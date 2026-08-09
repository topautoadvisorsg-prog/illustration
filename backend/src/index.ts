import { getEnv } from './env.js';
import { dbBanner, describeDbEnvironment } from './lib/db-environment.js';
import { logger } from './lib/logger.js';
import { buildServer } from './server.js';
import { activeStorageKind } from './services/storage/project-storage.js';

async function main(): Promise<void> {
  const env = getEnv();
  // Boot-time BUILD signal. A failed image build leaves the previous container
  // running and answering /health exactly as before, so a deploy can appear to
  // land while the old code keeps serving. Stating the commit on every boot
  // means `railway logs` answers "which code is actually running?" without
  // having to reason about deployment records.
  logger.info(
    { commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? 'unknown', branch: process.env.RAILWAY_GIT_BRANCH ?? 'unknown' },
    `booting build ${(process.env.RAILWAY_GIT_COMMIT_SHA ?? 'unknown').slice(0, 7)}`,
  );
  // Boot-time DATABASE signal. Local dev and the deployment shared one Supabase
  // database until 2026-08-08, and nothing on screen ever said so — a local
  // probe silently mutated real production data. Every start now states which
  // database this process is actually talking to, loudly when it is production.
  const dbEnv = describeDbEnvironment(env.DATABASE_URL, env.APP_ENVIRONMENT, env.PRODUCTION_DB_HOST || undefined);
  if (dbEnv.isProduction && dbEnv.appEnvironment !== 'production') {
    logger.warn(
      { db: dbEnv.host, database: dbEnv.database, appEnvironment: dbEnv.appEnvironment },
      `${dbBanner(dbEnv)} — a NON-production process is pointed at the PRODUCTION database. Migrations and destructive scripts are blocked; ordinary writes are NOT. Point DATABASE_URL at the Docker dev database.`,
    );
  } else {
    logger.info({ db: dbEnv.host, database: dbEnv.database, appEnvironment: dbEnv.appEnvironment }, dbBanner(dbEnv));
  }

  // Boot-time persistence signal: confirms on every deploy whether generated
  // images/PDFs are going to durable Supabase Storage or ephemeral local disk.
  const storage = activeStorageKind();
  if (storage === 'supabase') {
    logger.info({ storage, env: env.NODE_ENV }, 'project storage: durable (Supabase) — files persist across redeploys');
  } else {
    logger.warn({ storage, env: env.NODE_ENV }, 'project storage: EPHEMERAL local disk — files will be LOST on redeploy (Supabase not configured)');
  }
  const server = await buildServer();
  await server.listen({ host: env.HOST, port: env.PORT });
}

main().catch((error) => {
  logger.fatal({ error }, 'backend failed to start');
  process.exit(1);
});
