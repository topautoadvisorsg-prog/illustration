import { Worker } from 'bullmq';
import { type JobType } from '@wildlands/shared';
import { childLogger } from '../lib/logger.js';
import { getRedisConnectionOptions } from '../services/redis/queues.js';

export function startWorker(name: JobType): Worker {
  const log = childLogger({ worker: name });
  const worker = new Worker(
    name,
    async (job) => {
      log.info({ jobId: job.id, data: job.data }, 'worker scaffold received job');
      throw new Error(`${name} worker handler is not implemented yet; Phase 1 service code is next.`);
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 1,
    },
  );

  worker.on('failed', (job, error) => {
    log.error({ jobId: job?.id, error }, 'worker job failed');
  });

  log.info('worker started');
  return worker;
}
