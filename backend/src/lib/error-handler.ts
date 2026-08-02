/**
 * The centralized error-translation layer's Fastify wiring — see
 * docs/ERROR_HANDLING_STANDARD.md. Extracted from server.ts so it can be
 * exercised with a minimal Fastify instance in tests (backend/src/lib/__tests__/
 * error-handling.test.ts) without needing a live database.
 *
 * Without this, Fastify's default handler sends raw Zod validation output
 * straight to the operator (schema paths like "body/config/authorName", or —
 * for a manually-thrown ZodError that escapes a route handler — a JSON-dumped
 * issues array). Every path below ends in a plain sentence per field, never a
 * schema path, raw JSON, or stack trace. Routes that already reply with a
 * structured error via `reply.code().send(...)` never reach this handler at
 * all — it only catches thrown/uncaught errors.
 */
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { ZodError } from 'zod';
import type { ApiErrorAction, ApiErrorField } from '@wildlands/shared';
import { UserFacingError } from './user-facing-error.js';
import { issuesToFields, summaryMessage, summaryErrorCode } from './validation-messages.js';
import { ERROR_CODES } from './error-codes.js';
import { logger } from './logger.js';

const require = createRequire(import.meta.url);
// Read once at module load — used to tag every translated-error telemetry
// log with the running build, per the "which app version" ask.
export const APP_VERSION = (require('../../package.json') as { version?: string }).version ?? 'unknown';

export interface TranslatedErrorEvent {
  /** Generated fresh for this occurrence — lets a later "recovery clicked" /
   *  "recovery succeeded" event (see error-events.repo.ts, diagnostics.routes.ts)
   *  be tied back to the specific error that prompted it. */
  correlationId: string;
  errorCode: string;
  method: string;
  path: string;
  projectId?: string;
  statusCode: number;
  appVersion: string;
}

/** Called for every translated error, in addition to the structured log line
 *  below. server.ts wires this to also persist a row (error_events table) —
 *  see backend/src/db/repositories/error-events.repo.ts. Tests can pass their
 *  own no-op / spy via registerErrorHandler's second argument. */
export type TranslatedErrorSink = (event: TranslatedErrorEvent) => void;

const noopSink: TranslatedErrorSink = () => {};

/** Structured log line for every translated user-facing error — the "which
 *  error, how often, which step, which project" telemetry. Deliberately just
 *  a structured pino log (searchable/aggregable in whatever log sink is
 *  already wired up) rather than new analytics infra. Returns the event
 *  (including its correlationId) so the caller can put it in the response. */
function logTranslatedError(
  request: { method: string; url: string; params: unknown },
  errorCode: string,
  statusCode: number,
  sink: TranslatedErrorSink,
): TranslatedErrorEvent {
  const params = request.params as Record<string, unknown> | undefined;
  const projectId = typeof params?.id === 'string' ? params.id : undefined;
  const event: TranslatedErrorEvent = {
    correlationId: randomUUID(),
    errorCode,
    method: request.method,
    path: request.url.split('?')[0] ?? request.url,
    projectId,
    statusCode,
    appVersion: APP_VERSION,
  };
  logger.info({ event: 'translated_validation_error', ...event }, 'translated validation error');
  try {
    sink(event);
  } catch (err) {
    // Telemetry must never break the response it's describing.
    logger.warn({ err }, 'translated-error telemetry sink failed');
  }
  return event;
}

/** The one JSON shape every translated error responds with — see ApiErrorSchema
 *  (shared). Pulled out so the three branches below (UserFacingError, Fastify
 *  schema validation, raw ZodError safety net) build it identically instead
 *  of repeating the same object literal with minor variations. */
function sendTranslated(
  reply: FastifyReply,
  args: {
    statusCode: number;
    errorTitle: string;
    message: string;
    errorCode: string;
    correlationId: string;
    fields?: ApiErrorField[];
    action?: ApiErrorAction;
  },
): void {
  reply.code(args.statusCode).send({
    error: args.errorTitle,
    message: args.message,
    statusCode: args.statusCode,
    fields: args.fields,
    action: args.action,
    errorCode: args.errorCode,
    correlationId: args.correlationId,
  });
}

/**
 * Registers the centralized error handler on `app`. `sink` is called once per
 * translated error (in addition to the always-on structured log) — server.ts
 * passes one that persists to the error_events table; tests can pass a spy or
 * omit it entirely.
 */
export function registerErrorHandler(app: FastifyInstance, sink: TranslatedErrorSink = noopSink): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof UserFacingError) {
      const event = logTranslatedError(request, error.errorCode, error.statusCode, sink);
      sendTranslated(reply, {
        statusCode: error.statusCode,
        errorTitle: error.code,
        message: error.message,
        errorCode: error.errorCode,
        correlationId: event.correlationId,
        fields: error.fields,
        action: error.action,
      });
      return;
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const issues = error.validation.map((v) => v.params.issue);
      const fields = issuesToFields(issues);
      const errorCode = summaryErrorCode(fields, ERROR_CODES.FIELD_GENERIC);
      const event = logTranslatedError(request, errorCode, 400, sink);
      sendTranslated(reply, {
        statusCode: 400,
        errorTitle: 'Validation Error',
        message: summaryMessage(fields),
        errorCode,
        correlationId: event.correlationId,
        fields,
      });
      return;
    }

    if (error instanceof ZodError) {
      const fields = issuesToFields(error.issues);
      const errorCode = summaryErrorCode(fields, ERROR_CODES.UNCLASSIFIED);
      const event = logTranslatedError(request, errorCode, 400, sink);
      sendTranslated(reply, {
        statusCode: 400,
        errorTitle: 'Validation Error',
        message: summaryMessage(fields),
        errorCode,
        correlationId: event.correlationId,
        fields,
      });
      return;
    }

    request.log.error(error);
    reply.send(error);
  });
}
