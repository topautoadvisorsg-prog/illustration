/**
 * SHARED VISION QA CORE — one model stack, several profiles.
 *
 * There was already a vision reviewer in this repository: `openai/text-review.ts`,
 * which compares baked text in a generated illustration against its source. It
 * owns client construction, a structured JSON response, a retry policy and a
 * reviewer version. Building a second stack beside it to look at interior pages
 * would have meant two places to fix a provider change and two ways to get
 * retries wrong.
 *
 * So this is the shared part, and the profiles sit on top:
 *
 *     vision-core
 *       ├── Profile A  Illustration / text fidelity   (existing, unchanged)
 *       └── Profile B  Interior page layout           (new)
 *
 * PROFILE A IS NOT MODIFIED. Its prompt, its schema and its behaviour are
 * exactly what they were; it is a shipped, calibrated reviewer and this phase
 * has no business changing what it says.
 *
 * ─── THE TWO CAPABILITIES THAT WERE MISSING ───────────────────────────────
 *
 * DOWNSCALING. A print page rasterises to something no model needs at full
 * size, and sending it costs real money for no extra judgement. Pages are
 * resized to a review width that still shows typography.
 *
 * CACHING, keyed by image hash + profile version + model. Re-auditing a book
 * where three pages changed must not pay for the other hundred and sixty-seven.
 * The key includes the profile version deliberately: changing the prompt changes
 * the answer, so it must miss.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import OpenAI from 'openai';
import { getEnv, isPlaceholder } from '../../env.js';

let client: OpenAI | null = null;

/**
 * ONE SHOT. `maxRetries: 0` on purpose: a vision audit of a 170-page book is a
 * paid operation, and a silent retry storm is how a cheap audit becomes an
 * expensive one nobody authorised. A failure is reported and counted.
 */
export function getVisionClient(): OpenAI {
  if (client) return client;
  const env = getEnv();
  if (isPlaceholder(env.OPENAI_API_KEY)) {
    throw new Error('OPENAI_API_KEY is not configured; vision QA is disabled.');
  }
  client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 90_000, maxRetries: 0 });
  return client;
}

export interface VisionProfile {
  /** Stable identifier, e.g. 'page-layout'. */
  id: string;
  /** Bump when the prompt or schema changes. Part of the cache key. */
  version: number;
  /** Longest edge sent to the model. Enough for typography, no more. */
  reviewWidthPx: number;
  systemPrompt: string;
}

export interface VisionImage {
  /** Free-text role for the model: 'page under review', 'preceding page'. */
  label: string;
  png: Buffer;
}

export interface VisionCallResult<T> {
  parsed: T | null;
  raw: string;
  cached: boolean;
  model: string;
  /** Null when the answer came from cache. */
  usage: { promptTokens: number; completionTokens: number } | null;
  error?: string;
}

export interface VisionCacheStats {
  hits: number;
  misses: number;
  failures: number;
  promptTokens: number;
  completionTokens: number;
}

export class VisionCache {
  readonly stats: VisionCacheStats = { hits: 0, misses: 0, failures: 0, promptTokens: 0, completionTokens: 0 };

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  /**
   * IMAGE HASH + PROFILE VERSION + MODEL.
   *
   * All three matter. The same page under a revised prompt is a different
   * question, and the same question to a different model is a different answer.
   */
  key(images: VisionImage[], profile: VisionProfile, model: string, extra: string): string {
    const h = createHash('sha256');
    for (const i of images) h.update(i.label).update(createHash('sha256').update(i.png).digest());
    h.update(`|${profile.id}@${profile.version}|${model}|${extra}`);
    return h.digest('hex');
  }

  read(key: string): string | null {
    const f = path.join(this.dir, `${key}.json`);
    return existsSync(f) ? readFileSync(f, 'utf8') : null;
  }

  write(key: string, raw: string): void {
    writeFileSync(path.join(this.dir, `${key}.json`), raw);
  }
}

/** Downscale for review. Preserves aspect; never enlarges. */
export async function toReviewSize(png: Buffer, widthPx: number): Promise<Buffer> {
  const meta = await sharp(png).metadata();
  if ((meta.width ?? 0) <= widthPx) return png;
  return sharp(png).resize({ width: widthPx, withoutEnlargement: true, kernel: 'lanczos3' }).png().toBuffer();
}

/**
 * Ask a vision profile a question about one or more images.
 *
 * Returns `parsed: null` rather than throwing when the model answers with
 * something that is not the agreed shape. An audit that crashes on one bad
 * response loses the other hundred and sixty-nine.
 */
export async function callVisionProfile<T>(input: {
  profile: VisionProfile;
  images: VisionImage[];
  userText: string;
  cache?: VisionCache;
  /** Anything else that changes the question, folded into the cache key. */
  cacheDiscriminator?: string;
  validate: (value: unknown) => T | null;
}): Promise<VisionCallResult<T>> {
  const env = getEnv();
  const model = env.OPENAI_REVIEW_MODEL;
  const { profile, cache } = input;

  const resized: VisionImage[] = [];
  for (const img of input.images) {
    resized.push({ label: img.label, png: await toReviewSize(img.png, profile.reviewWidthPx) });
  }

  const key = cache?.key(resized, profile, model, input.cacheDiscriminator ?? '');
  if (cache && key) {
    const hit = cache.read(key);
    if (hit !== null) {
      cache.stats.hits += 1;
      return { parsed: safeValidate(hit, input.validate), raw: hit, cached: true, model, usage: null };
    }
  }

  try {
    const completion = await getVisionClient().chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: profile.systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: input.userText },
            ...resized.map((i) => ({
              type: 'image_url' as const,
              image_url: { url: `data:image/png;base64,${i.png.toString('base64')}` },
            })),
          ],
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const usage = {
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
    };
    if (cache && key) {
      cache.stats.misses += 1;
      cache.stats.promptTokens += usage.promptTokens;
      cache.stats.completionTokens += usage.completionTokens;
      if (raw) cache.write(key, raw);
    }
    return { parsed: safeValidate(raw, input.validate), raw, cached: false, model, usage };
  } catch (e) {
    if (cache) cache.stats.failures += 1;
    return { parsed: null, raw: '', cached: false, model, usage: null, error: (e as Error).message };
  }
}

function safeValidate<T>(raw: string, validate: (v: unknown) => T | null): T | null {
  try {
    return validate(JSON.parse(raw));
  } catch {
    return null;
  }
}
