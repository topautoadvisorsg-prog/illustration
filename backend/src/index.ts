import { getEnv } from './env.js';
import { dbBanner, describeDbEnvironment } from './lib/db-environment.js';
import { logger } from './lib/logger.js';
import { buildServer } from './server.js';
import {
  activeStorageKind,
  hasIgnoredProductionStorageCredentials,
} from './services/storage/project-storage.js';

/**
 * PROCESS LIFECYCLE — so a dev-server restart during a long request is visible.
 *
 * `tsx watch` restarts by killing this process and starting a new one. From
 * outside, that is indistinguishable from a request that hangs: the client waits
 * forever on a connection nothing will ever answer. It has already happened once
 * mid-render here and cost an hour of misdiagnosis.
 *
 * Deliberately hooks only `exit` — an observer, not a handler. Adding a SIGTERM
 * listener would REPLACE Node's default terminate-on-signal behaviour, which is
 * a behaviour change in the shutdown path, and this is instrumentation.
 * A restart therefore reads as: an exit line, then a boot line with a new pid.
 */
function logProcessLifecycle(): void {
  const startedAt = Date.now();
  logger.info({ pid: process.pid, node: process.version }, `process START pid=${process.pid}`);
  process.on('exit', (code) => {
    // Must stay synchronous: nothing async runs during 'exit'.
    logger.info(
      { pid: process.pid, code, uptimeMs: Date.now() - startedAt },
      `process EXIT pid=${process.pid} code=${code} after ${Date.now() - startedAt}ms` +
        ' — if this lands mid-request, the request was killed, not hung',
    );
  });
}

async function main(): Promise<void> {
  const env = getEnv();
  logProcessLifecycle();
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
  if (storage === 'supabase' || storage === 'r2') {
    logger.info({ storage, env: env.NODE_ENV }, `project storage: durable (${storage}) — files persist across redeploys`);
  } else {
    logger.warn({ storage, env: env.NODE_ENV }, 'project storage: EPHEMERAL local disk — files will be LOST on redeploy');
  }
  // Production credentials present in a process that is not production. They are
  // IGNORED, not used — but say so, because the alternative is a developer
  // believing their writes are local while they land in the production bucket.
  // That is exactly how a dev intake put a manuscript into production R2.
  if (hasIgnoredProductionStorageCredentials()) {
    logger.warn(
      { appEnvironment: env.APP_ENVIRONMENT, storage },
      'production storage credentials are present but IGNORED: APP_ENVIRONMENT is not "production", ' +
        'so this process uses LOCAL disk. Nothing it writes can reach the production bucket.',
    );
  }
  const server = await buildServer();
  await server.listen({ host: env.HOST, port: env.PORT });
}

main().catch((error) => {
  logger.fatal({ error }, 'backend failed to start');
  process.exit(1);
});
