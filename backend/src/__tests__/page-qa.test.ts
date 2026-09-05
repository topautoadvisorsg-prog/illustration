/**
 * WHAT A FAILURE HERE MEANS
 *
 * Page QA has exactly one way to become worthless: crying wolf. A chapter opener
 * is supposed to be two thirds empty, a parity blank entirely empty, a part
 * divider six words alone in the middle of a page. A system that reports those
 * as defects buries the one body page that genuinely broke, and then people stop
 * reading its output — which is worse than not having built it.
 *
 * So most of what is pinned below is the system NOT firing. The negative
 * fixtures prove it still fires when something is actually wrong.
 *
 * These use synthetic page models rather than rendered PDFs, so the suite stays
 * portable and fast. The end-to-end path is exercised by `qa:fixture-smoke`.
 */
import { describe, expect, it } from 'vitest';
import type { BookNorms, ModelPage, PageLine, PageModel } from '../pipeline/page-qa/page-model.js';
import { classifyPages } from '../pipeline/page-qa/page-roles.js';
import { runDeterministicRules, statusOf } from '../pipeline/page-qa/deterministic-rules.js';

const NORMS: BookNorms = {
  bodySizePt: 12,
  leadingPt: 15.5,
  measurePt: 313,
  // A full `bodyPage` below runs from y=540 down to 540 - 29 * 15.5 = 90.5, so
  // these are this synthetic book's real text block rather than a guess.
  textBlockTopPt: 540,
  textBlockBottomPt: 90.5,
};
const BLOCK_CAPACITY_PT = NORMS.textBlockTopPt - NORMS.textBlockBottomPt + NORMS.leadingPt;
const W = 396; // 5.5in
const H = 612; // 8.5in

const line = (y: number, text: string, over: Partial<PageLine> = {}): PageLine => ({
  y,
  x0: 60,
  x1: 60 + NORMS.measurePt,
  size: NORMS.bodySizePt,
  text,
  font: 'Body',
  ...over,
});

/** A full page of running text, top to bottom. */
function bodyPage(n: number, over: Partial<ModelPage> = {}): ModelPage {
  const lines: PageLine[] = [];
  for (let i = 0; i < 30; i += 1) lines.push(line(540 - i * NORMS.leadingPt, `Running text line ${i} of page ${n}.`));
  const furniture = [line(30, String(n), { size: 9, x0: 190, x1: 206 })];
  return assemble(n, [...lines, ...furniture], over);
}

function assemble(n: number, all: PageLine[], over: Partial<ModelPage> = {}): ModelPage {
  const furniture = all.filter((l) => l.y > H - 54 || l.y < 54);
  const body = all.filter((l) => !(l.y > H - 54 || l.y < 54));
  const ys = body.map((l) => l.y);
  const images = over.images ?? [];
  const imageArea = images.reduce((a, b) => a + (b.x1 - b.x0) * (b.y1 - b.y0), 0);
  const page: ModelPage = {
    n,
    widthPt: W,
    heightPt: H,
    lines: [...all].sort((a, b) => b.y - a.y),
    body: [...body].sort((a, b) => b.y - a.y),
    furniture,
    textBox: body.length ? { x0: 60, x1: 60 + NORMS.measurePt, y0: Math.min(...ys), y1: Math.max(...ys) } : null,
    inkBox: all.length ? { x0: Math.min(...all.map((l) => l.x0)), x1: Math.max(...all.map((l) => l.x1)), y0: Math.min(...all.map((l) => l.y)), y1: Math.max(...all.map((l) => l.y)) } : null,
    density: body.length / 30,
    images,
    imageAreaFraction: imageArea / (W * H),
    textFill: body.length
      ? Math.min(1, (Math.max(...ys) - Math.min(...ys) + NORMS.leadingPt) / BLOCK_CAPACITY_PT)
      : 0,
    largestGapPt: 0,
    largestGapAt: 0,
    headings: body.filter((l) => l.size > NORMS.bodySizePt + 1),
    blank: all.length === 0,
    ...over,
  };
  return page;
}

