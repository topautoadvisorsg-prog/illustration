/**
 * WHAT A FAILURE HERE MEANS
 *
 * Eighteen scripts used to reach production by reading `.env` themselves and
 * inventing their own safety check. Five of them could write; one of those had
 * no check at all. If a test here fails, that arrangement is back: either a
 * production write can happen without anyone authorizing it, or a development
 * script can silently end up pointed at production.
 *
 * The dotenv-order test is the subtle one. `env.ts` loads `.env` (production)
 * and THEN `.env.development.local` with override, so the developer default
 * wins. Every old script defeated that on purpose by re-reading `.env` and
 * assigning `process.env.DATABASE_URL` back. Resolution must come from the
 * declared credential file for the environment ASKED FOR, never from whatever
 * happens to be in `process.env` at the time.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PROD_URL = 'postgresql://prod_user:sup3rs3cret@aws-1-us-west-2.pooler.supabase.com:6543/postgres';
const DEV_URL = 'postgresql://wildlands:devpass@127.0.0.1:55432/wildlands_dev';

let root: string;

/** A repo root with both credential files, so resolution is exercised for real. */
function makeRoot(opts: { prod?: string; dev?: string } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'wl-dbaccess-'));
  if (opts.prod !== null) writeFileSync(path.join(dir, '.env'), `DATABASE_URL="${opts.prod ?? PROD_URL}"\nNODE_ENV="production"\n`);
  if (opts.dev !== null) writeFileSync(path.join(dir, '.env.development.local'), `DATABASE_URL="${opts.dev ?? DEV_URL}"\nAPP_ENVIRONMENT="development"\n`);
  return dir;
}

/** Fresh module each time: the module records the process's access in a singleton. */
async function load(rootDir: string) {
  vi.resetModules();
  const mod = await import('../db/operational-access.js');
  vi.spyOn(mod, 'REPO_ROOT', 'get' as never).mockReturnValue?.(rootDir);
  return mod;
}

beforeEach(() => {
  root = makeRoot();
  delete process.env.DATABASE_URL;
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete process.env.DATABASE_URL;
});

/**
 * REPO_ROOT is a const export, so rather than fight the module system the tests
 * run against a real temporary root by pointing the module at it through the
 * only seam it has: the files it reads. We chdir instead of mocking.
 */
const withRoot = async <T>(dir: string, fn: (m: typeof import('../db/operational-access.js')) => Promise<T> | T): Promise<T> => {
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    vi.resetModules();
    vi.doMock('node:url', async () => {
      const actual = await vi.importActual<typeof import('node:url')>('node:url');
      return { ...actual, fileURLToPath: () => path.join(dir, 'backend', 'src', 'db', 'operational-access.ts') };
    });
    const mod = await import('../db/operational-access.js');
    return await fn(mod);
  } finally {
    vi.doUnmock('node:url');
    process.chdir(cwd);
  }
};

describe('intent is part of the request', () => {
  it('refuses a production WRITE with no grant', async () => {
    await withRoot(root, async (m) => {
      expect(() => m.openOperationalDatabase({ environment: 'production', intent: 'write' })).toThrow(
        /Refusing a PRODUCTION WRITE with no authorization/,
      );
    });
  });

  it('allows a production READ with no grant, and says it is a read', async () => {
    await withRoot(root, async (m) => {
      const a = m.openOperationalDatabase({ environment: 'production', intent: 'read' });
      expect(a.environment).toBe('production');
      expect(a.intent).toBe('read');
      expect(a.grantReason).toBeUndefined();
    });
  });

  it('allows an authorized production write and carries the reason', async () => {
    await withRoot(root, async (m) => {
      const grant = m.ProductionWriteGrant.declare({
        reason: 'Freeze rev26 as the shipping interior',
        confirmed: true,
      });
      const a = m.openOperationalDatabase({ environment: 'production', intent: 'write', grant });
      expect(a.intent).toBe('write');
      expect(a.grantReason).toBe('Freeze rev26 as the shipping interior');
    });
  });
});

