import { describe, expect, it } from 'vitest';
import { pickIntroductionSection, recoverFrontMatterSections } from '../recover-sections.js';
import { joinAuthors, textPageLineCapacity, wrapText } from '../compose-page.js';
import { frontMatterStatus, resolveSpine } from '../../book-assembly/spine-order.js';

const MANUSCRIPT = `# THE WILD LANDS

# Introduction

The landscape you're walking through is the direct result of ice.

A second paragraph of the introduction.

# CHAPTER 1 — KNOW YOUR REGION

## Some Entry

Body text.

# CHAPTER 2 — ANIMALS

## Another Entry

More body.
`;

describe('recoverFrontMatterSections — the silently-dropped sections come back', () => {
  it('recovers the Introduction with its full text, heading stripped', () => {
    const sections = recoverFrontMatterSections(MANUSCRIPT);
    const intro = sections.find((s) => s.kind === 'INTRODUCTION');
    expect(intro).toBeDefined();
    expect(intro!.markdown).toContain('direct result of ice');
    expect(intro!.markdown).toContain('second paragraph');
    expect(intro!.markdown).not.toContain('# Introduction');
    expect(intro!.markdown).not.toContain('CHAPTER 1');
  });

  it('ignores chapter headings and unrecognized H1s', () => {
    const sections = recoverFrontMatterSections(MANUSCRIPT);
    expect(sections).toHaveLength(1); // only the Introduction
  });

  it('recognizes Preface and Foreword; priority picks Introduction first', () => {
    const ms = '# Foreword\n\nF text.\n\n# Preface\n\nP text.\n\n# Introduction\n\nI text.\n\n# CHAPTER 1 — X\n\nbody';
    const sections = recoverFrontMatterSections(ms);
    expect(sections.map((s) => s.kind).sort()).toEqual(['FOREWORD', 'INTRODUCTION', 'PREFACE']);
    expect(pickIntroductionSection(sections)!.kind).toBe('INTRODUCTION');
  });

  it('priority falls to Preface, then Foreword, then null', () => {
    const pf = recoverFrontMatterSections('# Preface\n\nP.\n\n# Foreword\n\nF.\n\n# CHAPTER 1 — X\n\nb');
    expect(pickIntroductionSection(pf)!.kind).toBe('PREFACE');
    const f = recoverFrontMatterSections('# Foreword\n\nF.\n\n# CHAPTER 1 — X\n\nb');
    expect(pickIntroductionSection(f)!.kind).toBe('FOREWORD');
    expect(pickIntroductionSection([])).toBeNull();
  });

  it('drops empty recognized sections', () => {
    const sections = recoverFrontMatterSections('# Introduction\n\n# CHAPTER 1 — X\n\nbody');
    expect(sections).toHaveLength(0);
  });

  it('recovers H2 sections under a title H1 (the real New England shape)', () => {
    const ms = [
      '---',
      '',
      '## COVER PAGE',
      '',
      '# THE WILD LANDS: NEW ENGLAND',
      '',
      '## DISCLAIMER',
      '',
      '**Please read this page before using this book in the field.**',
      '',
      'It is intended to build general knowledge.',
      '',
      '---',
      '',
      '## TABLE OF CONTENTS',
      '',
      '- Disclaimer',
      '',
      '## INTRODUCTION',
      '',
      'The landscape you are walking through is the direct result of ice.',
      '',
      '# CHAPTER 1 — KNOW YOUR REGION',
      '',
      'body',
    ].join('\n');
    const sections = recoverFrontMatterSections(ms);
    const kinds = sections.map((s) => s.kind).sort();
    expect(kinds).toEqual(['DISCLAIMER', 'INTRODUCTION']);
    const disc = sections.find((s) => s.kind === 'DISCLAIMER')!;
    expect(disc.markdown).toContain('general knowledge');
    expect(disc.markdown).not.toContain('TABLE OF CONTENTS'); // H2 section ends at next H2
    expect(disc.markdown).not.toMatch(/^-{3,}$/m); // separators stripped
    const intro = sections.find((s) => s.kind === 'INTRODUCTION')!;
    expect(intro.markdown).toContain('result of ice');
    expect(intro.markdown).not.toContain('CHAPTER 1'); // ends at the H1
  });
});

describe('composer helpers', () => {
  it('wrapText never exceeds the limit and keeps every word', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve';
    const lines = wrapText(text, 18);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(18);
    expect(lines.join(' ')).toBe(text);
  });

  it('textPageLineCapacity gives a sane page at the 7×10 canvas', () => {
    const cap = textPageLineCapacity({ w: 7.25, h: 10.25 }, true);
    expect(cap.linesPerPage).toBeGreaterThan(15);
    expect(cap.linesPerPage).toBeLessThan(60);
    expect(cap.maxCharsPerLine).toBeGreaterThan(40);
  });

  it('joinAuthors handles 1, 2, and 3+ authors', () => {
    expect(joinAuthors(['A'])).toBe('A');
    expect(joinAuthors(['A', 'B'])).toBe('A and B');
    expect(joinAuthors(['A', 'B', 'C'])).toBe('A, B, and C');
  });
});

