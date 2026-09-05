/**
 * Chapter-end fill, rev-18 vs rev-19, matched BY CHAPTER.
 *
 * Matching sparse pages by their opening line is wrong across a reflow: the
 * text that lands on a chapter's last page changes, so an unchanged situation
 * reports as NEW. A chapter is stable; its last page is what to compare.
 */
import { readFileSync } from 'node:fs';
import { buildPageModel, type ModelPage, type PageModel } from '../src/pipeline/page-qa/page-model.js';
import { INTERIOR_PDF, OUT_DIR } from './before-you-need-it-config.js';

const low = (p: ModelPage): number => {
  const t = p.textBox ? p.textBox.y0 : Infinity;
  const a = p.images.length ? Math.min(...p.images.map((b) => b.y0)) : Infinity;
  return Math.min(t, a);
};
const empty = (p: ModelPage, m: PageModel): number => {
  const l = low(p);
  if (!Number.isFinite(l)) return 1;
  return Math.max(0, (l - m.norms.textBlockBottomPt) / (m.norms.textBlockTopPt - m.norms.textBlockBottomPt));
};
/** A chapter opener: a page whose largest heading names a chapter. */
const openers = (m: PageModel) =>
  m.pages
    .map((p) => ({ p, h: p.headings.map((x) => x.text).join(' ') }))
    .filter((x) => /^\s*Chapter\s+\d+/i.test(x.h))
    .map((x) => ({ n: x.p.n, title: x.h.replace(/\s+/g, ' ').trim().slice(0, 30) }));

const A = await buildPageModel(readFileSync(`${OUT_DIR}/BEFORE-YOU-NEED-IT_interior_rev18_proof-04.pdf`));
const B = await buildPageModel(readFileSync(INTERIOR_PDF));
const oa = openers(A);
const ob = openers(B);
console.log(`rev-18 chapter openers ${oa.length}   rev-19 ${ob.length}\n`);
console.log('chapter                                  rev18 last  %empty | rev19 last  %empty | change');
for (const [i, c] of ob.entries()) {
  const endB = (ob[i + 1]?.n ?? B.pageCount + 1) - 1;
  const endA = (oa[i + 1]?.n ?? A.pageCount + 1) - 1;
  const pa = A.pages[endA - 1]!;
  const ea = empty(pa, A) * 100;
  const eb = empty(B.pages[endB - 1]!, B) * 100;
  const d = eb - ea;
  console.log(
    `${c.title.padEnd(40)} p${String(endA).padStart(4)} ${ea.toFixed(0).padStart(5)}% | ` +
      `p${String(endB).padStart(4)} ${eb.toFixed(0).padStart(5)}% | ${(d >= 0 ? '+' : '') + d.toFixed(0)}`,
  );
}
process.exit(0);
