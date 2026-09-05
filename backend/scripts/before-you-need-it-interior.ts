/**
 * BEFORE YOU NEED IT — build the shipping interior.
 *
 * REPLACES THE STAMPING STEP. From rev-19 the five figures are part of the
 * manuscript flow, so the render IS the finished book: there is no second pass
 * drawing art onto a finished PDF, and nothing can end up on a different page
 * from the sentence it explains.
 *
 * `before-you-need-it-place-illustrations.ts` is retired for this book. It
 * stamped the seven concepts that failed the concept audit — the volume dial,
 * the bra on a chair, the seedlings, the dotted line and the four-circle cycle
 * among them — and none of those assets is referenced any more.
 *
 *   yarn tsx scripts/before-you-need-it-interior.ts
 *
 * Local and free.
 */
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { FIGURES, INTERIOR_PDF, REV, RENDER_INPUT, readManuscript } from './before-you-need-it-config.js';

const { md, sha } = readManuscript();
console.log(`${REV}  manuscript sha ${sha.slice(0, 16)}…`);

const render = await renderTypesetBook({ ...RENDER_INPUT, markdown: md });
const r = render.report;

writeFileSync(INTERIOR_PDF, render.pdf);

// A figure whose asset is missing falls through to literal markdown rather than
// a broken image, so an absent figure is silent unless it is counted.
const drawn = Object.keys(FIGURES).filter((id) => render.html.includes(FIGURES[id]!.slice(400, 500)));
// `<figure class="tset-figure">` is NOT what ends up in the HTML: every block
// gets a data-block-id injected into its opening tag after emission, so an
// exact-tag match silently finds zero. Match the element, not the literal tag.
const figureTags = (render.html.match(/<figure[\s>]/g) ?? []).length;

console.log(`\n  ${r.totalPages} pages, ${r.blankPages.length} blanks, ` +
  `${r.verticalOverflowPages.length} vertical overflow, ${r.horizontalOverflow.length} horizontal overflow`);
console.log(`  figures in the flow: ${figureTags} of ${Object.keys(FIGURES).length}`);
if (figureTags !== Object.keys(FIGURES).length) {
  console.error(`  ABORT: expected ${Object.keys(FIGURES).length} figures, rendered ${figureTags}`);
  process.exit(2);
}
void drawn;

console.log(`\n  sha256 ${createHash('sha256').update(render.pdf).digest('hex')}`);
console.log(`  -> ${INTERIOR_PDF}`);
process.exit(0);
