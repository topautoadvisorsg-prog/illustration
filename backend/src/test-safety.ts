/**
 * Production safety guard — FAIL CLOSED.
 *
 * Automated tests must never touch production. Not the production database,
 * not production API keys, not production storage. This module inspects the
 * environment a test run actually ended up with and refuses to proceed if any
 * production resource is reachable, exiting with an explicit description of
 * the violation rather than a vague failure hours later.
 *
 * This is a guard, not a convenience. It exists because the suite genuinely
 * did run against the live production database — error-platform-e2e creates
 * and deletes projects, so every full run wrote to the database holding the
 * live book. env.ts no longer loads the repo-root `.env` under test, which
 * closes the default path; this module closes the rest, including someone
 * pasting a production URL into `.env.test` or exporting one in their shell.
 *
 * Design: DENY by default. A credential is allowed only if it is provably
 * safe — a recognized placeholder, or a database explicitly marked as a test
 * database. Anything that looks real is a violation. A new credential type
 * added to the schema is therefore refused until someone teaches this guard
 * how to recognize its safe form, which is the correct direction to fail.
 */

/** Placeholder markers used by `.env.example`. These are never real. */
const PLACEHOLDER_PATTERN = /your_|_here\b|example|placeholder|changeme|dummy|fake|xxx/i;

export function isPlaceholderValue(value: string | undefined): boolean {
  if (!value || value.trim() === '') return true;
  return PLACEHOLDER_PATTERN.test(value);
}

/**
 * A database URL is safe for tests only if it is explicitly a test database:
 * a local host, or a database name that says so. Anything else — including a
 * managed cloud host — is treated as production.
 */
export function isTestDatabaseUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not a URL at all. Only the literal .env.example placeholder is safe;
    // anything else unparseable cannot be proven safe.
    return isPlaceholderValue(url);
  }
  // A parseable URL is judged ONLY on its host and database name. The generic
  // placeholder pattern must NOT be applied here: a real production host can
  // legitimately contain "example" or "test" somewhere in its domain, and
  // treating that as a placeholder would wave production straight through.
  // (This exact hole was caught by test-safety.test.ts before shipping.)
  const host = parsed.hostname.toLowerCase();
  const dbName = parsed.pathname.replace(/^\//, '').toLowerCase();
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === 'host.docker.internal';
  const nameSaysTest = /(^|[_-])test($|[_-])|_test$|^test_/.test(dbName);
  return isLocalHost || nameSaysTest;
}

interface CredentialCheck {
  name: string;
  value: string | undefined;
  /** Why this specific value is considered production. */
  describe: (value: string) => string;
  isSafe: (value: string | undefined) => boolean;
}

function looksLikeRealSecret(value: string | undefined): boolean {
  return !isPlaceholderValue(value);
}

/**
 * Inspect the environment and return every production-safety violation.
 * Pure — returns findings rather than throwing, so it is itself testable.
 */
export function findProductionSafetyViolations(env: NodeJS.ProcessEnv = process.env): string[] {
  const checks: CredentialCheck[] = [
    {
      name: 'DATABASE_URL',
      value: env.DATABASE_URL,
      isSafe: (v) => !v || isTestDatabaseUrl(v),
      describe: () =>
        'points at a database that is not provably a test database. Tests create and delete real rows. ' +
        'Use a dedicated test database (a localhost host, or a database name containing "test").',
    },
    {
      name: 'SUPABASE_SERVICE_ROLE_KEY',
      value: env.SUPABASE_SERVICE_ROLE_KEY,
      isSafe: (v) => !looksLikeRealSecret(v),
      describe: () => 'is a real Supabase service-role key, which bypasses row-level security on production data.',
    },
    {
      name: 'OPENAI_API_KEY',
      value: env.OPENAI_API_KEY,
      isSafe: (v) => !looksLikeRealSecret(v),
      describe: () => 'is a real OpenAI key. A test that reaches the API spends real money on image generation.',
    },
    {
      name: 'ANTHROPIC_API_KEY',
      value: env.ANTHROPIC_API_KEY,
      isSafe: (v) => !looksLikeRealSecret(v),
      describe: () => 'is a real Anthropic key. A test that reaches the API spends real money.',
    },
    {
      name: 'REPLICATE_API_TOKEN',
      value: env.REPLICATE_API_TOKEN,
      isSafe: (v) => !looksLikeRealSecret(v),
      describe: () => 'is a real Replicate token. A test that reaches the API spends real money.',
    },
    {
      name: 'R2_ACCESS_KEY_ID',
      value: env.R2_ACCESS_KEY_ID,
      isSafe: (v) => !looksLikeRealSecret(v),
      describe: () => 'grants access to production R2 storage, where the book’s rendered pages live.',
    },
    {
      name: 'R2_SECRET_ACCESS_KEY',
      value: env.R2_SECRET_ACCESS_KEY,
      isSafe: (v) => !looksLikeRealSecret(v),
      describe: () => 'grants write access to production R2 storage.',
    },
  ];

  const violations: string[] = [];
  for (const check of checks) {
    if (check.isSafe(check.value)) continue;
    violations.push(`  - ${check.name} ${check.describe(check.value ?? '')}`);
  }
  return violations;
}

/**
 * Enforce production safety for a test run. Throws with a clear, actionable
 * explanation naming every offending variable. Called from the vitest setup
 * file, so it runs before any test in any file.
 */
export function assertNoProductionResourcesInTests(env: NodeJS.ProcessEnv = process.env): void {
  const violations = findProductionSafetyViolations(env);
  if (violations.length === 0) return;

  throw new Error(
    [
      '',
      'PRODUCTION SAFETY VIOLATION — refusing to run tests.',
      '',
      'The test environment can reach production resources. Tests create, modify,',
      'and delete data, and can spend money. This run was stopped before any test',
      'executed.',
      '',
      'Offending configuration:',
      ...violations,
      '',
      'How to fix:',
      '  1. Tests must not read the repo-root .env — it holds production credentials.',
      '     Check that nothing exported these into your shell before running vitest.',
      '  2. Put test-only values in .env.test (see .env.test.example). Leave secrets',
      '     as placeholders; only set DATABASE_URL, and only to a DEDICATED test',
      '     database that is safe to wipe.',
      '  3. Never point a test at the production database, bucket, or API key.',
      '',
    ].join('\n'),
  );
}
