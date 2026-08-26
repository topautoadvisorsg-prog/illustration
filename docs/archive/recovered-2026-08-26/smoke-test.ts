/**
 * Day 1 Smoke Tests
 * ------------------------------------------------------------------
 * Validates connectivity + auth for every external API the pipeline
 * depends on. Run via: `yarn smoke`
 *
 * Each check is independent and reports PASS / FAIL / SKIPPED.
 * SKIPPED means the env var is still the .env.example placeholder.
 * Exit code is 0 if everything not SKIPPED passes, otherwise 1.
 *
 * Add a new external API? Add a check function and wire it into
 * the `checks` array at the bottom.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import IORedis from 'ioredis';
import OpenAI from 'openai';
import Replicate from 'replicate';
import * as Sentry from '@sentry/node';
import { getEnv, isPlaceholder } from '../src/env.js';

type CheckStatus = 'PASS' | 'FAIL' | 'SKIPPED';

interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
  durationMs: number;
}

async function timed<T>(fn: () => Promise<T>): Promise<[T | Error, number]> {
  const t0 = Date.now();
  try {
    const v = await fn();
    return [v, Date.now() - t0];
  } catch (e) {
    return [e as Error, Date.now() - t0];
  }
}

function skipIfPlaceholder(name: string, value: string): CheckResult | null {
  if (isPlaceholder(value)) {
    return { name, status: 'SKIPPED', detail: 'env value is .env.example placeholder', durationMs: 0 };
  }
  return null;
}

// ----------------------- Checks ------------------------------------

async function checkAnthropic(): Promise<CheckResult> {
  const env = getEnv();
  const skip = skipIfPlaceholder('Anthropic Claude', env.ANTHROPIC_API_KEY);
  if (skip) return skip;

  const [res, ms] = await timed(async () => {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const r = await client.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'reply with the word OK and nothing else' }],
    });
    return r;
  });
  if (res instanceof Error) {
    return { name: 'Anthropic Claude', status: 'FAIL', detail: res.message, durationMs: ms };
  }
  return { name: 'Anthropic Claude', status: 'PASS', detail: `model=${env.ANTHROPIC_MODEL}`, durationMs: ms };
}

async function checkOpenAI(): Promise<CheckResult> {
  const env = getEnv();
  const skip = skipIfPlaceholder('OpenAI', env.OPENAI_API_KEY);
  if (skip) return skip;

  const [res, ms] = await timed(async () => {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const models = await client.models.list();
    const hasImageModel = models.data.some((m) => m.id === env.OPENAI_IMAGE_MODEL);
    return { count: models.data.length, hasImageModel };
  });
  if (res instanceof Error) {
    return { name: 'OpenAI', status: 'FAIL', detail: res.message, durationMs: ms };
  }
  const detail = res.hasImageModel
    ? `${res.count} models available; ${env.OPENAI_IMAGE_MODEL} accessible`
    : `${res.count} models available; WARNING: ${env.OPENAI_IMAGE_MODEL} NOT in account (org verification?)`;
  return { name: 'OpenAI', status: res.hasImageModel ? 'PASS' : 'FAIL', detail, durationMs: ms };
}

async function checkReplicate(): Promise<CheckResult> {
  const env = getEnv();
  const skip = skipIfPlaceholder('Replicate', env.REPLICATE_API_TOKEN);
  if (skip) return skip;

  const [res, ms] = await timed(async () => {
    const client = new Replicate({ auth: env.REPLICATE_API_TOKEN });
    // Cheapest: fetch account info — confirms auth without spending credits.
    const acct = await client.accounts.current();
    return acct;
  });
  if (res instanceof Error) {
    return { name: 'Replicate', status: 'FAIL', detail: res.message, durationMs: ms };
  }
  return { name: 'Replicate', status: 'PASS', detail: `account=${res.username ?? 'unknown'}`, durationMs: ms };
}

async function checkSupabase(): Promise<CheckResult> {
  const env = getEnv();
  const skip =
    skipIfPlaceholder('Supabase', env.SUPABASE_URL) ??
    skipIfPlaceholder('Supabase', env.SUPABASE_SERVICE_ROLE_KEY);
  if (skip) return skip;

  const [res, ms] = await timed(async () => {
    const client = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    // listUsers requires the service role — fails fast on bad key.
    const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) throw error;
    return data;
  });
  if (res instanceof Error) {
    return { name: 'Supabase', status: 'FAIL', detail: res.message, durationMs: ms };
  }
  return { name: 'Supabase', status: 'PASS', detail: `auth admin reachable`, durationMs: ms };
}

async function checkRedis(): Promise<CheckResult> {
  const env = getEnv();
  const skip = skipIfPlaceholder('Upstash Redis', env.UPSTASH_REDIS_URL);
  if (skip) return skip;

  const [res, ms] = await timed(async () => {
    const redis = new IORedis(env.UPSTASH_REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      lazyConnect: true,
    });
    try {
      await redis.connect();
      const pong = await redis.ping();
      await redis.quit();
      return pong;
    } catch (e) {
      try { redis.disconnect(); } catch { /* noop */ }
      throw e;
    }
  });
  if (res instanceof Error) {
    return { name: 'Upstash Redis', status: 'FAIL', detail: res.message, durationMs: ms };
  }
  return { name: 'Upstash Redis', status: 'PASS', detail: `PING -> ${res}`, durationMs: ms };
}

async function checkSentry(): Promise<CheckResult> {
  const env = getEnv();
  const skip = skipIfPlaceholder('Sentry', env.SENTRY_DSN_BACKEND);
  if (skip) return skip;

  const [res, ms] = await timed(async () => {
    Sentry.init({ dsn: env.SENTRY_DSN_BACKEND, tracesSampleRate: 0, environment: 'smoke-test' });
    const eventId = Sentry.captureMessage('wildlands smoke-test', 'info');
    await Sentry.flush(3000);
    return eventId;
  });
  if (res instanceof Error) {
    return { name: 'Sentry', status: 'FAIL', detail: res.message, durationMs: ms };
  }
  return { name: 'Sentry', status: 'PASS', detail: `event=${res ?? 'sent'}`, durationMs: ms };
}

// ----------------------- Runner ------------------------------------

function format(r: CheckResult): string {
  const icon = r.status === 'PASS' ? '✓' : r.status === 'FAIL' ? '✗' : '○';
  const time = r.status === 'SKIPPED' ? '' : `  (${r.durationMs}ms)`;
  return `  ${icon}  ${r.name.padEnd(18)} ${r.status.padEnd(8)} ${r.detail}${time}`;
}

async function main(): Promise<void> {
  console.log('\nWildlands Publishing Platform — Day 1 Smoke Tests');
  console.log('───────────────────────────────────────────────────');

  // Env validation first — fail fast if .env is structurally broken.
  try {
    getEnv();
  } catch (e) {
    console.error(`\n[FATAL] ${(e as Error).message}\n`);
    process.exit(2);
  }

  const checks = [
    checkAnthropic,
    checkOpenAI,
    checkReplicate,
    checkSupabase,
    checkRedis,
    checkSentry,
  ];

  const results = await Promise.all(checks.map((c) => c()));
  results.forEach((r) => console.log(format(r)));

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIPPED').length;
  console.log('───────────────────────────────────────────────────');
  console.log(`  PASS: ${passed}   FAIL: ${failed}   SKIPPED: ${skipped}`);
  if (skipped > 0) {
    console.log(`\n  ${skipped} check(s) skipped — fill .env with real keys to enable.`);
  }
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Unexpected smoke-test failure:', e);
  process.exit(99);
});
