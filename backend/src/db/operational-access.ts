/**
 * THE ONE WAY AN OPERATIONAL SCRIPT REACHES A DATABASE.
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Eighteen scripts reached production by hand: each read `.env` itself, pulled
 * `DATABASE_URL` out with its own regex, wrote it back into `process.env` before
 * the database client was constructed, and then invented its own safety check —
 * or did not. Of the five that can WRITE, one had no host check at all, and that
 * one was `scripts/qa/book.ts`, the script written to be the sanctioned path.
 *
 * Storage already had a real guard: `project-storage.ts` refuses production
 * unless `APP_ENVIRONMENT` says the process IS production. Its comment claims it
 * "follows the same rule the production-database guard already follows." There
 * was no such guard. `client.ts` read `env.DATABASE_URL` and connected. A
 * comment asserting protection that does not exist is worse than no comment,
 * because the next engineer stops looking.
 *
 * ─── POSITIVE IDENTIFICATION, NOT URL SNIFFING ───────────────────────────────
 * "Is this production?" is answered by DECLARATION, not by inspecting the
 * connection string. Sniffing for `127.0.0.1` is what the old scripts did, and
 * it is wrong in both directions: a remote host is not necessarily production,
 * and a tunnelled production database can be on loopback.
 *
 * The declaration lives here, in committed code: production credentials live in
 * the repo-root `.env`, development credentials in `.env.development.local`.
 * That is already how `env.ts` layers them. This module states it once so no
 * script has to restate it, and the loopback checks below are SAFETY NETS
 * against a misconfigured file, never the identifier.
 *
 * ─── INTENT IS PART OF THE REQUEST ───────────────────────────────────────────
 * Reading production and writing production are different privileges. A read
 * needs no ceremony. A write needs a `ProductionWriteGrant`, which cannot be
 * constructed from a bare `true` — it takes a reason and an explicit
 * confirmation, and the reason is carried into the audit line. That is the
 * difference between authorization and a boolean that gets copied.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** backend/src/db -> repo root */
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

export type DatabaseEnvironment = 'development' | 'production';
export type AccessIntent = 'read' | 'write';

/** Where each environment's credentials are declared. The positive identifier. */
const CREDENTIAL_SOURCE: Record<DatabaseEnvironment, string> = {
  production: '.env',
  development: '.env.development.local',
};

export class DatabaseAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseAccessError';
  }
}

/**
 * Proof that a human authorized a production write, carrying WHY.
 *
 * Deliberately not a boolean and not constructible with `new`. A boolean gets
 * defaulted to `true` in a copied script and nobody notices; this has to be
 * declared at a call site with a reason, and the reason ends up in the log line
 * and in the refusal message when it is missing.
 */
export class ProductionWriteGrant {
  private constructor(readonly reason: string) {}

  static declare(input: { reason: string; confirmed: boolean }): ProductionWriteGrant {
    const reason = (input.reason ?? '').trim();
    if (!input.confirmed) {
      throw new DatabaseAccessError(
        'A production write grant was requested but not confirmed.\n' +
          '  `confirmed` must come from a deliberate operator action — a --confirm flag, not a default.',
      );
    }
    // A grant whose reason is "1" or "yes" is a boolean wearing a costume.
    if (reason.length < 12) {
      throw new DatabaseAccessError(
        `A production write grant needs a real reason; got ${JSON.stringify(reason)}.\n` +
          '  It is recorded with the operation. Say what is being changed and why.',
      );
    }
    return new ProductionWriteGrant(reason);
  }
}

export interface ResolvedAccess {
  environment: DatabaseEnvironment;
  intent: AccessIntent;
  /** `host:port/database`. Credentials are never included, so this is safe to print. */
  target: string;
  /** Present only for an authorized production write. */
  grantReason?: string;
}

/** Everything except `host:port/database`. Never log a raw connection string. */
export function redactConnectionString(url: string): string {
  try {
    const withoutCreds = url.replace(/\/\/[^@]*@/, '//');
    const u = new URL(withoutCreds);
    return `${u.host}${u.pathname}`;
  } catch {
    return '<unparseable connection string>';
  }
}

