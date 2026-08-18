/**
 * TRADE NONFICTION GUIDE TYPESET LAYOUT — v1
 *
 * A 6x9 adult trade paperback for a practical how-to guide. DERIVED from the
 * educational-nonfiction line, not a copy of it: the geometry, type size and
 * component set all move, because the reader moved.
 *
 * The educational line is a 5.5x8.5 digest set at 12pt/1.3 for readers 9-14,
 * approved on NO ONE TOLD ME THAT. DIRT RICH is a 37,777-word beginner's guide
 * to backyard homesteading for adults, with three reference tables, a fenced
 * site plan and a 65-entry source list. Same family of book; different trim,
 * different measure, different furniture.
 *
 * `educational-nonfiction-typeset@1` and `@2` are NOT touched by this file, and
 * no shipped book changes pin. This is a new registry entry, which is the whole
 * mechanism: a new class of book is a REGISTERED STANDARD, never an edit to the
 * renderer or to someone else's approved design.
 *
 * ─── WHAT IS INHERITED AND WHAT IS NOT ────────────────────────────────────
 * Inherited, because they were decided on evidence that still applies:
 *   - ragged right (see below)
 *   - orphans/widows at 2 — Paged.js here ignores both properties; raising them
 *     was measured on a real book and fixed nothing
 *   - the 0.24 opener sink, the 1.2em indent with 0.25em paragraph spacing
 *   - the terminal micro-section rescue
 *
 * NOT inherited, because they belong to the other book:
 *   - the alert panel keyed to SEE A DOCTOR IF / TALK TO SOMEONE IF
 *   - the chapter takeaway keyed to "The one thing to remember"
 * Both are OFF here. DIRT RICH's recurring closing beat is "The Honest Version",
 * which appears 11 times — but as a BOLD RUN-IN inside a paragraph, not as a
 * heading, and the alert-panel component matches on heading text. Wiring it to
 * the wrong mechanism would have produced nothing and looked configured. It
 * needs a run-in matcher, which does not exist yet. Left deliberately unstyled.
 */
import type { TypesetLayoutStandard } from './types.js';

