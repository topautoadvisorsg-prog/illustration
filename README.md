# The Wildlands Publishing Platform

Turns a finished manuscript into a print-ready, fully illustrated KDP book through
a single guided **Operator Console** — no terminal required.

```text
Operator Console (8 steps):
  Project → Manuscript → Book Setup → Breakdown → Paginate →
  Front & Back Matter → Render & Review (pages + cover + Kindle) → Build Book
```

- Live frontend (Operator Console): `https://frontend-production-f65d.up.railway.app`
- Live backend: `https://wildlandsbackend-production.up.railway.app`
- Health check: `GET /` and `GET /health` → `{ "storage": "supabase", "storageDurable": true, "db": "connected" }`

---

## Starting a new book — `docs/DROP_A_BOOK.md`

You do not have to walk the eight steps by hand to onboard a book.

**Console:** Step 1 → **Drop a book in**. Pick the manuscript, name the book,
choose the book type and trim. One button creates the project, ingests the
manuscript, runs the stages that book's track actually uses, and finishes with a
readiness report.

**Agent:** an MCP server (`yarn workspace @wildlands/backend mcp`) exposes the
same operations as tools. Free tools and spending tools are separated, and the
spending ones refuse to run without explicit confirmation.

**Before spending on anything**, run the free gate — `GET /api/projects/:id/readiness`
or the "Check readiness (free)" button. It is deterministic and read-only, and
it answers whether the book is set up correctly enough to be worth paying for:
that the production profile, layout standard and Style DNA genuinely resolve
rather than silently falling back, that the breakdown parser did not drop
entries, that no other book's region has leaked into these prompts, that print
faces are vendored rather than fetched mid-render, and that a cover is
geometrically buildable.

Its checks are chosen by the book's track — a typeset book is not asked for
pagination it never uses. The rule it lives by is that **a check may only fail
on evidence**; anything else is a warning or N/A, because a gate that fails a
book you already shipped is a gate you learn to ignore.

---

## TWO PRODUCTION TRACKS — read this before changing anything

The platform builds books by **two different routes**, chosen per project by the
production profile in Step 3 (Book Setup → "Book type"). They share the front of
the pipeline, diverge in the middle, and are **supposed** to converge again at
print-prep, cover and assembly.

```text
                     Project → Manuscript → Book Setup → Breakdown
                                       │
                 ┌─────────────────────┴─────────────────────┐
                 │                                           │
   TRACK A: AI WHOLE-PAGE                       TRACK B: DETERMINISTIC TYPESET
   (Illustrated Field Guide)                    (Educational Nonfiction, B&W Digest)
                 │                                           │
   Paginate (character-grid estimate)           Paginate (Paged.js flows the book;
                 │                              the renderer IS the authority)
   Render every page as one AI image                        │
   (text baked in by the model)                  Typeset interior PDF: live vector
                 │                               text, embedded Type0 fonts,
   Front/Back Matter (Step 6)                    front matter + TOC generated in
                 │                               the same pass
   Review & approve each page                                │
                 │                               Illustrations STAMPED onto the
   Print-Prep: 300 DPI compose per page          finished PDF, anchored to stable
                 │                               block ids
                 └─────────────────────┬─────────────────────┘
                                       │
                         Cover (full wrap: back | spine | front)
                         Print-Prep composes cover art at 300 DPI
                                       │
                         Prebuild Audit → Final Assembly (local)
                                       │
                         Delivery Validation
                                       │
                        interior.pdf  +  cover.pdf  → KDP
```

### Which stages are shared, and which are track-specific

| Stage | Track A (AI page) | Track B (typeset) |
|---|---|---|
| Project / Manuscript / Book Setup / Breakdown | shared | shared |
| Paginate | plans pages for image generation | **produces the finished interior** |
| Front & Back Matter (Step 6) | required | **not used** — built inside the typeset pass |
| Render & Review (Step 7) | per-page image render + approval | **only the cover applies** |
| Cover | shared | shared |
| Print-Prep / DPI | per page + cover | cover only |
| Assembly | merges approved page PDFs | stores the finished typeset PDF unchanged |
| Delivery validation | shared | shared |

### How Track B reaches the end of the factory

`assembleBook()` branches on the track, which comes from the production
profile's `bodyRenderTrack` — never guessed from what data happens to exist, so
a half-populated project cannot silently change tracks.

