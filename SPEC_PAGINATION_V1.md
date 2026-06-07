# SPEC — Pagination v1 + Text-In-Reading-Field Preview

**Author:** Claudio (CTO)
**Date:** 2026-06-07
**Status:** Draft for approval. Adds a new Pagination stage to the pipeline and
the operator-facing Reading-Field text preview. Additive to `SPEC.md` (v2.1).

---

## 1. Why this exists

Today's pipeline has no pagination. Breakdown decides that one manuscript `##`
heading = one logical page and every later stage decorates that lie. A
1,500-word entry and a 60-word entry are both "one page," and the operator only
discovers the mismatch at Text-Fit (after Page Plan has already assigned a
layout) or at Render (after the printed page has already been laid out).

The platform is also blind to the most important operator question:

> **"Does this exact text fit inside this exact Reading Field, on this exact
> page, before I spend image credits?"**

Right now the operator can see word counts, capacity warnings, and a zone
schematic — but never the real manuscript text rendered inside the real Reading
Field with the real typography. So image spend is always a guess.

Pagination v1 closes both gaps in one stage.

---

## 2. Core principle

> Pagination is not just splitting text. It is allocating manuscript content to
> real printed pages, then proving — visually, on the operator's screen — that
> each allocation fits.

Two outputs, both mandatory:

1. A **printed-page plan**: a list of real pages, each one knowing which entry
   (or which slice of an entry) it carries, what layout it uses, and what role
   it plays (opener / continuation / compacted multi-entry).
2. A **Text-In-Reading-Field Preview** for every printed page that shows the
   actual title, the actual manuscript text, in the actual Reading Field, using
   the actual typography — on parchment, with no image required.

Image generation is gated on the operator approving the preview, per page.

---

## 3. New pipeline shape

```
Stage 1     Manuscript Upload
Stage 1.5   Breakdown                 (unchanged — content units only)
Stage 1.75  PAGINATION                (NEW)
            ├─ Splitter               long entries → opener + continuations
            ├─ Compactor              very short entries → multi-entry page
            ├─ Orphan guard           rebalance to avoid tiny tail pages
            ├─ Reading-Field allocate per-page text slice + layout zone
            └─ Persist printed pages
Stage 1.8   TEXT-IN-READING-FIELD PREVIEW   (NEW)
            ├─ Render real text in real zone
            ├─ Per-page approval     operator signs each page
            └─ Image-spend gate      no Stage 3 until approved
Stage 2     Page Plan                 (simplified — pagination already fit it)
Stage 3     Image Generation          (gated by Stage 1.8 approval)
Stage 4     Image Review
Stage 5     Upscale
Stage 6     Final Render
Stage 7     Stitch + Export
```

`Stage 1.5` and `Stage 2` retain their names because they exist; Pagination is
inserted as `Stage 1.75` so the numbering keeps its meaning. `Stage 1.8`
(Preview) is technically a sub-stage of pagination but is operator-facing
enough to warrant its own slot in the UI.

---

## 4. Data model changes

### 4.1 `pages` table — additive columns

```sql
ALTER TABLE pages
  ADD COLUMN entry_key            text,              -- original opener key (e.g. CH01_P010)
  ADD COLUMN part_n               int DEFAULT 1,     -- 1-based index within the entry's parts
  ADD COLUMN total_parts          int DEFAULT 1,     -- N (so part_n = 3 of 4)
  ADD COLUMN page_role            text DEFAULT 'opener',   -- 'opener' | 'continuation' | 'compacted'
  ADD COLUMN carries_subject      boolean DEFAULT true,    -- only opener carries the image subject
  ADD COLUMN compacted_entry_keys jsonb,             -- ['CH07_P002','CH07_P003'] for compacted pages
  ADD COLUMN reading_field_text   text,              -- the exact markdown slice to render here
  ADD COLUMN reading_field_chars  int,               -- post-strip char count for the slice
  ADD COLUMN reading_field_words  int,               -- post-strip word count for the slice
  ADD COLUMN fit_status           text DEFAULT 'PENDING',  -- PENDING | FITS | TIGHT | OVERFLOW | UNDERFILL
  ADD COLUMN preview_approved     boolean DEFAULT false,
  ADD COLUMN preview_approved_at  timestamptz,
  ADD COLUMN preview_approved_by  text;              -- operator id or 'system' for batch approve
```

