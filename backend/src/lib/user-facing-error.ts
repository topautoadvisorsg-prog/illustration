import type { ApiErrorAction, ApiErrorField } from '@wildlands/shared';

/**
 * Throw this instead of letting a raw Zod/validation error (or any other
 * internal detail) reach the operator. The global error handler in
 * server.ts recognizes this class and sends its fields verbatim — nothing
 * else is inferred or reformatted, so the message here IS what's shown.
 *
 * This is the ONLY sanctioned way to produce a user-facing error anywhere
 * in the backend — see docs/ERROR_HANDLING_STANDARD.md. `errorCode` is
 * required (not optional) so a new call site can't silently skip it: pick
 * an existing code from error-codes.ts or mint a new one there first.
 */
export class UserFacingError extends Error {
  statusCode: number;
  code: string;
  errorCode: string;
  fields?: ApiErrorField[];
  action?: ApiErrorAction;

  constructor(
    message: string,
    opts: { errorCode: string; statusCode?: number; code?: string; fields?: ApiErrorField[]; action?: ApiErrorAction },
  ) {
    super(message);
    this.name = 'UserFacingError';
    this.statusCode = opts.statusCode ?? 400;
    this.code = opts.code ?? 'Bad Request';
    this.errorCode = opts.errorCode;
    this.fields = opts.fields;
    this.action = opts.action;
  }
}
