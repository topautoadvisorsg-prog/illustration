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

/**
 * Environment isolation (platform requirement).
 *
 * Under test, the repo-root `.env` is NEVER loaded. It holds real production
 * credentials — live Postgres, R2, OpenAI — and loading it during tests both
 * (a) let the suite reach production services, and (b) made ~12 tests depend
 * on the developer's local configuration, so they failed permanently on any
 * machine actually set up to do render work. Standing failures like that hide
 * real regressions.
 *
 * Test runs load `.env.example` (placeholder values, schema-valid by design)
 * and then an optional `.env.test` for anything a test genuinely needs. A test
 * that requires a live database must opt in explicitly and point at a
 * DEDICATED test database — never production.
 */
const IS_TEST = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

loadDotenv({ path: path.join(REPO_ROOT, '.env.example') });
if (IS_TEST) {
  loadDotenv({ path: path.join(REPO_ROOT, '.env.test'), override: true });
} else {
  loadDotenv({ path: path.join(REPO_ROOT, '.env'), override: true });
  // DEVELOPER OVERRIDE LAYER, loaded last so it wins.
  //
  // `.env` holds real production credentials and is shared with the deployed
  // stack; a developer must not have to edit it (and risk committing or losing
  // it) just to point at a local database. `.env.development.local` is
  // gitignored and overrides only what it names — in practice DATABASE_URL,
  // pointing at the Docker Postgres from docker-compose.dev.yml.
  //
  // Absent, behaviour is exactly as before.
  loadDotenv({ path: path.join(REPO_ROOT, '.env.development.local'), override: true });
}

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
  // Vision-capable reasoning model for automated text/prompt QA (see
  // services/openai/text-review.ts + prompt-review.ts). A chat-completion
  // call is still a fraction of an image-generation call's cost even on a
  // top-tier model. History: gpt-4o-mini was too inaccurate (missed a real
  // typo, invented a false positive); gpt-4o improved but still produced a
  // false positive reading a deliberate rhetorical contrast as a content
  // contradiction; gpt-5.5 (Aug 2026) is the current upgrade attempt.
  OPENAI_REVIEW_MODEL: z.string().default('gpt-5.5'),

  REPLICATE_API_TOKEN: z.string().default(''),
  REPLICATE_UPSCALE_MODEL: z.string().default('nightmareai/real-esrgan'),

  SUPABASE_URL: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),

  // Cloudflare R2 object storage (S3-compatible). Optional: when all four are set
  // with real values, getProjectStorage() uses R2 instead of Supabase Storage —
  // zero-egress image/file storage. Absent → falls back to Supabase (current
  // behavior), so rollback is just unsetting these. DB stays on Supabase regardless.
  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_BUCKET: z.string().default('project-files'),

  UPSTASH_REDIS_URL: z.string().default(''),
  UPSTASH_REDIS_TOKEN: z.string().default(''),

  SENTRY_DSN_FRONTEND: z.string().default(''),
  SENTRY_DSN_BACKEND: z.string().default(''),

  STORAGE_ROOT: z.string().default(path.join(REPO_ROOT, 'backend/storage')),

  // ── Database environment guard (lib/db-environment.ts) ──
  // What this process believes it is. Only 'production' exempts a process from
  // the production-database guard, so a developer machine cannot migrate or
  // mutate production even if it loads the production .env.
  APP_ENVIRONMENT: z.enum(['development', 'production', 'test']).default('development'),
  // Host fragment identifying the production database. Empty means "treat any
  // non-loopback host as potentially production" — fail safe, not fail open.
  PRODUCTION_DB_HOST: z.string().default(''),

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
