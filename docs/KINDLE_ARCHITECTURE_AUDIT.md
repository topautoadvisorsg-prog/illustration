# Kindle Architecture Audit & Design Review

**Status:** Audit + design only — NO implementation. Deliverable for approval before
any hero-illustration build. Goal: make Kindle a **first-class edition** built from the
**same source data** as Hardcover/Paperback, not a bolt-on.

Verified against the codebase 2026-06-24.

---

## Audit 1 — Current Kindle Pipeline: who owns what

| Responsibility | Owner (file) | Notes |
|---|---|---|
| Manuscript ingest | `stage-1-ingestion/*` | parse + sanitize (strips `[ICON:…]`, emoji) |
| **Breakdown** (chapters + entries + metadata) | `stage-1.5-manifests/generate-manifests.ts` | writes `manifests` (BOOK / CHAPTER / PAGE) — the source of `entryTitle`, `imageSubject`, scientific name, region/hazard |
| **Pagination** (text → pages) | `stage-1.75-pagination/paginate.ts` (+ flow-engine, capacity, streams) | writes `pages` rows with `entryKey`, `readingFieldText`, `section`, `chapterNumber`, `plannedPageNumber` |
| **Front/Back matter** | `front-matter/plan-front-matter.ts` | creates title/copyright/contents/glossary/index/about pages; sets `pages.section` + `frontMatterType` |
| **Image rendering** (print) | `whole-page-render/render-whole-page.ts` | bakes text+art into one image per page → `whole_page_renders`. **Kindle does NOT use this.** |
| **Image prompt generation** | `whole-page-render/assemble-page-prompt.ts` | image prompts only. **Kindle generates no prompts** (it uses real text). |
| **Metadata strip** | `subject-badges/extract-badges.ts` (`stripReadingFieldMetadata`, `extractBinomial`) | strips the binomial/hazard header; pulls scientific name. Shared by print + Kindle. |
| **Markdown → blocks** | `whole-page-render/markdown-blocks.ts` (`markdownToBlocks`) | typed plain-text blocks. Shared by print + Kindle. |
| **EPUB model** (what becomes a chapter, page grouping, reading order) | `stage-8-epub/assemble-epub.ts` (`assembleEpubModel`) | **owns all Kindle structure decisions** |
| **EPUB build** (I/O, cover, packing) | `stage-8-epub/build-epub.ts` (`buildKindleEpub`, `assembleProjectModel`) | loads data, crops cover, packs `.epub` via `epub-gen-memory` |
| **EPUB API** (preview + export) | `api/epub.routes.ts` | `GET …/preview` (model, no packing) · `POST …/export/kindle-epub` (bytes) |
| **Operator UI** | `frontend/ProductionConsole.js` → Render & Review | preview tree + report + export |

**Kindle structure decisions all live in `assemble-epub.ts`:**
- *What becomes a chapter:* title page (synthesized), copyright, introduction (grouped), one chapter per body `chapterNumber`, glossary, about. Skips half-title/title-art/contents/index.
- *Page grouping:* body pages grouped into entries by `entryKey` within a chapter; their `readingFieldText` concatenated.
- *Reading order:* filters `pages` by `section` (FRONT/BODY/BACK), sorts body by `chapterNumber` then `plannedPageNumber`.

### Flow diagram

```
Manuscript
  │  (stage-1 ingest → stage-1.5 manifests)
  ▼
Breakdown ── manifests (BOOK/CHAPTER/PAGE): entryTitle, subject, sci-name, region…
  │  (stage-1.75 paginate)
  ▼
Pagination ── pages rows: entryKey, readingFieldText, section, chapter#, pageNum
  │
  ├───────────────► PRINT path: whole-page render → print-prep → book-assembly
  │                 (resolveSpine) → interior + cover PDF
  │
  └───────────────► KINDLE path (no rendering, no spend):
                    assemble-epub (group by entryKey, build chapters, OWN order)
                      → build-epub (cover crop + epub-gen pack)
                      → EPUB
                      → Preview (epub.routes GET /preview → Render & Review)
                      → Export (POST /export → .epub download)
```

**⚠ Finding (divergence risk):** print reading order = `book-assembly/spine-order.ts`
`resolveSpine()`; Kindle reading order = `assemble-epub.ts`'s own section/chapter/page
sort. **Two independent implementations of "book order."** They agree today, but a
future change to one won't propagate to the other. Should be one shared authority.

---

## Audit 2 — Entry Architecture

**What an entry is:** a single subject/topic — Black Bear, Moose, White Pine,
Chanterelle, Destroying Angel, Navigation, Hypothermia. One entry = one opener page +
its continuation pages.

**How entries are identified — `pages.entryKey` (text column):**
- The **opener** page has `entryKey === pageKey` and `pageRole = 'opener'`.
- **Continuations** share the opener's `entryKey` with suffixed page keys (e.g.
  `CH02_P005` opener, `CH02_P005_c1`, `_c2` continuations).
