/**
 * Pre-flight guard for developer database commands.
 *
 * Run BEFORE anything that migrates or mutates. Prints which database is
 * actually configured, then refuses if the target is production and this
 * process is not production.
 *
 *   tsx scripts/db-guard.ts migrate
 *   tsx scripts/db-guard.ts destructive-script
 *
 * Deliberately NOT wired into `yarn start`: the deployed backend runs its own
 * migrations against production, which is correct. This guards the DEVELOPER
 * commands, which are the ones that reached production by accident.
 *
 * Note it keys off APP_ENVIRONMENT, never NODE_ENV — the repo's `.env` sets
 * NODE_ENV=production even on a laptop, so NODE_ENV cannot distinguish a
 * developer machine from the deployment.
 */
import { getEnv } from '../src/env.js';
import {
  assertSafeDbOperation,
  dbBanner,
  describeDbEnvironment,
  ProductionDatabaseGuardError,
  type GuardedOperation,
} from '../src/lib/db-environment.js';

const operation = (process.argv[2] ?? 'migrate') as GuardedOperation;
const env = getEnv();
const dbEnv = describeDbEnvironment(env.DATABASE_URL, env.APP_ENVIRONMENT, env.PRODUCTION_DB_HOST || undefined);

console.log(dbBanner(dbEnv));

try {
  assertSafeDbOperation(operation, dbEnv);
  console.log(`db-guard: "${operation}" permitted against ${dbEnv.label}.`);
} catch (err) {
  if (err instanceof ProductionDatabaseGuardError) {
    console.error('\n' + err.message + '\n');
    process.exit(1);
  }
  throw err;
}
