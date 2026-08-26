/**
 * WHAT A FAILURE HERE MEANS
 *
 * The correction layer is the difference between "change one period in one book"
 * and "edit the shared renderer and hope three other books do not repaginate".
 * Its value depends entirely on two properties:
 *
 *   1. A correction that resolves does exactly what it says and nothing else.
 *   2. A correction that does NOT resolve stops the build, loudly.
 *
 * The second is the one worth guarding. A correction that silently becomes a
 * no-op is worse than no correction layer at all: someone made a deliberate
 * decision, the build reported success, and the defect shipped anyway.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, CorrectionSchema } from '@wildlands/shared';
import type { Correction } from '@wildlands/shared';
import { parseTypesetSections } from '../pipeline/typeset/typeset-book.js';
import { TRADE_NONFICTION_GUIDE_TYPESET_V2 } from '../pipeline/typeset/layout-standards/trade-nonfiction-guide-v2.js';
import { normalizeManuscriptNewlines } from '../pipeline/stage-1-ingestion/normalize-newlines.js';
import { enumerateBlocks, resolveCorrections } from '../pipeline/corrections/resolve-corrections.js';
import { renderCorrectionReport } from '../pipeline/corrections/correction-report.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, 'fixtures/fixture-book/manuscript.md');
const MD = normalizeManuscriptNewlines(readFileSync(FIXTURE, 'utf8'));

const CONFIG = ProjectConfigSchema.parse({
  volume: 1,
  title: 'The Fixture Field Guide',
  authorName: 'The Fixture Standards Board',
  trimSize: { widthIn: 6, heightIn: 9, bleedIn: 0.125 },
  paperStock: 'white',
});
const STANDARD = TRADE_NONFICTION_GUIDE_TYPESET_V2;

const sections = () => parseTypesetSections(MD);
const run = (corrections: Correction[]) =>
  resolveCorrections({ sections: sections(), config: CONFIG, layoutStandard: STANDARD, corrections });

const blocks = enumerateBlocks(sections(), CONFIG, STANDARD);
const blockWith = (fragment: string) => {
  const hit = blocks.find((b) => b.preview.includes(fragment));
  if (!hit) throw new Error(`No fixture block previews "${fragment}"`);
  return hit;
};

const DEFECT = blockWith('deliberate defect');
const LEAD_IN = blockWith('The things a bulleted list');
const CALLOUT = blocks.find((b) => b.kind === 'callout')!;

const base = { reason: 'because the test says so', status: 'active' as const };

describe('text corrections', () => {
  it('applies one punctuation fix and reports the exact change', () => {
    const r = run([
      { ...base, id: 't1', type: 'text', anchor: DEFECT.blockId, expect: '5 p.m.. and', replace: '5 p.m. and' },
    ]);
    expect(r.ok).toBe(true);
    const res = r.resolutions[0]!;
    expect(res.outcome).toBe('APPLIED');
    expect(res.before).toContain('5 p.m..');
    expect(res.after).toContain('5 p.m.');
    expect(res.after).not.toContain('5 p.m..');
    // and the corrected text is actually in the returned sections
    expect(r.sections.flatMap((s) => s.bodyLines).join('\n')).not.toContain('5 p.m..');
  });

  it('does not mutate the caller\'s sections', () => {
    const original = sections();
    resolveCorrections({
      sections: original,
      config: CONFIG,
      layoutStandard: STANDARD,
      corrections: [
        { ...base, id: 't1', type: 'text', anchor: DEFECT.blockId, expect: '5 p.m.. and', replace: '5 p.m. and' },
      ],
    });
    expect(original.flatMap((s) => s.bodyLines).join('\n')).toContain('5 p.m..');
  });

  it('REFUSES when the expected text is no longer in the source', () => {
    const r = run([
      {
        ...base,
        id: 't-stale',
        type: 'text',
        anchor: DEFECT.blockId,
        expect: 'a sentence this manuscript has never contained',
        replace: 'anything at all',
      },
    ]);
    expect(r.resolutions[0]!.outcome).toBe('EXPECT_MISMATCH');
    expect(r.resolutions[0]!.detail).toContain('CORRECTION NO LONGER MATCHES SOURCE');
    expect(r.ok).toBe(false);
  });

  it('refuses an expectation that appears more than once in the block', () => {
    const r = run([
      { ...base, id: 't-ambig', type: 'text', anchor: DEFECT.blockId, expect: 'the', replace: 'THE' },
    ]);
    expect(r.resolutions[0]!.outcome).toBe('AMBIGUOUS');
    expect(r.ok).toBe(false);
  });

  it('reports an anchor that matches nothing rather than dropping it', () => {
    const r = run([
      { ...base, id: 't-gone', type: 'text', anchor: 'deadbeef', expect: 'x', replace: 'y' },
    ]);
    expect(r.resolutions[0]!.outcome).toBe('UNMATCHED');
    expect(r.ok).toBe(false);
  });

  it('a punctuation fix does not move the block it is anchored to', () => {
    // normaliseBlockText keeps only alphanumerics, so the same correction stays
    // resolvable on the next build. Without this the layer would be single-use.
    const r = run([
      { ...base, id: 't1', type: 'text', anchor: DEFECT.blockId, expect: '5 p.m.. and', replace: '5 p.m. and' },
    ]);
    const after = enumerateBlocks(r.sections, CONFIG, STANDARD);
    expect(after.some((b) => b.blockId === DEFECT.blockId)).toBe(true);
  });
});

describe('metadata corrections', () => {
  it('sets a field for every output that displays it', () => {
    const r = run([{ ...base, id: 'm1', type: 'metadata', field: 'authorName', value: 'A New Name' }]);
    expect(r.metadata.authorName).toBe('A New Name');
    expect(r.resolutions[0]!.outcome).toBe('APPLIED');
  });

  it('reports a no-op rather than pretending to change something', () => {
    const r = run([{ ...base, id: 'm2', type: 'metadata', field: 'title', value: CONFIG.title }]);
    expect(r.resolutions[0]!.outcome).toBe('NOOP');
    expect(r.ok).toBe(true);
  });
});

describe('display corrections', () => {
  it('sets a heading display without touching the manuscript', () => {
    const heading = blockWith('All Figures Here Are Synthetic');
    const r = run([{ ...base, id: 'h1', type: 'headingDisplay', anchor: heading.blockId, stripDrawnMarks: true }]);
    expect(r.headingDisplay[heading.blockId]).toEqual({ display: undefined, stripDrawnMarks: true });
    expect(r.ok).toBe(true);
  });

  it('sets a running head for a real section', () => {
    const r = run([
      { ...base, id: 'rh', type: 'runningHead', section: 'appendix-a-reference-values', display: 'Appendix A' },
    ]);
    expect(r.runningHead['appendix-a-reference-values']).toBe('Appendix A');
  });

  it('refuses a running head for a section that does not exist', () => {
    const r = run([{ ...base, id: 'rh2', type: 'runningHead', section: 'no-such-section', display: 'x' }]);
    expect(r.resolutions[0]!.outcome).toBe('UNMATCHED');
    expect(r.ok).toBe(false);
  });

  it('sets a TOC entry that intentionally differs from the heading', () => {
    const r = run([
      { ...base, id: 'toc', type: 'tocDisplay', section: 'sources', display: 'Sources and Further Reading' },
    ]);
    expect(r.tocDisplay['sources']).toBe('Sources and Further Reading');
  });
});

describe('layout corrections stay compatible with the existing override system', () => {
  it('compiles to the same LayoutOverride shape', () => {
    const r = run([
      { ...base, id: 'l1', type: 'layout', anchor: LEAD_IN.blockId, override: { keepWithNext: true } },
    ]);
    expect(r.layoutOverrides[LEAD_IN.blockId]).toEqual({ keepWithNext: true });
  });

  it('merges with overrides already configured on the project, without clobbering them', () => {
    const withExisting = ProjectConfigSchema.parse({
      ...CONFIG,
      layoutOverrides: { [LEAD_IN.blockId]: { spaceBeforeEm: 1 } },
    });
    const r = resolveCorrections({
      sections: sections(),
      config: withExisting,
      layoutStandard: STANDARD,
      corrections: [
        { ...base, id: 'l2', type: 'layout', anchor: LEAD_IN.blockId, override: { keepWithNext: true } },
      ],
    });
    expect(r.layoutOverrides[LEAD_IN.blockId]).toEqual({ spaceBeforeEm: 1, keepWithNext: true });
  });

  it('a presentation variant becomes an override, not free styling', () => {
    const r = run([
      { ...base, id: 'bp', type: 'blockPresentation', anchor: CALLOUT.blockId, variant: 'compact' },
    ]);
    expect(r.layoutOverrides[CALLOUT.blockId]).toEqual({ variant: 'compact' });
  });
});

describe('illustration corrections use structural anchors', () => {
  it('anchors a plate to a block rather than a page', () => {
    const r = run([
      {
        ...base,
        id: 'ill',
        type: 'illustration',
        anchor: LEAD_IN.blockId,
        asset: 'fixture-plate',
        placement: 'after-block',
        widthPercent: 70,
      },
    ]);
    expect(r.illustrations[LEAD_IN.blockId]).toEqual({
      asset: 'fixture-plate',
      placement: 'after-block',
      widthPercent: 70,
      side: undefined,
    });
  });

  it('refuses an illustration anchored to a block that no longer exists', () => {
    const r = run([
      { ...base, id: 'ill2', type: 'illustration', anchor: 'deadbeef', asset: 'x', placement: 'after-block' },
    ]);
    expect(r.resolutions[0]!.outcome).toBe('UNMATCHED');
    expect(r.ok).toBe(false);
  });
});

describe('the schema is closed', () => {
  it('rejects an unknown property', () => {
    const parsed = CorrectionSchema.safeParse({
      id: 'x',
      type: 'text',
      reason: 'r',
      anchor: 'a',
      expect: 'b',
      replace: 'c',
      thisIsNotAProperty: true,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an unknown correction type', () => {
    expect(CorrectionSchema.safeParse({ id: 'x', type: 'teleport', reason: 'r' }).success).toBe(false);
  });

  it('requires a reason', () => {
    expect(
      CorrectionSchema.safeParse({ id: 'x', type: 'metadata', field: 'title', value: 'v' }).success,
    ).toBe(false);
  });

  it('rejects a layout override property outside the closed set', () => {
    const parsed = CorrectionSchema.safeParse({
      id: 'x',
      type: 'layout',
      reason: 'r',
      anchor: 'a',
      override: { fontSize: '12pt' },
    });
    expect(parsed.success).toBe(false);
  });
});

describe('superseded corrections', () => {
  it('are kept on the record and not applied', () => {
    const r = run([
      { ...base, status: 'superseded', id: 's1', type: 'metadata', field: 'authorName', value: 'Never Applied' },
    ]);
    expect(r.resolutions[0]!.outcome).toBe('SUPERSEDED');
    expect(r.metadata.authorName).toBe(CONFIG.authorName);
    expect(r.ok).toBe(true);
  });
});

describe('determinism and reporting', () => {
  const all: Correction[] = JSON.parse(
    readFileSync(path.join(HERE, 'fixtures/fixture-book/corrections.json'), 'utf8'),
  );

  it('the shipped demonstration document resolves cleanly', () => {
    const r = run(all);
    expect(r.ok).toBe(true);
    expect(r.counts.APPLIED).toBe(8);
    expect(r.counts.SUPERSEDED).toBe(1);
    expect(r.counts.UNMATCHED + r.counts.AMBIGUOUS + r.counts.EXPECT_MISMATCH).toBe(0);
  });

  it('covers every correction type', () => {
    expect(new Set(all.map((c) => c.type)).size).toBe(8);
  });

  it('produces byte-identical results on a repeat run', () => {
    expect(JSON.stringify(run(all).resolutions)).toBe(JSON.stringify(run(all).resolutions));
    expect(JSON.stringify(run(all).sections)).toBe(JSON.stringify(run(all).sections));
  });

  it('renders a report carrying counts and a verifiable diff', () => {
    const report = renderCorrectionReport(run(all));
    expect(report).toContain('configured 9');
    expect(report).toContain('applied 8');
    expect(report).toContain('5 p.m..');
    expect(report).toContain('All corrections resolved.');
  });

  it('the report says BLOCKED when something did not resolve', () => {
    const report = renderCorrectionReport(
      run([{ ...base, id: 'bad', type: 'text', anchor: 'deadbeef', expect: 'x', replace: 'y' }]),
    );
    expect(report).toContain('BLOCKED');
    expect(report).toContain('bad');
  });
});

describe('the hard gate', () => {
  it('one unresolved correction is enough to block a build', () => {
    const good: Correction = { ...base, id: 'ok', type: 'metadata', field: 'title', value: 'A Better Title' };
    const bad: Correction = { ...base, id: 'bad', type: 'text', anchor: 'deadbeef', expect: 'x', replace: 'y' };
    expect(run([good]).ok).toBe(true);
    expect(run([good, bad]).ok).toBe(false);
  });
});
