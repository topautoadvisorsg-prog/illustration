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
   * `keepTogether: false` deliberately. These run 125-258 words — the longest is
   * about four fifths of a page — and forcing the box whole would push a
   * near-page-length panel to the next leaf whenever it started low, buying a
   * large hole in the middle of a chapter. The heading is the panel's label, so
   * a box that does break still announces itself at the top; a page-sized hole
   * has nothing to recommend it. Judged again on the rendered pages.
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
