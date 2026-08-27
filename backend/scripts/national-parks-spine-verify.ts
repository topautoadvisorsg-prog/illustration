/**
 * INDEPENDENT SPINE VERIFICATION for the staged 7 NATIONAL PARKS covers.
 *
 * Deliberately not the build's own report. This starts from the delivery folder,
 * pins each file by hash, re-derives the spine plan from source, and measures the
 * typography again — so a number can only survive if it reproduces.
 *
 * WHY THE TYPOGRAPHY IS MEASURED IN ISOLATION AND NOT ON THE COVER.
 * A detector run over the finished wrap cannot tell cream lettering from sunlit
 * cloud; that mistake was made three times on these books and produced three
 * different wrong answers, including a "FAIL" on a cover that was fine. The
 * typography is therefore rendered ALONE on transparency and measured on alpha,
 * where nothing in the picture can reach it. What links that measurement to the
 * shipped file is the hash check below: the staged bytes are the bytes the same
 * plan produced.
 *
 *   node ../node_modules/tsx/dist/cli.mjs scripts/national-parks-spine-verify.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { planSpineType } from '../src/pipeline/publishing-standard/spine-type.js';
import { getKdpCoverDimensions } from '../src/pipeline/publishing-standard/kdp-cover-specs.js';
import { PAGE_THICKNESS_IN } from '../src/pipeline/publishing-standard/cover-dimensions.js';

const DEL = 'C:/Users/jovan/Downloads/7-NATIONAL-PARKS-KDP-UPLOAD';
const DPI = 300;
const TITLE = '7 National Parks Without the Rookie Mistakes';
const AUTHOR = 'Wes Denman';
const GAP_IN = 0.5;
/** KDP's hard floor, and the house target that sits above it. */
const KDP_FLOOR_IN = 0.0625;
const TARGET_IN = 0.075;
/** Title and author must not crowd each other down the spine. */
const MIN_LINE_GAP_IN = 0.2;

const PAGES = 116;
const PB_SPINE = PAGES * PAGE_THICKNESS_IN.white;
const hc = getKdpCoverDimensions({
  binding: 'HARDCOVER',
  coverType: 'CASE_LAMINATE',
  interiorType: 'BLACK_AND_WHITE',
  paperType: 'WHITE',
  trimSize: '6x9',
  pageCount: PAGES,
});

interface Edition {
  name: string;
  file: string;
  expectSha: string;
  wrapWIn: number;
  wrapHIn: number;
  spineIn: number;
  safeStripIn: number;
  safeLenIn: number;
}

const EDITIONS: Edition[] = [
  {
    name: 'PAPERBACK',
    file: 'paperback/7-national-parks-cover-6x9-116pp.pdf',
    expectSha: 'e1cd19ae146a39290d26bed78d5fe962af94c94fb7704173d23c428fc566842d',
    wrapWIn: 0.125 * 2 + 6 * 2 + PB_SPINE,
    wrapHIn: 9.25,
    spineIn: PB_SPINE,
    safeStripIn: PB_SPINE - 2 * KDP_FLOOR_IN,
    safeLenIn: 8.5,
  },
  {
    name: 'HARDCOVER',
    file: 'hardcover/7-national-parks-HARDCOVER-6x9-116pp.pdf',
    expectSha: '75c142e346eab4825226fddf77f8a41f95a31adbf14d880a8b2ffaec5d2f7d3e',
    wrapWIn: hc.fullWidthIn,
    wrapHIn: hc.fullHeightIn,
    spineIn: hc.spineIn,
    safeStripIn: hc.spineSafeWidthIn,
    safeLenIn: hc.spineSafeHeightIn,
  },
];

