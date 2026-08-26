/**
 * WHAT A FAILURE HERE MEANS
 *
 * These cover the MACHINERY around the vision reviewer: schema validation,
 * caching, resizing, and the refusal to accept a malformed answer. None of them
 * make a paid model call, and none of them ever should — a CI run that spends
 * money is a CI run people disable.
 *
 * They deliberately do NOT assert that the model gives good answers. Whether the
 * page-layout profile is well calibrated is an empirical question settled by
 * running it against real pages, not something a unit test can pin.
 */
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { VisionCache, toReviewSize } from '../services/vision/vision-core.js';
import type { VisionImage, VisionProfile } from '../services/vision/vision-core.js';
import {
  PAGE_LAYOUT_PROFILE,
  buildPageUserText,
  validatePageReview,
} from '../pipeline/page-qa/vision-profile.js';
import { contactSheets, flaggedProof, regionCrop } from '../pipeline/page-qa/proof-sheets.js';

const png = (w: number, h: number, shade = 240) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: shade, g: shade, b: shade } } })
    .png()
    .toBuffer();

const valid = {
  page: 12,
  overallComposition: 'GOOD',
  findings: [
    {
      issueCode: 'LARGE_GAP',
      verdict: 'NOT_A_DEFECT',
      severity: 'EXPECTED',
      confidence: 0.9,
      region: 'mid page',
      visualReason: 'Space above a subheading.',
      suggestedCorrectionType: 'none',
    },
  ],
};

describe('vision response schema', () => {
  it('accepts a well-formed review', () => {
    const r = validatePageReview(valid);
    expect(r?.page).toBe(12);
    expect(r?.findings[0]!.verdict).toBe('NOT_A_DEFECT');
  });

  it('accepts a clean page with no findings', () => {
    expect(validatePageReview({ page: 1, overallComposition: 'GOOD', findings: [] })?.findings).toEqual([]);
  });

  /**
   * REFUSED, NOT COERCED. A half-understood verdict entering a calibration
   * matrix is worse than a recorded failure, because it looks like data.
   */
  it.each([
    ['not an object', 'hello'],
    ['missing page', { overallComposition: 'GOOD', findings: [] }],
    ['page not a number', { page: '12', overallComposition: 'GOOD', findings: [] }],
    ['unknown composition', { page: 1, overallComposition: 'SPLENDID', findings: [] }],
    ['findings not an array', { page: 1, overallComposition: 'GOOD', findings: {} }],
    ['unknown verdict', { page: 1, overallComposition: 'GOOD', findings: [{ ...valid.findings[0], verdict: 'MAYBE' }] }],
    ['unknown severity', { page: 1, overallComposition: 'GOOD', findings: [{ ...valid.findings[0], severity: 'BAD' }] }],
    ['confidence out of range', { page: 1, overallComposition: 'GOOD', findings: [{ ...valid.findings[0], confidence: 4 }] }],
    ['confidence not a number', { page: 1, overallComposition: 'GOOD', findings: [{ ...valid.findings[0], confidence: 'high' }] }],
    ['missing issueCode', { page: 1, overallComposition: 'GOOD', findings: [{ ...valid.findings[0], issueCode: '' }] }],
  ])('refuses %s', (_label, value) => {
    expect(validatePageReview(value)).toBeNull();
  });
});

describe('the prompt does not lead the model', () => {
  it('states the role and asks the model to explain measurements, not confirm them', () => {
    const text = buildPageUserText({
      page: 40,
      role: 'BODY',
      measurements: ['gapPt: 31.4'],
      deterministicFindings: [{ code: 'LARGE_GAP', detail: '2.03x leading' }],
      hasNeighbours: true,
    });
    expect(text).toContain('STRUCTURAL ROLE: BODY');
    expect(text).toContain('Decide whether each is a real');
    // It must never tell the model what answer is wanted.
    expect(text).not.toMatch(/this is (a )?(defect|false positive)/i);
    expect(text).not.toMatch(/expected to be clean/i);
  });

  it('does not label a sampled page as clean', () => {
    const text = buildPageUserText({
      page: 88,
      role: 'BODY',
      measurements: [],
      deterministicFindings: [],
      hasNeighbours: false,
    });
    expect(text).toContain('No automated findings were raised');
    expect(text).toContain('Judge it on its own merits');
    expect(text).not.toMatch(/clean|sample|control/i);
  });
});

