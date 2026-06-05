import { getEnv } from './env.js';
import { logger } from './lib/logger.js';
import { buildServer } from './server.js';
import { activeStorageKind } from './services/storage/project-storage.js';

async function main(): Promise<void> {
  const env = getEnv();
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
