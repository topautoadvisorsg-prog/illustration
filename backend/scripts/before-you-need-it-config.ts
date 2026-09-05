/**
 * BEFORE YOU NEED IT — the one production configuration.
 *
 * WHY THIS FILE EXISTS. The proof script and the page-shooter each built their
 * own `ProjectConfig`. When the proof gained two layout overrides, the shooter
 * did not, so the greyscale proofs were pictures of a DIFFERENT BOOK from the
 * one being verified — and they showed a widow the audit had just reported
 * fixed. Nothing failed; the two simply disagreed, silently, which is worse.
 *
 * Anything that renders this book imports from here. Divergence is now a
 * compile error rather than a discrepancy nobody notices.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ProjectConfigSchema } from '@wildlands/shared';
import { EDUCATIONAL_NONFICTION_TYPESET_V4 } from '../src/pipeline/typeset/layout-standards/educational-nonfiction-v4.js';

export const BOOK = 'C:/Users/jovan/Downloads/before-you-need-it';
export const REV = 'rev-19';
export const MANUSCRIPT = `${BOOK}/01-WORKING/${REV}/BEFORE-YOU-NEED-IT_MANUSCRIPT.md`;
export const OUT_DIR = `${BOOK}/06-PRODUCTION`;

/**
 * THE INTERIOR THAT SHIPS. Derived from `REV`, never spelled out.
 *
 * This filename was hardcoded in EIGHT places across seven scripts. Bumping the
 * revision renamed what the build WROTE while both cover builds, the contents
 * check, the whitespace check, the contact sheets and the delivery packager all
 * went on READING the previous revision by name — so a cover could be composed
 * against one book while a different one shipped. Nothing would have failed.
 */
export const INTERIOR_PDF = `${OUT_DIR}/BEFORE-YOU-NEED-IT_interior_${REV.replace('-', '')}_ILLUSTRATED.pdf`;
export const INTERIOR_NAME = INTERIOR_PDF.split('/').pop()!;

/**
 * rev-18. A different hash means the wrong file.
 *
 * rev-18 is rev-17 plus SIX copy corrections and nothing else: a redundant
 * "entire whole", a pronoun pointing at the wrong person, an unparseable double
 * verb, a stray article, the book's only dangling `if` clause, and a
 * subject/verb disagreement. Six lines changed, 44,462 words, no factual,
 * medical or safety content touched.
 *
 * rev-17 stays on disk untouched — it is the 172-page candidate the covers and
 * the Kindle edition were built against, and it has to remain comparable.
 */
export const EXPECTED_SHA = '6cb9362e5e5f060f7ec16eca967c046fb343749d1b07afb5e0528e2780687661';

export const STANDARD = EDUCATIONAL_NONFICTION_TYPESET_V4;

/** From the structural inventory, decided before any render. */
export const EXPECTED_SAME_DAY = 6;
export const EXPECTED_IMMEDIATE = 2;

/** Reads the manuscript and refuses anything that is not `REV`. */
export function readManuscript(): { md: string; sha: string } {
  const raw = readFileSync(MANUSCRIPT);
  const sha = createHash('sha256').update(raw).digest('hex');
  if (sha !== EXPECTED_SHA) {
    console.error(`ABORT: not ${REV} (${sha})`);
    process.exit(2);
  }
  return { md: raw.toString('utf8'), sha };
}