- So an entry = all `pages` rows with the same `entryKey`.

| Question | Answer |
|---|---|
| How identified | `pages.entryKey` |
| Where it begins | the opener page (`pageRole='opener'`, `entryKey===pageKey`) |
| Where it ends | last continuation sharing that `entryKey` before the next entry |
| Entry metadata | `manifests` (kind=PAGE) keyed by `entryKey`: `entryTitle`, `imageSubject`/`cleanSubject`, scientific name (via `extractBinomial` of the body), `region`, `hazard`, `sourceConfidence` |
| Multi-page → one entry | group `pages` by `entryKey`, concatenate `readingFieldText` (exactly what `assemble-epub` does) |

**Verdict — partially entry-centric.** The *data to group by entry exists*
(`entryKey` + manifests), and the Kindle exporter already uses it. **But there is NO
first-class `entries` table** — an entry is an *emergent grouping*, re-derived in code
each time (assemble-epub, render-whole-page, pagination all re-group independently).
There is no stable `entryId`, no single row that owns an entry's title/body/metadata,
and nothing an illustration could attach to. **This is the core gap for making every
edition work from entries.**

---

## Audit 3 — Kindle Illustration Architecture (design only)

**Correct model (agreed):** **one hero illustration per ENTRY**, not per print page.
Introduction → 1; Black Bear → 1; Moose → 1; White Pine → 1; Destroying Angel → 1; etc.

**Does it fit the current data model? — NO, not cleanly. New tables are required.**

Today, illustrations are **`whole_page_renders`** — versioned **per page**, with the
art *and text baked into one image*. That's wrong for reuse: it's page-tied, text-fused,
and print-specific. There is nowhere to store "the one clean hero image for Black Bear."

**Recommended (from `ENTRY_CENTRIC_ARCHITECTURE_SPEC.md`):** two additive tables.

```
entries                         -- first-class, derived from pages+manifests (read-only backfill)
  id            uuid pk
  project_id    uuid
  entry_key     text            -- = existing pages.entryKey (stable handle)
  chapter_number int
  title         text            -- manifest entryTitle
  subtitle      text null       -- generic (scientific name for a guide; cuisine for a cookbook)
  body_markdown text            -- canonical pre-pagination body
  entry_type    text            -- DATA-DRIVEN per book (SPECIES|PLANT|ZONE|TOPIC|…)
  attributes    jsonb           -- region/hazard/source (guide) — generic bag, no genre columns
  hero_asset_id uuid null  →  entry_assets.id

entry_assets                    -- reusable media tied to an ENTRY (not a page)
  id          uuid pk
  entry_id    uuid → entries.id
  kind        text              -- HERO_ILLUSTRATION (v1)
  image_path  text              -- CLEAN art, NO baked text (R2 key)
  alt_text    text              -- entry title (+ subtitle)
  prompt / prompt_sha256 / model -- generation audit
  status      text              -- QUEUED|RENDERED|APPROVED|REJECTED
  active      boolean           -- the ONE hero used by exports
```

- **Phase A** (entries table + read-only backfill from `pages`+`manifests`) is
  **freeze-safe, no spend** — pure synthesis of data that already exists.
- **Phase B** (entry_assets + hero generation) reuses the **artwork-only render seam**
  that already exists in `assemble-page-prompt.ts` (the `rendersCriticalText=false`
  branch: "render artwork… do not render readable text"). Render-once, operator-reviewed.
- Why text-free heroes: they're reusable across every format; baked page renders are not.

---

## Audit 4 — Illustration Ownership

| Decision | Owner / mechanism (recommended) |
|---|---|
| **Which entries get an illustration** | the operator, guided by `entry_type` (e.g. all species/plant/zone entries). Config-driven, not hardcoded. |
| **Where it appears** | declared on the asset/edition projection — Kindle: before the entry title (`heroPlacement`, already modeled). Print/web decide their own placement from the same asset. |
| **Where stored** | `entry_assets.image_path` in **Cloudflare R2** (the storage seam), keyed by **entry**, never by page. |
| **How approved** | render-once → operator reviews the actual image in **Render & Review** → Approve/Reject (one `active` hero per entry). |
| **How regenerated** | re-render the entry's hero (new `entry_assets` version); operator re-approves. |
| **How reused across editions** | every edition reads the entry's `active` hero asset — **no regeneration.** |

**Reuse target (the whole point):** one approved illustration of "Black Bear" feeds
**Hardcover · Paperback · Kindle · Website · Mobile App · Flashcards · translated
editions** — because it's tied to the *entry*, is *text-free*, and is *format-agnostic*.

**Current blocker:** illustrations are page-tied + text-baked (`whole_page_renders`), so
nothing is reusable today. The `entries`/`entry_assets` layer is the prerequisite.

---

## Audit 5 — Kindle Review Experience (think like a first-time operator)