const model = (pages: ModelPage[]): PageModel => ({
  sha256: 'test',
  pageCount: pages.length,
  norms: NORMS,
  pages,
});

const audit = (pages: ModelPage[]) => {
  const m = model(pages);
  const roles = classifyPages(m.pages, NORMS);
  return { roles, findings: runDeterministicRules(m, roles), status: statusOf(runDeterministicRules(m, roles)) };
};

const codes = (f: ReturnType<typeof audit>['findings']) => f.map((x) => x.code);

describe('page role classification', () => {
  it('an empty page is a parity blank, not a defect', () => {
    const { roles, findings } = audit([bodyPage(1), assemble(2, []), bodyPage(3)]);
    expect(roles[1]!.role).toBe('PARITY_BLANK');
    expect(codes(findings)).not.toContain('SPARSE_PAGE');
  });

  it('a display heading high on the page opens a chapter', () => {
    const opener = assemble(2, [
      line(540, 'Chapter Two', { size: 24 }),
      line(440, 'The chapter begins here with its first paragraph.'),
      line(30, '2', { size: 9 }),
    ]);
    const { roles } = audit([bodyPage(1), opener, bodyPage(3)]);
    expect(roles[1]!.role).toBe('CHAPTER_OPENER');
  });

  it('front matter is decided before opener, so a title page is not a chapter', () => {
    // The title page carries the largest type in the book. Classifying by size
    // alone made it a chapter opener and every page after it a sparse BODY.
    const title = assemble(1, [line(500, 'THE BOOK', { size: 30 })]);
    const { roles } = audit([title, bodyPage(2), bodyPage(3)]);
    expect(roles[0]!.role).toBe('FRONT_MATTER');
  });

  it('a part divider is sparse by design', () => {
    const divider = assemble(2, [line(400, 'PART TWO — THE MIDDLE', { size: 22 })]);
    const { roles, findings } = audit([bodyPage(1), divider, bodyPage(3)]);
    expect(roles[1]!.role).toBe('PART_DIVIDER');
    expect(codes(findings.filter((f) => f.page === 2))).not.toContain('SPARSE_PAGE');
    expect(codes(findings.filter((f) => f.page === 2))).not.toContain('MISSING_FOLIO');
  });
});

describe('sparse pages are judged by role, not by emptiness', () => {
  it('records a sparse chapter opener as EXPECTED rather than a finding', () => {
    const opener = assemble(2, [line(540, 'Chapter Two', { size: 24 }), line(30, '2', { size: 9 })]);
    const { findings } = audit([bodyPage(1), opener, bodyPage(3)]);
    const f = findings.find((x) => x.page === 2 && x.code === 'SPARSE_BY_DESIGN');
    expect(f?.severity).toBe('EXPECTED');
  });

  it('flags a genuinely half-empty BODY page', () => {
    const half = assemble(2, [
      ...Array.from({ length: 8 }, (_, i) => line(540 - i * NORMS.leadingPt, `Only eight lines here ${i}.`)),
      line(30, '2', { size: 9 }),
    ], { density: 0.27 });
    const { findings } = audit([bodyPage(1), half, bodyPage(3), bodyPage(4)]);
    expect(codes(findings.filter((f) => f.page === 2))).toContain('SPARSE_PAGE');
  });
});

/**
 * STRANDED CONTINUATION.
 *
 * Six fixtures, and only two of them fire. The rule earns its place by what it
 * leaves alone: a plate, a composed ending, a blank and an opener are all
 * legitimately empty, and a detector that flags them is a detector that gets
 * switched off.
 *
 * The two that DO fire are the shapes measured on a real 175-page interior,
 * where each produced no finding of any kind -- not a defect, and not even the
 * EXPECTED note that would have proved the page was seen.
 */