function readDeclaredUrl(environment: DatabaseEnvironment): string {
  const file = CREDENTIAL_SOURCE[environment];
  let contents: string;
  try {
    contents = readFileSync(path.join(REPO_ROOT, file), 'utf8');
  } catch {
    throw new DatabaseAccessError(
      `No ${file} at the repository root, so ${environment} credentials are not declared.\n` +
        `  This module identifies an environment by WHERE its credentials live, not by what the URL looks like.`,
    );
  }
  const match = contents.match(/^DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/m);
  if (!match?.[1]) {
    throw new DatabaseAccessError(`${file} declares no DATABASE_URL, so ${environment} cannot be resolved.`);
  }
  return match[1].trim();
}

const isLoopback = (url: string): boolean => /(?:\/\/|@)(?:127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url);

/**
 * The module-level record of what THIS process was authorized to do.
 *
 * `client.ts` reads it as a tripwire: a process that is not production, and
 * never declared a grant, must not end up holding a non-loopback connection.
 * Without that, this module would be advice rather than a guard — a new script
 * could still reassign `process.env.DATABASE_URL` and connect.
 */
let current: ResolvedAccess | null = null;
export const currentAccess = (): ResolvedAccess | null => current;
/** Test seam only. Production code never calls this. */
export const __resetAccessForTests = (): void => {
  current = null;
};

/**
 * Select a database for an operational script, and prove the selection is allowed.
 *
 * MUST be called before anything imports the database client, because `getDb()`
 * memoizes its connection on first use. That ordering requirement is the one
 * piece of the old boilerplate that survives, and it is now in one place.
 */
export function openOperationalDatabase(request: {
  environment: DatabaseEnvironment;
  intent: AccessIntent;
  /** Required to write production. Read access never needs one. */
  grant?: ProductionWriteGrant;
}): ResolvedAccess {
  const { environment, intent } = request;

  if (environment === 'production' && intent === 'write' && !request.grant) {
    throw new DatabaseAccessError(
      'Refusing a PRODUCTION WRITE with no authorization.\n\n' +
        '  Pass a grant that says why:\n\n' +
        "    grant: ProductionWriteGrant.declare({ reason: '…', confirmed: argv.includes('--confirm') })\n\n" +
        '  Read-only production access does not need one — ask for intent "read" instead.',
    );
  }
  if (environment !== 'production' && request.grant) {
    throw new DatabaseAccessError(
      `A production write grant was supplied for a ${environment} connection. ` +
        'That grant is meaningless here; remove it rather than leaving it to be copied into a script that IS production.',
    );
  }

  const url = readDeclaredUrl(environment);

  // Safety nets against a misconfigured credentials file. NOT the identifier.
  if (environment === 'production' && isLoopback(url)) {
    throw new DatabaseAccessError(
      `${CREDENTIAL_SOURCE.production} declares a loopback DATABASE_URL (${redactConnectionString(url)}), ` +
        'but it is the file this platform treats as production credentials. Refusing rather than guessing which is wrong.',
    );
  }
  if (environment === 'development' && !isLoopback(url)) {
    throw new DatabaseAccessError(
      `${CREDENTIAL_SOURCE.development} declares a NON-loopback DATABASE_URL (${redactConnectionString(url)}). ` +
        'A development connection pointing off-box is exactly the mistake this guard exists to catch.',
    );
  }

  process.env.DATABASE_URL = url;
  current = {
    environment,
    intent,
    target: redactConnectionString(url),
    ...(request.grant ? { grantReason: request.grant.reason } : {}),
  };
  return current;
}

/** The one line a script should print about its connection. Carries no secret. */
export function describeAccess(access: ResolvedAccess): string {
  const head = `  database       ${access.environment.toUpperCase()} ${access.intent}  ${access.target}`;
  return access.grantReason ? `${head}\n  authorized     ${access.grantReason}` : head;
}
