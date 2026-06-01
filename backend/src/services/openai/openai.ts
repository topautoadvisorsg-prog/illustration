/**
 * services/openai — typed wrapper around OpenAI image generation (gpt-image-1).
 *
 * What it does: single entry point for image-generation calls. Returns the raw
 * PNG bytes. Pipeline code must never touch the SDK directly.
 *
 * Clean-art contract: the prompt is assembled by Stage 2 and must contain NO
 * instruction to render text — all typography is added later by the layout engine.
 */

import OpenAI from 'openai';
import { getEnv, isPlaceholder } from '../../env.js';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  const env = getEnv();
  if (isPlaceholder(env.OPENAI_API_KEY)) {
    throw new Error('OPENAI_API_KEY is not configured; image generation is disabled.');
  }
  client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
}

/** gpt-image-1 sizes. Book pages are portrait, so 1024x1536 is the default. */
export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024' | 'auto';
export type ImageQuality = 'low' | 'medium' | 'high' | 'auto';

export interface GenerateImageInput {
  prompt: string;
  size?: ImageSize;
  quality?: ImageQuality;
}

export interface GeneratedImage {
  pngBuffer: Buffer;
  model: string;
  size: ImageSize;
  widthPx: number;
  heightPx: number;
}

function sizeToPixels(size: ImageSize): { widthPx: number; heightPx: number } {
  if (size === 'auto') return { widthPx: 1024, heightPx: 1536 };
  const [w, h] = size.split('x').map(Number);
  return { widthPx: w ?? 1024, heightPx: h ?? 1536 };
}

export async function generateImage(input: GenerateImageInput): Promise<GeneratedImage> {
  const env = getEnv();
  const openai = getClient();
  const size: ImageSize = input.size ?? '1024x1536';
  const quality: ImageQuality = input.quality ?? 'high';

  // gpt-image-1 sizes/quality differ from the DALL-E type union; cast the params.
  const params = {
    model: env.OPENAI_IMAGE_MODEL,
    prompt: input.prompt,
    size,
    quality,
    n: 1,
  } as unknown as OpenAI.Images.ImageGenerateParams;

  const response = await openai.images.generate(params);
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error('OpenAI returned no image data (expected base64 PNG).');
  }

  const { widthPx, heightPx } = sizeToPixels(size);
  return { pngBuffer: Buffer.from(b64, 'base64'), model: env.OPENAI_IMAGE_MODEL, size, widthPx, heightPx };
}
