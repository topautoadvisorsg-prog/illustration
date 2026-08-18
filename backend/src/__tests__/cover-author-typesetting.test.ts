/**
 * DETERMINISTIC AUTHOR PLACEMENT — the guarantee a prompt could not give.
 *
 * Four consecutive DIRT RICH generations placed the author name at 90-96% of the
 * canvas height after being explicitly told to end by 86%, because an image model
 * follows its learned convention (byline at the very bottom) over a stated bound.
 * The spine had the same problem and was moved into code for the same reason.
 *
 * These tests are about the CONTRACT, not about DIRT RICH: any book opting into
 * deterministic author placement gets an exact height, and the prompt stops
 * asking the model for a name it must not paint.
 */
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  DEFAULT_AUTHOR_PLACEMENT,
  typesetAuthorOntoCover,
} from '../pipeline/cover/author-typesetter.js';
import { buildCoverPrompt } from '../pipeline/cover/cover-prompt.js';
import { buildCoverSpec } from '../pipeline/cover/cover-spec.js';
import { ProjectConfigSchema } from '@wildlands/shared';

const artwork = async (w = 1536, h = 1024): Promise<Buffer> =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 40, g: 60, b: 30 } } }).png().toBuffer();

const configFor = () =>
  ProjectConfigSchema.parse({
    volume: 1,
    title: 'ANY BOOK',
    authorName: 'Some Author',
    trimSize: { widthIn: 6, heightIn: 9, bleedIn: 0.125 },
    typography: { bodyPt: 11, lineHeight: 1.35, headingFont: 'Archivo', bodyFont: 'EB Garamond' },
    productionProfileId: 'bw-educational-nonfiction',
  });

const specWith = (authorTypeSetBy: 'deterministic' | 'ai') =>
  buildCoverSpec({
    projectId: 'p1',
    config: configFor(),
    pageCount: 126,
    pageCountSource: 'typeset',
    model: 'gpt-image-2',
    authorTypeSetBy,
  });

describe('the author name lands where it is told', () => {
  it('places the baseline at the requested fraction of height', async () => {
    const r = await typesetAuthorOntoCover(await artwork(), {
      ...DEFAULT_AUTHOR_PLACEMENT,
      author: 'Abby Fenwick',
      centreFraction: 0.735,
    });
    expect(r.baselinePx).toBe(Math.round(1024 * 0.86));
    expect(r.heightPx).toBe(1024);
  });

  it('leaves the promised clearance of artwork beneath it', async () => {
    const r = await typesetAuthorOntoCover(await artwork(), {
      ...DEFAULT_AUTHOR_PLACEMENT,
      author: 'Abby Fenwick',
      centreFraction: 0.735,
    });
    // The failure being prevented: four generations left 4-10%. This is 14%.
    expect(r.clearanceFraction).toBeCloseTo(0.14, 5);
    expect(r.clearanceFraction).toBeGreaterThan(0.1);
  });

  it('is exact at any canvas size, so it does not depend on the model output shape', async () => {
    for (const [w, h] of [[1536, 1024], [1536, 1144], [1024, 1536]] as [number, number][]) {
      const r = await typesetAuthorOntoCover(await artwork(w, h), {
        ...DEFAULT_AUTHOR_PLACEMENT,
        author: 'Abby Fenwick',
        centreFraction: 0.735,
      });
      expect(r.baselinePx, `${w}x${h}`).toBe(Math.round(h * 0.86));
    }
  });

  it('returns a real PNG of unchanged dimensions', async () => {
    const r = await typesetAuthorOntoCover(await artwork(), {
      ...DEFAULT_AUTHOR_PLACEMENT,
      author: 'Abby Fenwick',
      centreFraction: 0.735,
    });
    const m = await sharp(r.png).metadata();
    expect(m.format).toBe('png');
    expect([m.width, m.height]).toEqual([1536, 1024]);
  });

  it('escapes markup in the name rather than emitting broken SVG', async () => {
    const r = await typesetAuthorOntoCover(await artwork(), {
      ...DEFAULT_AUTHOR_PLACEMENT,
      author: 'Ben & <Jones>',
      centreFraction: 0.735,
    });
    expect((await sharp(r.png).metadata()).format).toBe('png');
  });
});

describe('the prompt stops asking for what code will set', () => {
  it('deterministic: forbids painting the author and says why', () => {
    const p = buildCoverPrompt(specWith('deterministic'));
    expect(p).toMatch(/DO NOT PAINT THE AUTHOR NAME/);
    expect(p).toMatch(/added afterwards by the\s+typesetting system/);
  });

  it('deterministic: does not also order the model to paint every string', () => {
    // The old blanket negative ("whatever type you do not paint will not exist")
    // directly contradicts the deterministic branch, and the model obeys it.
    const p = buildCoverPrompt(specWith('deterministic'));
    expect(p).not.toMatch(/There is no later step: whatever type you do not paint will not exist/);
  });

  it('ai: unchanged — still names the author for the model to paint', () => {
    const p = buildCoverPrompt(specWith('ai'));
    expect(p).toMatch(/FRONT — AUTHOR: "Some Author"/);
    expect(p).not.toMatch(/DO NOT PAINT THE AUTHOR NAME/);
  });

  it('defaults to ai, so no existing book changes behaviour', () => {
    const spec = buildCoverSpec({
      projectId: 'p1',
      config: configFor(),
      pageCount: 126,
      pageCountSource: 'typeset',
      model: 'gpt-image-2',
    });
    expect(spec.authorTypeSetBy).toBe('ai');
  });
});
