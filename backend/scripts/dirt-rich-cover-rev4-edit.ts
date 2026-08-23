/**
 * DIRT RICH cover Rev 4 — ONE-SHOT edit of the APPROVED artwork.
 *
 * Sends the approved Rev 3 wrap artwork to gpt-image via the platform's own
 * service (images.edit), asking for exactly two changes: new front subtitle,
 * and all spine lettering removed.
 *
 * ONE SHOT. NO RETRY. If the model returns something unusable, this script does
 * not call again — the operator decides whether to spend again.
 *
 *   tsx scripts/dirt-rich-cover-rev4-edit.ts <sourcePng> <promptTxt> <outPng>
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../');

await import('../src/env.js');
const PROD = parseDotenv(readFileSync(path.join(REPO_ROOT, '.env')));
process.env.DATABASE_URL = PROD.DATABASE_URL;
process.env.APP_ENVIRONMENT = 'production';

const [SRC, PROMPT_FILE, OUT] = process.argv.slice(2);
if (!SRC || !PROMPT_FILE || !OUT) {
  throw new Error('usage: dirt-rich-cover-rev4-edit.ts <sourcePng> <promptTxt> <outPng>');
}

const { generateImageFromBlueprint } = await import('../src/services/openai/openai.js');

const source = readFileSync(SRC);
const prompt = readFileSync(PROMPT_FILE, 'utf8');
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

console.log('ONE-SHOT COVER EDIT — no retry');
console.log(`  source     : ${path.basename(SRC)}  ${source.length} bytes  sha ${sha(source).slice(0, 16)}`);
console.log(`  prompt     : ${prompt.length} chars`);
console.log(`  model      : ${process.env.OPENAI_IMAGE_MODEL ?? '(from env)'}`);
console.log(`  size       : 1536x1024 (matches the approved artwork aspect)`);
console.log('  calling images.edit ...');

const started = Date.now();
const result = await generateImageFromBlueprint({
  blueprintPng: source,
  prompt,
  size: '1536x1024',
});

writeFileSync(OUT, result.pngBuffer);
console.log(`\n  returned   : ${result.widthPx}x${result.heightPx}  ${result.pngBuffer.length} bytes`);
console.log(`  model used : ${result.model}`);
console.log(`  elapsed    : ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`  out sha    : ${sha(result.pngBuffer)}`);
console.log(`  -> ${OUT}`);
