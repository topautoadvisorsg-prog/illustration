/**
 * DATABASE ENVIRONMENT GUARD.
 *
 * ─── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * Local development and the Railway deployment shared ONE Supabase database.
 * On 2026-08-08 a local verification probe POSTed to the API and overwrote a
 * real project's canonical manuscript provenance. Nothing in the stack objected,
 * because from the code's point of view it was simply "the database".
 *
 * The lesson is not "be careful". It is that a developer machine must not be
 * ABLE to run migrations or destructive operations against production, whatever
 * `.env` happens to be loaded.
 *
 * ─── THE RULE ─────────────────────────────────────────────────────────────
 * Production is identified by HOST, not by a mode flag, because a mode flag is
 * exactly the thing that gets left wrong. If DATABASE_URL points at the
 * production host and this process is not itself production, guarded operations
 * refuse.
 *
 * An intentional exception requires BOTH an explicit override variable AND a
 * matching confirmation of the host — two independent actions, so neither a
 * stale shell export nor a copy-pasted command can trip it alone.
 */

/** Operations dangerous enough to require the guard. */
export type GuardedOperation =
  | 'migrate'
  | 'destructive-script'
  | 'seed'
  | 'prune';

export interface DbEnvironment {
  /** Host parsed out of DATABASE_URL (credentials never retained). */
  host: string;
  /** Database name. */
  database: string;
  /** True when the host matches the configured production host fragment. */
  isProduction: boolean;
  /** What this process believes it is: development | production | test. */
  appEnvironment: string;
  /** Human label for the boot banner. */
  label: string;
}

/** Parse DATABASE_URL without ever holding the password. */
export function describeDbEnvironment(
  databaseUrl: string,
  appEnvironment: string,
  productionHostFragment: string | undefined,
): DbEnvironment {
  let host = '(unparseable)';
  let database = '(unknown)';
  try {
    const u = new URL(databaseUrl);
    host = u.hostname;
    database = u.pathname.replace(/^\//, '') || '(unknown)';
  } catch {
    /* leave the placeholders — an unparseable URL is reported, not thrown */
  }

  // A production host fragment must be configured for the check to mean
  // anything. When absent we do NOT silently treat everything as safe: we treat
  // any non-loopback host as potentially production.
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === 'host.docker.internal';
  const isProduction = productionHostFragment
    ? host.includes(productionHostFragment)
    : !isLoopback;

  return {
    host,
    database,
    isProduction,
    appEnvironment,
    label: isProduction ? 'PRODUCTION' : isLoopback ? 'LOCAL DEV' : 'REMOTE (non-production)',
  };
}

/** The two-part override. Both must be present and the host must match. */
export function overrideIsValid(env: NodeJS.ProcessEnv, host: string): boolean {
  return env.ALLOW_PRODUCTION_DB_WRITE === 'I_UNDERSTAND' && env.PRODUCTION_DB_CONFIRM_HOST === host;
}

export class ProductionDatabaseGuardError extends Error {
  constructor(operation: GuardedOperation, dbEnv: DbEnvironment) {
    super(
      [
        `REFUSED: "${operation}" targets the PRODUCTION database.`,
        ``,
        `  host        : ${dbEnv.host}`,
        `  database    : ${dbEnv.database}`,
        `  APP_ENVIRONMENT : ${dbEnv.appEnvironment}`,
        ``,
        `Development must not migrate or mutate production. If you meant to run`,
        `against local development, point DATABASE_URL at the Docker database:`,
        ``,
        `  docker compose -f docker-compose.dev.yml up -d`,
        `  (.env.development.local already sets DATABASE_URL for this)`,
        ``,
        `If this really is an intentional production operation, set BOTH:`,
        `  ALLOW_PRODUCTION_DB_WRITE=I_UNDERSTAND`,
        `  PRODUCTION_DB_CONFIRM_HOST=${dbEnv.host}`,
      ].join('\n'),
    );
    this.name = 'ProductionDatabaseGuardError';
  }
}

/**
 * Throw unless `operation` is safe against the currently configured database.
 *
 * Safe when: the target is not production, OR this process genuinely IS
 * production (APP_ENVIRONMENT=production, i.e. the deployed backend running its
 * own migrations), OR the two-part override is present.
 */
export function assertSafeDbOperation(
  operation: GuardedOperation,
  dbEnv: DbEnvironment,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!dbEnv.isProduction) return;
  if (dbEnv.appEnvironment === 'production') return;
  if (overrideIsValid(env, dbEnv.host)) return;
  throw new ProductionDatabaseGuardError(operation, dbEnv);
}

/** One-line boot banner: which database is this process actually talking to. */
export function dbBanner(dbEnv: DbEnvironment): string {
  return `DB ${dbEnv.label} — ${dbEnv.database} @ ${dbEnv.host} (APP_ENVIRONMENT=${dbEnv.appEnvironment})`;
}
