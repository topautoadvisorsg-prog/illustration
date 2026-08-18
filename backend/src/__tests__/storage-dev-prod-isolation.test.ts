/**
 * DEV/PROD STORAGE ISOLATION — a non-production process must never resolve to
 * production object storage, whatever credentials are in its environment.
 *
 * ─── THE INCIDENT THIS LOCKS DOWN ─────────────────────────────────────────
 * A developer machine held real R2 and Supabase credentials in its `.env`, with
 * `NODE_ENV=production` left set. The production-DATABASE guard worked: the
 * project row went to the local `wildlands_dev` Postgres. Storage had no
 * equivalent guard, so `getProjectStorage()` returned R2-backed storage and a
 * local dev intake wrote a manuscript into the production bucket.
 *
 * Nothing errored. Nothing warned. Half the project was in dev and half in
 * production, and it was only found by instrumenting an unrelated hang.
 *
 * The tests below therefore set REAL-LOOKING credentials on purpose. A test that
 * proves isolation with the credentials absent proves nothing at all — absence
 * was never the failure mode.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const PROD_CREDS = {
  R2_ACCOUNT_ID: 'acct-1234567890abcdef',
  R2_ACCESS_KEY_ID: 'AKIAEXAMPLEKEYID0000',
  R2_SECRET_ACCESS_KEY: 'secret-example-key-value-0000000000',
  R2_BUCKET: 'wildlands-prod',
  SUPABASE_URL: 'https://exampleprojectref.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.signature',
};

const saved: Record<string, string | undefined> = {};
const KEYS = [...Object.keys(PROD_CREDS), 'APP_ENVIRONMENT', 'NODE_ENV', 'STORAGE_ROOT'];

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/**
 * Re-import with a fresh module registry so `getEnv()` re-reads the environment.
 * Both modules are pulled from the SAME fresh registry — importing them from
 * different registries would compare two unrelated copies and pass regardless.
 */
async function loadStorage(env: Record<string, string>) {
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  const { resetModules } = await import('vitest').then((m) => ({ resetModules: m.vi.resetModules }));
  resetModules();
  return import('../services/storage/project-storage.js');
}

describe('dev/prod storage isolation — the exact incident configuration', () => {
  /** Real credentials + NODE_ENV=production + APP_ENVIRONMENT=development. */
  const INCIDENT = { ...PROD_CREDS, NODE_ENV: 'production', APP_ENVIRONMENT: 'development' };

  it('does NOT report R2 as configured, despite valid R2 credentials', async () => {
    const s = await loadStorage(INCIDENT);
    expect(s.isR2StorageConfigured()).toBe(false);
  });

  it('does NOT report Supabase as configured, despite valid Supabase credentials', async () => {
    const s = await loadStorage(INCIDENT);
    expect(s.isSupabaseStorageConfigured()).toBe(false);
  });

  it('reports the active storage as local, not r2', async () => {
    const s = await loadStorage(INCIDENT);
    expect(s.activeStorageKind()).toBe('local-ephemeral');
  });

  it('instantiates LOCAL storage — never an R2 or Supabase client', async () => {
    const s = await loadStorage(INCIDENT);
    const svc = s.getProjectStorage() as { constructor: { name: string }; inner?: unknown };
    // The cache wrapper is transparent; what matters is what it wraps.
    const chain = JSON.stringify(svc, (_k, v) =>
      v && typeof v === 'object' ? { __type: v.constructor?.name, ...v } : v,
    );
    expect(chain).not.toMatch(/R2StorageService/);
    expect(chain).not.toMatch(/SupabaseStorageService/);
    expect(chain).toMatch(/LocalStorageService/);
  });

  it('surfaces that production credentials were seen and ignored', async () => {
    const s = await loadStorage(INCIDENT);
    expect(s.hasIgnoredProductionStorageCredentials()).toBe(true);
  });

  it('does not throw — a dev box uses local disk rather than refusing to start', async () => {
    const s = await loadStorage(INCIDENT);
    expect(() => s.getProjectStorage()).not.toThrow();
  });
});

describe('the guard keys off APP_ENVIRONMENT, not NODE_ENV', () => {
  it('NODE_ENV=production alone does not unlock production storage', async () => {
    // NODE_ENV is a build/runtime mode. It was 'production' on the machine that
    // wrote to the production bucket, which is precisely why it cannot be the
    // signal that grants access to production data.
    const s = await loadStorage({ ...PROD_CREDS, NODE_ENV: 'production', APP_ENVIRONMENT: 'development' });
    expect(s.isR2StorageConfigured()).toBe(false);
  });

  it('APP_ENVIRONMENT=test is also denied', async () => {
    const s = await loadStorage({ ...PROD_CREDS, APP_ENVIRONMENT: 'test' });
    expect(s.isR2StorageConfigured()).toBe(false);
    expect(s.isSupabaseStorageConfigured()).toBe(false);
    expect(s.activeStorageKind()).toBe('local-ephemeral');
  });

  it('defaults to denied when APP_ENVIRONMENT is unset — fail safe, not fail open', async () => {
    const env = { ...PROD_CREDS, NODE_ENV: 'production' };
    delete process.env.APP_ENVIRONMENT;
    const s = await loadStorage(env);
    expect(s.isR2StorageConfigured()).toBe(false);
  });
});

describe('production is still allowed to reach production storage', () => {
  it('APP_ENVIRONMENT=production with R2 credentials resolves to R2', async () => {
    // The guard must not break the real service. Isolation that also blocks
    // production is not isolation, it is an outage.
    const s = await loadStorage({ ...PROD_CREDS, NODE_ENV: 'production', APP_ENVIRONMENT: 'production' });
    expect(s.isR2StorageConfigured()).toBe(true);
    expect(s.activeStorageKind()).toBe('r2');
    expect(s.hasIgnoredProductionStorageCredentials()).toBe(false);
  });

  it('production with NO storage credentials still refuses to start', async () => {
    for (const k of Object.keys(PROD_CREDS)) delete process.env[k];
    const s = await loadStorage({ NODE_ENV: 'production', APP_ENVIRONMENT: 'production' });
    // Ephemeral local disk in production silently destroyed the image library
    // once. Failing loudly is the approved behaviour and must survive this change.
    expect(() => s.getProjectStorage()).toThrow(/PERSISTENT STORAGE NOT CONFIGURED/);
  });
});
