/**
 * services/replicate — Real-ESRGAN upscaling wrapper.
 *
 * What it does: takes an approved illustration PNG and returns a higher-resolution
 * PNG suitable for the 300 DPI print gate. Disabled until REPLICATE_API_TOKEN is set.
 *
 * Model: set REPLICATE_UPSCALE_MODEL to a full "owner/model:version" ref (e.g.
 * nightmareai/real-esrgan:<version>). face_enhance is OFF — we upscale illustrations,
 * not photos.
 */

import Replicate from 'replicate';
import { getEnv, isPlaceholder } from '../../env.js';

let client: Replicate | null = null;

function getClient(): Replicate {
  if (client) return client;
  const env = getEnv();
  if (isPlaceholder(env.REPLICATE_API_TOKEN)) {
    throw new Error('REPLICATE_API_TOKEN is not configured; upscaling is disabled.');
  }
  client = new Replicate({ auth: env.REPLICATE_API_TOKEN });
  return client;
}

export interface UpscaleInput {
  pngBuffer: Buffer;
  scale?: number;
}

export interface UpscaleOutput {
  pngBuffer: Buffer;
  model: string;
  scale: number;
}

/** Coerce the various Replicate output shapes into a downloadable URL. */
async function outputToBuffer(output: unknown): Promise<Buffer> {
  const first = Array.isArray(output) ? output[0] : output;
  let url: string | undefined;
  if (typeof first === 'string') {
    url = first;
  } else if (first && typeof (first as { url?: () => unknown }).url === 'function') {
    url = String((first as { url: () => unknown }).url());
  }
  if (!url) throw new Error('Replicate returned no downloadable image URL.');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download upscaled image (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

export async function upscaleImage(input: UpscaleInput): Promise<UpscaleOutput> {
  const env = getEnv();
  const replicate = getClient();
  const scale = input.scale ?? 4;
  const dataUri = `data:image/png;base64,${input.pngBuffer.toString('base64')}`;

  const output = await replicate.run(env.REPLICATE_UPSCALE_MODEL as `${string}/${string}`, {
    input: { image: dataUri, scale, face_enhance: false },
  });

  return { pngBuffer: await outputToBuffer(output), model: env.REPLICATE_UPSCALE_MODEL, scale };
}
