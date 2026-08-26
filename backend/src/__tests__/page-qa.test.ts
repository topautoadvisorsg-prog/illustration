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

const NORMS: BookNorms = { bodySizePt: 12, leadingPt: 15.5, measurePt: 313 };
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
