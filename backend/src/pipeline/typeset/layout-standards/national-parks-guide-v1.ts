/**
 * NATIONAL PARKS GUIDE TYPESET LAYOUT — v1
 *
 * A 6x9 adult trade paperback for a first-timer's travel guide. DERIVED from
 * `trade-nonfiction-guide-typeset@1` — same trim, same measure, same type scale,
 * same ragged-right decision — and differing only where this book's components
 * differ from DIRT RICH's.
 *
 * `trade-nonfiction-guide-typeset@1` and `@2` are NOT touched by this file, and
 * DIRT RICH does not change pin. A new class of book is a REGISTERED STANDARD,
 * never an edit to the renderer or to someone else's approved design.
 *
 * ─── WHAT THIS BOOK HAS THAT DIRT RICH DOES NOT ───────────────────────────
 * 7 NATIONAL PARKS WITHOUT THE ROOKIE MISTAKES, 33,421 words, 23 divisions,
 * 12 numbered chapters, zero illustrations. Its furniture:
 *
 *   NOBODY WARNED ME     7 recurring mid-chapter sections, 125-258 words each,
 *                        one per park. Boxed.
 *   SKIP IT / DO THIS    16 blockquote boxes opening with a `###` label.
 *   warning callouts     16 paragraphs opened with the warning sign, all of
 *                        them safety copy. Set with a drawn inline mark, NOT
 *                        promoted to panels — see below.
 *   reference tables     5 tables, 46 rows. One is five columns wide and cannot
 *                        be a grid at this measure — see `tables`.
 *   structural rules     128 horizontal rules, every one of them touching a
 *                        heading — see `blocks.sceneBreakAtHeading`.
 *
 * ─── WHY THE WARNINGS ARE NOT PANELS ──────────────────────────────────────
 * The obvious move is to route all sixteen through `alertPanel`, which is what
 * that component is for. It is the wrong move here and the operator ruled on it
 * directly: these sit inline in the middle of running advice, one every few
 * pages, and boxing each one would change the rhythm of every safety passage in
 * the book. The drawn mark carries the signal on its own, hanging in the margin
 * so the warning keeps the same left edge as the prose around it.
 *
 * The panel is spent instead on NOBODY WARNED ME, which is a titled section
 * rather than a sentence and is the one recurring beat the reader is meant to
 * stop at.
 */
import type { TypesetLayoutStandard } from './types.js';
import { TRADE_NONFICTION_GUIDE_TYPESET_V1 } from './trade-nonfiction-guide-v1.js';

