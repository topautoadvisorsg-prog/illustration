import { Queue, type ConnectionOptions, type JobsOptions } from 'bullmq';
import { JobTypeSchema, type JobType } from '@wildlands/shared';
import { getEnv, isPlaceholder } from '../../env.js';

export interface PipelineJobData {
  projectId?: string;
  pageId?: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
  removeOnComplete: 1000,
  removeOnFail: false,
};

let redisOptions: ConnectionOptions | null = null;

export function getRedisConnectionOptions(): ConnectionOptions {
  if (redisOptions) return redisOptions;
  const env = getEnv();
  if (isPlaceholder(env.UPSTASH_REDIS_URL)) {
    throw new Error('UPSTASH_REDIS_URL is still a placeholder; queues are disabled until Redis credentials arrive.');
  }
  const url = new URL(env.UPSTASH_REDIS_URL);
  redisOptions = {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: decodeURIComponent(url.username || 'default'),
    password: decodeURIComponent(url.password),
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
  return redisOptions;
}

export function getPipelineQueue(name: JobType): Queue<PipelineJobData, void, JobType> {
  const queueName = JobTypeSchema.parse(name);
  return new Queue<PipelineJobData, void, JobType>(queueName, {
    connection: getRedisConnectionOptions(),
    defaultJobOptions,
  });
}

export async function enqueuePipelineJob(name: JobType, data: PipelineJobData): Promise<string> {
  const queue = getPipelineQueue(name);
  const job = await queue.add(name, data, {
    jobId: data.idempotencyKey,
  });
  return job.id ?? data.idempotencyKey;
}