- **Track A** merges the approved per-page print PDFs in spine order.
- **Track B** stores the finished typeset PDF **unchanged**. Rasterising it back
  into page images to satisfy the page-render assembler would destroy the vector
  text, the embedded fonts and the stamped illustrations, which are the entire
  point of the track. Its gate is the typesetter's own report — vertical
  overflow, unplaced artwork — plus the shared cover-sync gate.

One builder produces the typeset interior for everyone:
`pipeline/typeset/build-typeset-interior.ts`. The preview, the cover's page
count, assembly and the delivery check all call it, so a preview and an export
cannot disagree about the book. It reads the chapter-start policy from the
project (`typesetChaptersStartRecto`) rather than a request parameter, because
that policy changes the page count and the page count sizes the spine.

`renderCoverPdf()` is track-aware through `resolveCoverPageCount()`; it used to
read the legacy pagination table unconditionally and threw `no_pages` for every
typeset book.

### Before you build a new subsystem, read this map

This platform has already shipped a printed book. If you are about to write a
cover renderer, a spine calculator, a delivery validator or an assembler, it
exists — trace the map below to the code that does it and change that instead.
Two answers to "how wide is the spine" sitting in one repository is how a wrong
one gets printed.

That has gone wrong twice, in both directions: a parallel cover system was built
for capability that had already shipped, and real capability sat unreachable
inside scripts (`validate-delivery.ts` with one book's paths compiled into it,
`font-embed-probe.ts`'s font walk) where nothing on the delivery path could call
it. A script is where a capability goes to be forgotten. If an operator needs
it, it belongs in a module with an endpoint and a control.

### Where the production code actually lives

Names do not always say "cover" or "assembly". This map is the shortcut:

| What | Where |
|---|---|
| Cover renderer + AI wrap artwork | `pipeline/stage-6-layout/render-chapter.ts` (`renderCoverPdf`, `generateCoverWrapArtwork`) |
| Cover 300-DPI composition | `pipeline/print-prep/cover-print.ts` (`composeCoverPrint`) |
| Cover dimensions / spine width / all KDP figures | `pipeline/stage-6-layout/render-html.ts` (`computeCoverDimensions`) — **single source, with the Amazon citations** |
| Typeset interior | `pipeline/typeset/` (`render-typeset.ts`, `typeset-book.ts`, `front-matter.ts`) |
| Typeset interior, as one call | `pipeline/typeset/build-typeset-interior.ts` (`buildTypesetInterior`) — **what every consumer should use** |
| Illustration stamping | `pipeline/typeset/stamp-illustrations.ts` |
| Assembly (both tracks) | `pipeline/book-assembly/assemble-book.ts` (`assembleBook`) |
| Final assembly, Track A large books | `scripts/build-local2.ts` (**runs locally**, see below) |
| Delivery check of the finished PDFs | `pipeline/book-assembly/delivery-check.ts`, `pdf-inspect.ts` — exposed at `GET /api/projects/:id/delivery-check` and in the Build Book step |
| Readiness (Track A page state) | `scripts/prebuild-audit.ts` |

### Why final assembly runs locally

The deployed backend **OOMs and returns 502** on assembly: the merge loads every
print PDF into memory at once. The build therefore runs on the operator's
machine with an enlarged Node heap and writes straight to local disk, which is
also where KDP uploads from. This is a real operational constraint, not a
preference. See `PUBLISHING_TO_KDP.md`.

---

## The AI whole-page render model (Track A)

For Track A the generated image **IS the finished page** — illustration and all
of its text baked in by the image model (`gpt-image-2`), rendered as one
full-bleed image, with no separate typesetting pass and no boxed `<img>`.

**This describes Track A only.** Track B typesets real text with Paged.js and
keeps it vector; an earlier version of this README stated the platform had no
typesetting pass at all, which sent at least one contributor off building a
parallel system for capability that already existed.

- **Interior pages (Track A)** are rendered one finished image per page, then
  prepared for print at **300 DPI** (sharp Lanczos upscale onto the trim + bleed
  canvas, badge/folio stamp, lossless PNG → single-page PDF). Code:
  `pipeline/whole-page-render/` and `pipeline/print-prep/`.
- **The cover (both tracks)** is a full-wrap asset (back · spine · front), its
  spine sized from the interior page count, composed at **300 DPI** and embedded
  losslessly. Generated artwork does **not** need to originate at final print
  size; `composeCoverPrint` upscales it onto the 300 DPI canvas. Code:
  `pipeline/stage-6-layout/render-chapter.ts` + `pipeline/print-prep/cover-print.ts`.
- **Assembly** merges the approved per-page print PDFs into one interior PDF in
  spine order (lossless, `pdf-lib`). Code: `pipeline/book-assembly/`.

The legacy layered / Paged.js "text-safe zone + scrim" renderer (Stage 2–6, the
CLI `scripts/`, the `images` review table, Replicate Real-ESRGAN upscale) is
**retired from the production path**. The old "Publishing Platform" UI (`App.js`)
has been **deleted**; the **`?legacy=1`** URL param now opens a lean Advanced/dev
panel (`AdvancedPanel.js`) with only genuinely-needed tools (the no-spend Pipeline
Check). Do not use the legacy renderer for new books.

> Backend note: the unused "Publishing Intelligence" backend (intelligence routes,
> service, `knowledge.repo`, and the `experiments`/`decisions`/`sops`/
> `lessons_learned`/`print_reviews` tables) is dead weight pending a careful
> teardown — not yet removed.

## The Operator Console workflow

Top-to-bottom, one book at a time. A ✓ on a step means it's done. Previewing is
free; only **Render & Review** (step 7) spends (page renders + cover artwork).

1. **Project** — create a book (title, subtitle, author, trim) or open/delete one.
2. **Manuscript** — paste/drop the Markdown manuscript (keep Glossary, Index,
   Sources as top-level sections).
3. **Book Setup** — confirm title/subtitle/author/trim (form loads the saved
   config; visual style is fixed by the Wildlands Standard).
4. **Breakdown** — deterministic split into chapters + entries (no AI, no spend);
   shows the chapter list.
5. **Paginate** — flows text onto pages and shows a **fit blueprint** per page
   (red = text, blue/light-blue = illustration, orange = ornament; "% full" + a
   FITS/UNDERFILLED/OVERFLOW chip) so the operator confirms fit before any spend.
6. **Front & Back Matter** — builds title, copyright, contents (from real page
   numbers), glossary, index, sources, about-the-author.
7. **Render & Review** — the review hub. Free to preview; rendering spends.
   - **Cover** — generate the full-wrap artwork (paid); spine sized to the current
     page count. Shows the **print front cover (7×10)** and the **Kindle front
     cover (portrait 1600×2560)** side by side, with trim/safe + spine-fold QA overlays.
   - **Interior pages** — one finished, text-baked image per page: **Preview** (free;
     shows the exact text the AI will print), **Review prompt** (free pre-flight
     sanity check — run it *before* Render, see below), **Render** (paid; re-click
     to retry a FAILED page), **AI review text** (cheap automated text-fidelity
     check — see below, run it before Approve), **Approve for book** / **Reject**,
     **Upload image** (no-spend manual escape hatch — see below).
   - **Kindle eBook — preview & export** — reflowable EPUB from the real text
     (structure tree, actual reflowable text, per-entry hero-image slots [future],
     build report, export). No spend.
8. **Build Book** — merges the approved pages into the interior PDF and produces the
   print-ready cover PDF (300 DPI). Blocks if any page isn't book-ready **or** if the
   cover is out of sync with the interior (see below). On success: interior PDF +
   cover PDF + an in-page preview. Paperback = same interior + paperback wrap.

Operator SOP with screen-by-screen detail: `WILDLANDS_OPERATOR_MANUAL.md` (repo root).

## Prompt pre-flight review (before you spend anything)

**"Review prompt"** (every page card, works even before the page has ever been
rendered) checks the assembled spec BEFORE any paid image call — does the
illustration subject actually match the entry title, is the body text intact
(not truncated, duplicated, or placeholder), nothing internally contradictory.
It's a text-only chat completion (no image involved), so it costs a fraction
even of the post-render AI text review below. Code:
`services/openai/prompt-review.ts`,
`POST /api/whole-page-render/page/:pageId/review-prompt`.

**Result banners are advisory, not a gate — and dismissible.** Both this
check and the post-render "AI review text" say explicitly when they find
something that they do not block the next action (Render / Approve still
work regardless), and both have a ✕ to clear a result once you've read it and
decided. Nothing in this pipeline is designed to leave you at a dead end — if
a review flags something, look at the actual page yourself, use your
judgment, then dismiss and move on either way.

**Caught and fixed one real false-positive class:** the "internal
contradiction" check originally flagged ANY mention of a different
species/subject as a mismatch — but naming another animal for comparison
("unlike black bears, grizzlies have...") or rhetorical contrast is normal,
constant, and deliberate in this book's writing. `prompt-review.ts`'s system
prompt now explicitly carves that out; only flag when the entry's own topic
is genuinely absent or replaced, not merely referenced. Worth remembering if
tuning this prompt further: false positives here cost real operator trust —
a reviewer that cries wolf gets ignored, including on the pages where it's
actually right.

Like every other AI-calling action in this pipeline it is **strictly one
explicit call, triggered only by the operator clicking the button** — nothing
in this codebase auto-retries or auto-loops a paid or even a free OpenAI call
on its own; confirmed by reading `createAndRunRender` (one row per explicit
call) and the OpenAI client config (`maxRetries: 0` — even the SDK's own
transient-error retry is off). A failed render just sits at `FAILED` with its
error message until an operator explicitly acts on it again.

## AI text review (cheap QA assist, not a substitute for a real check)

`gpt-image-2` occasionally bakes a typo into a page's text (it's a much higher-
stakes failure mode than art quality, since a misspelled word in a printed book
is just wrong). Instead of an operator eyeballing every word of every page,
**"AI review text"** (per-page button in Render & Review, once a page is
RENDERED) calls a vision-capable chat model — `OPENAI_REVIEW_MODEL` in
`.env`, currently `gpt-5.5` — to compare the baked text against the literal
source and flag mismatches. One call costs a small fraction of an image
generation. Code: `services/openai/text-review.ts`,
`POST /api/whole-page-render/:renderId/ai-review`.