describe('stranded continuation pages, whatever their assigned role', () => {
  const stranded = (f: ReturnType<typeof audit>['findings'], page: number) =>
    codes(f.filter((x) => x.page === page)).includes('STRANDED_CONTINUATION');

  it('fires on a two-line continuation, which classifies as PLATE because it is empty', () => {
    // PLATE is assigned by `body.length <= 2 && headings.length === 0`, so the
    // page is exempted from the whitespace check BECAUSE it is nearly empty.
    const p2 = assemble(2, [
      line(540, 'and that is the whole of it, once you have seen it written'),
      line(524.5, 'down.'),
      line(30, '2', { size: 9 }),
    ]);
    const { roles, findings } = audit([bodyPage(1), p2, bodyPage(3)]);
    expect(roles[1]!.role).toBe('PLATE');
    expect(stranded(findings, 2)).toBe(true);
    const f = findings.find((x) => x.page === 2 && x.code === 'STRANDED_CONTINUATION')!;
    expect(f.severity).toBe('REVIEW');
    expect(f.suggests).toBe('layout');
  });

  it('fires on a three-line continuation before an opener, which classifies as CHAPTER_END', () => {
    // CHAPTER_END is assigned from the NEXT page alone and says nothing about
    // this one, so three stranded lines are exempt for a reason external to them.
    const p2 = assemble(2, [
      line(540, 'Everything after this point is a lookup, not a read-through.'),
      line(524.5, 'Find the thing that is worrying you, and go to the page it'),
      line(509, 'names.'),
      line(30, '2', { size: 9 }),
    ]);
    const opener = assemble(3, [
      line(540, 'Chapter Two', { size: 24 }),
      line(440, 'The chapter begins here with its first paragraph.'),
      line(30, '3', { size: 9 }),
    ]);
    const { roles, findings } = audit([bodyPage(1), p2, opener, bodyPage(4)]);
    expect(roles[1]!.role).toBe('CHAPTER_END');
    expect(stranded(findings, 2)).toBe(true);
  });

  it('leaves a real illustration plate alone: the page carries image ink', () => {
    // 252 x 168pt is the placement this book's stamped illustrations actually
    // use -- 17.5% of a 5.5 x 8.5in page, well over the 2% bar.
    //
    // The caption sits at the TOP of the text block ON PURPOSE, so the
    // vertical-position condition cannot exclude this page and the IMAGE guard
    // is the only thing that can. A fixture excluded by two conditions at once
    // proves neither of them.
    const plate = assemble(
      2,
      [line(540, 'A small zipped pouch, closed and waiting.'), line(30, '2', { size: 9 })],
      { images: [{ x0: 72, x1: 324, y0: 200, y1: 368 }] },
    );
    const { findings } = audit([bodyPage(1), plate, bodyPage(3)]);
    expect(stranded(findings, 2)).toBe(false);
  });

  it('leaves a four-line closing beat alone: it is a composition, not a fragment', () => {
    const beat = assemble(2, [
      line(400, 'Here it is, from an adult, in writing:'),
      line(370, 'Your body is yours. Nobody else gets a say in who touches it,'),
      line(354.5, 'or when, or how. Not a friend, not a relative, not a'),
      line(339, 'stranger, and not an adult.'),
      line(30, '2', { size: 9 }),
    ]);
    const { findings } = audit([bodyPage(1), beat, bodyPage(3)]);
    expect(stranded(findings, 2)).toBe(false);
  });

  it('leaves a parity blank alone: there is no body to strand', () => {
    const { findings } = audit([bodyPage(1), assemble(2, []), bodyPage(3)]);
    expect(stranded(findings, 2)).toBe(false);
  });

  it('leaves a chapter opener alone: it carries a heading', () => {
    const opener = assemble(2, [
      line(540, 'Chapter Two', { size: 24 }),
      line(440, 'The chapter begins here.'),
      line(30, '2', { size: 9 }),
    ]);
    const { roles, findings } = audit([bodyPage(1), opener, bodyPage(3)]);
    expect(roles[1]!.role).toBe('CHAPTER_OPENER');
    expect(stranded(findings, 2)).toBe(false);
  });

  /**
   * THE POSITION PAIR. Same three lines, same emptiness, same absence of a
   * heading or an image -- only the vertical position differs. Everything the
   * rule can see is held constant except the one thing under test.
   */
  describe('position is what separates stranded from placed', () => {
    const NOTE = [
      'And if your question is not here — there is a much longer version',
      'of this list at the back, with about thirty-five questions on it.',
      'Look there next.',
    ];
    const at = (top: number) =>
      assemble(2, [
        ...NOTE.map((s, i) => line(top - i * NORMS.leadingPt, s)),
        line(30, '2', { size: 9 }),
      ]);

    it('fires when a short continuation starts at the top of the text block', () => {
      const { findings } = audit([bodyPage(1), at(NORMS.textBlockTopPt), bodyPage(3)]);
      expect(stranded(findings, 2)).toBe(true);
    });

    it('does not fire on the same content placed lower down the page', () => {
      // A fifth of the way in — the depth the approved closing beat sits at.
      const lower = NORMS.textBlockTopPt - NORMS.leadingPt * 6;
      const { findings } = audit([bodyPage(1), at(lower), bodyPage(3)]);
      expect(stranded(findings, 2)).toBe(false);
    });

    it('tolerates one line of slack, so a hair below the top still counts', () => {
      const { findings } = audit([
        bodyPage(1),
        at(NORMS.textBlockTopPt - NORMS.leadingPt),
        bodyPage(3),
      ]);
      expect(stranded(findings, 2)).toBe(true);
    });
  });

  it('does not fire on a full body page, which is the whole book', () => {
    const { findings } = audit([bodyPage(1), bodyPage(2), bodyPage(3)]);
    expect(codes(findings)).not.toContain('STRANDED_CONTINUATION');
  });

  it('is REVIEW, never a hard failure: a short page is not automatically defective', () => {
    const p2 = assemble(2, [line(540, 'down.'), line(30, '2', { size: 9 })]);
    const { status } = audit([bodyPage(1), p2, bodyPage(3)]);
    expect(status.status).not.toBe('BLOCKED');
  });
});

