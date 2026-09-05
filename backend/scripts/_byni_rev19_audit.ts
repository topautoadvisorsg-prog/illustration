/**
 * BEFORE YOU NEED IT — the rev-19 audit the owner asked for, in his order.
 *
 *   1. page count
 *   2. every illustration: where it landed, how big it prints, at what PPI,
 *      whether it is clipped, and whether it got separated from its passage
 *   3. sparse pages across the WHOLE book, diffed against rev-18 so that
 *      "newly sparse" means newly sparse and not merely sparse
 *
 * Reports. Fixes nothing. The owner asked to see defects before they are
 * touched, and the last time whitespace was allowed to drive a decision it
 * produced seven illustrations nobody wanted.
 *
 *   yarn tsx scripts/_byni_rev19_audit.ts
 *
 * Local and free.
 */
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { buildPageModel, type ModelPage, type BookNorms } from '../src/pipeline/page-qa/page-model.js';
import { classifyPages, SPARSE_BY_DESIGN } from '../src/pipeline/page-qa/page-roles.js';
import { INTERIOR_PDF, OUT_DIR } from './before-you-need-it-config.js';

// BASELINE IS THE TEXT-ONLY PROOF, NOT rev-18 ILLUSTRATED.
// rev-18 ILLUSTRATED carries the seven retired stamps, and all seven sat on
// chapter-end pages -- p12, p31, p40, p49, p66, p115, p132. Diffing against it
// would score the REMOVAL of failed art as nine new holes, when those holes are
// what the old program was placed into. The proof is the same 172pp of text
// with no art at all, which is the only honest "before".
const REV18 = `${OUT_DIR}/BEFORE-YOU-NEED-IT_interior_rev18_proof-04.pdf`;
const PT = 72;

/** Lowest ink on the page — text or art, whichever reaches further down. */
const lowestInk = (p: ModelPage): number => {
  const t = p.textBox ? p.textBox.y0 : Infinity;
  const a = p.images.length ? Math.min(...p.images.map((b) => b.y0)) : Infinity;
  return Math.min(t, a);
};

/** How much of the text block's height is left white below the last ink. */
const emptyFoot = (p: ModelPage, n: BookNorms): number => {
  const low = lowestInk(p);
  if (!Number.isFinite(low)) return 1;
  return Math.max(0, (low - n.textBlockBottomPt) / (n.textBlockTopPt - n.textBlockBottomPt));
};

const now = await buildPageModel(readFileSync(INTERIOR_PDF));
const was = await buildPageModel(readFileSync(REV18));
const N = now.norms;
const roles = new Map(classifyPages(now.pages, now.norms).map((r) => [r.page, r.role]));
const wasRoles = new Map(classifyPages(was.pages, was.norms).map((r) => [r.page, r.role]));
const byDesign = new Set<string>(SPARSE_BY_DESIGN);

console.log('═══ 1. PAGE COUNT');
console.log(`  rev-18  ${was.pageCount} pages   (text-only proof, 0 art)`);
console.log(`  rev-19  ${now.pageCount} pages   (five figures in the flow)`);
console.log(`  delta   ${now.pageCount - was.pageCount >= 0 ? '+' : ''}${now.pageCount - was.pageCount}`);
console.log(`  text block ${N.textBlockTopPt.toFixed(1)} -> ${N.textBlockBottomPt.toFixed(1)}pt, leading ${N.leadingPt.toFixed(1)}pt`);

console.log('\n═══ 2. ILLUSTRATION AUDIT');
const withArt = now.pages.filter((p) => p.images.length);
console.log(`  pages carrying painted art: ${withArt.length}`);
const src = JSON.parse(readFileSync(`${OUT_DIR}/figures/FIGURE-MANIFEST.json`, 'utf8')) as Array<{
  id: string; file: string; chapter: string; teaches: string; widthPx: number; heightPx: number;
}>;
// Figures appear in manuscript order, so the Nth art-bearing page is the Nth figure.
for (const [i, p] of withArt.entries()) {
  const m = src[i];
  const b = p.images[0]!;
  const wIn = (b.x1 - b.x0) / PT;
  const hIn = (b.y1 - b.y0) / PT;
  const png = await sharp(`${OUT_DIR}/figures/${m!.id}.png`).metadata();
  const ppi = Math.round(png.width! / wIn);
  const measure = N.measurePt / PT;
  const overWide = b.x1 - b.x0 > N.measurePt + 2;
  const offTop = b.y1 > N.textBlockTopPt + N.leadingPt;
  const offBottom = b.y0 < N.textBlockBottomPt - N.leadingPt;
  const above = p.body.filter((l) => l.y > b.y1).length;
  const below = p.body.filter((l) => l.y < b.y0).length;
  console.log(`\n  ${m!.id}  ->  p${p.n}   ${m!.chapter}`);
  console.log(`     prints ${wIn.toFixed(2)} x ${hIn.toFixed(2)} in   source ${png.width}x${png.height}px   ${ppi} PPI`);
  console.log(`     measure is ${measure.toFixed(2)}in — ${overWide ? 'OVER-WIDE' : 'inside the measure'}`);
  console.log(`     clipping: top ${offTop ? 'OFF-BLOCK' : 'ok'}, bottom ${offBottom ? 'OFF-BLOCK' : 'ok'}`);
  console.log(`     ${above} body lines above it on the page, ${below} below`);
  console.log(`     page is ${(emptyFoot(p, N) * 100).toFixed(0)}% empty at the foot`);
  console.log(`     teaches: ${m!.teaches}`);
}

console.log('\n═══ 3. SPARSE PAGES, WHOLE BOOK');
const rowsNow = now.pages.map((p) => ({ p, e: emptyFoot(p, N) }));
const OVER = 0.25;
const flagged = rowsNow.filter((r) => r.e > OVER).sort((a, b) => a.p.n - b.p.n);
// rev-18 sparse set, keyed by the first body line so a page can be traced across a reflow.
const key = (p: ModelPage): string => (p.body[0]?.text ?? p.furniture[0]?.text ?? `#${p.n}`).slice(0, 48);
const wasSparse = new Map(
  was.pages.filter((p) => emptyFoot(p, was.norms) > OVER).map((p) => [key(p), { n: p.n, e: emptyFoot(p, was.norms) }]),
);
console.log(`  rev-18: ${wasSparse.size} pages over ${OVER * 100}% empty`);
console.log(`  rev-19: ${flagged.length} pages over ${OVER * 100}% empty\n`);
console.log('  pg   empty  role                     was-in-rev18   opening line');
for (const { p, e } of flagged) {
  const prior = wasSparse.get(key(p));
  const role = roles.get(p.n) ?? '?';
  const tag = prior ? `yes p${prior.n} ${(prior.e * 100).toFixed(0)}%` : 'NEW';
  const head = (p.headings[0]?.text ?? p.body[0]?.text ?? (p.images.length ? '(art)' : '(empty)')).slice(0, 42);
  console.log(
    `  ${String(p.n).padStart(3)}  ${(e * 100).toFixed(0).padStart(4)}%  ${role.padEnd(24)} ${tag.padEnd(14)} ${head}`,
  );
}
const news = flagged.filter((r) => !wasSparse.has(key(r.p)));
console.log(`\n  NEWLY sparse: ${news.length}${news.length ? ` -> p${news.map((r) => r.p.n).join(', p')}` : ''}`);
console.log(`  of which sparse-by-design roles: ${news.filter((r) => byDesign.has(roles.get(r.p.n) ?? '')).length}`);
void wasRoles;
process.exit(0);
