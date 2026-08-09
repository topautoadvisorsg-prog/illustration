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
    kickerPtDelta: 1.5,
    folioPtDelta: 1,
  },

  paragraphs: {
    indentEm: 1.2,
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
    sinkFraction: 0.27,
    // "Chapter One", not "Chapter 1" — CHAPTER_BOOK_STANDARD.md §3. The label is
    // generated in words and uppercased by style, never pre-uppercased in code.
    labelFormat: 'chapter-word',
    labelTransform: 'uppercase',
    labelLetterSpacingEm: 0.22,
    blockMarginBottomEm: 2,
    centered: true,
  },

  // Premium convention: a chapter always opens on a right-hand page. Costs a
  // blank verso whenever the previous chapter ends on a recto (14 in this book).
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
    listItemSpacingEm: 0.18,
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
};