describe('typographic residue', () => {
  /** A real body page carrying one extra line, so the page keeps role BODY. */
  const withLine = (text: string) => {
    const p2 = bodyPage(2);
    const extra = line(200, text);
    return audit([bodyPage(1), assemble(2, [...p2.lines, extra]), bodyPage(3)]);
  };

  it('a scene-break ornament is NOT unrendered markup', () => {
    // This shipped as four HARD_FAILs on a real, correct book.
    expect(codes(withLine('***').findings)).not.toContain('LITERAL_MARKUP');
  });

  it('but genuine unrendered markup is a hard failure', () => {
    const f = withLine('## A heading that never rendered').findings;
    expect(codes(f)).toContain('LITERAL_MARKUP');
    expect(f.find((x) => x.code === 'LITERAL_MARKUP')!.severity).toBe('HARD_FAIL');
  });

  it('catches a missing glyph', () => {
    expect(codes(withLine('A word with a � in it').findings)).toContain('MISSING_GLYPH');
  });

  it('catches a doubled word', () => {
    expect(codes(withLine('This sentence contains contains a doubled word.').findings)).toContain('DUPLICATED_TOKEN');
  });

  it('suggests a text correction for residue, not a layout one', () => {
    const f = withLine('Two  spaces here.').findings.find((x) => x.code === 'DOUBLE_SPACE');
    expect(f?.suggests).toBe('text');
  });
});