Existing rows backfill: `entry_key = page_key`, `part_n = 1`, `total_parts = 1`,
`page_role = 'opener'`, `carries_subject = true`, `reading_field_text =`
the body markdown from the PAGE manifest. Backfill runs once at migration time
inside the same transaction as the column adds, so the table is never in a
half-migrated state.

### 4.2 New page-key convention

- Openers: `CH01_P010` (unchanged).
- Continuations: `CH01_P010_c1`, `CH01_P010_c2`, ... — suffix `_cN` where N is
  the 1-based continuation index. The opener has no suffix.
- Compacted pages: the first entry's key, with suffix `_m` — e.g.
  `CH07_P002_m`. The full list lives in `compacted_entry_keys`.

This convention keeps page-key sorting natural (`_c1` sorts after the opener,
before the next entry) and makes the role visible at a glance.

### 4.3 `manifests` table

Unchanged. Pagination does NOT write new manifests. The PAGE manifests Breakdown
created stay locked. Each split / continuation / compacted page in `pages`
references its source manifest(s) by `entry_key` / `compacted_entry_keys`, not
by foreign key — the manifest stays the authoritative entry record, and the
pages table is the printed-page projection of it.

### 4.4 New table: `page_approvals` (audit log)

```sql
CREATE TABLE page_approvals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  decision    text NOT NULL CHECK (decision IN ('APPROVED','REJECTED','RESET')),
  reason      text,
  decided_by  text NOT NULL,
  decided_at  timestamptz NOT NULL DEFAULT now()
);
```

Every approve / reject / reset of a preview is logged. Restores the "who said
yes to spending money on this page" audit trail.

---

## 5. Entry-to-page mapping algorithm

Single entry point: `paginateProject({ projectId, config })` in
`backend/src/pipeline/stage-1.75-pagination/paginate.ts`. Pseudocode:

```
loadedEntries = list PAGE manifests for project, in order
capacityTable = build per-layout capacity from layout library + DEFAULT_LAYOUT_CAPACITY
geometry      = computePageGeometry(config.trimSize)
result        = []

for each entry in loadedEntries:
    candidateLayout = preChooseLayout(entry, capacityTable)
    perPageTarget   = capacityTable[candidateLayout].targetWords

    parts = splitter(entry.bodyMarkdown, perPageTarget, capacityTable[candidateLayout].maxWords)
    parts = orphanGuard(parts, perPageTarget)

    for (part, i) of parts:
        push {
            entry_key: entry.pageKey,
            part_n: i + 1,
            total_parts: parts.length,
            page_role: i === 0 ? 'opener' : 'continuation',
            layout: i === 0 ? candidateLayout : continuationLayoutFor(candidateLayout),
            carries_subject: i === 0,
            reading_field_text: part,
        }

result = compactor(result, capacityTable)   # multi-entry compaction pass
result = assignPageNumbers(result)          # planned_page_number = 1..N
persist(result)
```

### 5.1 Splitter

- Splits on **paragraph boundaries first** (`\n\n` in markdown). Never splits
  inside a paragraph in v1.
- Target words per part = the chosen layout's `targetWords`.
- A part is allowed to exceed `targetWords` by up to 10% if it avoids creating
  a tiny tail (orphan guard handles this).
- A part may NOT exceed `maxWords` of the layout. If a single paragraph alone
  exceeds `maxWords`, v1 keeps it whole and flags `fit_status = OVERFLOW` on
  that part. v2 may sub-split on sentence boundaries; explicitly out of scope.