describe('resolveSpine — Front Matter v1 section ordering', () => {
  const page = (o: Partial<Parameters<typeof resolveSpine>[0][number]>) => ({
    id: 'x',
    pageKey: 'k',
    chapterNumber: 1,
    plannedPageNumber: 1,
    ...o,
  });

  it('orders FRONT_MATTER < BODY < BACK_MATTER with body unaffected by null spineOrder', () => {
    const spine = resolveSpine([
      page({ pageKey: 'BODY_2', chapterNumber: 1, plannedPageNumber: 2 }),
      page({ pageKey: 'BM_1', section: 'BACK_MATTER', spineOrder: 1 }),
      page({ pageKey: 'FM_2', section: 'FRONT_MATTER', spineOrder: 2 }),
      page({ pageKey: 'BODY_1', chapterNumber: 1, plannedPageNumber: 1 }),
      page({ pageKey: 'FM_1', section: 'FRONT_MATTER', spineOrder: 1 }),
    ]);
    expect(spine.map((p) => p.pageKey)).toEqual(['FM_1', 'FM_2', 'BODY_1', 'BODY_2', 'BM_1']);
  });

  it('legacy rows (no section) keep the old chapter/page ordering', () => {
    const spine = resolveSpine([
      page({ pageKey: 'B', chapterNumber: 2, plannedPageNumber: 1 }),
      page({ pageKey: 'A', chapterNumber: 1, plannedPageNumber: 5 }),
    ]);
    expect(spine.map((p) => p.pageKey)).toEqual(['A', 'B']);
  });

  it('frontMatterStatus flips to included when FM rows exist', () => {
    expect(frontMatterStatus([page({})])).toBe('absent');
    expect(frontMatterStatus([page({ section: 'FRONT_MATTER' })])).toBe('included');
  });
});

// ─── Composer ink-bounds — the clipped-title defect can never return ────────

import sharp from 'sharp';
import { composeFrontMatterPage, fitTitle } from '../compose-page.js';

describe('composeFrontMatterPage — ink stays inside the trim-safe area', () => {
  const canvasIn = { w: 7.25, h: 10.25 };
  // Safe area: bleed (0.125in) + 0.25in inside trim.
  const SAFE_IN = 0.375;

  async function inkBounds(png: Buffer): Promise<{ left: number; right: number; w: number }> {
    const meta = await sharp(png).metadata();
    // trim() crops uniform border; info gives the offset of the ink box.
    const { info } = await sharp(png).trim({ threshold: 12 }).toBuffer({ resolveWithObject: true });
    const left = -(info.trimOffsetLeft ?? 0);
    return { left, right: left + info.width, w: meta.width! };
  }

  it('the live defect case: long tracked title no longer clips the page edges', async () => {
    const page = await composeFrontMatterPage({
      kind: 'TITLE_PAGE',
      canvasIn,
      pageLabel: null,
      title: 'The Wildlands Field Guide',
      subtitle: 'New England Volume',
      authors: ['The Wildlands'],
    });
    const b = await inkBounds(page.pngBuffer);
    const safePx = SAFE_IN * 300;
    expect(b.left).toBeGreaterThanOrEqual(safePx);
    expect(b.right).toBeLessThanOrEqual(b.w - safePx);
  }, 30000);

  it('an absurdly long title wraps + shrinks instead of clipping', async () => {
    const page = await composeFrontMatterPage({
      kind: 'HALF_TITLE',
      canvasIn,
      pageLabel: null,
      title: 'The Comprehensive Wilderness Survival And Natural History Compendium',
    });
    const b = await inkBounds(page.pngBuffer);
    const safePx = SAFE_IN * 300;
    expect(b.left).toBeGreaterThanOrEqual(safePx);
    expect(b.right).toBeLessThanOrEqual(b.w - safePx);
  }, 30000);

  it('contents page with real chapter titles stays inside the frame', async () => {
    const page = await composeFrontMatterPage({
      kind: 'CONTENTS',
      canvasIn,
      pageLabel: 'xi',
      tocHeading: 'Contents',
      tocEntries: [
        { label: 'I', title: 'KNOW YOUR REGION', pageNumber: 1 },
        { label: 'VIII', title: 'BUSHCRAFT & THE LIVING FOREST', pageNumber: 230 },
      ],
    });
    const b = await inkBounds(page.pngBuffer);
    const safePx = SAFE_IN * 300;
    expect(b.left).toBeGreaterThanOrEqual(safePx - 1);
    expect(b.right).toBeLessThanOrEqual(b.w - safePx + 1);
  }, 30000);
});

describe('fitTitle', () => {
  it('keeps short titles at base size', () => {
    const r = fitTitle('SHORT', 34, 1500, 8, true);
    expect(r.pt).toBe(34);
    expect(r.lines).toEqual(['SHORT']);
  });

  it('shrinks long titles, then wraps to at most three lines that all fit', () => {
    const r = fitTitle('THE COMPREHENSIVE WILDERNESS SURVIVAL COMPENDIUM OF THE NORTHEAST', 34, 1500, 8, true);
    expect(r.lines.length).toBeLessThanOrEqual(3);
    expect(r.pt).toBeGreaterThanOrEqual(14);
    for (const line of r.lines) {
      expect(line.length * (0.72 * (r.pt / 72) * 300 + 8)).toBeLessThanOrEqual(1500 + 1);
    }
    // No words lost in the wrap.
    expect(r.lines.join(' ')).toBe('THE COMPREHENSIVE WILDERNESS SURVIVAL COMPENDIUM OF THE NORTHEAST');
  });
});
