import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getEnv, isPlaceholder } from '../env.js';
import { currentAccess, redactConnectionString, DatabaseAccessError } from './operational-access.js';
import * as schema from './schema/index.js';

export type WildlandsDb = PostgresJsDatabase<typeof schema>;

let db: WildlandsDb | null = null;

export function getDb(): WildlandsDb {
  if (db) return db;

  const env = getEnv();
  if (isPlaceholder(env.DATABASE_URL)) {
    throw new Error('DATABASE_URL is still a placeholder; database access is disabled until Supabase keys arrive.');
  }

  assertConnectionAllowed(env.DATABASE_URL, env.APP_ENVIRONMENT);

  const client = postgres(env.DATABASE_URL, {
    max: 5,
    prepare: false,
  });
  db = drizzle(client, { schema });
  return db;
}

/**
 * TRIPWIRE. The entry point in `operational-access.ts` is the sanctioned way in;
 * this is what makes it a guard rather than advice.
 *
 * Without it, a script can still do what all eighteen of the old ones did —
 * assign `process.env.DATABASE_URL` and connect — and nothing would notice.
 *
 * The rule is narrow on purpose: a process that does not believe it IS
 * production, and never declared operational access, must not hold an off-box
 * connection. It does not try to decide whether a given host is production;
 * that question is answered by declaration in `operational-access.ts`. It only
 * refuses the combination that has no legitimate explanation.
 *
 * `APP_ENVIRONMENT` is the signal, never `NODE_ENV`. The repo-root `.env` sets
 * `NODE_ENV="production"` on developer machines, which is precisely how storage
 * once wrote a local intake into the production bucket.
 */
function assertConnectionAllowed(url: string, appEnvironment: string): void {
  const loopback = /(?:\/\/|@)(?:127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url);
  if (loopback || appEnvironment === 'production' || currentAccess()) return;
  throw new DatabaseAccessError(
    `Refusing to open an off-box database connection from a process that is not production.

` +
      `    target           ${redactConnectionString(url)}
` +
      `    APP_ENVIRONMENT  ${appEnvironment}

` +
      `  Nothing declared operational access, so this is an ad-hoc connection of exactly the kind
` +
      `  that used to be written by hand in every script. Declare it instead:

` +
      `    import { openOperationalDatabase } from './db/operational-access.js';
` +
      `    openOperationalDatabase({ environment: 'production', intent: 'read' });

` +
      `  ...before anything imports the database client. For a write, add a ProductionWriteGrant.`,
  );
}
