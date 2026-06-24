/* SINGLE SOURCE of the active project ID for every operator script.
 *
 * Reads PROJECT_ID from the environment (<repo-root>/.env). Fails LOUDLY if it is
 * missing — it NEVER defaults to a hardcoded book, so a script can never silently
 * run against the wrong project. This is the one-line-per-book setup that makes the
 * toolchain safe for the next region:  PROJECT_ID=<project-id>  in .env.
 *
 * Every script imports `P` from here instead of hardcoding an id.
 */
import '../src/env.js'; // side-effect: loads <repo-root>/.env into process.env before we read it

const raw = process.env.PROJECT_ID?.trim();
if (!raw) {
  console.error(
    'FATAL: PROJECT_ID is not set. Add `PROJECT_ID=<project-id>` to your .env (the active book) and re-run.\n' +
      'Refusing to default to a hardcoded project — a script must never act on the wrong book.',
  );
  process.exit(1);
}

export const P: string = raw;

// Print the active project ONCE (to stderr, so it never pollutes parsed stdout) so
// the operator always sees which book a script just ran against.
console.error(`[project] active PROJECT_ID = ${P}`);

// Operator STORAGE STATUS LINE — printed on every script so nobody is ever confused
// about where files are going. Computed from env directly (no heavy client imports,
// no full-env validation) so it stays cheap on startup. .env is already loaded above.
const isPh = (v?: string): boolean => !v || /^your_.*_here$/i.test(v) || v.trim() === '';
const r2On = !isPh(process.env.R2_ACCOUNT_ID) && !isPh(process.env.R2_ACCESS_KEY_ID) && !isPh(process.env.R2_SECRET_ACCESS_KEY);
const supaOn = !isPh(process.env.SUPABASE_URL) && !isPh(process.env.SUPABASE_SERVICE_ROLE_KEY);
const filesMode = r2On
  ? supaOn
    ? 'R2 primary · Supabase fallback'
    : 'R2 only (NO fallback)'
  : supaOn
    ? 'Supabase only'
    : 'Local disk (EPHEMERAL)';
const dbMode = /supabase/i.test(process.env.DATABASE_URL ?? '') ? 'Supabase' : 'Postgres';
console.error(`[storage] Storage mode: ${filesMode} · DB: ${dbMode}`);
