/**
 * Spike 2 Step D — Upscale via Replicate Real-ESRGAN
 *
 * Requires: REPLICATE_API_TOKEN.
 *
 * Real-ESRGAN model on Replicate accepts a URL or data-URI input. We upload the
 * locally-generated PNG as a data URI to keep the spike self-contained (no S3).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Replicate from 'replicate';
import { getEnv, isPlaceholder } from '../../backend/src/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../output/vertical-slice');

const REAL_ESRGAN_VERSION =
  'f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa'; // nightmareai/real-esrgan pinned

export interface UpscaledImage {
  path: string;
  sizeBytes: number;
  scaleFactor: number;
}

export async function stepD_upscale(
  generatedImagePath: string,
  pageId: string,
  scaleFactor = 4,
): Promise<UpscaledImage> {
  const env = getEnv();
  if (isPlaceholder(env.REPLICATE_API_TOKEN)) {
    throw new Error('REPLICATE_API_TOKEN is still a placeholder. Fill .env with a real token.');
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  const client = new Replicate({ auth: env.REPLICATE_API_TOKEN });

  // Read source as data URI — Replicate accepts this directly for image inputs.
  const srcBuf = await readFile(generatedImagePath);
  const dataUri = `data:image/png;base64,${srcBuf.toString('base64')}`;

  const output = (await client.run(
    `nightmareai/real-esrgan:${REAL_ESRGAN_VERSION}` as `${string}/${string}:${string}`,
    {
      input: {
        image: dataUri,
        scale: scaleFactor,
        face_enhance: false,
      },
    },
  )) as unknown;

  // Output is a URL string (or array with one URL) — fetch it.
  const url = Array.isArray(output) ? (output[0] as string) : (output as string);
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    throw new Error(`Replicate returned unexpected output: ${JSON.stringify(output).slice(0, 200)}`);
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download upscaled image: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());

  const outPath = path.join(OUTPUT_DIR, `${pageId}_upscaled.png`);
  await writeFile(outPath, buf);

  return { path: outPath, sizeBytes: buf.byteLength, scaleFactor };
}

// Standalone runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const generatedPath = path.join(OUTPUT_DIR, 'TW_NEW_ENGLAND_P047_generated.png');
  try {
    const result = await stepD_upscale(generatedPath, 'TW_NEW_ENGLAND_P047');
    // eslint-disable-next-line no-console
    console.log(`✓ Step D — upscaled to ${result.path} (${(result.sizeBytes / 1024 / 1024).toFixed(2)} MB, ${result.scaleFactor}×)`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`✗ Step D — ${(e as Error).message}`);
    process.exit(1);
  }
}