| Surface | Where it lives now | Verdict |
|---|---|---|
| Kindle preview | **Render & Review (Step 7)** | ✓ correct — one review hub |
| Image review (future heroes) | will be Render & Review, beside page renders | ✓ correct (agreed; not a separate grid) |
| Export (.epub) | inside the Render & Review Kindle panel | ⚠ minor — the rule says *downloads → Build & Export*; export currently sits with the preview. Acceptable for v1; revisit when editions are unified. |
| Validation (EPUBCheck) | internal, at build | ✓ automatic |
| Kindle Previewer | external GUI, operator's manual step | ✓ documented in the operator manual; not a console step |
| "Where do I go now?" moments | resolved — legacy door hidden, Kindle in Render & Review, manual exists | mostly ✓ |

**Remaining "where do I go?" risk:** there is no single **"Editions"** view that shows
*Hardcover / Paperback / Kindle* as peers with their status. Kindle preview is in Step 7,
print build is in Step 8, paperback is a note. It works, but editions aren't presented as
equals — a future operator may not realize all three come from one source. **Not bolted-on
anymore, but not yet "first-class peers" in the UI.**

---

## Audit 6 — Future Book Test (Book #2, thousands of entries)

| Question | Finding |
|---|---|
| Does it work for Book #2? | **Yes** in the product — console + API routes are parameterized on `:projectId`; storage keys are `<projectId>/…`; data is project-scoped + isolated. Create a new project → fully independent. |
| Anything hardcoded? | The Kindle cover crop assumes a **left-to-right wrap** (front on the right) — reasonable default, not book-specific. Cover dims (1600×2560) are a Kindle standard, fine. |
| Anything tied to the current project? | **Local CLI scripts** (`build-epub-local`, etc.) read `PROJECT_ID` from `.env` (`_project.ts`) — env-bound, a "wrong book" footgun for CLI use (mitigated: scripts print the active id). The *product* is not env-bound. |
| Scale to hundreds of books? | Yes — per-project rows + storage prefixes. |
| Scale to thousands of entries? | Mostly — pagination/render are per-page; the Kindle `/preview` builds the **whole model in one JSON** (~475 KB for 127 entries). At thousands of entries this grows (a few MB) but is still fine; could paginate the preview later. |

**Technical debt to record now (before building on it):**
1. **Entries are emergent, not first-class.** Re-grouped independently in ≥3 places
   (assemble-epub, render-whole-page, pagination). No stable `entryId`. → an `entries`
   table is the foundation.
2. **Illustrations are page-tied + text-baked** (`whole_page_renders`) → not reusable
   across editions. → `entry_assets`.
3. **Two reading-order implementations** (print `resolveSpine` vs Kindle's own sort) →
   should be one shared authority both editions call.
4. **Editions not first-class in the UI** (no unified Editions view).
5. **CLI `PROJECT_ID` is env-bound** (product is fine; tooling footgun).
6. Cosmetic: dead enum consts + possibly-orphaned `use-toast`/`lib/utils` after the
   App.js deletion (zero runtime impact).

---

## Summary

**What exists & works well**
- Clean project-scoped data isolation (storage + DB + parameterized routes).
- A real reflowable Kindle pipeline from actual text (no PDF-to-EPUB), EPUBCheck-clean.
- `entryKey` + manifests already capture entry grouping + per-entry metadata.
- The artwork-only render seam needed for text-free heroes already exists.
- Kindle now lives in the review hub (not bolted-on); operator manual covers solo use.

**What doesn't (the gaps for entry-centric editions)**
- No first-class `entries` table — entries are re-derived ad hoc.
- Illustrations are page-tied + text-baked — not reusable across editions.
- Two divergent reading-order implementations.
- Editions aren't presented as first-class peers in the UI.

**What needs to change (recommended architecture, in order)**
1. **Entry as a first-class record** (`entries`, derived/backfilled read-only from
   pages+manifests). Freeze-safe, no spend. *This is the foundation — do it first.*
2. **`entry_assets`** — one reusable, text-free hero per entry, stored in R2, keyed by
   entry. The reuse layer for every edition.
3. **Hero generation** via the existing artwork-only seam; render-once; reviewed in
   Render & Review. (Spend + post-proof.)
4. **Editions as projections of entries** — Hardcover/Paperback/Kindle (and future
   web/app/flashcards/translations) all read the entry + its `active` hero. One shared
   reading-order authority.
5. **Unify the Editions UI** (optional polish) — present the three editions as peers.

**Bottom line:** the spine is sound and Kindle is no longer a bolt-on, but the platform
is *grouping-centric*, not yet *entry-centric*. The one architectural move that makes
hero illustrations (and every future edition) correct instead of another bolt-on is
**promoting the entry to a first-class record with reusable, entry-tied assets.** Build
that foundation (Phase A first, freeze-safe) before generating any illustrations.
