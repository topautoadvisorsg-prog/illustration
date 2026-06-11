/**
 * Zod-validated environment loader.
 *
 * Fails fast at boot if any required env var is missing or malformed.
 * Distinguishes between placeholder values (e.g. `your_X_here`) and real values
 * so smoke tests can report which services are not yet configured rather than
 * crashing the entire app during Phase 0.
 */

import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../');
loadDotenv({ path: path.join(REPO_ROOT, '.env.example') });
loadDotenv({ path: path.join(REPO_ROOT, '.env'), override: true });

/** A placeholder value still using the .env.example template. */
export function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return /^your_.*_here$/i.test(value) || value.trim() === '';
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PORT: z.coerce.number().int().positive().default(8001),
  HOST: z.string().default('0.0.0.0'),

  // External APIs — all accepted as strings; placeholder detection done separately.
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-5-20250929'),

  OPENAI_API_KEY: z.string().min(1),
  OPENAI_IMAGE_MODEL: z.string().default('gpt-image-2'),

  REPLICATE_API_TOKEN: z.string().default(''),
  REPLICATE_UPSCALE_MODEL: z.string().default('nightmareai/real-esrgan'),

  SUPABASE_URL: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),

  UPSTASH_REDIS_URL: z.string().default(''),
  UPSTASH_REDIS_TOKEN: z.string().default(''),

  SENTRY_DSN_FRONTEND: z.string().default(''),
  SENTRY_DSN_BACKEND: z.string().default(''),

  STORAGE_ROOT: z.string().default(path.join(REPO_ROOT, 'backend/storage')),

  // Pagination v1 feature flag. When false (default), Stage 1.75 modules can be
  // imported and unit-tested but no API endpoint exposes them and the existing
  // Page Plan flow is unchanged. Flip to true ONLY after the full Stage 1.75 +
  // Stage 1.8 stack is shipped and end-to-end tested by the operator.
  PAGINATION_V1_ENABLED: z.coerce.boolean().default(false),

  // Simplified layout families (Layouts A, B, C, D). When false (default), the
  // planner picks from the 16 named templates as before. When true, the planner
  // routes to the four simplified families instead, and the Layout A flow rule
  // emits paired text + illustration pages. The 16 legacy templates remain in
  // code as latent infrastructure either way.
  LAYOUT_SIMPLIFIED_V1: z.coerce.boolean().default(false),

  // Whole-page render pipeline gate. When false (default), the routes return
  // 503. WHOLE_PAGE_RENDER_ENABLED is the current name; WHOLE_PAGE_EXPERIMENT_ENABLED
  // is the legacy name kept as a fallback so the deployed Railway variable keeps
  // working until it is renamed. Resolve via `wholePageRenderEnabled()`.
  WHOLE_PAGE_RENDER_ENABLED: z.coerce.boolean().default(false),
  WHOLE_PAGE_EXPERIMENT_ENABLED: z.coerce.boolean().default(false),
});

/** True if the whole-page render pipeline is enabled, honoring the legacy
 *  env var name as a fallback during the rename transition. */
export function wholePageRenderEnabled(): boolean {
  const env = getEnv();
  return env.WHOLE_PAGE_RENDER_ENABLED || env.WHOLE_PAGE_EXPERIMENT_ENABLED;
}

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Env validation failed:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/**
 * Report which env keys are still set to .env.example placeholders.
 * Used by smoke tests to skip checks for un-configured services.
 */
export function getPlaceholderKeys(): string[] {
  const env = getEnv();
  const checkKeys: Array<keyof Env> = [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'REPLICATE_API_TOKEN',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATABASE_URL',
    'UPSTASH_REDIS_URL',
    'UPSTASH_REDIS_TOKEN',
    'SENTRY_DSN_FRONTEND',
    'SENTRY_DSN_BACKEND',
  ];
  return checkKeys.filter((k) => isPlaceholder(env[k] as string));
}
