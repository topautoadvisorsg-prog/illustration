# Wildlands — Session Handoff (2026-06-27)

You are taking over the Wildlands publishing platform. Read this fully before acting.
The operator is the agency CTO ("Claudio" persona). Be direct, do EXACTLY what's asked,
don't over-explain, and when asked to SHOW something, show it in the real app/browser —
not as chat images.

## Access / environment
- **Local repo:** `C:/Users/jovan/Downloads/wildlands agents platform` (Yarn workspaces: backend = Fastify/TS + Drizzle, frontend = React/craco, shared = Zod).
- **GitHub:** `github.com/topautoadvisorsg-prog/illustration`. Working branch **`session/qa-rebalance-2026-06-19`**; **`main` auto-deploys to Railway** (~5–7 min; runs `drizzle-kit migrate && node dist/index.js`).
- **Frontend (console):** https://frontend-production-f65d.up.railway.app
- **Backend API:** https://wildlandsbackend-production.up.railway.app
- **Console password (CONSOLE_PASSWORD):** `hemlock-lichen-3372` — sent as `Authorization: Bearer <pw>` or `?k=<pw>` for image loads. NOTE: I am barred from submitting login passwords into forms; the operator must click "Enter" to log in. Plan for that.
- **Active project:** THE WILDLANDS, id **`66c1c69c-2c81-409e-a4b5-bff3f3bb04ba`**. Trim 7×10, ~275 interior pages.
- **Storage:** Cloudflare **R2** (prod cutover DONE 2026-06-27; Supabase is read-fallback only). DB stays on Supabase.
- **Local tooling (verified):** tsc `node ../node_modules/typescript/bin/tsc --noEmit`; tests `corepack yarn vitest run`; frontend build `CI=false node_modules/.bin/craco build`; tsx scripts `node ../node_modules/tsx/dist/cli.mjs scripts/<x>.ts`; EPUBCheck `"C:/Program Files/Eclipse Adoptium/jre-21.0.11.10-hotspot/bin/java.exe" -jar "C:/Users/jovan/epubcheck/epubcheck-5.3.0/epubcheck.jar" <file>.epub`.
- **Pre-existing test failures (~32, NOT from recent work):** pagination/layout/blueprint/server/routes + a flaky sharp `cover-print` test. Don't chase these; verify your change adds 0 NEW failures (stash-compare).

## State by track
**1. Kindle EPUB — DONE + LIVE.**
- 130 hero illustrations rendered (127 entries + 3 section + FM_001 reused as frontispiece) and embedded; alt-text on all; EPUBCheck 0/0/0/0; ~29 MB. KDP-ready file: `C:/Users/jovan/Downloads/THE_WILDLANDS_KINDLE.epub`.
- Console preview (Step 7) shows heroes full-width; the preview-only "appears before the title" caption was removed.
- Render tooling: `scripts/render-all.sh` (bash orchestrator, survives node crashes) → `render-one.ts` per image with `timeout` hard kill; `heroes-data.ts` holds all prompts; **zero inline retries, render-once, skip-if-exists**. Heroes in `Downloads/heroes/` + storage `heroes/kindle/`. Mapping in `heroes/mapping.json`.

**2. Edition architecture (One Book → Many Editions) — foundation DONE, byte-identical Color.**
- **Gap C** (633e4d2): colour is owned by the Style DNA; shared prompts are style-neutral.
- **Style DNA registry** (35772d5): `publishing-standard/style-dna.ts` — `assembleIllustrationDna(styleDnaId?)`, default `cinematic-naturalist-color` (byte-identical). `bw-naturalist` is REGISTERED BUT INERT (data only).
- **Edition entity** (fb4b133): `editions` table (**migration 0009, DEPLOYED**); `editions.repo.ts` (+ idempotent `ensureDefaultColorEdition`); pure `pipeline/editions/resolve-edition-style.ts`; `build-page-spec` takes optional `styleDnaId`. An edition OWNS: Style DNA, palette/ink/paper, paper type, cover, format. **Operator selects Color/Monochrome; the platform owns every rule — never expose internal edition decisions to the operator.**

**3. Paperback cover preview — JUST BUILT + DEPLOYED (3bb9d11).**
- Step 7 cover area now has a 4th panel **"Paperback wrap — fit check (PAPERBACK)"**: the paperback wrap (7×10, Premium Color spine ~0.648" from live page count) with dotted KDP guides (magenta=bleed, teal=trim, green=safe, orange=spine, red=barcode). Route: `GET /api/projects/:id/cover/paperback-preview`. Module: `pipeline/print-prep/paperback-preview.ts`.
- Distinct from the hardcover wrap (larger, case turn-in). Fit issue visible: the **barcode zone overlaps the fox** on the back cover — back-cover composition should be nudged.

## Open items / decisions awaiting the operator
- **"About the Series" is now a PLATFORM DEFAULT** (`plan-front-matter.ts` `standardSeriesDescription`) — every Wildlands book auto-gets the standard blurb + "Continue the Journey" review CTA as its **own interior back-matter page** (`pushBack` TEXT_PAGE — NEVER a cover; structurally impossible to land on front/back cover). The review line's region fills from the book's **subtitle** (`{region}'s wild places`). A book can still override via `series.description`. **Series Two inherits it with zero config** — the Series Two agent just needs to VERIFY it renders + reads right once the manuscript/subtitle is set (nothing to build; it's not missing).
- **B&W ("Monochrome") wiring** — plan delivered & approved-in-principle, NOT built. Order: (1) rename `bw-naturalist`→`monochrome`; (2) route the selected edition's palette/ink/paper to consumers still on global `PALETTE` (typography ink, print-prep folios/cartouches, badges, front-matter compose, whole-page header, typography-dna identity); (3) add `editionId` to `whole_page_renders` (migration 0010) + a heroes edition dimension so Monochrome renders store separately from Color; (4) thread styleDnaId through the render TRIGGER + cover-wrap path (`render-chapter.ts:647`); (5) THEN render Monochrome (IMAGE SPEND — get explicit go). Plan doc: `docs/EDITION_ARCHITECTURE_AUDIT.md`.
- **Default Color edition ROW** not yet inserted (table exists; boot doesn't run the backfill). resolveEditionStyle defaults to Color, so nothing breaks; create the row when the edition selector ships (or wire `ensureDefaultColorEdition` into boot).
- **Paperback build** (vs just the preview): decide reuse the wrap art at paperback dims vs a new front-cover render; fix barcode-over-fox. Plan: `docs/PAPERBACK_COVER_PLAN.md`.
- **3 overview hero duplicates** (#36 forager's-code, #54 toxic-plants, #75 mycologist-protocol) corrected in `heroes-data.ts` but NOT re-rendered (~$0.60 if wanted; originals in `heroes/superseded/`).
- B&W is a separate KDP listing but the SAME platform project (one manuscript, swap Style DNA).

## Operator working-style (read this)
- **Do exactly the scope; never expand or over-explain.** Short, direct, done.
- **"Show me" = in the real app/browser, not chat images.** Drive the console live.
- **Cost-aware:** confirm before any image spend; render-once; no silent re-rendering; report failures at the end.
- **Don't touch the print pipeline / approved renders** without flagging (it's frozen until printed proof).
- **Editions:** platform owns all rules; operator just picks the edition. Don't ask "what goes grayscale?"-type internal questions.
- Memory lives in the Claude memory dir (`wildlands_*` files) — read them for deeper history.
