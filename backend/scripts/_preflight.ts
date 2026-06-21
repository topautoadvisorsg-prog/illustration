/* PRE-FLIGHT for paid renders (operator rule 2026-06-20). NO paid image generation.
 * Verifies the things that, if broken, would burn paid OpenAI generations with no
 * saved output:
 *   1. OpenAI key is valid / API reachable (auth check, free — does NOT reveal the
 *      billing hard-cap; only a real generation does, which _batch catches after 1).
 *   2. Supabase Storage CANARY: upload a tiny file → read it back → delete it.
 *      This is the critical gate — if storage can't save/serve, we must NOT spend.
 *
 * Exports `preflight()` for _batch.ts to call before any render. Run directly to
 * print a GO / NO-GO: `node ../node_modules/tsx/dist/cli.mjs scripts/_preflight.ts`
 */
import { pathToFileURL } from 'node:url';
import WebSocketImpl from 'ws';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../src/env.js';

const g = globalThis as { WebSocket?: unknown };
if (typeof g.WebSocket === 'undefined') g.WebSocket = WebSocketImpl;

const BUCKET = 'project-files';
const P = '66c1c69c-2c81-409e-a4b5-bff3f3bb04ba';

export async function storageCanary(): Promise<{ ok: boolean; detail: string }> {
  const env = getEnv();
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const key = `${P}/_canary/canary-${Date.now()}.txt`;
  const payload = Buffer.from(`wildlands-storage-canary ${new Date().toISOString()}`);
  const up = await client.storage.from(BUCKET).upload(key, payload, { contentType: 'text/plain', upsert: true });
  if (up.error) return { ok: false, detail: `UPLOAD blocked: ${up.error.message}` };
  const dl = await client.storage.from(BUCKET).download(key);
  if (dl.error || !dl.data) {
    await client.storage.from(BUCKET).remove([key]).catch(() => undefined);
    return { ok: false, detail: `READ blocked: ${dl.error?.message ?? 'no data'}` };
  }
  const back = Buffer.from(await dl.data.arrayBuffer());
  const rm = await client.storage.from(BUCKET).remove([key]);
  if (rm.error) return { ok: false, detail: `DELETE blocked: ${rm.error.message}` };
  if (!back.equals(payload)) return { ok: false, detail: 'read-back content mismatch' };
  return { ok: true, detail: 'upload + read + delete OK' };
}

export async function openaiAuthCheck(): Promise<{ ok: boolean; detail: string }> {
  const env = getEnv();
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    });
    if (!res.ok) return { ok: false, detail: `/v1/models HTTP ${res.status} (key invalid or blocked)` };
    return { ok: true, detail: 'key valid, API reachable (note: does NOT prove billing-cap headroom)' };
  } catch (e) {
    return { ok: false, detail: `unreachable: ${(e as Error).message}` };
  }
}

export async function preflight(): Promise<{ ok: boolean; storageOk: boolean; lines: string[] }> {
  const oa = await openaiAuthCheck();
  const st = await storageCanary();
  const lines = [
    `OpenAI : ${oa.ok ? 'OK  ' : 'FAIL'} — ${oa.detail}`,
    `Storage: ${st.ok ? 'OK  ' : 'FAIL'} — ${st.detail}`,
  ];
  return { ok: oa.ok && st.ok, storageOk: st.ok, lines };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const r = await preflight();
  console.log('\n=== PRE-FLIGHT (no paid generation) ===');
  for (const l of r.lines) console.log('  ' + l);
  console.log(r.ok ? '\nGO — safe to render.' : '\nNO-GO — do NOT render until the FAIL above is fixed.');
  process.exit(r.ok ? 0 : 1);
}
