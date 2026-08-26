/**
 * WHAT EACH PAGE IS FOR.
 *
 * This layer exists because without it the QA generates confident nonsense. A
 * chapter opener is SUPPOSED to be two thirds empty. A parity blank is supposed
 * to be entirely empty. A part divider is supposed to carry six words in the
 * middle of nowhere. Flagging those as sparse would bury the one body page that
 * genuinely broke, which is the failure mode that makes a QA system get ignored.
 *
 * Roles are inferred from the finished PDF, not declared by hand, because the
 * point is to audit what shipped rather than what someone believed shipped. A
 * book can still override a page's role explicitly when inference is wrong, and
 * that override is a book-local decision like any other.
 */
import type { BookNorms, ModelPage } from './page-model.js';
import { isHeadingSize } from './page-model.js';

export type PageRole =
  /** Ordinary running text. The only role with a real density expectation. */
  | 'BODY'
  /** Opens a chapter: display heading high on the page, text starting below it. */
  | 'CHAPTER_OPENER'
  /** A part title, alone. Sparse by design. */
  | 'PART_DIVIDER'
  /** The last page of a section. Trailing whitespace is normal here. */
  | 'CHAPTER_END'
  /** Deliberately empty, so the next section opens recto. Must stay empty. */
  | 'PARITY_BLANK'
  /** Title, copyright, dedication and similar. */
  | 'FRONT_MATTER'
  | 'CONTENTS'
  | 'APPENDIX'
  | 'SOURCES'
  /** A full-page plate. Little or no body text is correct. */
  | 'PLATE';

export interface RoleAssignment {
  page: number;
  role: PageRole;
  /** Why the classifier decided this, so a wrong call can be argued with. */
  evidence: string;
  /** Below this, a page of this role is worth a look. Null means no expectation. */
  minDensity: number | null;
  /** Should this page carry a folio and running head? */
  expectsFurniture: boolean;
}

/** What each role tolerates. The whole point of the role model. */
const EXPECTATION: Record<PageRole, { minDensity: number | null; expectsFurniture: boolean }> = {
  BODY: { minDensity: 0.55, expectsFurniture: true },
  CHAPTER_OPENER: { minDensity: null, expectsFurniture: true },
  PART_DIVIDER: { minDensity: null, expectsFurniture: false },
  CHAPTER_END: { minDensity: null, expectsFurniture: true },
  PARITY_BLANK: { minDensity: null, expectsFurniture: false },
  FRONT_MATTER: { minDensity: null, expectsFurniture: false },
  CONTENTS: { minDensity: null, expectsFurniture: true },
  APPENDIX: { minDensity: 0.45, expectsFurniture: true },
  SOURCES: { minDensity: null, expectsFurniture: true },
  PLATE: { minDensity: null, expectsFurniture: false },
};

export interface ClassifyOptions {
  /** Book-local role overrides, keyed by 1-based page number. */
  overrides?: Record<number, PageRole>;
  /**
   * How many pages at the front are front matter before the body starts.
   * Inferred when omitted: the first page carrying a chapter-style opener.
   */
  frontMatterUntil?: number;
}

export function classifyPages(
  pages: ModelPage[],
  norms: BookNorms,
  opts: ClassifyOptions = {},
): RoleAssignment[] {
  /**
   * A contents LIST usually runs past the page carrying the word "Contents".
   * Its entries are a title and a folio separated by a long gap, which is not a
   * paragraph and must not be measured as one.
   */
  const contentsPages = new Set<number>();
  for (const p of pages) {
    const looksLikeEntries =
      p.body.length > 3 &&
      p.body.filter((l) => /\d{1,4}\s*$/.test(l.text.trim())).length >= p.body.length * 0.6;
    const declares = p.lines.some((l) => /^\s*contents\s*$/i.test(l.text.trim()));
    if (declares) contentsPages.add(p.n);
    else if (looksLikeEntries && contentsPages.has(p.n - 1)) contentsPages.add(p.n);
  }

  const openerPages = new Set<number>();
  for (const p of pages) if (looksLikeOpener(p, norms)) openerPages.add(p.n);

  /**
   * FRONT MATTER RUNS UNTIL THE FOLIOS START.
   *
   * Inferring it from the first display heading was wrong on a real book: a
   * title page carries the largest type in the volume, so page 1 classified as
   * a chapter opener and every front-matter page after it as BODY, which then
   * reported a near-empty half-title as a sparse defect.
   *
   * Printed front matter is unfoliated or romanised. The first page carrying an
   * arabic folio is where the body starts.
   */
  const firstFoliated = pages.find((p) =>
    p.furniture.some((l) => /^\s*\d{1,4}\s*$/.test(l.text)),
  )?.n;
  const frontMatterUntil = opts.frontMatterUntil ?? (firstFoliated ? firstFoliated - 1 : 0);

  return pages.map((p, i) => {
    const override = opts.overrides?.[p.n];
    if (override) {
      return { page: p.n, role: override, evidence: 'declared by the book', ...EXPECTATION[override] };
    }
    const { role, evidence } = infer(p, pages[i + 1], norms, openerPages, frontMatterUntil, contentsPages);
    return { page: p.n, role, evidence, ...EXPECTATION[role] };
  });
}