export const NATIONAL_PARKS_GUIDE_TYPESET_V1: TypesetLayoutStandard = {
  ...TRADE_NONFICTION_GUIDE_TYPESET_V1,

  id: 'national-parks-guide-typeset@1',
  label: 'National Parks Guide — 6x9 (v1)',
  description:
    'Adult trade travel guide at 6x9. The trade-nonfiction geometry and type scale, with boxed recurring callout sections, drawn inline safety marks, structural rules suppressed at headings, and a stacked fallback for tables too wide to set as a grid.',

  /**
   * Chapters are authored as `# 4 — Great Smoky Mountains`, so the number and
   * the short title arrive already separated and the opener sets as
   * `CHAPTER 4` over `Great Smoky Mountains`. Inherited from the trade standard
   * unchanged; recorded here because it is the reason `titleSource: 'parsed'`
   * is correct for this book too.
   */
  opener: { ...TRADE_NONFICTION_GUIDE_TYPESET_V1.opener },

  /**
   * This book heads its appendix `⟶ ALL FIGURES IN THIS APPENDIX ARE CURRENT AS
   * OF: August 2026`. The running head and the contents entry already drop that
   * arrow — a CSS string cannot carry an SVG, and the transliterated `->` printed
   * along the top of pages 113 and 115 of the proof, where it read as a mistake.
   *
   * Leaving it on the display heading alone made the three disagree about the
   * same title, and at display size a leading arrow hangs outside the left edge
   * of the measure and throws the optical centring off.
   *
   * Set HERE rather than in the renderer: this is one book's typography, not a
   * platform rule. Every other standard omits the field and keeps `draw`.
   */
  headingDrawnMarks: 'strip',

  /**
   * A HEADING KEEPS TWO LINES OF TEXT WITH IT, NOT ONE BLOCK.
   *
   * Binding a heading to the next paragraph is enough only when that paragraph
   * runs to two lines. When it is a single line the whole unit still fits at the
   * foot of a page, so the reader gets a heading, one line, and a page turn --
   * the defect the binding exists to prevent, moved one line further on.
   *
   * This book has exactly two such headings and both shipped that way twice:
   *   p58  "Below the rim: who should, who shouldn't, and which trail"
   *        over "Descending even a little changes the park from a view into a
   *        place. If you can, do it."                        86 characters
   *   p64  "Wildlife and what to look for"
   *        over "The most dangerous animal at the Grand Canyon is a squirrel.
   *        I'm not being cute."                              80 characters
   *
   * MEASURED ON THIS TRIM, never inherited. 87 clears both observed lines and
   * sits just under the 87.79 ceiling this standard's own 4.625in measure can
   * physically set at 11pt, so it can never become a threshold that fires on
   * every heading in the book. 88 was tried first and the provenance test
   * rejected it on exactly that arithmetic, which is the guard working.
   *
   * The alternative, forcing each heading to the next page with break-before,
   * was tried and is worse: it fixed the heading and left a two-thirds-empty
   * page behind it.
   */
  headingBind: { extraParagraphUnderChars: 87 },

  blocks: {
    ...TRADE_NONFICTION_GUIDE_TYPESET_V1.blocks,
    /**
     * Every rule in this manuscript is a structural divider: 108 of 128 sit
     * immediately before a heading and the other 20 immediately after one. None
     * of them separates two passages of prose, which is the only thing a scene
     * break is for. Printed literally they would set 128 rows of asterisks
     * through a 130-page interior, one above nearly every heading in the book.
     */
    sceneBreakAtHeading: 'drop-at-heading',
  },

  /**
   * NOBODY WARNED ME, boxed.
   *
   * `keepTogether` stays FALSE as a book-wide policy, and the panels that must
   * not break are pinned individually instead. That is not the tidier option;
   * it is the one the pages allow.
   *
   * Turning it on globally was tried and measured. These panels run 125-258
   * words, so a panel that starts low moves whole to the next leaf and pushes
   * roughly three inches of text down the rest of the chapter. In chapters 6
   * and 9 that space was not spare: it was the white at the chapter end that
   * the closing plates sit in. The build dropped two of the fifteen plates,
   * correctly refusing art that no longer fit, and the book lost more than it
   * gained.
   *
   * So the break is decided per panel, in national-parks-layout-overrides.ts,
   * where the cost can be checked against the plate that shares the chapter.
   * See the split-panel rules in typeset-book.ts: a panel that IS allowed to
   * break is supposed to read as one box continuing, and pp87-88 showed that
   * treatment is not reaching the rendered page. Until that is fixed, any panel
   * that would split needs pinning rather than trusting the continuation.
   */
  alertPanel: {
    enabled: true,
    headings: ['NOBODY WARNED ME'],
    labelPt: 10.5,
    labelLetterSpacingEm: 0.14,
    borderPt: 0.75,
    paddingEm: 0.85,
    marginYEm: 1,
    keepTogether: false,
  },

  /**
   * OFF. This book's chapters close on ordinary prose — there is no recurring
   * named closing beat to key on, and wiring the component to a heading that
   * does not exist would produce nothing while looking configured.
   */
  chapterTakeaway: {
    ...TRADE_NONFICTION_GUIDE_TYPESET_V1.chapterTakeaway,
    enabled: false,
    headings: [],
  },

  /**
   * OFF. DIRT RICH needed it for a source list written as citation-then-URL soft
   * breaks. This book strips its citation apparatus by design — 258 stubs
   * removed before export — and has no section where the authored LINE is the
   * unit of meaning.
   */
  quickAnswerIndex: {
    ...TRADE_NONFICTION_GUIDE_TYPESET_V1.quickAnswerIndex,
    enabled: false,
    sectionTitles: [],
  },

  /**
   * OFF. There are no URLs in the body text — the handoff says so and a scan
   * confirms it — so there is no long token to break and no reason to carry a
   * rule that can reflow a line.
   */
  longTokens: {
    mode: 'none',
    minTokenLength: 28,
    breakAnywhereFallback: false,
  },

  /**
   * Five tables, 46 rows: entry requirements (3 col), entrance fees (2 col),
   * additional permits (5 col), reservation release timing (3 col), seasonal
   * roads (3 col).
   *
   * `stackWhenColumnsExceed: 4` catches exactly one of them — the five-column
   * permits table, whose widest cell reads "Timed Entry + Bear Lake Road if your
   * day touches the Bear Lake corridor; plain Timed Entry for everywhere else".
   * Divided five ways the 4.625in measure gives that column under an inch, about
   * eleven characters, and the row sets as a vertical smear of one-word lines.
   * There is no trim at which it works as a grid.
   *
   * The other four stay grids: at two and three columns they have the width they
   * need, and stacking them would turn a scannable comparison into a list.
   */
  tables: {
    // 9pt against 11pt body: a table is scanned, not read.
    typePt: 9,
    cellPaddingEm: 0.3,
    headerRulePt: 1,
    rowRulePt: 0.25,
    breakPolicy: 'keep-together',
    repeatHeader: false,
    stackWhenColumnsExceed: 4,
    stackedLabelPt: 8.5,
  },

  /**
   * OFF. Zero fenced blocks in the manuscript, so this would style nothing —
   * and leaving a component enabled that matches nothing is how a standard
   * starts to describe a book it is not for.
   */
  preformatted: undefined,
};
