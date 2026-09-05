/**
 * BEFORE YOU NEED IT — how much of each page is actually EMPTY.
 *
 * Not textFill, which ignores illustrations and so calls an art page empty. This
 * measures the real thing a reader sees: how far up the page the ink stops, and
 * how much white is left below it.
 *
 *   lowest ink = the bottom of the lowest line box OR the bottom of the lowest
 *                image, whichever is lower
 *   empty foot = that, down to the foot of the text block, as a fraction
 *
 * A page ending 5% short is ordinary ragged-bottom setting. A page ending 60%
 * short is a page with a hole in it, whatever role a classifier assigns it.
 *
 *   yarn tsx scripts/_byni_whitespace.ts [--over=0.25]
 *
 * Local and free.
 */
import { readFileSync } from 'node:fs';
import { buildPageModel } from '../src/pipeline/page-qa/page-model.js';
import { classifyPages } from '../src/pipeline/page-qa/page-roles.js';
import { INTERIOR_PDF, OUT_DIR } from './before-you-need-it-config.js';

const OVER = Number(process.argv.find((a) => a.startsWith('--over='))?.slice(7) ?? 0.25);
const PDF = INTERIOR_PDF;

const model = await buildPageModel(readFileSync(PDF));
const roles = new Map(classifyPages(model.pages, model.norms).map((r) => [r.page, r.role]));
const { textBlockTopPt: TOP, textBlockBottomPt: BOTTOM } = model.norms;
const BLOCK = TOP - BOTTOM;

interface Row {
  n: number;
  role: string;
  emptyFoot: number;
  lowestInk: number;
  lines: number;
  art: boolean;
}

const rows: Row[] = [];
for (const p of model.pages) {
  if (!p.textBox && !p.images.length) continue;
  const textLow = p.textBox ? p.textBox.y0 : Infinity;
  const artLow = p.images.length ? Math.min(...p.images.map((b) => b.y0)) : Infinity;
  const lowestInk = Math.min(textLow, artLow);
  if (!Number.isFinite(lowestInk)) continue;
  rows.push({
    n: p.n,
    role: roles.get(p.n) ?? '?',
    emptyFoot: Math.max(0, (lowestInk - BOTTOM) / BLOCK),
    lowestInk,
    lines: p.body.length,
    art: p.images.length > 0,
  });
}

const flagged = rows.filter((r) => r.emptyFoot > OVER).sort((a, b) => b.emptyFoot - a.emptyFoot);

console.log(`text block ${TOP.toFixed(1)} down to ${BOTTOM.toFixed(1)}pt (${BLOCK.toFixed(1)}pt tall)`);
console.log(`${model.pageCount} pages; ${flagged.length} end more than ${(OVER * 100).toFixed(0)}% short.\n`);
console.log('  page  empty foot   lines  art   role');
console.log('  ' + '─'.repeat(58));
for (const r of flagged) {
  console.log(
    `  p${String(r.n).padStart(3)}   ${(r.emptyFoot * 100).toFixed(0).padStart(3)}%        ` +
      `${String(r.lines).padStart(3)}   ${r.art ? 'YES' : ' — '}   ${r.role}`,
  );
}

const noArt = flagged.filter((r) => !r.art);
console.log(`\n  ${flagged.length} short pages, of which ${noArt.length} carry NO illustration:`);
console.log(`  ${noArt.map((r) => `p${r.n}`).join(', ')}`);
process.exit(0);
