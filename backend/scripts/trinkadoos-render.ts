/**
 * THE TRINKADOOS — render one scene's artwork, text-free.
 *
 * Reads the prompt from the committed prompt set rather than taking it as an
 * argument, so what is rendered is always what was reviewed. A prompt retyped
 * at the command line is a prompt nobody approved.
 *
 * References are attached as the edit-endpoint image, which is how the approved
 * character sheets control identity. The reference list per scene comes from
 * RENDER-CHECKLIST.md's rules, encoded here.
 *
 * PAID. One image per run, no batching, no retries. Nothing here composites
 * typography -- that is trinkadoos-opener.ts, and it runs after the still is
 * approved.
 *
 * Usage: tsx scripts/trinkadoos-render.ts <sceneNumber>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { generateImageFromBlueprint, assertRenderableSize, type ImageSize } from '../src/services/openai/openai.js';
import { BOOK } from './trinkadoos-config.js';

const PROMPTS = `${BOOK}/08-VIDEO-LAYER/BOOK-01-IMAGE-PROMPTS.md`;
const REFS = 'C:/Users/jovan/Downloads/wildlands agents platform/docs/trinkadoos/references/characters';
const OUT = `${BOOK}/10-ARTWORK`;

/**
 * Reference sheets and output size per scene.
 *
 * Single pages render 1024x1024; spreads render 2048x1024, which is a TRUE 2:1 --
 * both edges multiples of 16, ratio well inside the 3:1 limit. gpt-image-2 takes
 * custom resolutions, so there is no reason to render 1.5:1 and crop away a third
 * of the height of a composition that was designed for the full width.
 *
 * Scenes carrying two sheets send two. They are never merged into one composite
 * first: a stitched sheet is a picture of neither character.
 */
const E = `${REFS}/everyday`;
const M = `${REFS}/magical`;
const Z = `${REFS}/zinumi-fairy.png`;
const SQUARE: ImageSize = '1024x1024';
const SPREAD: ImageSize = '2048x1024';

const SCENE_REFS: Record<number, { refs: string[]; size: ImageSize }> = {
  1:  { refs: [`${E}/four-children-everyday.png`], size: SQUARE },
  2:  { refs: [`${E}/four-children-everyday.png`, Z], size: SPREAD },
  3:  { refs: [`${E}/four-children-everyday.png`, Z], size: SPREAD },
  4:  { refs: [`${E}/four-children-everyday.png`, Z], size: SPREAD },
  5:  { refs: [`${E}/four-children-everyday.png`, Z], size: SPREAD },
  6:  { refs: [`${E}/four-children-everyday.png`], size: SPREAD },
  7:  { refs: [`${E}/four-children-everyday.png`], size: SPREAD },
  8:  { refs: [`${E}/nico-everyday.png`, `${E}/sivi-everyday.png`], size: SPREAD },
  9:  { refs: [`${E}/four-children-everyday.png`, `${M}/four-children-magical.png`], size: SPREAD },
  10: { refs: [`${M}/four-children-magical.png`, Z], size: SPREAD },
  11: { refs: [`${M}/four-children-magical.png`], size: SPREAD },
  12: { refs: [`${M}/four-children-magical.png`], size: SPREAD },
  13: { refs: [`${M}/four-children-magical.png`], size: SPREAD },
  14: { refs: [`${M}/four-children-magical.png`], size: SPREAD },
  15: { refs: [`${M}/four-children-magical.png`], size: SPREAD },
  16: { refs: [`${E}/four-children-everyday.png`, Z], size: SQUARE },
};

/** Pulls the reviewed prompt for a scene straight out of the committed file. */
function promptForScene(scene: number): { title: string; prompt: string } {
  const md = readFileSync(PROMPTS, 'utf8');
  const block = md.split(/(?=^## Scene \d+ — )/m).find((b) => b.startsWith(`## Scene ${scene} — `));
  if (!block) throw new Error(`Scene ${scene} not found in ${PROMPTS}`);
  const title = /^## Scene \d+ — (.+)$/m.exec(block)![1]!;
  const lines = block
    .split('\n')
    .filter((l) => l.startsWith('> '))
    .map((l) => l.slice(2).trim());
  if (!lines.length) throw new Error(`Scene ${scene} has no prompt lines`);
  return { title, prompt: lines.join(' ') };
}

async function main() {
  const scene = Number(process.argv[2]);
  const cfg = SCENE_REFS[scene];
  if (!cfg) throw new Error(`Scene ${scene} has no reference mapping`);

  const { title, prompt } = promptForScene(scene);
  assertRenderableSize(cfg.size);
  const missing = cfg.refs.filter((r) => !existsSync(r));
  if (missing.length) throw new Error(`missing reference(s): ${missing.join(', ')}`);
  const references = cfg.refs.map((r) => readFileSync(r));

  console.log(`scene ${scene} — ${title}`);
  console.log(`  reference : ${cfg.refs.map((r) => r.split('/').pop()).join(' + ')}`);
  console.log(`  size      : ${cfg.size}`);
  console.log(`  prompt    : ${prompt.length} chars, read from the committed prompt set`);
  console.log('  calling gpt-image-2 ...');

  const image = await generateImageFromBlueprint({ prompt, blueprintPng: references, size: cfg.size });

  mkdirSync(OUT, { recursive: true });
  const out = `${OUT}/scene-${String(scene).padStart(2, '0')}_artwork-textfree.png`;
  writeFileSync(out, image.pngBuffer);
  console.log(`  model     : ${image.model}`);
  console.log(`  written   : ${out}  (${image.widthPx}x${image.heightPx}, ${(image.pngBuffer.length / 1024).toFixed(0)} KB)`);
}

await main();
