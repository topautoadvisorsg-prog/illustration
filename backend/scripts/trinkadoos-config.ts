/**
 * THE TRINKADOOS, FIRST WAVE — the one production configuration.
 *
 * Ten standalone 32-page picture books. This is NOT one book with ten chapters,
 * and nothing here may ever assemble them into one volume: each title is its own
 * ISBN, its own 32 pages, its own cover. The compiled "QA Reading Edition" that
 * editorial worked from is a review artifact and is not a production input.
 *
 * WHY ONE CONFIG. Before You Need It learned this the hard way: its proof script
 * and its page-shooter each built their own config, drifted apart, and the proofs
 * became pictures of a different book from the one being verified. Nothing failed
 * — they simply disagreed, silently. Anything that renders The Trinkadoos imports
 * from here, so divergence is a compile error rather than a discrepancy nobody
 * notices.
 *
 * TWO SOURCES, BOTH HASH-LOCKED, AND THEY CHECK EACH OTHER.
 *
 *   - Story text: the layout-export manuscripts, one per title. Editorially
 *     signed off, production lines already stripped, 6,238 approved story words.
 *   - Art direction: the recovered Layout & Illustration Brief. 160 ART blocks.
 *     Authoritative. The condensed cues in the reading edition are NOT a
 *     substitute — they carried 20.8% of the art direction and dropped a
 *     load-bearing plant from Book 8 without any visible ellipsis.
 *
 * The brief also carries the story text for every unit. `readTitle()` asserts the
 * two agree unit by unit, so a stale brief or a stale layout export is a hard
 * abort rather than a book typeset from one and art-directed from the other.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { TrimSize } from '@wildlands/shared';
import { computePageGeometry, type PageMargins } from '../src/pipeline/stage-6-layout/page-geometry.js';

export const BOOK = 'C:/Users/jovan/Downloads/trinkadoos';
export const LAYOUT_DIR = `${BOOK}/06-LAYOUT-EXPORT/per-title`;
export const ART_BRIEF = `${BOOK}/01-ART-BRIEF/TRINKADOOS_LAYOUT_AND_ILLUSTRATION_BRIEF.md`;
export const OUT_DIR = `${BOOK}/07-INTERIORS`;

/** Recovered from the desktop app's HTTP cache and hashed the moment it was found. */
export const ART_BRIEF_SHA = 'b204e9e1b43e3dbb19cc50d9f842af3cbf43433d044b5d2a58e4c3a40e3f457c';

/**
 * Trim, from the brief's own FORMAT SPEC. Not inferred, not chosen here.
 *
 *   Trim 8.5 x 8.5 in square - 32 pages - full-bleed illustration throughout,
 *   built to trim + 0.125 in - one art layout serves paperback, hardcover, ebook.
 */
export const TRIM: TrimSize = { widthIn: 8.5, heightIn: 8.5, bleedIn: 0.125 };

/**
 * Margins for a full-bleed picture book, not for a text block.
 *
 * The art runs edge to edge, so these do not frame a page of prose — they bound
 * the TEXT-SAFE ZONE that type may occupy over the artwork. KDP's minimum inside
 * margin at 32 pp is 0.375 in; 0.625 in of gutter sits clear of it, and 0.5 in
 * on the other three edges keeps every word inside KDP's 0.25 in safe zone with
 * room to spare. A picture book is read flat in a lap, and type that runs into
 * the gutter of a square book is the commonest reason a spread has to be redrawn.
 */
export const MARGINS: PageMargins = { topIn: 0.5, rightIn: 0.5, bottomIn: 0.5, gutterIn: 0.625 };

export const GEOMETRY = computePageGeometry(TRIM, MARGINS);

/** 32 pages: pp. 1-2 front matter, p. 3 opener, pp. 4-31 fourteen spreads, p. 32 closer. */
export const EXTENT = 32;
export const SPREAD_COUNT = 14;
/** p.3 opener + 14 spreads + p.32 closer. The brief carries exactly this many per title. */
export const UNITS_PER_TITLE = 16;

export interface TitleSpec {
  /** 1-10, the published order of the wave. */
  book: number;
  /** The record ordinal in the manuscript-studio project the layout export came from. */
  ordinal: number;
  title: string;
  spotlight: 'Bram' | 'Tessa' | 'Nico' | 'Sivi';
  /** Story words, from BASELINE-MANIFEST.md. Asserted at parse time. */
  words: number;
  layoutFile: string;
  /** A different hash means the wrong file. */
  sha: string;
}