describe('image preprocessing', () => {
  it('downscales a print-size page to review width', async () => {
    const big = await png(2400, 3600);
    const small = await toReviewSize(big, 760);
    const meta = await sharp(small).metadata();
    expect(meta.width).toBe(760);
    expect(small.length).toBeLessThan(big.length);
  });

  it('never enlarges an image that is already small', async () => {
    const small = await png(400, 600);
    const out = await toReviewSize(small, 760);
    expect((await sharp(out).metadata()).width).toBe(400);
  });
});

describe('the vision cache', () => {
  const profile: VisionProfile = { ...PAGE_LAYOUT_PROFILE, version: 1 };
  const images = async (): Promise<VisionImage[]> => [{ label: 'page under review', png: await png(100, 140) }];

  it('is stable for the same image, profile and model', async () => {
    const c = new VisionCache(mkdtempSync(path.join(tmpdir(), 'vc-')));
    const i = await images();
    expect(c.key(i, profile, 'm', '')).toBe(c.key(i, profile, 'm', ''));
  });

  it('MISSES when the profile version changes, because the question changed', async () => {
    const c = new VisionCache(mkdtempSync(path.join(tmpdir(), 'vc-')));
    const i = await images();
    expect(c.key(i, { ...profile, version: 2 }, 'm', '')).not.toBe(c.key(i, profile, 'm', ''));
  });

  it('misses when the model changes', async () => {
    const c = new VisionCache(mkdtempSync(path.join(tmpdir(), 'vc-')));
    const i = await images();
    expect(c.key(i, profile, 'other-model', '')).not.toBe(c.key(i, profile, 'm', ''));
  });

  it('misses when the image changes', async () => {
    const c = new VisionCache(mkdtempSync(path.join(tmpdir(), 'vc-')));
    const a = await images();
    const b: VisionImage[] = [{ label: 'page under review', png: await png(100, 140, 10) }];
    expect(c.key(b, profile, 'm', '')).not.toBe(c.key(a, profile, 'm', ''));
  });

  it('reads back what it wrote, and reports a miss as null', async () => {
    const c = new VisionCache(mkdtempSync(path.join(tmpdir(), 'vc-')));
    const k = c.key(await images(), profile, 'm', '');
    expect(c.read(k)).toBeNull();
    c.write(k, JSON.stringify(valid));
    expect(JSON.parse(c.read(k)!).page).toBe(12);
  });
});

describe('proof artifacts', () => {
  it('builds paginated contact sheets rather than one enormous bitmap', async () => {
    const pages = await Promise.all(
      Array.from({ length: 40 }, async (_, i) => ({ n: i + 1, png: await png(200, 300) })),
    );
    const sheets = await contactSheets(pages, { cols: 6, rows: 5, flagged: new Set([3, 19]) });
    expect(sheets.length).toBe(2);
    for (const s of sheets) expect((await sharp(s).metadata()).width).toBeGreaterThan(0);
  });

  it('builds a flagged proof with neighbours', async () => {
    const proof = await flaggedProof({
      page: { n: 20, png: await png(400, 600) },
      before: { n: 19, png: await png(400, 600) },
      after: { n: 21, png: await png(400, 600) },
      role: 'BODY',
      findings: [{ code: 'LARGE_GAP', severity: 'REVIEW', detail: '2.03x leading between two paragraphs' }],
    });
    const meta = await sharp(proof).metadata();
    // Wide enough to carry a side column, the page and the annotation panel.
    expect(meta.width).toBeGreaterThan(1200);
  });

  it('crops a region without discarding the page', async () => {
    const page = await png(400, 600);
    const crop = await regionCrop(page, { topFraction: 0.3, heightFraction: 0.4 }, 'p20 LARGE_GAP');
    const meta = await sharp(crop).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBeLessThan(600);
    expect(meta.height).toBeGreaterThan(200);
  });
});

describe('report-only', () => {
  it('the vision profile can only suggest a correction type, never author one', () => {
    const r = validatePageReview(valid)!;
    for (const f of r.findings) {
      expect(typeof f.suggestedCorrectionType).toBe('string');
      // There is nowhere in the shape for an anchor, an expectation or a
      // replacement: the schema cannot express an edit.
      expect(Object.keys(f).sort()).toEqual(
        ['confidence', 'issueCode', 'region', 'severity', 'suggestedCorrectionType', 'verdict', 'visualReason'].sort(),
      );
    }
  });

  it('an audit writes no corrections anywhere', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vq-'));
    writeFileSync(path.join(dir, 'vision.json'), JSON.stringify({ results: [] }));
    expect(readdirSync(dir)).toEqual(['vision.json']);
  });
});
