# The Wildlands Publishing Platform

Turns a finished manuscript into a print-ready, fully illustrated KDP book through
a single guided **Operator Console** — no terminal required.

```text
Operator Console (9 steps):
  Project → Manuscript → Book Setup → Breakdown → Paginate →
  Front & Back Matter → Render Pages → Cover → Assemble & Export
```

- Live frontend (Operator Console): `https://frontend-production-f65d.up.railway.app`
- Live backend: `https://wildlandsbackend-production.up.railway.app`
- Health check: `GET /` and `GET /health` → `{ "storage": "supabase", "storageDurable": true, "db": "connected" }`

---

## The render model (the thing to understand)

This platform is **AI-first and whole-page**. The generated image **IS the finished
page** — illustration **and all of its text baked in by the image model** (`gpt-image-2`),
rendered as one full-bleed image. There is no separate typesetting pass and no
boxed `<img>`. Only the barcode (on the cover) is engine-stamped.

- **Interior pages** are rendered one finished image per page, then prepared for
  print at **300 DPI** (sharp Lanczos upscale onto the 7×10 + bleed canvas, badge/
  folio stamp, lossless PNG → single-page PDF). Code: `pipeline/whole-page-render/`
  and `pipeline/print-prep/`.
- **The cover** is a separate full-wrap asset (back · spine · front), its spine
  sized from the interior page count, composed at **300 DPI** and embedded
  losslessly. Code: `pipeline/stage-6-layout/render-chapter.ts` +
  `pipeline/print-prep/cover-print.ts`.
- **Assembly** merges the approved per-page print PDFs into one interior PDF in
  spine order (lossless, `pdf-lib`). Code: `pipeline/book-assembly/`.

The legacy layered / Paged.js "text-safe zone + scrim" renderer (Stage 2–6, the
CLI `scripts/`, the `images` review table, Replicate Real-ESRGAN upscale) is
**retired from the production path** and reachable only behind the console's
"Legacy tools" toggle. Do not use it for new books.

## The Operator Console workflow

Top-to-bottom, one book at a time. A ✓ on a step means it's done. Previewing is
free; only **Render** (step 7) and **Cover** (step 8) spend.

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
7. **Render Pages** — one finished, text-baked image per page (paid). Per page:
   **Preview** (free; shows the exact text the AI will print), **Render** (paid;
   re-click to retry a FAILED page), **Approve for book** / **Reject**.
8. **Cover** — generate the full-wrap cover artwork (paid); spine sized to the
   current page count.
9. **Assemble & Export** — merges the interior PDF and produces the print-ready
   cover PDF. Blocks if any page isn't book-ready **or** if the cover is out of
   sync with the interior (see below). On success: interior PDF + cover PDF + an
   in-page preview of the finished book.

Operator SOP with screen-by-screen detail: `WILDLANDS_OPERATOR_MANUAL.md` (repo root).

## Cover / interior synchronization (production gate)

The cover spine width is baked into the AI cover art for a specific interior page
count. When the cover artwork is generated, the platform records
`config.publishing.coverSync = { builtForPageCount, spineIn, generatedAt }`.

**Final (full-book) export compares the recorded cover page count to the live
interior page count and BLOCKS the export on a mismatch**, with:

> "Cover is out of date. The interior page count changed and the spine width may
> be incorrect. Regenerate the cover before exporting."

Regenerating the cover (step 8) refreshes `coverSync` and clears the block. Chapter
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
- **300 DPI** interior print-prep (sharp Lanczos) and **300 DPI** full-wrap cover
  (direct lossless embed); KDP-shaped interior + cover PDFs.
- Cover/interior synchronization export gate.
- Fastify backend; Supabase Postgres + Drizzle migrations (auto-applied on
  deploy); durable Supabase Storage.

## Not implemented yet

- **Permanent Image Library** (project-independent archive of approved AI masters).
- **Safe project deletion** (purge project storage files; preserve library).
- Kindle EPUB export.
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

Run locally: `yarn workspace @wildlands/backend dev` · `yarn workspace frontend dev`.

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
```