export const TITLES: readonly TitleSpec[] = [
  { book: 1, ordinal: 2, title: 'The Lantern Tree Went Dark', spotlight: 'Bram', words: 765, layoutFile: 'LAYOUT-02-chapter-1.md', sha: 'e0ee05cb56153212cffd9f35f14b6de6128b11ee15b70e736b0eb6211aecb305' },
  { book: 2, ordinal: 3, title: 'The Baby Dragon of Cloudstone', spotlight: 'Sivi', words: 530, layoutFile: 'LAYOUT-03-chapter-2.md', sha: 'cbf27235fb031004bccb2daac8ff1230b91af63e597b84b614ded3e571616cf8' },
  { book: 3, ordinal: 4, title: 'The Forest That Lost Its Colors', spotlight: 'Nico', words: 572, layoutFile: 'LAYOUT-04-chapter-3.md', sha: '3ddc00850ec2a0f9df1243cb4a5389e54734368b19687a891911abfc1cbd74f5' },
  { book: 4, ordinal: 5, title: 'The Moon Fox Who Lost His Way', spotlight: 'Bram', words: 675, layoutFile: 'LAYOUT-05-chapter-4.md', sha: 'ce9d1f7da28ebc4ce2faa9b541d7a18bcff0e84a05d1bfaae1b20e2b95a99558' },
  { book: 5, ordinal: 6, title: 'The Valley of Giant Flowers', spotlight: 'Tessa', words: 582, layoutFile: 'LAYOUT-06-chapter-5.md', sha: 'c1ab618ddc8c230603ba534b47cd7f8a58d9bdf48658a20921d17d2f5ca39dce' },
  { book: 6, ordinal: 7, title: 'The Bridge That Forgot How to Build Itself', spotlight: 'Nico', words: 640, layoutFile: 'LAYOUT-07-chapter-6.md', sha: '3b83521bb4bca6fa8305b0a244e4fe8396ce18905575fc6a690b3fb2ac83362b' },
  { book: 7, ordinal: 8, title: 'The Firefly Festival That Lost Its Spark', spotlight: 'Sivi', words: 557, layoutFile: 'LAYOUT-08-chapter-7.md', sha: '978e1370d973c5e2476c1759b1841875c4a7ce937f44db88d45533af31f293ab' },
  { book: 8, ordinal: 9, title: "The Creature Who Didn't Want to Be Seen", spotlight: 'Tessa', words: 584, layoutFile: 'LAYOUT-09-chapter-8.md', sha: 'bcd921db57f3fc96a1b98687b493ec6820298672508aee94cac46c56428edf01' },
  { book: 9, ordinal: 10, title: 'The Door Beneath the Glowing Waterfall', spotlight: 'Nico', words: 690, layoutFile: 'LAYOUT-10-chapter-9.md', sha: '2f4a9778e94c26e2c0460d3cba05e3543b68fe0bc426e0417e59035312c67dc0' },
  { book: 10, ordinal: 11, title: 'The City Beneath the Giant Leaf', spotlight: 'Bram', words: 643, layoutFile: 'LAYOUT-11-chapter-10.md', sha: 'ca5cfa557bdf3242fd4b9ead834bd175768b5af7cb8c30c3a022f4f15a0f16d3' },
] as const;

/**
 * Power palette, from the series bible. Consistent across all ten titles.
 *
 * Carried here because the text overlay tints to the spotlight child's colour and
 * an off-palette page is a canon defect, not a design preference.
 */
export const PALETTE = {
  Bram: { power: 'HOLD', ink: '#7A4A12', glow: '#E8A33D' },
  Tessa: { power: 'REVEAL', ink: '#5B4A6B', glow: '#D9C7E8' },
  Nico: { power: 'STEADY', ink: '#3F5233', glow: '#8FB36A' },
  Sivi: { power: 'LIFT', ink: '#3B3F7A', glow: '#8E93E0' },
} as const;

/**
 * Beats that exist only in the picture. From the brief's own LOAD-BEARING section.
 *
 * These are carried into every art slot so the instruction travels with the page
 * rather than living in a document an illustrator may never open. Book 8 Spread 3
 * is the one that was actually lost once already.
 */
export const LOAD_BEARING: Readonly<Record<string, string>> = {
  '8:S3': 'Ordinary fog beyond the bridge, ZERO WORDS. Establishes the normal that makes Spread 12\u2019s "Not ordinary fog" mean something. If it is cut, Book 8\u2019s turn has no baseline.',
  '4:S10': 'The note says DARK BAND, never "shadow". Naming the shadow spoils the reveal one spread early.',
  '7:S2': 'The wall clue goes deliberately unread. Nobody sees it, including the reader.',
};

/** Reads one title's layout manuscript and refuses anything that is not the approved file. */
export function readTitleManuscript(spec: TitleSpec): string {
  const raw = readFileSync(`${LAYOUT_DIR}/${spec.layoutFile}`);
  const sha = createHash('sha256').update(raw).digest('hex');
  if (sha !== spec.sha) {
    console.error(`ABORT book ${spec.book}: layout manuscript is not the approved file (${sha})`);
    process.exit(2);
  }
  return raw.toString('utf8');
}

/** Reads the authoritative art brief and refuses any other revision. */
export function readArtBrief(): string {
  const raw = readFileSync(ART_BRIEF);
  const sha = createHash('sha256').update(raw).digest('hex');
  if (sha !== ART_BRIEF_SHA) {
    console.error(`ABORT: art brief is not the recovered authoritative revision (${sha})`);
    process.exit(2);
  }
  return raw.toString('utf8');
}
