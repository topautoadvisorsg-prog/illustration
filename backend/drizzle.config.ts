import { defineConfig } from 'drizzle-kit';
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { assertSafeDbOperation, dbBanner, describeDbEnvironment } from './src/lib/db-environment.js';

// MUST mirror backend/src/env.ts's load order, including the developer override
// layer. drizzle-kit runs in its OWN process and previously loaded only `.env`,
// so `yarn drizzle:migrate` migrated PRODUCTION even with the dev database
// configured — the guard script could not see it, because the guard runs in a
// different process. Loading the same layers here is what actually points
// drizzle-kit at the dev database.
loadDotenv({ path: path.resolve(__dirname, '../.env') });
loadDotenv({ path: path.resolve(__dirname, '../.env.development.local'), override: true });

// Second line of defence: drizzle-kit bypasses the guard script entirely, so
// re-assert it here, in-process, using the URL drizzle-kit will actually use.
const dbUrl = process.env.DATABASE_URL ?? 'your_database_url_here';
{
  const appEnvironment = process.env.APP_ENVIRONMENT ?? 'development';
  const dbEnv = describeDbEnvironment(dbUrl, appEnvironment, process.env.PRODUCTION_DB_HOST || undefined);
  console.log('[drizzle-kit] ' + dbBanner(dbEnv));
  assertSafeDbOperation('migrate', dbEnv);
}

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: dbUrl,
  },
  strict: true,
  verbose: true,
});
