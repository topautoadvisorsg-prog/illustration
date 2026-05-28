/**
 * Structured Pino logger.
 *
 * Every log entry includes a `service` field. Pipeline code is expected to
 * augment child loggers with `stage`, `book_id`, `page_id`, `correlation_id`
 * as those values come into scope.
 */

import pino, { type Logger, type LoggerOptions } from 'pino';
import { getEnv } from '../env.js';

const env = getEnv();

const options: LoggerOptions = {
  level: env.LOG_LEVEL,
  base: { service: 'wildlands-backend', env: env.NODE_ENV },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.api_key',
      '*.apiKey',
      '*.token',
      '*.password',
    ],
    censor: '[REDACTED]',
  },
};

// Pretty logs in dev, JSON in prod.
const transport =
  env.NODE_ENV === 'development'
    ? pino.transport({
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
      })
    : undefined;

export const logger: Logger = transport ? pino(options, transport) : pino(options);

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
