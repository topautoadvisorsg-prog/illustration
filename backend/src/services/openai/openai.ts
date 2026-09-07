/**
 * services/openai — typed wrapper around OpenAI image generation (gpt-image-2).
 *
 * What it does: single entry point for image-generation calls. Returns the raw
 * PNG bytes. Pipeline code must never touch the SDK directly.
 *
 * The prompt is assembled upstream (whole-page-render/assemble-page-prompt.ts)
 * and, for text-bearing pages, DOES instruct the model to bake real typography
 * into the artwork — there is no separate layout engine that adds text later.
 */

import OpenAI, { toFile } from 'openai';
import { getEnv, isPlaceholder } from '../../env.js';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  const env = getEnv();
  if (isPlaceholder(env.OPENAI_API_KEY)) {
    throw new Error('OPENAI_API_KEY is not configured; image generation is disabled.');
  }
  // Hard 4-min per-call cap so a stalled render fails fast and the batch moves on
  // instead of hanging on the SDK's 10-min default (+2 retries ≈ up to 30 min).
  // 4 min (not 2) because dense pages legitimately take 2–4 min to render — a 2-min
  // cap killed valid pages and forced wasteful re-renders. maxRetries:0 keeps the
  // ceiling honest; the batch's own retry pass re-runs anything that genuinely fails.
  client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 240_000, maxRetries: 0 });
  return client;
}

/** gpt-image-2 sizes. Book pages are portrait, so 1024x1536 is the default. */
/**
 * Named sizes the SDK's type union knows about, plus any exact `WxH` the endpoint
 * accepts. gpt-image-2 takes custom resolutions -- both edges a multiple of 16,
 * long:short no wider than 3:1 -- and the installed SDK types (4.104.0) predate
 * that, listing only the fixed union. The call site already casts its params, so
 * a custom size reaches the endpoint unchanged; widening here just stops the
 * type system from being the thing that forbids it.
 */
export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024' | 'auto' | (string & {});
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

/** Fails before spending rather than after: both edges /16, ratio within 3:1. */
export function assertRenderableSize(size: ImageSize): void {
  if (size === 'auto') return;
  const m = /^(\d+)x(\d+)$/.exec(size);
  if (!m) throw new Error(`size must be "WxH" or "auto", got "${size}"`);
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (w % 16 || h % 16) throw new Error(`both edges must be multiples of 16: ${size}`);
  const ratio = Math.max(w, h) / Math.min(w, h);
  if (ratio > 3) throw new Error(`long:short must not exceed 3:1, got ${ratio.toFixed(2)}:1`);
}

export async function generateImage(input: GenerateImageInput): Promise<GeneratedImage> {
  const env = getEnv();
  const openai = getClient();
  const size: ImageSize = input.size ?? '1024x1536';
  assertRenderableSize(size);
  const quality: ImageQuality = input.quality ?? 'high';

  // gpt-image-2 sizes/quality differ from the DALL-E type union; cast the params.
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

export interface GenerateFromBlueprintInput {
  prompt: string;
  /**
   * Reference PNG(s) handed to the model.
   *
   * An array is passed straight through: the edits endpoint takes up to 16 images
   * for gpt-image models, and a scene that needs the group sheet AND Zinumi has to
   * send both. Merging them into one composite sheet first would hand the model a
   * picture that is not what either character looks like.
   */
  blueprintPng: Buffer | Buffer[];
  size?: ImageSize;
  /**
   * Optional PNG mask, same dimensions as the reference image. TRANSPARENT pixels
   * are the region the model may paint; opaque pixels are the ones it is asked
   * to hold.
   *
   * This constrains the REQUEST. It is not a guarantee about the response, and
   * callers must not treat it as one: a page of set type must never be replaced
   * by a model's reconstruction of what that type looked like, and the only way
   * to be sure of that is to keep the original pixels and composite the masked
   * region back in yourself.
   */
  maskPng?: Buffer;
}

/**
 * Reference-image mode: generate an illustration using a layout blueprint PNG as the
 * composition map via the image edits endpoint. The model composes the illustration
 * into the blueprint's zones (and leaves the text-safe zone calm) at generation time.
 */
export async function generateImageFromBlueprint(input: GenerateFromBlueprintInput): Promise<GeneratedImage> {
  const env = getEnv();
  const openai = getClient();
  const size: ImageSize = input.size ?? '1024x1536';
  assertRenderableSize(size);
  const buffers = Array.isArray(input.blueprintPng) ? input.blueprintPng : [input.blueprintPng];
  if (buffers.length === 0) throw new Error('at least one reference image is required');
  if (buffers.length > 16) throw new Error(`the edits endpoint takes at most 16 images, got ${buffers.length}`);
  const files = await Promise.all(
    buffers.map((b, i) => toFile(b, `reference-${i + 1}.png`, { type: 'image/png' })),
  );
  const imageFile = files.length === 1 ? files[0]! : files;
  const maskFile = input.maskPng
    ? await toFile(input.maskPng, 'mask.png', { type: 'image/png' })
    : undefined;

  // gpt-image params differ from the DALL-E edit type union; cast like generateImage.
  const params = {
    model: env.OPENAI_IMAGE_MODEL,
    image: imageFile,
    ...(maskFile ? { mask: maskFile } : {}),
    prompt: input.prompt,
    size,
    n: 1,
  } as unknown as OpenAI.Images.ImageEditParams;

  const response = await openai.images.edit(params);
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error('OpenAI returned no image data from blueprint edit (expected base64 PNG).');
  }

  const { widthPx, heightPx } = sizeToPixels(size);
  return { pngBuffer: Buffer.from(b64, 'base64'), model: env.OPENAI_IMAGE_MODEL, size, widthPx, heightPx };
}
