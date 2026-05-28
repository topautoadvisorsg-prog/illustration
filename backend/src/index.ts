import { getEnv } from './env.js';
import { logger } from './lib/logger.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const env = getEnv();
  const server = await buildServer();
  await server.listen({ host: env.HOST, port: env.PORT });
}

main().catch((error) => {
  logger.fatal({ error }, 'backend failed to start');
  process.exit(1);
});