- Code fences (` ``` `), images, and `<!-- … -->` blocks are atomic units; the
  splitter treats them as single paragraphs and never breaks them.

### 5.2 Continuation rules

- Continuation page layout = `LAYOUT_2_TEXT_HEAVY` in v1 (clean reading layout
  with small corner art slot). A future `LAYOUT_17_CONTINUATION` can replace
  this; not blocking v1.
- Continuation pages have `carries_subject = false`. **The image agent is not
  invoked on continuation pages in v1.** The renderer fills the image area
  with a soft parchment wash (or the opener's image, downscaled, behind the
  text) — operator-tunable, not blocking.
- Each continuation page gets a small `"(continued)"` line under the title
  band, rendered by the typography engine.

### 5.3 Orphan guard

Prevents two failure modes:

1. **Tail orphan:** the last continuation has < 30% of `targetWords`. Fix:
   pull paragraphs back one part at a time until the tail clears 30% OR the
   previous part exceeds `maxWords`. If neither is achievable, accept the
   orphan and emit warning `orphan_tail_accepted`.
2. **Single-paragraph orphan:** the last part is one paragraph and that
   paragraph alone is < 60 words. Same fix as above.

The orphan guard runs after the splitter and BEFORE the compactor. It only
modifies parts within one entry.

### 5.4 Short-entry compaction

Two short adjacent entries can share one printed page when:

- Both are `< 0.5 × targetWords` of the candidate layout.
- They share a parent chapter.
- Both are content types where compaction reads naturally:
  `REFERENCE_PAGE`, `FIELD_NOTES_PAGE`, `BACK_MATTER`. Compaction is
  explicitly NOT allowed for `WARNING_PAGE`, `CHAPTER_OPENER`, or any
  content type with a danger override.
- The combined char count fits the layout's capacity.

Compacted page page_role = `'compacted'`. `entry_key` = first entry's key.
`compacted_entry_keys` = ordered array of all entries on the page. Only ONE
image (the first entry's) is used; the rest render their text under it.

Compaction is conservative in v1 — at most TWO entries per compacted page —
and is operator-tunable via `config.layoutPolicy.compactionEnabled` (default
`true`).

### 5.5 Reading-Field allocation

For each printed page, given the chosen layout + page geometry:

1. Run `directLayout({ bodyMarkdown: part.reading_field_text, layoutTemplate,
   geometry, bodyPt, lineHeight })` — the existing Stage 6 layout director.
   Returns `textSafeZones[]` (the Reading Field rectangles in page-percent
   coordinates), `typographyZones[]` (title band), `imagePriorityZones[]`.
2. Compute char capacity per Reading Field:
   `charsPerLine = floor(readingFieldWidthIn × charsPerInch(bodyFont, bodyPt))`
   `usableLines  = floor(readingFieldHeightIn / (bodyPt × lineHeight / 72))`
   `capacityChars = sum across all reading_field zones`
3. Compare to `reading_field_chars` (post-strip char count of the assigned
   text). Set `fit_status`:
   - `FITS`     — `chars ≤ 0.85 × capacity`
   - `TIGHT`    — `0.85 × capacity < chars ≤ capacity`
   - `OVERFLOW` — `chars > capacity`
   - `UNDERFILL` — `chars < 0.30 × capacity` (visual whitespace problem)

The fit_status is what Stage 1.8 surfaces to the operator. `OVERFLOW` and
`UNDERFILL` block preview approval until the operator either accepts the
warning explicitly or re-paginates.

---

## 6. Stage 1.8 — Text-In-Reading-Field Preview

### 6.1 Renderer

A new HTML template at
`backend/src/pipeline/stage-1.8-preview/preview-page.html.ts`. Single page,
no images. Inputs:

- The page's `reading_field_text` (markdown)
- The page's `layoutTemplate` → zone geometry
- The project's typography (`bodyFont`, `bodyPt`, `lineHeight`, `headingFont`,
  `titleSize`)
- The project's trim size + bleed
- A parchment background color (from `config.colorPalette.paper`)

Output: a single-page PDF (via the same Paged.js + Chromium that Stage 6
uses, so the preview's text geometry exactly matches the final render's text
geometry).

The preview shows:

- Title band: the entry title in the configured heading font.
- Reading Field zones: filled with the assigned markdown text in the
  configured body font, at the configured pt and line height, with paragraph
  spacing matching the final render.
- Image zone(s): a soft parchment wash labeled with the image subject string
  in small gray italics — *"Image: <imageSubject>"* — so the operator knows
  what will fill that zone later, without rendering art.
- Page chrome: planned page number, `(continued)` flag if continuation,
  small chapter / entry tag in the gutter.

The preview is generated on demand (`GET /api/pages/:pageId/preview`) and
cached on disk by `(pageId, sha256(reading_field_text + layoutTemplate +
typography))` so re-opening the page is instant.

### 6.2 Operator UI — Page Production tab

A new tab in the Page Inspector, between **Layout** and **Image Generation**:

```
Manuscript | Layout | PAGE PRODUCTION | Image Generation | Image Result | Final Page
```

The PAGE PRODUCTION tab shows, for the selected page:

- **Source Entry** — entry title, chapter, original `entry_key`.
- **Print Page** — planned page number (e.g. *"page 23 of 145"*), role
  badge (opener / continuation / compacted), part `2 of 4` if continuation.
- **Layout** — template name, capacity (chars target / max), typography
  used.
- **Reading Field Preview** — the live PDF preview inline (PDF.js viewer
  in iframe). Operator sees the actual text flowing inside the actual zone.
- **Fit Status** — large colored badge: FITS / TIGHT / OVERFLOW / UNDERFILL,
  with the actual chars / capacity numbers next to it.
- **Continuation chain** — for continuation pages, a small chip row showing
  all sibling parts with active highlight: `[CH01_P010] [c1] [c2] [c3]`.
- **Actions:**
  - **Approve Page** (green) — sets `preview_approved = true`, logs to
    `page_approvals`, advances workflow. Disabled until fit_status is FITS,
    TIGHT, or operator explicitly opts to accept OVERFLOW/UNDERFILL.
  - **Re-paginate from here** (secondary) — re-runs the splitter on this
    entry only, with operator-supplied override (force-split point,
    force-merge into next entry, force layout). Invalidates all sibling
    parts' approvals.
  - **Accept warning** (small, only when OVERFLOW/UNDERFILL) — records
    `reason` in `page_approvals` and enables Approve.

### 6.3 Bulk approval — Chapter Production tab

On Control Center, a **Chapter Production** panel shows a grid of all pages
in the chapter with fit_status colors and approval state. Operator can:

- Click any page to jump to its Page Production preview.
- **Approve all FITS** in one click (logs each page individually).
- **Re-paginate chapter** — re-runs Stage 1.75 for this chapter only.

### 6.4 Image-generation gate

`generatePageImage(pageId)` adds a precondition:

```ts
if (!page.preview_approved) {
  throw new GenerationBlockedError(
    'preview_not_approved',
    `Page ${page.pageKey} does not have an approved Reading-Field preview. ` +
    `Approve the preview in Page Production before spending image credits.`
  );
}
```

The existing chapter-layout-approval gate stays as a coarser pre-gate. Preview
approval is the new fine-grained per-page gate.

Continuation pages where `carries_subject = false` are NOT image-generation
targets; their gate is effectively `n/a` and the UI hides the Image Generation
tab for them.

---

## 7. API additions

```
POST   /api/projects/:id/paginate
       body: { mode?: 'replace' | 'append-to-pending' }
       returns: { totalPages, totalEntries, splits, continuations, compactions, warnings }

GET    /api/pages/:pageId/preview                  → PDF bytes (cached)
POST   /api/pages/:pageId/preview/approve          → 200 { approved: true }
POST   /api/pages/:pageId/preview/reject           body: { reason } → 200 { rejected: true }
POST   /api/pages/:pageId/repaginate
       body: { forceSplitAfterChar?, forceLayout?, mergeWithNext? }
       returns: { affectedPageIds, newPlan }

GET    /api/projects/:id/pagination-report
       returns: per-chapter summary + warnings + orphan list + fit distribution
```

Stage 2 (Page Plan) `/api/projects/:id/plan` route is preserved but simplified:
it now reads the already-paginated `pages` rows and only picks the layout +
assembles the prompt. The overflow autoroute logic is removed (pagination
already enforced fit).

---

## 8. Backend file additions

```
backend/src/pipeline/stage-1.75-pagination/
  README.md
  paginate.ts                 // orchestrator
  splitter.ts                 // paragraph-aware split
  orphan-guard.ts             // tail + single-paragraph rebalance
  compactor.ts                // multi-entry compaction
  capacity.ts                 // char-level capacity math
  reading-field-allocate.ts   // wraps stage-6 directLayout + fit_status
  __tests__/
    splitter.test.ts
    orphan-guard.test.ts
    compactor.test.ts
    paginate.integration.test.ts

backend/src/pipeline/stage-1.8-preview/
  README.md
  preview-page.html.ts        // builds the preview HTML string
  render-preview.ts           // Paged.js + Chromium → PDF
  preview-cache.ts            // (pageId, contentHash) → file path
  __tests__/
    preview-page.test.ts

backend/src/api/pagination.routes.ts   // the 6 endpoints above
backend/src/db/migrations/0003_pagination.sql   // the column adds + page_approvals
backend/src/db/repositories/pages.repo.ts       // extended with the new columns
```

Stage 2 `plan-pages.ts` is amended (not rewritten): remove
`escalateForOverflow`, remove the splitter scaffolding comments, read
`reading_field_text` instead of the full body when building the prompt.

---

## 9. Migration strategy

### 9.1 Database

`backend/src/db/migrations/0003_pagination.sql`:

- Adds the 11 new columns to `pages` (all nullable or with safe defaults).
- Creates `page_approvals`.
- Backfills the new columns on existing rows in the same transaction.

The migration is **forward-compatible**: an old backend reading new rows will
ignore the new columns and behave as it did before. A new backend reading old
rows uses the backfilled defaults. Either order of (deploy DB, deploy backend)
is safe.

### 9.2 Existing projects

For projects already past Breakdown when this ships:

- The migration's backfill creates valid `opener` rows with `total_parts = 1`.
  These existing projects are silently "paginated as a no-op."
- Operators can opt into the new flow by clicking
  **Re-paginate Project** in the Pagination panel. This calls
  `POST /paginate { mode: 'replace' }`, which:
  - Detects approved or PRINT_READY pages and refuses unless the operator
    confirms a `mode: 'replace-including-approved'` override (mirrors the
    existing Stage 2 re-plan guard).
  - Clears `preview_approved` flags (so images can't be generated without
    re-approval).
  - Preserves existing generated images by `entry_key`: the new opener for an
    entry inherits the old page's images. Continuations start image-free.

### 9.3 Frontend

The Page Production tab is added behind the same `cc-control cc-intel` tag as
the other Inspector tabs. The Chapter Production panel is `cc-control
cc-export` so it appears on both Control Center and Export views.

No existing tab is removed. No existing screen is destroyed.

---

## 10. Test plan

### 10.1 Unit tests

`splitter.test.ts`:
- 200-word entry → 1 part.
- 1,500-word entry, target 340 → 4-5 parts, none > maxWords, all on
  paragraph boundaries.
- Entry with one 2,000-word paragraph → 1 part, `fit_status = OVERFLOW`,
  warning logged.
- Entry containing a code fence → fence stays intact.
- Empty body → throws `EMPTY_ENTRY_BODY`.

`orphan-guard.test.ts`:
- 4 parts, last part < 30% of target → pulls back, returns 4 parts with
  evened distribution OR 3 parts with last close to maxWords.
- 2 parts, last part 1 paragraph 40 words → merges into 1 part if total fits,
  else accepts orphan and warns.

`compactor.test.ts`:
- Two adjacent FIELD_NOTES_PAGE entries, both ~100 words, same chapter →
  merged into one compacted page, `page_role = 'compacted'`,
  `compacted_entry_keys` has both keys.
- One WARNING_PAGE entry + one short field-notes entry → not compacted.
- Compaction disabled in config → no merges.

`capacity.test.ts`:
- Known geometry (7×10 trim, 0.75" margins, EB Garamond 11pt, 1.35 lh) →
  capacityChars matches a precomputed expected value within ±2%.
- `fit_status` thresholds: chars at 0.84×capacity → FITS; at 0.95×capacity →
  TIGHT; at 1.10×capacity → OVERFLOW; at 0.20×capacity → UNDERFILL.

`paginate.integration.test.ts`:
- Run `paginateProject` on the real Wildlands manuscript fixture (129 entries).
- Asserts: every persisted page has `entry_key`, `part_n`, `total_parts`,
  `page_role`, `reading_field_text` non-null. Total page count is documented
  and stable. Orphan count is below an asserted threshold.

### 10.2 Preview tests

`preview-page.test.ts`:
- Synthetic page input → preview HTML contains the title in the heading
  font, the body text in the body font, the Reading Field labeled, no `<img>`
  tags (only parchment + text).
- Continuation page → `(continued)` chip present, opener's image subject
  string visible as small italic placeholder.

End-to-end (manual / scripted):
- Generate preview PDF for a known page on a non-prod project, open it, eyeball
  it. Assert: text fits the zone; no overflow off the page; title doesn't
  overlap body; parchment background renders.

### 10.3 API tests

`pagination.routes.test.ts`:
- `POST /paginate` on a project without Breakdown → 400.
- `POST /paginate` twice without `mode` → second call needs confirmation if
  approved pages exist.
- `POST /preview/approve` then `POST /generate-image` → succeeds.
- `POST /generate-image` before approval → 409 with code
  `preview_not_approved`.

### 10.4 Acceptance — the one that matters

A non-engineer operator (you), with no instructions beyond the on-screen
labels:

1. Uploads The Wildlands manuscript.
2. Runs Breakdown → 129 entries.
3. Runs Pagination → some N ≥ 129 printed pages.
4. Opens any page → sees real text in real Reading Field on parchment.
5. Approves 5 pages, generates images on those 5, gets back 5 illustrations
   whose composition matches the previewed Reading Field.
6. Tries to generate an image on an unapproved page → gets a clear error.

If you can do this without me explaining a single concept, the SPEC is done.

---

## 11. Out of scope for v1

These belong in v2+ and must NOT bleed into v1:

- Sentence-level splitting inside a paragraph.
- Three-or-more-entry compaction.
- Continuation pages that carry their own minor illustration (different
  subject from opener). v1 reuses or omits.
- Operator-defined ad-hoc page breaks via UI hot keys.
- Cross-chapter compaction.
- Multi-column Reading Fields.
- Reading-Field text re-flow on font / size change without re-pagination.
- A `LAYOUT_17_CONTINUATION` template (LAYOUT_2 is the v1 stand-in).
- LLM-assisted compaction or subject inference at pagination time.

Each item above is a real future improvement; locking them out of v1 keeps the
ship date honest.

---

## 12. Rollout

1. **Land Path A first** (the in-place splitter inside Page Plan, no schema
   changes). Operator regains usable testing in days, not weeks. The work is
   throwaway — it's deleted when Stage 1.75 lands — but it unblocks the
   current SmartKlix-style "test the rest of the pipeline" need.
2. **SPEC review** (this document). One pass with the operator (you) and
   approval. Anything ambiguous gets resolved here, not during implementation.
3. **Schema migration** (`0003_pagination.sql`). Lands on its own commit,
   deployed and verified before any code that reads the new columns.
4. **Stage 1.75 backend** (paginate.ts and helpers + tests). Lands behind a
   feature flag `PAGINATION_V1_ENABLED` defaulting to false in prod. Tests
   run on every PR.
5. **Stage 1.8 backend** (preview renderer). Lands with the feature flag
   still off; tests prove the preview PDF generates correctly.
6. **Frontend Page Production tab + Chapter Production panel.** Behind the
   same flag.
7. **Flip the flag** on prod after one full end-to-end test by the operator.
   `escalateForOverflow` removed from Stage 2 in the same commit that flips
   the flag.
8. **Remove the Path A splitter** in the commit after that, once the new
   pipeline has been stable for one operator-session.

---

## 13. Open questions for approval

These need an answer before implementation starts:

1. **Continuation image policy:** in v1, do continuation pages show
   (a) bare parchment, (b) the opener's image faded behind text, or (c)
   a small repeated motif (laurel branch, mark)? My recommendation is (a) for
   v1 — cleanest, no extra image spend, fastest to ship.
2. **Compaction default:** on or off in v1? My recommendation: on, because
   the alternative is many half-empty back-matter pages. Operator-tunable
   per project.
3. **Page numbering:** continuation pages get their own planned page number
   (i.e. they push later entries to higher page numbers). Confirmed?
4. **Re-paginate scope:** "Re-paginate Chapter" — does it also re-run Stage 2
   for that chapter automatically? My recommendation: yes, atomically, so the
   operator never sees a chapter with paginated pages but stale Page-Plan
   layouts.
5. **Operator override on Approve when OVERFLOW:** is the operator allowed to
   approve an OVERFLOW page (knowing the renderer will truncate or push to
   another physical page)? My recommendation: yes, but require a `reason`
   string logged in `page_approvals`.

Reply with answers or **"approved as written"** and I'll start with the
migration commit.
