# Recovered from `geometry-reconciliation`, 2026-08-26

These four files existed on the `geometry-reconciliation` branch and **nowhere
else**. Two of them are named by `package.json` targets that have pointed at
nothing since the branch stopped being merged — the targets were not stale
references to deleted code, they were references to code that never landed.

They are preserved **here, not in `backend/scripts/`**, deliberately. Nothing in
this directory is on a path the platform can invoke, so none of it can become a
hidden production dependency. Promotion out of this directory is a reviewed
decision, one file at a time.

Source branch: `geometry-reconciliation` (3 commits, last 2026-06-08, 362 behind
`main`). The branch's stated purpose — one geometry source of truth — **did
ship**: `backend/src/pipeline/publishing-standard/geometry.ts` and
`SPEC_GEOMETRY_RECONCILIATION.md` are on `main` and `main`'s copies are newer.
Only these four files did not come with it.

---

## `audit-manuscript.ts` — 63 loc

**Classification: REUSABLE, as-is.**

**Purpose.** A CLI over the live parser. Takes a manuscript path, runs
`parseManuscriptOutline` and `assertUsableManuscriptOutline`, and reports
duplicate chapter numbers and other outline defects before a book is ingested.

**Dependencies.** `../src/pipeline/stage-1-ingestion/parse-manuscript-outline.js`
only, plus `node:fs` and `node:path`. **Both exported symbols still exist on
`main` and are unchanged**, so this file compiles and runs today.

**Against the current platform.** There is no equivalent. `manuscript-parse-gate.ts`
checks a manuscript at typeset time, inside the pipeline; this checks one before
it enters. That gap is real: a manuscript with duplicate chapter numbers is
currently discovered by a failed build.

**Recommendation.** Promote in Phase 3 as the first entry point of the manuscript
audit layer, once the QA system has a home to put it in. Do not wire the
`audit:manuscript` target back up before then — a command that exists is a
command someone will run against production data.

---

## `smoke-test.ts` — 221 loc

**Classification: PARTIALLY REUSABLE. The shape is good; the service list is stale.**

**Purpose.** Connectivity and auth check for every external service, reporting
PASS / FAIL / SKIPPED per service, where SKIPPED means the env var is still the
`.env.example` placeholder. Exit code 0 unless something that is configured fails.

**Dependencies.** `@anthropic-ai/sdk`, `openai`, `replicate`,
`@supabase/supabase-js`, `ioredis`, `@sentry/node`, and `../src/env.js`.

**Against the current platform.** The design is sound and worth keeping: fail
loudly on a real misconfiguration, stay quiet about what is deliberately unset.
The roster is out of date — it checks Supabase as the storage backend, and
storage is now **R2-primary with Supabase as read fallback**. Cloudflare R2 is
not checked at all, which is the one that matters most now.

**Cost note.** It authenticates against paid providers. It does not generate
anything, so it does not spend, but it does make live network calls with real
keys.

**Recommendation.** Rewrite the roster against the current service list rather
than restoring the file. Keep the PASS / FAIL / SKIPPED contract exactly. Good
candidate for the first CI job once the fixture book exists.

---

## `verify-live-geometry.ts` — 228 loc

**Classification: HISTORICAL REFERENCE. Do not promote.**

**Purpose.** Verified that the June geometry reconciliation had taken effect on
the **deployed** backend, over HTTPS.

**Why it stays here.** Two reasons, either of which is sufficient:

1. It runs against production by default, with a hardcoded production project id
   and the live Railway URL as fallbacks.
2. It carries a `--repaginate` flag, and re-pagination **CASCADE-deletes body
   render rows**. A destructive operation against production, one flag away, in a
   script whose name says "verify".

The reconciliation it was written to prove shipped in June. It has no remaining
job.

**What is worth keeping from it.** The idea, not the file: it reads the trim from
the project config and derives the expected geometry rather than asserting a
fixed size. That principle belongs in the Phase 1 cover-geometry validator.

---

## `scripts-README.md` — 33 loc

**Classification: HISTORICAL REFERENCE.**

Documented `backend/scripts/` when the folder was small enough to document. It
covers `smoke-test.ts` and a handful of others, in a what-it-does / input /
output / how-to-run / what-can-go-wrong format that is genuinely good and worth
reviving as the template for per-script documentation.

Preserved with its original bytes, including a UTF-8 BOM and one mojibake
sequence (`â€"` for an em dash) — evidence of the same line-ending and encoding
drift the remediation is addressing, so it is left uncorrected here.

**Recommendation.** Use its format for the script census documentation. Do not
restore the file itself; `backend/scripts/` now holds 310 files and a single
hand-maintained README is no longer the right instrument.