let failures = 0;
const check = (ok: boolean, label: string, detail: string): void => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(38)} ${detail}`);
};

for (const e of EDITIONS) {
  const bytes = readFileSync(path.join(DEL, ...e.file.split('/')));
  const sha = createHash('sha256').update(bytes).digest('hex');
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(0);

  console.log(`\n${e.name}  ${e.file}`);
  check(sha === e.expectSha, 'staged bytes are the ones verified', `${sha.slice(0, 16)}…`);
  check(pdf.getPageCount() === 1, 'single page', `${pdf.getPageCount()} page(s)`);
  check(
    Math.abs(page.getWidth() / 72 - e.wrapWIn) < 0.002 && Math.abs(page.getHeight() / 72 - e.wrapHIn) < 0.002,
    'wrap geometry',
    `${(page.getWidth() / 72).toFixed(4)} x ${(page.getHeight() / 72).toFixed(4)}in`,
  );

  const H = Math.round(e.wrapHIn * DPI);
  const spineWpx = Math.round(e.spineIn * DPI);
  const plan = await planSpineType({
    title: TITLE,
    author: AUTHOR,
    wrapHeightPx: H,
    spineWidthPx: spineWpx,
    foldSafeWidthPx: Math.round(e.safeStripIn * DPI),
    safeLengthPx: Math.round(e.safeLenIn * DPI),
    gapPx: Math.round(GAP_IN * DPI),
    targetClearPx: Math.round(TARGET_IN * DPI),
  });

  const inIn = (px: number): string => (px / DPI).toFixed(4);
  console.log(`        title ${plan.titlePx}px (cap ${plan.titleCapPx}px), author ${plan.authorPx}px`);
  check(
    plan.titleClearLeftPx / DPI >= TARGET_IN && plan.titleClearRightPx / DPI >= TARGET_IN,
    'title + halo clears the house target',
    `${inIn(plan.titleClearLeftPx)} / ${inIn(plan.titleClearRightPx)}in (need ${TARGET_IN})`,
  );
  check(
    plan.authorClearLeftPx / DPI >= TARGET_IN && plan.authorClearRightPx / DPI >= TARGET_IN,
    'author + halo clears the house target',
    `${inIn(plan.authorClearLeftPx)} / ${inIn(plan.authorClearRightPx)}in (need ${TARGET_IN})`,
  );
  check(
    plan.measuredClearPerSidePx / DPI >= KDP_FLOOR_IN,
    "no fold crossing (KDP's own floor)",
    `worst side ${inIn(plan.measuredClearPerSidePx)}in (floor ${KDP_FLOOR_IN})`,
  );
  check(
    plan.measuredImbalancePx / DPI <= 0.02,
    'cross-axis centring',
    `${inIn(plan.measuredImbalancePx)}in imbalance`,
  );

  /* Collision: look DOWN the spine at the isolated typography and find the
     largest clear gap. On a correct spine that gap is the space between title
     and author; on a collided one it collapses to a word space. */
  const strip = await sharp(Buffer.from(plan.svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rowHasInk: boolean[] = new Array(strip.info.height).fill(false);
  for (let y = 0; y < strip.info.height; y += 1) {
    for (let x = 0; x < strip.info.width; x += 1) {
      if (strip.data[(y * strip.info.width + x) * strip.info.channels + 3]! > 0) {
        rowHasInk[y] = true;
        break;
      }
    }
  }
  const gaps: number[] = [];
  let run = 0;
  let seenInk = false;
  for (let y = 0; y < rowHasInk.length; y += 1) {
    if (rowHasInk[y]) {
      if (seenInk && run > 0) gaps.push(run);
      seenInk = true;
      run = 0;
    } else if (seenInk) run += 1;
  }
  gaps.sort((a, b) => b - a);
  const biggest = (gaps[0] ?? 0) / DPI;
  const runnerUp = (gaps[1] ?? 0) / DPI;
  check(
    biggest >= MIN_LINE_GAP_IN,
    'title and author do not collide',
    `largest gap ${biggest.toFixed(3)}in, next ${runnerUp.toFixed(3)}in (need ${MIN_LINE_GAP_IN})`,
  );
}

console.log(
  failures === 0
    ? '\nSPINE VERIFICATION: PASS — both staged covers reproduce and clear the house target'
    : `\nSPINE VERIFICATION: FAIL — ${failures} failure(s)`,
);
process.exit(failures === 0 ? 0 : 1);
