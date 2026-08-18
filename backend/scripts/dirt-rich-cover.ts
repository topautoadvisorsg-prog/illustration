/**
 * DIRT RICH front cover — art direction, prompt, preflight, and generation.
 *
 * Goes through the platform's own cover pipeline (`buildCoverRequest`) rather
 * than calling the image model directly, because that is what injects the wrap
 * geometry, the safe lines and the spine width as PERCENTAGES OF THE MODEL'S OWN
 * CANVAS. Told only "a 0.31 inch spine", a model paints a spine several times
 * too wide — nothing in prose converts an inch into a fraction of a canvas.
 *
 * ─── ART DIRECTION, AND WHERE IT COMES FROM ───────────────────────────────
 * Modelled on the direction that produced NO ONE TOLD ME THAT, read out of that
 * project's stored config rather than remembered:
 *
 *   "A designed graphic cover for a boy aged 9 to 14. Deep saturated cobalt
 *    field, one signal-orange accent, flat bold shapes and generous empty space.
 *    A few large simple objects only. Nothing clinical, nothing cute."
 *
 * The formula is one saturated field, one accent, a few large objects, generous
 * empty space — and a closing negative aimed at the book's own failure mode. For
 * a puberty book that risk is reading clinical or babyish. For this book it is
 * FARMHOUSE FANTASY, so the closing line names that instead.
 *
 *   yarn tsx scripts/dirt-rich-cover.ts             # prompt + preflight only
 *   yarn tsx scripts/dirt-rich-cover.ts --generate  # $0.05, one shot
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { ProjectConfigSchema } from '@wildlands/shared';
import { getProject } from '../src/db/repositories/projects.repo.js';
import { buildCoverRequest } from '../src/pipeline/cover/build-cover-request.js';
import { generateImage } from '../src/services/openai/openai.js';
import { AVG_COST_PER_IMAGE_USD } from '../src/services/cost/estimate.js';

const PROJECT_ID = '55d7bce0-2f71-4f02-8131-e6c750c8506e';
const OUT = 'C:/Users/jovan/Downloads/dirt-rich-cover';
const GENERATE = process.argv.includes('--generate');
mkdirSync(OUT, { recursive: true });

const project = await getProject(PROJECT_ID);
if (!project) throw new Error('project not found');
const config = ProjectConfigSchema.parse(project.config);

// Art direction and back-cover copy are set by dirt-rich-cover-copy.ts. This
// script only builds and generates, so the two cannot drift apart.
// Pin the PHOTOGRAPHIC cover look for this book only.
//
// The production profile pins `graphic-trade-cover`, which forbids photographic
// rendering outright — so the operator's photoreal art direction was overruled
// by the DNA three times in a row, silently. Passing the edition DNA here
// overrides it for DIRT RICH without touching the profile, so NO ONE TOLD ME
// THAT keeps its flat cover.
const req = await buildCoverRequest(PROJECT_ID, config, {
  editionStyleDnaId: 'photographic-trade-cover',
  // The model does not letter the author name; code sets it afterwards at an
  // exact height. Four prompted attempts put it at 90-96% of the canvas after
  // being told to end by 86%.
  authorTypeSetBy: 'deterministic',
});

writeFileSync(`${OUT}/cover-prompt.txt`, req.prompt, 'utf8');
writeFileSync(`${OUT}/cover-blueprint.png`, req.blueprintPng);
console.log(`page count : ${req.spec.provenance.pageCountSource} -> ${req.spec.geometry.pageCount}`);
console.log(`spine      : ${req.spec.geometry.dims.spineIn.toFixed(3)}in, spine text allowed: ${req.spec.spineTextAllowed}`);
console.log(`spine type : set by ${req.spec.spineTypeSetBy}`);
console.log(`prompt     : ${req.prompt.length} chars -> ${OUT}/cover-prompt.txt`);
console.log(`blueprint  : ${OUT}/cover-blueprint.png\n`);

console.log('PREFLIGHT');
for (const c of req.preflight.checks ?? []) {
  console.log(`  ${c.status.padEnd(5)} ${c.label}: ${c.detail}`);
}
console.log(`  overall: ${req.preflight.status ?? '(none)'}\n`);

if (!GENERATE) {
  console.log('PROMPT ONLY — nothing generated. Re-run with --generate.');
  process.exit(0);
}

console.log(`generating — $${AVG_COST_PER_IMAGE_USD.toFixed(2)}, one shot, no retry`);
const img = await generateImage({ prompt: req.prompt, size: '1536x1024', quality: 'high' });
writeFileSync(`${OUT}/_artwork-no-author.png`, img.pngBuffer);
console.log(`  ok  ${img.widthPx}x${img.heightPx}  ${Math.round(img.pngBuffer.length / 1024)}KB (no author lettering)`);

if (req.spec.authorTypeSetBy === 'deterministic') {
  const { typesetAuthorOntoCover, DEFAULT_AUTHOR_PLACEMENT } = await import('../src/pipeline/cover/author-typesetter.js');
  // Centre of the FRONT panel on the model canvas, from the resolved geometry —
  // not a guess, and it moves correctly if the trim or page count ever changes.
  const fp = req.spec.geometry.modelPx.frontPanel;
  const mc = req.spec.geometry.modelCanvas;
  const centreFraction = (fp.x + fp.w / 2) / mc.widthPx;
  const set = await typesetAuthorOntoCover(img.pngBuffer, {
    ...DEFAULT_AUTHOR_PLACEMENT,
    author: req.spec.copy.author,
    centreFraction,
  });
  writeFileSync(`${OUT}/dirt-rich-cover-wrap.png`, set.png);
  console.log(`  author "${req.spec.copy.author}" set by CODE at baseline ${set.baselinePx}px of ${set.heightPx}px`);
  console.log(`  clear artwork beneath: ${(set.clearanceFraction * 100).toFixed(1)}% of height`);
} else {
  writeFileSync(`${OUT}/dirt-rich-cover-wrap.png`, img.pngBuffer);
}
console.log(`  -> ${OUT}/dirt-rich-cover-wrap.png`);