export const CONFIG = ProjectConfigSchema.parse({
  volume: 1,
  title: 'Before You Need It',
  /**
   * THE COMPLETE SUBTITLE, including the audience tail.
   *
   * The manuscript title block and both covers carry "— For Girls 8-12"; this
   * value did not, so the interior title page shipped a shortened form of the
   * same subtitle. Accidental, introduced here rather than decided.
   */
  subtitle:
    'A Mother’s Honest Guide to Periods, Puberty, and Everything Nobody Explains — For Girls 8–12',
  authorName: 'Margo Teale',
  productionProfileId: 'bw-educational-nonfiction',
  trimSize: STANDARD.trim,
  typography: {
    bodyPt: STANDARD.type.bodyPt,
    lineHeight: STANDARD.type.lineHeight,
    headingFont: STANDARD.type.headingFont,
    bodyFont: STANDARD.type.bodyFont,
  },
  typesetLayoutStandardId: STANDARD.id,
  /**
   * TWO WIDOWS, judged individually rather than swept.
   *
   * Both are accidental continuation fragments: the tail of a paragraph
   * stranded alone at the top of a page, directly above a heading. Holding the
   * paragraph together moves it whole to the next page, which is the bounded,
   * approved control for exactly this.
   *
   * The third finding, p5's "This book is for you.", is deliberately NOT fixed.
   * It is the opening sentence of the book, set as its own paragraph under a
   * section heading that sits on the SAME page, so nothing carried over and
   * there is no fragment to repair. Compressing it would flatten a deliberate
   * beat to make a detector green.
   */
  layoutOverrides: {
    '04789c43': { keepTogether: true, note: 'p68 widow: "five minutes earlier." stranded above a heading' },
    '8fd35cac': { keepTogether: true, note: 'p100 widow: "options are for." stranded above a heading' },
    /**
     * p154 — the consent chapter's closing statement, four lines on an
     * otherwise empty leaf, jammed against the top margin so it read as
     * leftover rather than as an ending.
     *
     * A PLAIN DROP, NOT THE `closing-beat` VARIANT. That variant sets
     * `text-align: center`, but every standard from @2 onward is ragged right
     * via `text-align-last: left` — so it centres every line except the last,
     * which snaps flush left and reads as a mistake. Proven on this page and on
     * p8. The bounded spacing override achieves the same composition with no
     * alignment side-effect.
     *
     * ATTACHED TO THE LEAD-IN, deliberately. Attaching it to the closing
     * statement puts the gap BETWEEN "Here it is, from an adult, in writing:"
     * and the sentence it announces, separating the two. The whole unit has to
     * move together.
     */
    'd987d0b9': { spaceBeforeEm: 6, note: 'p154: drop the closing unit clear of the top margin' },
    /**
     * p6 — the two-line bridge closing "Before we start", stranded alone on an
     * otherwise empty leaf at 6% of the text block.
     *
     * PULLED BACK, NOT DRESSED UP. Unlike p154 this block belongs on the page
     * before it and very nearly fits there: p5 ends with 45.5px of the text
     * block unused and the block is 44.8px tall. The ONLY thing keeping it off
     * the page is its own top margin, which this book sets at about 2.7px —
     * paragraphs here are separated by a first-line indent, not by space.
     *
     * So the margin goes and the break is refused. `breakBefore: 'avoid'` alone
     * does NOT work and was measured doing the opposite: with the margin still
     * present the block cannot fit, so the engine satisfies the rule by pushing
     * the PREVIOUS paragraph forward instead, opening a seven-line hole on p5.
     * The two properties are only correct together.
     *
     * WHAT IT COSTS. The empty leaf stops existing, so the book is 174 pages
     * rather than 175 and every page after p5 moves up one. Line breaking is
     * untouched — the measure is identical on recto and verso — and this was
     * verified block by block rather than assumed.
     */
    /**
     * p6/p7 — the "Where to find things" list, set TIGHT so it finishes on its
     * own page.
     *
     * The list ran three lines past the foot of p6 and left its last entry —
     * "And if your question isn't here" — alone on p7 at 9% of the text block.
     * Every other route out was measured and rejected: the note cannot be
     * pulled back as it stands (p6 leaves 45.5px, the entry needs 65.6px);
     * `spaceBeforeEm: 6`, the schema maximum, drops it only 13.6% down and it
     * still reads as leftover; `closing-beat` reproduces the known
     * ragged-right defect; and closing the heading sink by the full 2em bound
     * fits it but pulls the first entry into the heading (-1px gap).
     *
     * Removing the space BETWEEN the entries is the one control that fits the
     * list without compressing anything a reader notices. The space is only
     * ~2.7pt to begin with — this setting separates paragraphs by first-line
     * indent, not by leading — and every entry still opens on an indent and a
     * bold run-in, so the list reads as a list. Rendered and compared before
     * being taken.
     *
     * EIGHT OVERRIDES ON ONE PAGE IS THE SMELL `layout-overrides.ts` DESCRIBES:
     * "If something is wanted on more than a couple of blocks, that is evidence
     * of a systemic gap, and it belongs in the standard." It is right. The
     * standard has no contents-list treatment, and a navigational lookup set as
     * spaced body prose is the actual defect underneath this. Building that
     * treatment is a new layout capability and deliberately out of scope here;
     * this is the bounded local expression of it, recorded so the next book
     * does not rediscover it.
     */
    '264efcd4': { spaceBeforeEm: 0, note: 'p6 list: set tight so the section finishes on one page' },
    '0cdf68ce': { spaceBeforeEm: 0, note: 'p6 list: set tight so the section finishes on one page' },
    'cfc7c686': { spaceBeforeEm: 0, note: 'p6 list: set tight so the section finishes on one page' },
    '7b82fd25': { spaceBeforeEm: 0, note: 'p6 list: set tight so the section finishes on one page' },
    'dc436533': { spaceBeforeEm: 0, note: 'p6 list: set tight so the section finishes on one page' },
    '9320eeca': { spaceBeforeEm: 0, note: 'p6 list: set tight so the section finishes on one page' },
    'ff5cad97': { spaceBeforeEm: 0, note: 'p6 list: set tight so the section finishes on one page' },
    '073541bd': { spaceBeforeEm: 0, note: 'p6 list: set tight so the section finishes on one page' },
    /**
     * p113 — the lead-in that had been left behind by its own sentence.
     *
     * The page ended on "And separately, and most importantly:" and the thing it
     * introduces — "If you ever have thoughts about hurting yourself, tell an
     * adult today." — was overleaf. A colon separated from its object by a page
     * turn, and the object is the most important sentence in that chapter.
     *
     * NOT A WHITESPACE DEFECT. p113 is full, which is why every measurement in
     * this book passed it: `textFill`, `density`, SPARSE_PAGE and
     * STRANDED_CONTINUATION all judge how much is on a page, and this is about
     * WHERE the break falls. It was found by looking at the pages.
     *
     * `keepWithNext` refuses a break after the lead-in, so it travels forward to
     * meet its sentence. Measured before it was taken: 172 pages before and
     * after, no blanks, no overflow, and not one other block moves.
     */
    /**
     * p41 -- Chapter 3's closing callback, "Ruby wore that bra eventually",
     * left as three lines on a 93%-empty leaf.
     *
     * BREAKING HIGHER UP THE SECTION, NOT AT THE HEADING. Breaking before the
     * heading balances the two pages at 16 lines each but opens a 47% hole on
     * p40 -- one bad page traded for two mediocre ones. Breaking here instead
     * moves the three paragraphs that form the closing movement (the fuss, the
     * limits, the Ruby callback) onto p41 together: p40 lands at 21% empty,
     * which is ordinary ragged-bottom setting in this book, and p41 carries
     * nine lines at 74% -- the same shape as the Chapter 14 and 15 closings.
     *
     * Measured, not argued: keepWithNext on this block does nothing at all, and
     * keepWithNext on the paragraph below it reaches only five lines, which
     * clears the detector's three-line threshold without fixing the page.
     */
    'ef8ab5af': { breakBefore: 'page', note: 'p41: carry the whole closing movement, not just the callback' },
    'e1c2ca96': {
      keepWithNext: true,
      note: 'p113: keep the lead-in with the sentence it introduces',
    },
    '798a70fe': {
      spaceBeforeEm: 0,
      breakBefore: 'avoid',
      note: 'p6: close the space above the bridge and refuse the break, so it sits on p5 where it belongs',
    },
  },
});

