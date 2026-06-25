/* Render ONE hero by id, then exit. The driver enforces a hard kill-timeout, so
 * this stays simple: a couple fast retries for cold-connection blips, otherwise
 * let it run; if the OpenAI call hangs, the driver kills this whole process.
 *   node ../node_modules/tsx/dist/cli.mjs scripts/render-one.ts <id>
 * exit 0 = wrote (or already existed); 1 = error; 2 = unknown id. */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateImage } from '../src/services/openai/openai.js';
import { HEROES, PREAMBLE, NEGATIVES, MODIFIER, SIZE } from './heroes-data.js';

const OUT = 'C:/Users/jovan/Downloads/heroes';
const id = process.argv[2];
const h = HEROES.find((x) => x.id === id);
if (!h) { console.error(`unknown id: ${id}`); process.exit(2); }

const fname = `hero_${h.id.padStart(3, '0')}_${h.slug}.png`;
const fpath = join(OUT, fname);
if (existsSync(fpath)) { console.log('exists'); process.exit(0); }

const prompt = `${PREAMBLE}\n\n${MODIFIER[h.chapter]}\n\nSUBJECT: ${h.body}\n\n${NEGATIVES}`;
// ZERO retries (operator's call): one attempt. If it fails, fail fast and move on —
// no re-try, no risk of a second billed generation. Failures are swept ONCE at the
// very end as a single deliberate pass, not an inline loop.
try {
  const t0 = Date.now();
  const img = await generateImage({ prompt, size: SIZE[h.o], quality: 'high' });
  writeFileSync(fpath, img.pngBuffer);
  console.log(`OK ${img.widthPx}x${img.heightPx} ${(img.pngBuffer.length / 1024) | 0}KB ${((Date.now() - t0) / 1000) | 0}s`);
  process.exit(0);
} catch (e) {
  console.error(`failed (no retry): ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
