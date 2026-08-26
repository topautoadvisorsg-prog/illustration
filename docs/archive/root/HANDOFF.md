# HANDOFF — NO ONE TOLD ME THAT (typeset print book)

Written 2026-08-08. Read this before touching anything.

## The goal

Publish **NO ONE TOLD ME THAT** — a black-and-white educational nonfiction
puberty guide for boys 9–14. It is a **professionally typeset print book**, not
an AI-illustrated one. Body pages are deterministic typeset text (Paged.js →
vector PDF). Roughly 10–12 B&W illustrations may be added later as deliberate
moments. **No AI page rendering for body pages. No paid image generation.**

## Operating rules the operator has set (follow these)

1. **Work in the real platform UI, in the browser.** Do not do the work in
   terminal scripts and hand back files. The operator must see it on screen at
   `frontend-production-f65d.up.railway.app`. Scripts are for diagnosis only.
2. **The operator uploads a manuscript ONCE.** Never ask for a re-upload because
   environments differ. Fix version skew yourself.
3. **Do not modify the frozen manuscript prose.**
4. **Fix root causes generically**, not one-off patches for this book.
5. **Ask before paid rendering.** Nothing paid has been run.
6. Report honestly; state what is verified vs assumed.

## Current state — WORKING

- **Typeset engine** `backend/src/pipeline/typeset/` — config-driven (trim,
  margins, typography from ProjectConfig; structure from manuscript headings).
  `GET /api/projects/:id/typeset-preview` (`?format=json` for the report).
- **Console**: Step 5 · Paginate → *Typeset interior preview*. Renders pages to
  canvas with pdf.js (an `<iframe>` PDF embed showed a blank black box).
- **Current proof**: 155 pages, 5.5×8.5, 12pt/1.3, 0.625in gutter, bleed 0,
  **0 overflow**, 14 blank pages, chapters on rectos from p5.
- **Chapter opener alignment: FIXED and verified in production** (see below).
- **Dev/prod DB isolation**: Docker Postgres on 55432,
  `docker-compose.dev.yml`, `.env.development.local` (gitignored, loaded last),
  guard in `backend/src/lib/db-environment.ts`.
- Manuscript provenance: canonical source retained separately from the
  sanitized working copy. Canonical `2145cb95…0157a8`, working `165a6dbb…c4818f`.

## IMMEDIATE NEXT STEPS (operator's exact order)

1. **Finish verifying the alignment fix.** Two of six cases confirmed
   (`CHAPTER 1` label, `No One Told Me That` title — both now centered with
   natural spacing). Still to check on pages ~6–8:
   `What it isn't`, `The three things`,
   `Here's something nobody warns you about.`, `make good choices.`
   Expect: section headings LEFT, paragraph last lines RAGGED-RIGHT.
2. **Run the diagnostic harness once** — `backend/scripts/typeset-diagnose.ts`.
   It captures tag/class/parent/display/text-align/text-align-last/white-space/
   word-spacing/width before AND after Paged.js, plus whether `.tsec > .opener`
   child selectors survive pagination. **Its "after" pass currently times out**:
   swap `waitUntil: 'networkidle0'` for the polling wait the real renderer uses
   (see `render-typeset.ts` STABLE_JS).
3. **Close the deploy-verification hole.** Add the running commit to
   `/health` (`RAILWAY_GIT_COMMIT_SHA` is in the container) and add
   `tsc --noEmit` to pre-deploy. A green `/health` must never be read as
   "latest deploy landed" — see the incident below.
4. **Spec deviation to decide**: the label renders `CHAPTER 1`;
   `CHAPTER_BOOK_STANDARD.md` §3 says **"Chapter One"**. Operator's call.
5. **Font choice.** Render the SAME opener at 5.5×8.5 in **Oswald**, **Archivo**,
   **Montserrat**, show all three, let the operator choose. Oswald is their
   current lean. **Do not depend on Google Fonts at render time for final print**
   — bake the chosen family into `Dockerfile.backend` (it already apt-installs
   fonts-liberation / fonts-dejavu-core / fonts-freefont-ttf; none of the three
   candidates are installed, they are fetched from the CDN today).
6. **Only then**: the 155-page design QA. Do not start it before typography is
   confirmed — auditing against a broken style system is wasted work.

## Two incidents that cost hours — do not repeat

**A green `/health` does not mean your code deployed.** A failed Docker build
leaves the PREVIOUS container running and answering normally. Confirm the
*build* and *instance*, per service:
`railway status --json` → `serviceInstances[].latestDeployment.{meta.commitHash,status,instances[].status}`.

**Backticks inside a template literal break the build silently.**
`typeset-book.ts` builds CSS in a template literal. A CSS comment containing
`` `text-align` `` terminated the string, the build failed, Railway kept the old
container, and two "fixes" appeared to do nothing. Run `tsc --noEmit` before
pushing.

**Railway overrides the Dockerfile CMD** with
`yarn workspace @wildlands/backend start` = `drizzle-kit migrate && node dist/index.js`.
The DB guard in `drizzle.config.ts` therefore runs on every boot; it crashed the
backend until `APP_ENVIRONMENT=production` was set on the Railway service. Any
boot-time guard must be checked against Railway's start command, not the CMD.

**tsx + puppeteer**: esbuild injects a `__name` helper into compiled functions;
puppeteer serialises them into the page where it does not exist, so every
`page.evaluate` throws `__name is not defined`. Pass evaluate bodies as STRINGS.

## Environment

- Railway project `illustrious-reverence`; services `frontend`,
  `@wildlands/backend`. **Railway CLI works** (logged in) — an older note
  claiming it was blocked was wrong.
- Local and production shared ONE Supabase DB until isolation landed; local dev
  now uses Docker Postgres. Production data is real — do not mutate it to test.
- Console password: ask the operator; agents cannot type it into the login form.
  The Browser pane session is often already authenticated — check first.
- Project id (production): `3b7ed37a-8a07-4bfd-a0c3-14ae5dc4a6ff`.

## Not started / known gaps

- Breakdown has not been run on this project, so Step 6 front matter (title
  page, copyright, TOC) does not exist. The book currently opens on Chapter 1.
- Page 1 is blank and has not been explained (13 other blanks are recto-parity).
- Production profile system: only `wildlands-field-guide` is registered. The
  `bw-educational-nonfiction` profile is designed but NOT built. A novel would
  fail Breakdown outright (needs `###` entries per chapter).
- Known ESM cycle: Stage 1.5 ↔ production-profiles registry, worked around with
  deferred arrow wrappers. Relocate the field-guide classification to remove it.
