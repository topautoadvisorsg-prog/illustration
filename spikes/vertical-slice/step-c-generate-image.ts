/**
 * Spike 2 Step C — Generate Image via OpenAI gpt-image-1
 *
 * Requires: OPENAI_API_KEY with org verified for gpt-image-1.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import { getEnv, isPlaceholder } from '../../backend/src/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../output/vertical-slice');

export interface GeneratedImage {
  path: string;
  sizeBytes: number;
  promptUsed: string;
}

export async function stepC_generateImage(
  prompt: string,
  pageId: string,
): Promise<GeneratedImage> {
  const env = getEnv();
  if (isPlaceholder(env.OPENAI_API_KEY)) {
    throw new Error('OPENAI_API_KEY is still a placeholder. Fill .env with a real key.');
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  // gpt-image-1: portrait orientation for book pages. Closest supported size to 8.5x11 ratio is 1024x1536.
  const response = await client.images.generate({
    model: env.OPENAI_IMAGE_MODEL,
    prompt,
    size: '1024x1536',
    quality: 'high',
    n: 1,
  });

  const data = response.data?.[0];
  if (!data?.b64_json) {
    throw new Error('OpenAI returned no image data (b64_json missing).');
  }

  const outPath = path.join(OUTPUT_DIR, `${pageId}_generated.png`);
  const buf = Buffer.from(data.b64_json, 'base64');
  await writeFile(outPath, buf);

  return { path: outPath, sizeBytes: buf.byteLength, promptUsed: prompt };
}

// Standalone runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const { stepA_loadManifest } = await import('./step-a-load-manifest.js');
  const { stepB_assemblePrompt } = await import('./step-b-assemble-prompt.js');
  try {
    const manifest = await stepA_loadManifest();
    const { prompt } = await stepB_assemblePrompt(manifest);
    const result = await stepC_generateImage(prompt, manifest.manifest_id);
    // eslint-disable-next-line no-console
    console.log(`✓ Step C — generated image at ${result.path} (${(result.sizeBytes / 1024).toFixed(1)} KB)`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`✗ Step C — ${(e as Error).message}`);
    process.exit(1);
  }
}
