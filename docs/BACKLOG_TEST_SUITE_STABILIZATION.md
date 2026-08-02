# Backlog — Test Suite Stabilization

**Status:** backlog. Not blocking current work. Tracked here per an explicit
request to not let this drift into "ignored indefinitely" — pick it up
before the test suite grows much further, not urgently today.

This is a punch list, not a plan — each item needs its own investigation
before fixing (per the testing philosophy in `docs/ERROR_HANDLING_STANDARD.md`:
fix bugs that actually exist, don't chase coverage for its own sake).

## 1. ~31 pre-existing failing tests, unrelated to the error-handling platform

Confirmed via `git stash` before any error-handling-platform work landed —
these fail identically on a clean checkout, so they predate and are
unrelated to everything in `ERROR_HANDLING_STANDARD.md` /
`ERROR_HANDLING_ARCHITECTURE.md`. Grouped by likely root cause, as last
observed:

- **Stale layout-template naming** (`src/pipeline/stage-1.75-pagination/__tests__/layout-sequence.test.ts`,
  `paginate.integration.test.ts`, `src/__tests__/blueprint.test.ts`,
  `book-identity.test.ts`, `generate-image.test.ts`, `layered-layout.test.ts`,
  `layout-regions.test.ts`, `page-role-prompt.test.ts`, `flow-engine.test.ts`) —
  several assert on old template names (e.g. `LAYOUT_4_DANGER_WARNING`) where
  the actual code now produces newer simplified-family names (e.g.
  `LAYOUT_B_IMAGE_TOP`). Looks like the tests weren't updated when the
  simplified layout families (`LAYOUT_A_*`/`LAYOUT_B_*`/etc. in
  `LayoutTemplateIdSchema`, shared/src/index.ts) were introduced. Needs
  someone who knows which naming is actually current production behavior to
  update the tests to match (or fix the code, if the tests were right and
  something regressed — that determination is the actual work here).
- **`server.test.ts` environment assumptions** — expects `OPENAI_API_KEY` in
  the health check's `placeholderKeys` list and expects `/api/agents` to be
  reachable without auth; both fail against the current `.env` /
  `CONSOLE_PASSWORD` setup. Likely the test was written before the
  password gate existed, or before placeholder-key detection changed.
- **`whole-page.routes.test.ts`** (8 failures, all "returns 503 when the flag
  is off") — suggests `WHOLE_PAGE_RENDER_ENABLED` (or equivalent) defaults
  differently in the test environment now than when these were written.

None of these look hard to fix individually — they mostly look like the
tests drifted from the code rather than the code being broken — but
verifying that for each one (rather than just updating assertions to match
current behavior blindly) is real work, not a five-minute pass.

## 2. Parallel-execution flakiness under full `vitest run`

Observed while adding `backend/src/__tests__/error-platform-e2e.test.ts`
(real DB-backed integration tests, same pattern as the pre-existing
`server.test.ts`): running the full suite in parallel worker threads
occasionally tips an unrelated CPU-heavy test into a transient failure —
different ones each run (seen: `cover-print.test.ts`, `print-prep.test.ts`,
`pagination.routes.guards.test.ts`), never a repeatable logic failure. All
pass reliably alone or in small targeted subsets.

Root cause is resource contention, not test logic: `vitest.config.ts` has no
`pool`/`poolOptions`/concurrency tuning, so all ~60 test files run in
parallel by default, and DB-round-trip tests + `sharp`-based image
composition tests compete for the same CPU/network/connection-pool budget.

Options for whoever picks this up (not evaluated in depth — this is a
backlog item, not a plan):
- Tune `vitest.config.ts`'s `test.poolOptions.threads.maxThreads` down, or
  split DB-touching integration tests into a separate, serially-run vitest
  "project" so they don't compete with CPU-heavy unit tests.
- Or accept it and add a documented "if it fails, re-run just that file"
  note to CONTRIBUTING-style docs — cheaper, but doesn't fix CI reliability.

## Non-goals for this backlog item

- Don't chase 100% suite-wide green as an end in itself — some of these may
  reveal an actual regression once investigated, in which case fix the
  regression, not the test.
- Don't add new tests here — this item is about making the existing suite
  reliable, not expanding it.