describe('geometry', () => {
  it('a wrong page size is a hard failure', () => {
    const m = model([bodyPage(1)]);
    const roles = classifyPages(m.pages, NORMS);
    const f = runDeterministicRules(m, roles, { expectedTrimPt: { widthPt: 432, heightPt: 648 } });
    expect(codes(f)).toContain('PAGE_SIZE');
    expect(statusOf(f).status).toBe('BLOCKED');
  });

  it('content past the page edge is a hard failure', () => {
    const off = assemble(2, [...bodyPage(2).lines, line(200, 'This runs off', { x1: W + 20 })]);
    expect(codes(audit([bodyPage(1), off, bodyPage(3)]).findings)).toContain('CONTENT_OFF_PAGE');
  });
});

describe('running furniture', () => {
  it('furniture on a page that must be empty is a hard failure', () => {
    const blankWithFolio = assemble(2, [line(30, '2', { size: 9 })]);
    const { roles, findings } = audit([bodyPage(1), blankWithFolio, bodyPage(3)]);
    expect(roles[1]!.role).toBe('PARITY_BLANK');
    expect(codes(findings)).toContain('FURNITURE_ON_BLANK');
  });

  it('a running head disagreeing with configuration is a hard failure', () => {
    const p = assemble(2, [...bodyPage(2).lines, line(580, 'Wrong Head', { size: 9 })]);
    const m = model([bodyPage(1), p, bodyPage(3)]);
    const roles = classifyPages(m.pages, NORMS);
    const f = runDeterministicRules(m, roles, { expectedRunningHead: { 2: 'Right Head' } });
    const hit = f.find((x) => x.code === 'RUNNING_HEAD_MISMATCH');
    expect(hit?.severity).toBe('HARD_FAIL');
    expect(hit?.suggests).toBe('runningHead');
  });

  it('markup in furniture is a hard failure', () => {
    const p = assemble(2, [...bodyPage(2).lines, line(580, '**Chapter**', { size: 9 })]);
    expect(codes(audit([bodyPage(1), p, bodyPage(3)]).findings)).toContain('FURNITURE_RESIDUE');
  });
});

describe('status', () => {
  it('PASS when nothing is found', () => {
    expect(statusOf([]).status).toBe('PASS');
  });

  it('PASS_WITH_REVIEW never blocks', () => {
    expect(statusOf([{ page: 1, code: 'WIDOW', severity: 'REVIEW', role: 'BODY', detail: '' }]).status).toBe(
      'PASS_WITH_REVIEW',
    );
  });

  it('one HARD_FAIL blocks', () => {
    expect(
      statusOf([
        { page: 1, code: 'WIDOW', severity: 'REVIEW', role: 'BODY', detail: '' },
        { page: 2, code: 'PAGE_SIZE', severity: 'HARD_FAIL', role: 'BODY', detail: '' },
      ]).status,
    ).toBe('BLOCKED');
  });

  it('EXPECTED findings never affect status', () => {
    expect(
      statusOf([{ page: 1, code: 'SPARSE_BY_DESIGN', severity: 'EXPECTED', role: 'CHAPTER_OPENER', detail: '' }])
        .status,
    ).toBe('PASS');
  });
});

describe('the audit reports and never repairs', () => {
  it('produces findings without mutating the model it was given', () => {
    const pages = [bodyPage(1), bodyPage(2)];
    const snapshot = JSON.stringify(pages);
    audit(pages);
    expect(JSON.stringify(pages)).toBe(snapshot);
  });

  it('every actionable finding names a Phase 2 correction type, never an edit', () => {
    const bad = assemble(2, [line(400, 'Two  spaces.'), line(30, '2', { size: 9 })]);
    for (const f of audit([bodyPage(1), bad, bodyPage(3)]).findings) {
      if (f.suggests) {
        expect(['text', 'layout', 'headingDisplay', 'runningHead', 'tocDisplay', 'illustration']).toContain(f.suggests);
      }
    }
  });
});