describe('a grant is authorization, not a boolean', () => {
  it('cannot be declared unconfirmed', async () => {
    await withRoot(root, async (m) => {
      expect(() => m.ProductionWriteGrant.declare({ reason: 'a perfectly good reason', confirmed: false })).toThrow(
        /not confirmed/,
      );
    });
  });

  it('rejects a reason that is a boolean wearing a costume', async () => {
    await withRoot(root, async (m) => {
      expect(() => m.ProductionWriteGrant.declare({ reason: 'yes', confirmed: true })).toThrow(/needs a real reason/);
    });
  });

  it('refuses a grant handed to a development connection', async () => {
    await withRoot(root, async (m) => {
      const grant = m.ProductionWriteGrant.declare({ reason: 'this belongs to production', confirmed: true });
      expect(() => m.openOperationalDatabase({ environment: 'development', intent: 'write', grant })).toThrow(
        /meaningless here/,
      );
    });
  });
});

describe('dotenv override order cannot decide the environment', () => {
  /**
   * The whole point. `process.env.DATABASE_URL` is production before the call —
   * exactly the state every old script created — and asking for development
   * must still resolve to the development credentials file.
   */
  it('asking for development resolves development even when process.env holds production', async () => {
    process.env.DATABASE_URL = PROD_URL;
    await withRoot(root, async (m) => {
      const a = m.openOperationalDatabase({ environment: 'development', intent: 'write' });
      expect(a.environment).toBe('development');
      expect(a.target).toContain('127.0.0.1');
      expect(process.env.DATABASE_URL).toBe(DEV_URL);
    });
  });

  it('asking for production resolves production even when process.env holds development', async () => {
    process.env.DATABASE_URL = DEV_URL;
    await withRoot(root, async (m) => {
      const a = m.openOperationalDatabase({ environment: 'production', intent: 'read' });
      expect(a.target).toContain('supabase.com');
    });
  });
});

describe('safety nets against a misconfigured credentials file', () => {
  it('refuses when .env declares a loopback URL as production', async () => {
    const dir = makeRoot({ prod: DEV_URL });
    await withRoot(dir, async (m) => {
      expect(() => m.openOperationalDatabase({ environment: 'production', intent: 'read' })).toThrow(
        /declares a loopback DATABASE_URL/,
      );
    });
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses when the development file points off-box', async () => {
    const dir = makeRoot({ dev: PROD_URL });
    await withRoot(dir, async (m) => {
      expect(() => m.openOperationalDatabase({ environment: 'development', intent: 'read' })).toThrow(
        /NON-loopback DATABASE_URL/,
      );
    });
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('secrets never reach a log line or an error', () => {
  it('redacts credentials from a connection string', async () => {
    await withRoot(root, async (m) => {
      const red = m.redactConnectionString(PROD_URL);
      expect(red).not.toContain('sup3rs3cret');
      expect(red).not.toContain('prod_user');
      expect(red).toBe('aws-1-us-west-2.pooler.supabase.com:6543/postgres');
    });
  });

  it('keeps the password out of the resolved access and its description', async () => {
    await withRoot(root, async (m) => {
      const a = m.openOperationalDatabase({ environment: 'production', intent: 'read' });
      expect(JSON.stringify(a)).not.toContain('sup3rs3cret');
      expect(m.describeAccess(a)).not.toContain('sup3rs3cret');
    });
  });

  it('keeps the password out of a misconfiguration error', async () => {
    const dir = makeRoot({ prod: DEV_URL.replace('devpass', 'sup3rs3cret') });
    await withRoot(dir, async (m) => {
      try {
        m.openOperationalDatabase({ environment: 'production', intent: 'read' });
        throw new Error('should have refused');
      } catch (err) {
        expect((err as Error).message).not.toContain('sup3rs3cret');
      }
    });
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('the ordinary local workflow still works', () => {
  it('development read needs no ceremony at all', async () => {
    await withRoot(root, async (m) => {
      const a = m.openOperationalDatabase({ environment: 'development', intent: 'read' });
      expect(a.environment).toBe('development');
      expect(a.grantReason).toBeUndefined();
      expect(m.describeAccess(a)).toContain('DEVELOPMENT read');
    });
  });
});