/** Everything a render of this book needs, so no caller assembles it twice. */
/**
 * THE FIVE APPROVED FIGURES, as data URIs keyed by the name used in the
 * manuscript's `![](name){n%}` lines.
 *
 * FLOWED, NOT STAMPED. The retired set was drawn onto the finished PDF at fixed
 * coordinates, which meant art could only go where there was leftover room —
 * and in a book running 90-100% full that is chapter ends, nowhere near the
 * passage being explained. A flowed figure reserves its own height and stays
 * beside its text.
 */
export const FIGURES: Record<string, string> = Object.fromEntries(
  ['ch03-bra-types', 'ch03-breast-bud', 'ch06-three-openings', 'ch06-menstrual-cycle', 'ch09-tampon-angle'].map(
    (id) => [id, `data:image/png;base64,${readFileSync(`${OUT_DIR}/figures/${id}.png`).toString('base64')}`],
  ),
);

export const RENDER_INPUT = {
  config: CONFIG,
  layoutStandard: STANDARD,
  images: FIGURES,
  /**
   * NO PARITY BLANKS. Owner decision: chapters run on to whatever page comes
   * next rather than being forced onto a right-hand page. The premium
   * recto-opening convention costs a blank leaf roughly half the time, and this
   * book is not spending paper on it.
   */
  chaptersStartRecto: false,
  frontMatter: {},
} as const;
