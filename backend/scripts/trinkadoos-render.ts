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
import { generateImageFromBlueprint, type ImageSize } from '../src/services/openai/openai.js';
import { BOOK } from './trinkadoos-config.js';

const PROMPTS = `${BOOK}/08-VIDEO-LAYER/BOOK-01-IMAGE-PROMPTS.md`;
const REFS = 'C:/Users/jovan/Downloads/wildlands agents platform/docs/trinkadoos/references/characters';
const OUT = `${BOOK}/10-ARTWORK`;

/** Which sheet each scene attaches. Single page renders square; spreads render 2:1. */
const SCENE_REFS: Record<number, { refs: string[]; size: ImageSize }> = {
  1: { refs: [`${REFS}/everyday/four-children-everyday.png`], size: '1024x1024' },
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
  if (!cfg) throw new Error(`Scene ${scene} has no reference mapping yet. Only Scene 1 is wired.`);

  const { title, prompt } = promptForScene(scene);
  // The edit endpoint takes one image. All four children are on the group sheet,
  // which is why the checklist prefers it wherever the whole cast is in frame.
  if (cfg.refs.length !== 1) throw new Error('the edit endpoint takes exactly one reference image');
  const reference = readFileSync(cfg.refs[0]!);

  console.log(`scene ${scene} — ${title}`);
  console.log(`  reference : ${cfg.refs[0]!.split('/').pop()}`);
  console.log(`  size      : ${cfg.size}`);
  console.log(`  prompt    : ${prompt.length} chars, read from the committed prompt set`);
  console.log('  calling gpt-image-2 ...');

  const image = await generateImageFromBlueprint({ prompt, blueprintPng: reference, size: cfg.size });

  mkdirSync(OUT, { recursive: true });
  const out = `${OUT}/scene-${String(scene).padStart(2, '0')}_artwork-textfree.png`;
  writeFileSync(out, image.pngBuffer);
  console.log(`  model     : ${image.model}`);
  console.log(`  written   : ${out}  (${image.widthPx}x${image.heightPx}, ${(image.pngBuffer.length / 1024).toFixed(0)} KB)`);
}

await main();
