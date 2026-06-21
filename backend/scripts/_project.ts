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