export const TRADE_NONFICTION_GUIDE_TYPESET_V1: TypesetLayoutStandard = {
  id: 'trade-nonfiction-guide-typeset@1',
  label: 'Trade Nonfiction Guide — 6x9 (v1)',
  description:
    'Adult trade nonfiction how-to at 6x9. Ragged-right EB Garamond under Archivo, chapters opening recto on a one-third sink, with real tables, preformatted diagrams and controlled URL breaking for dense reference matter.',

  // A text interior has nothing running to the edge, so it prints with no bleed.
  trim: { widthIn: 6, heightIn: 9, bleedIn: 0 },

  /**
   * Wider all round than the digest. At 6x9 the digest's 0.5in fore-edge leaves
   * a 4.875in measure, which at 11pt runs past 75 characters and reads as a
   * textbook. 0.625 outside and 0.75 top/bottom give a 4.625in measure — about
   * 70 characters, the middle of the comfortable band for continuous reading.
   */
  margins: {
    topIn: 0.75,
    bottomIn: 0.75,
    outsideIn: 0.625,
    gutterIn: 0.75,
    // KDP's bands, same policy as the digest: the gutter has to grow with the
    // page count, and a book that crosses a threshold must stay compliant
    // without anyone remembering to adjust it.
    gutterByPageCount: [
      { maxPages: 150, gutterIn: 0.625 },
      { maxPages: 300, gutterIn: 0.75 },
      { maxPages: 500, gutterIn: 0.875 },
      { maxPages: 700, gutterIn: 1 },
    ],
  },

  type: {
    headingFont: 'Archivo',
    bodyFont: 'EB Garamond',
    /**
     * 11pt/1.35. The digest sets 12pt/1.3 for a 9-14 reader on a narrow measure;
     * an adult trade book at 6x9 sets smaller and leads looser. Both values sit
     * inside the declared tunable range (body 10.5-12, leading 1.20-1.45) and
     * are the STARTING setting for the first pagination preview, not a frozen
     * decision — they are judged on rendered pages, as everything here is.
     */
    bodyPt: 11,
    lineHeight: 1.35,
    sectionHeadingPt: 12.5,
    subsectionHeadingPt: 11.5,
    labelPt: 8.5,
    captionPt: 9,
    chapterTitleScale: 1.6,
    kickerPtDelta: 2.5,
    folioPtDelta: 1,
  },

  paragraphs: {
    indentEm: 1.2,
    spacingEm: 0.25,
    firstParagraphFlush: true,
    /**
     * RAGGED RIGHT, for the reason measured on the educational line rather than
     * as a style preference: `hyphens: auto` is a NO-OP in the render Chromium,
     * which loads hyphenation dictionaries through the component updater and has
     * none. Justifying with nothing to hyphenate can only stretch word spaces,
     * and on the last book it produced 105 lines at 2x normal spacing, worst
     * 4.5x. That is a property of the render environment, so it applies at any
     * trim and to any book set here.
     */
    justify: false,
    hyphenate: true,
    // Paged.js here honours `break-inside: avoid` and `break-before: page`, and
    // ignores `orphans` and `widows`. Raising these was tried on a real book,
    // fixed none of the nine cases it was meant to, and orphaned two
    // illustrations. Left at the values that at least cost nothing.
    orphans: 2,
    widows: 2,
  },

  opener: {
    sinkFraction: 0.24,
    /**
     * "Chapter 1", not "Chapter One". The manuscript numbers its own chapters in
     * numerals (`## Chapter 1: Backyard Me v1.0`), and spelling them out in the
     * kicker would contradict the author's own usage everywhere else in the
     * book, including the cross-references in the text.
     */
    labelFormat: 'chapter-numeral',
    labelTransform: 'uppercase',
    labelLetterSpacingEm: 0.22,
    blockMarginBottomEm: 2,
    centered: true,
    /**
     * The number prints ONCE, in the kicker, over the short title — so the
     * opener reads `CHAPTER 1` / `Backyard Me v1.0`. `source` would print the
     * author's full heading instead and must be paired with `labelFormat:
     * 'none'`. Both forms are available because the parser preserves both.
     */
    titleSource: 'parsed',
  },

  /**
   * Chapters open recto; front and back matter take the next available page.
   *
   * The back matter here is TEN sections — The Practical Bits, six appendices, a
   * glossary, the source list and the author note. Forcing each to a recto would
   * buy up to ten blank versos in the last quarter of the book for no reader
   * benefit; the same reasoning cost the last book three blanks in its final
   * nine pages.
   */
  sectionStart: {
    front: 'page',
    chapter: 'recto',
    back: 'page',
  },
  chaptersStartRecto: true,

  furniture: {
    versoRunningHead: 'book-title',
    rectoRunningHead: 'section-title',
    runningHeadSmallCaps: true,
    runningHeadLetterSpacingEm: 0.06,
    folio: 'bottom-center',
    suppressRunningHeadOnOpener: true,
    suppressFolioOnOpener: false,
    suppressFurnitureOnBlank: true,
  },

  blocks: {
    sceneBreakMark: '* * *',
    sceneBreakLetterSpacingEm: 0.5,
    listIndentEm: 1.4,
    // At least as much separation as between paragraphs, or a wrapped list item
    // reads as continuous prose.
    listItemSpacingEm: 0.3,
    callout: {
      borderLeftPt: 1.5,
      paddingLeftEm: 0.9,
      marginYEm: 0.9,
      italic: false,
      scale: 0.95,
    },
  },

  terminalMicroSection: {
    enabled: true,
    maxWords: 45,
    tightenedMarginTopEm: 0.5,
  },

  // OFF — see the header. This book's recurring closing beat is a bold run-in,
  // not a heading, so this component cannot see it.
  chapterTakeaway: {
    enabled: false,
    headings: [],
    labelPt: 10,
    labelLetterSpacingEm: 0.12,
    labelTransform: 'uppercase',
    marginTopEm: 0.9,
    labelGapEm: 0.25,
  },

  // OFF — the headings it matches belong to the puberty book.
  alertPanel: {
    enabled: false,
    headings: [],
    labelPt: 10.5,
    labelLetterSpacingEm: 0.12,
    borderPt: 0.75,
    paddingEm: 0.8,
    marginYEm: 1,
    keepTogether: true,
  },

  /**
   * `Where I Checked` is 65 sources across 17 domains, and each entry is written
   * as a citation line followed by its URL on the next line — a SOFT break.
   * Markdown joins soft-broken lines into one paragraph, which would run every
   * URL into the title of its own source and turn the reference apparatus into
   * unscannable prose. Exactly the failure this component was built for on the
   * last book, arriving in a different section under a different name.
   *
   * Scoped by section title, so it is structural rather than a global change to
   * how the book treats line breaks.
   */
  quickAnswerIndex: {
    enabled: true,
    sectionTitles: ['Where I Checked'],
    entrySpacingEm: 0.3,
    justify: false,
    keepEntryTogether: true,
    // Nothing in this book carries an urgency mark.
    urgentHeadings: [],
  },

  /**
   * 65 source URLs, several over 120 characters against a ~70-character measure.
   * Each is one token, so without break opportunities it simply leaves the text
   * block. Breaks are placed after structural punctuation so each fragment still
   * reads as part of an address.
   */
  longTokens: {
    mode: 'after-punctuation',
    minTokenLength: 28,
    breakAnywhereFallback: true,
  },

  /**
   * Three tables: A.1 at 3x13, B.1 at 2x7, and C.1 at 7 columns x 21 body rows.
   *
   * 9pt against 11pt body — a table is scanned, not read. `keep-together`
   * because C.1 is the book's most-consulted page and the manuscript specifies
   * it must not break across a page turn; at 7 columns it is also the one most
   * likely to want a dedicated page, which is a judgement to make on the
   * rendered spread rather than in advance.
   */
  tables: {
    typePt: 9,
    cellPaddingEm: 0.3,
    headerRulePt: 1,
    rowRulePt: 0.25,
    breakPolicy: 'keep-together',
    repeatHeader: false,
  },

  /**
   * Appendix E's site plan is drawn in box-drawing characters, so the FACE is
   * part of the contract, not a style choice. DejaVu Sans Mono 2.37 is vendored
   * locally and complete for exactly this reason: no Google-served mono face
   * carries U+2500-257F, and neither does any of the eleven faces already
   * vendored here. `preformatted-font-coverage.test.ts` fails if the face cannot
   * draw any character this book actually sets, because a missing glyph is
   * otherwise silent.
   *
   * 8pt/1.1 and shrink-to-measure: the plan is 41 columns wide and has to fit a
   * 4.625in text block without losing its alignment.
   */
  /**
   * Appendix D is eleven GFM task items and its own text says the reader is
   * meant to tick them. A 0.85em box reads as a real checkbox at 11pt without
   * dominating the line, and 0.45em between items gives a pen somewhere to go.
   */
  checklist: {
    boxSizeEm: 0.85,
    boxStrokePt: 0.75,
    boxGapEm: 0.6,
    itemSpacingEm: 0.45,
    keepItemTogether: true,
  },

  preformatted: {
    family: 'DejaVu Sans Mono',
    typePt: 8,
    lineHeight: 1.1,
    fit: 'shrink-to-measure',
    keepTogether: true,
    paddingEm: 0.4,
  },
};
