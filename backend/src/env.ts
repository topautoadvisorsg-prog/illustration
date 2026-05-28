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
  OPENAI_IMAGE_MODEL: z.string().default('gpt-image-1'),

  REPLICATE_API_TOKEN: z.string().min(1),
  REPLICATE_UPSCALE_MODEL: z.string().default('nightmareai/real-esrgan'),

  SUPABASE_URL: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),

  UPSTASH_REDIS_URL: z.string().min(1),
  UPSTASH_REDIS_TOKEN: z.string().min(1),

  SENTRY_DSN_FRONTEND: z.string().min(1),
  SENTRY_DSN_BACKEND: z.string().min(1),

  STORAGE_ROOT: z.string().default(path.join(REPO_ROOT, 'backend/storage')),
});

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