**Known limitation — read before trusting a "pass":** the reviewer reads the
page semantically, not pixel-by-pixel, so it can silently "autocorrect" a
subtle transposition in a common word — confirmed still true even on
`gpt-5.5`: it transcribed the known-bad `cinmanon` render as `cinnamon`
because that's what it expects a word spelled that closely to "cinnamon" to
be, even though the actual pixels are wrong. This is a structural limit of
using a language-vision model as an OCR proofreader (it reads intent, not
letter-shapes), not something a model-version upgrade fixes — a literal OCR
engine might catch this specific failure mode better, at the cost of
introducing its own noise on the stylized serif type this book uses. It
reliably catches grosser errors — garbled words, dropped/duplicated words,
wrong words entirely — but a `pass: true` is not a guarantee of zero typos.
Do not hard-gate Approve on it; treat it as a fast first pass, and still skim
the page yourself before Approve on anything going to final print.

Model history, for whoever tunes this next: `gpt-4o-mini` → too inaccurate
(missed a confirmed real typo, invented a false positive on a clean page).
`gpt-4o` → better, but produced a false positive on `prompt-review.ts`
specifically (see below). `gpt-5.5` → current, fixed that false-positive
class; the semantic-autocorrect limitation above is unrelated and still
open. Upgrading required two API-shape changes, not just a model-name swap:
`max_tokens` → `max_completion_tokens`, and `temperature` is no longer
settable (only the model's default is accepted) — expect similar shape
changes on the next upgrade too.

## Manual image upload (no-spend escape hatch)

**"Upload image"** (every page card in Render & Review) registers an
operator-supplied PNG as a real render version for that page — no OpenAI
image-generation spend. Everything downstream (AI review, Approve, print-prep,
select-for-book) works on it exactly like a normal render afterward. Use it
when:
- OpenAI billing/credits are exhausted and `Render` does nothing (check
  Railway logs or the render's `errorMessage` for `Billing hard limit has
  been reached` — that's the tell).
- You hand-corrected an image outside the pipeline (any image editor, or by
  asking Claude/an operator to use OpenAI's `images.edit` endpoint with a
  precise transparent-mask over just the bad word — far more reliable than a
  full-page regeneration, which tends to trade one typo for a different one
  elsewhere on the page. There's no dedicated script for this in the repo
  today; it was done ad hoc via `services/openai/openai.ts`'s pattern during
  development — worth formalizing into a script if it comes up often).
- Testing a prompt manually in a separate chat tool and want to bring the
  result into the real book — just confirm the wording is the actual page
  text first (a generic chat surface will often paraphrase instead of
  reproducing the literal source, which makes the result unusable even if it
  looks good).

Code: `POST /api/whole-page-render/:pageId/upload-manual` (base64 PNG in the
JSON body; `frontend`'s `uploadManualRender` reads the file via `FileReader`).

## Cover / interior synchronization (production gate)

The cover spine width is baked into the AI cover art for a specific interior page
count. When the cover artwork is generated, the platform records
`config.publishing.coverSync = { builtForPageCount, spineIn, generatedAt }`.

**Final (full-book) export compares the recorded cover page count to the live
interior page count and BLOCKS the export on a mismatch**, with:

> "Cover is out of date. The interior page count changed and the spine width may
> be incorrect. Regenerate the cover before exporting."

Regenerating the cover (step 7 · Render & Review) refreshes `coverSync` and clears the block. Chapter
proofs and pre-existing covers without a recorded count are exempt. Code:
`coverSyncStatus()` in `pipeline/book-assembly/assemble-book.ts`. No cover
versioning, no separate cover project.

## Project lifecycle

A project is a **temporary production workspace**. The intended lifecycle:

1. Create the book project.
2. Render and approve all pages.
3. Generate and approve the cover.
4. Export the KDP package (the cover sync gate must pass).
5. **Archive approved images to the permanent Image Library.**  *(planned — not
   yet implemented)*
6. Download the external backup.
7. **Delete the temporary project** (project data removed; library preserved).
   *(safe deletion — planned; see warning below)*
8. Start the next book.

> ⚠ **Image Library and safe deletion are not implemented yet.** Today,
> `DELETE /api/projects/:id` cascade-deletes the render records and leaves the
> image files orphaned in storage — **deleting a project loses its AI artwork.**
> This is safe for the disposable *test* projects, but **do not delete a real
> book project** until the Image Library + project-scoped storage cleanup ship.

## What's implemented (production path)

- Operator Console driving the whole-page AI pipeline end to end (the default and
  only operator path; legacy tools isolated behind a toggle).
- Manuscript upload → deterministic breakdown → pagination (body flow engine +
  unified reference model for glossary/index/sources) → front/back matter.
- Whole-page render via OpenAI **`gpt-image-2`** (text baked into the image;
  spend-gated; dependency-injected so tests never call the paid API), with
  preview / render / approve / reject / print-prep per page.
- No-spend prompt pre-flight review, cheap automated post-render AI
  text-fidelity review (`gpt-5.5` chat-vision call), and a no-spend manual
  image upload path for when generation is blocked or needs a hand
  correction — see "Prompt pre-flight review", "AI text review", and "Manual
  image upload" above. Confirmed zero auto-retry anywhere in the render
  pipeline (one explicit call per attempt, `maxRetries: 0` at the OpenAI
  client too).
- **300 DPI** interior print-prep (sharp Lanczos) and **300 DPI** full-wrap cover
  (direct lossless embed); KDP-shaped interior + cover PDFs.
- Cover/interior synchronization export gate.
- **Kindle EPUB export (Stage 8)** — text-first reflowable EPUB from the real
  manuscript text (selectable, no baked page images) + a portrait front cover
  (1600×2560, cropped from the wrap); previewed/exported in Render & Review;
  EPUBCheck-clean. Code: `pipeline/stage-8-epub/`.
- Cloudflare R2 storage adapter (zero-egress; dormant until R2 env vars are set —
  prod currently on Supabase). Code: `services/storage/`.
- Fastify backend; Supabase Postgres + Drizzle migrations (auto-applied on
  deploy); durable Supabase Storage.

## Not implemented yet

- **Permanent Image Library** (project-independent archive of approved AI masters).
- **Safe project deletion** (purge project storage files; preserve library).
- **Per-entry hero illustrations for Kindle** (one cinematic image per entry;
  needs the `entry_assets` foundation — spec'd, not built).
- BullMQ background workers (rendering runs synchronously per request).
- Single-user auth enforcement.

## Durable storage (production requirement)

Generated images and PDFs **must** use Supabase Storage. In production the backend
**fails loud** rather than falling back to ephemeral local disk (Railway wipes it
on redeploy). Confirm any deploy: `GET /health` → `storageDurable: true`.

## Tech stack

Node + TypeScript + Fastify · React (CRA/craco) · Zod · Supabase Postgres +
Drizzle · sharp + pdf-lib (print-prep & assembly) · OpenAI `gpt-image-2` ·
Anthropic Claude (operator chat / stage review only) · Puppeteer + Paged.js
(legacy renderer only) · Pino.

## Commands

```bash
yarn install
yarn workspace @wildlands/shared build
yarn workspace @wildlands/backend run typecheck
yarn workspace @wildlands/backend run test     # vitest
yarn workspace frontend build
```

## Run it yourself, no Claude required

Two processes, two terminals, from the repo root:

```bash
# Terminal 1 — backend (Fastify API on :8001, reads backend/../.env)
cd backend
yarn install        # first time only
yarn dev             # tsx watch src/index.ts

# Terminal 2 — frontend (Operator Console on :3000)
cd frontend
yarn install        # first time only
yarn dev             # craco start
```

Open `http://localhost:3000`, log in with the `CONSOLE_PASSWORD` value from
`.env`.

**Important:** the frontend defaults to the **deployed Railway backend**
(`DEFAULT_BACKEND_URL` in `ProductionConsole.js`), not your local one — so
running the frontend alone points at production data. To actually exercise a
local backend change before it's deployed, set the override when starting the
frontend:

```bash
REACT_APP_BACKEND_URL=http://localhost:8001 yarn dev
```

(PowerShell: `$env:REACT_APP_BACKEND_URL="http://localhost:8001"; yarn dev`)

### Key `.env` values (see `.env.example` for the full list)

| Variable | What it's for |
|---|---|
| `PROJECT_ID` | Which book the `backend/scripts/` operator scripts run against — scripts fail loudly if unset, never silently default. |
| `DATABASE_URL`, `SUPABASE_*` | Postgres + Supabase Storage. |
| `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL` | Page-image generation (`gpt-image-2`) — the expensive calls. |
| `OPENAI_REVIEW_MODEL` | The cheap text-QA reviewer (see "AI text review" above) — safe to swap for cost/accuracy tradeoffs. |
| `CONSOLE_PASSWORD` | Single shared password gating the whole API (no user accounts). Unset = open API, dev only. |
| `WHOLE_PAGE_RENDER_ENABLED` | Master flag for the whole-page pipeline; routes 503 when false. |

### Operator scripts (`backend/scripts/`)

One-off/reusable tools for direct DB + storage access, bypassing the UI —
useful when doing bulk QA or debugging a specific page. Run with
`node ../node_modules/tsx/dist/cli.mjs scripts/<name>.ts <args>` from
`backend/`. Worth knowing:

- `_review_chapter.ts CH02` — pulls every rendered page image + the DB's
  ground-truth text for a chapter into a scratch folder, for a manual
  typo sweep.
- `_qa_rerender.ts <pageKey>` — triggers one real render for a page (same
  paid call the UI's Render button makes) — always one at a time, this repo
  has already had one billing-limit incident from a batch job firing several
  generations concurrently.
- `_qa_listversions.ts <pageKey>` / `_qa_pull.ts` / `_qa_pullversion.ts` —
  inspect and download a page's render history.
- `_qa_billingcheck.ts` / `_qa_failcheck.ts CH02` — find FAILED renders and
  their error messages project-wide or per chapter (the July 2026 billing
  incident silently orphaned 15 pages this way — worth an occasional sweep).

## Deploy / Railway notes

- Two services: **frontend** (Nixpacks/`Dockerfile.frontend`, serves the static
  console) and **@wildlands/backend** (`Dockerfile.backend`, node:20 + chromium;
  runs `drizzle-kit migrate` on boot, so schema changes ship via a committed
  migration). ~5–6 min builds.
- **Watch-path quirk:** a service only auto-builds when a pushed commit touches its
  watched paths; an empty/unrelated commit shows up as `SKIPPED`. Force a build by
  editing a file under that service's tree. Verify a deploy by diffing the live
  bundle hash (`curl <frontend>/ | grep main.<hash>.js`).
- API POSTs need a JSON body — send `{}` for bodyless actions.
- `whole-page-render/:pageId` takes the page **UUID**, not the page key.
