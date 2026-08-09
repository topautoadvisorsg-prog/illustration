/**
 * EDUCATIONAL NONFICTION TYPESET LAYOUT — v1
 *
 * The design approved on NO ONE TOLD ME THAT (5.5x8.5 digest, B&W, text-first,
 * for readers 9-14). Every value here was previously a constant inside the CSS
 * template literal in `typeset-book.ts`; extracting them changed nothing about
 * the page, which is the point — this file IS the approved proof, expressed as
 * data instead of as a diff.
 *
 * LOCKED. Do not edit these values to improve the design. Register a `@2` and
 * let projects move to it deliberately: books already approved on `@1` must keep
 * rendering exactly as they were approved. See `registry.ts`.
 *
 * Approved proof: 155 pages, 14 parity blanks, 0 overflow, 28/28 sections,
 * Archivo display over EB Garamond text at 12pt/1.3.
 */
import type { TypesetLayoutStandard } from './types.js';

export const EDUCATIONAL_NONFICTION_TYPESET_V1: TypesetLayoutStandard = {
  id: 'educational-nonfiction-typeset@1',
  label: 'Educational Nonfiction — Digest (v1)',
  description:
    'Text-first B&W educational nonfiction at 5.5x8.5. Justified EB Garamond text under an Archivo display face, chapters opening recto on a one-third sink.',

  // A text interior has nothing running to the edge, so it prints with no bleed.
  trim: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },

  margins: {
    topIn: 0.625,
    bottomIn: 0.625,
    outsideIn: 0.5,
    // 0.625in covers KDP's 151-300pp band, where a normal trade book lands.
    gutterIn: 0.625,
    gutterByPageCount: [
      { maxPages: 150, gutterIn: 0.5 },
      { maxPages: 300, gutterIn: 0.625 },
      { maxPages: 500, gutterIn: 0.75 },
      { maxPages: 700, gutterIn: 0.875 },
    ],
  },

  type: {
    headingFont: 'Archivo',
    bodyFont: 'EB Garamond',
    bodyPt: 12,
    lineHeight: 1.3,
    sectionHeadingPt: 13,
    subsectionHeadingPt: 12.5,
    labelPt: 8.5,
    captionPt: 9,
    chapterTitleScale: 1.6,
    // Kicker 10pt -> 11pt (labelPt 8.5 + 2.5). At 10pt it read undersized
    // against the 19pt chapter title. Face, tracking, caps and centring
    // deliberately unchanged.
    kickerPtDelta: 2.5,
    folioPtDelta: 1,
  },

  paragraphs: {
    indentEm: 1.2,
    // APPROVED 2026-08-09 after comparing 0 / 0.25 / 0.35 on a dense body page.
    // At 0 the page read as one continuous block — correct for a novel, too
    // packed for a 9-14 reader dipping in and out of a practical guide. 0.35
    // was airy enough to start looking like a worksheet. 0.25 separates
    // paragraphs into visible units while the page still reads as a book.
    // The 1.2em indent is KEPT: the two work together rather than either/or.
    spacingEm: 0.25,
    firstParagraphFlush: true,
    justify: true,
    hyphenate: true,
    orphans: 2,
    widows: 2,
  },

  opener: {
    // APPROVED 2026-08-09 after a three-way comparison at 33% / 27% / 25% on the
    // real Chapter One opener. At 33% the first line of reading text landed at
    // roughly the middle of the page — a literary drop that read as empty for a
    // practical guide. 25% was efficient but tight enough that the opening
    // moment stopped feeling deliberate. 27% keeps the drop and starts the body
    // ~44% down instead of ~49%.
    // 33% -> 27% -> 24%. Each step moved the first line of reading text higher
    // and freed usable depth below the opener; at 27% it still sat lower than
    // this book wants.
    sinkFraction: 0.24,
    // "Chapter One", not "Chapter 1" — CHAPTER_BOOK_STANDARD.md §3. The label is
    // generated in words and uppercased by style, never pre-uppercased in code.
    labelFormat: 'chapter-word',
    labelTransform: 'uppercase',
    labelLetterSpacingEm: 0.22,
    blockMarginBottomEm: 2,
    centered: true,
  },

  // Premium convention for CHAPTERS only. Back matter starts on the next
  // available page: SOURCES, A NOTE FOR PARENTS and ABOUT THE AUTHOR are each
  // a page or two, and forcing them onto rectos cost three blank pages in the
  // last nine of the book for no reader benefit.
  sectionStart: {
    front: 'recto',
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
    // The drop folio is the one number allowed on an opening page.
    suppressFolioOnOpener: false,
    suppressFurnitureOnBlank: true,
  },

  blocks: {
    sceneBreakMark: '* * *',
    sceneBreakLetterSpacingEm: 0.5,
    listIndentEm: 1.4,
    // 0.18em -> 0.30em. At 0.18 multi-line list items separated LESS clearly
    // than the 0.25em between paragraphs, so a wrapped item read as continuous
    // prose. Items must separate at least as clearly as paragraphs do.
    listItemSpacingEm: 0.3,
    callout: {
      borderLeftPt: 1.5,
      paddingLeftEm: 0.9,
      marginYEm: 0.9,
      italic: false,
      scale: 0.95,
    },
  },

  // Conservative on purpose: 45 words is roughly three lines at this measure,
  // so an ordinary closing subsection is untouched and normal keep-with-next
  // behaviour elsewhere is unchanged.
  terminalMicroSection: {
    enabled: true,
    maxWords: 45,
    tightenedMarginTopEm: 0.5,
  },

  alertPanel: {
    enabled: true,
    // The manuscript signals a safety callout with an ALL-CAPS H3. Both of
    // these recur; the other all-caps H3s in the book are one-off category
    // headings in the Quick-Answer Index and must stay headings.
    // TALK TO SOMEONE IF carries the mental-health guidance, including the
    // self-harm indicators — the content in this book that most needs to be
    // findable by someone scanning for it.
    headings: ['SEE A DOCTOR IF', 'TALK TO SOMEONE IF'],
    labelPt: 10.5,
    labelLetterSpacingEm: 0.12,
    // A real rule on all four sides: the book calls these boxes, so they are
    // boxes. Thin enough not to shout on an uncoated B&W page.
    borderPt: 0.75,
    paddingEm: 0.8,
    marginYEm: 1,
    keepTogether: true,
  },

  chapterTakeaway: {
    enabled: true,
    headings: ['The one thing to remember'],
    // A label, not a heading: smaller than the 13pt H3 it replaces so the block
    // reads as a closing note rather than opening a new section.
    labelPt: 10,
    labelLetterSpacingEm: 0.12,
    labelTransform: 'uppercase',
    // Tighter than an H3's 1.15em, so the takeaway sits with the chapter it
    // closes rather than announcing itself.
    marginTopEm: 0.9,
    labelGapEm: 0.25,
  },
};
