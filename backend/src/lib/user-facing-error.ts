import type { ApiErrorAction, ApiErrorField } from '@wildlands/shared';

/**
 * Throw this instead of letting a raw Zod/validation error (or any other
 * internal detail) reach the operator. The global error handler in
 * server.ts recognizes this class and sends its fields verbatim — nothing
 * else is inferred or reformatted, so the message here IS what's shown.
 */
export class UserFacingError extends Error {
  statusCode: number;
  code: string;
  fields?: ApiErrorField[];
  action?: ApiErrorAction;

  constructor(
    message: string,
    opts: { statusCode?: number; code?: string; fields?: ApiErrorField[]; action?: ApiErrorAction } = {},
  ) {
    super(message);
    this.name = 'UserFacingError';
    this.statusCode = opts.statusCode ?? 400;
    this.code = opts.code ?? 'Bad Request';
    this.fields = opts.fields;
    this.action = opts.action;
  }
}