function infer(
  p: ModelPage,
  next: ModelPage | undefined,
  norms: BookNorms,
  openerPages: Set<number>,
  frontMatterUntil: number,
  contentsPages: Set<number>,
): { role: PageRole; evidence: string } {
  // A page carrying nothing but a folio is still a blank: it is the folio that
  // makes it a defect, and FURNITURE_ON_BLANK could never fire while "blank"
  // meant "no marks at all".
  if (p.blank || p.body.length === 0) {
    return { role: 'PARITY_BLANK', evidence: p.blank ? 'no text on the page' : 'no body text, only furniture' };
  }

  const allText = p.lines.map((l) => l.text).join(' ');
  const headingText = p.headings.map((h) => h.text).join(' ');

  if (contentsPages.has(p.n)) {
    return { role: 'CONTENTS', evidence: 'a contents list' };
  }
  if (/\bpart\s+(one|two|three|four|\d+|[IVX]+)\b/i.test(headingText) && p.body.length <= 6) {
    return { role: 'PART_DIVIDER', evidence: 'a part heading, and almost nothing else' };
  }
  if (/\bappendix\b/i.test(headingText) || /\bappendix\b/i.test(furnitureText(p))) {
    return { role: 'APPENDIX', evidence: 'appendix heading or running head' };
  }
  if (/\b(sources|bibliography|further reading|references)\b/i.test(headingText)) {
    return { role: 'SOURCES', evidence: 'a sources heading' };
  }
  // FRONT MATTER FIRST. A title page carries the largest type in the book and
  // would otherwise classify as a chapter opener.
  if (p.n <= frontMatterUntil) {
    return { role: 'FRONT_MATTER', evidence: `page ${p.n} is before the first foliated page` };
  }
  if (openerPages.has(p.n)) {
    return { role: 'CHAPTER_OPENER', evidence: 'a display heading at the head of the page' };
  }
  // A plate page: hardly any text, but not empty, and no heading to explain it.
  if (p.body.length > 0 && p.body.length <= 2 && p.headings.length === 0) {
    return { role: 'PLATE', evidence: 'almost no text and no heading' };
  }
  // The last page of a section: the next page opens something new.
  if (next && (openerPages.has(next.n) || next.blank)) {
    return { role: 'CHAPTER_END', evidence: 'the following page opens a new section' };
  }
  void allText;
  return { role: 'BODY', evidence: 'running text' };
}

const furnitureText = (p: ModelPage): string => p.furniture.map((l) => l.text).join(' ');

/**
 * A chapter opener: a display-sized heading in the upper part of the page, with
 * the text block starting below it rather than at the top margin.
 */
function looksLikeOpener(p: ModelPage, norms: BookNorms): boolean {
  if (p.blank || p.body.length === 0) return false;
  const big = p.body.filter((l) => l.size > norms.bodySizePt + 2.5);
  if (big.length === 0) return false;
  const topmost = Math.max(...big.map((l) => l.y));
  // In the top 45% of the page, and the page is not merely a body page that
  // happens to carry a subheading further down.
  return topmost > p.heightPt * 0.55 && big.some((l) => Math.abs(l.y - topmost) < 1);
}

/** Roles where an empty or near-empty page is the correct outcome. */
export const SPARSE_BY_DESIGN: readonly PageRole[] = [
  'PARITY_BLANK',
  'PART_DIVIDER',
  'CHAPTER_OPENER',
  'CHAPTER_END',
  'PLATE',
  'FRONT_MATTER',
];
