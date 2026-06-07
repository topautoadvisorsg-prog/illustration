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

## 5. Reading Block flow algorithm

**Model:** the book is a stream of text poured through a sequence of Reading
Blocks. Each printed page owns one Reading Block (the actual character
capacity of its layout's Reading Field at the project's typography). Text
flows into Block 1 until full → overflow continues into Block 2 → repeat
until the manuscript ends. Whatever remains in the last block determines
whether the book is balanced or has a half-empty tail.

Entries are **anchors** in the stream, not page boundaries. An entry's
content type controls how it enters the flow (preferred opener layout, hard
or soft break) but never owns its own page count — page count is whatever the
flow produces.

Single entry point: `paginateProject({ projectId, config })` in
`backend/src/pipeline/stage-1.75-pagination/paginate.ts`. Pseudocode:

```
entries  = list PAGE manifests for project, ordered (chapter, plannedPageNumber)
geometry = computePageGeometry(config.trimSize)
stream   = entriesToStream(entries)           // see §5.4
sequence = buildLayoutSequence(entries, config)  // see §5.6 — provisional sequence
result   = flowEngine(stream, sequence, config, geometry)  // §5.1
result   = tailRebalance(result, config)      // §5.3
result   = assignPageNumbers(result)
persist(result)
```

### 5.1 Flow engine

Input: a token stream + a provisional layout sequence + config + geometry.

The engine walks the layout sequence one Reading Block at a time:

1. **Open the next Reading Block.** Compute its capacity in chars by running
   `computePaginationCapacity({ readingFieldText: '', layoutTemplate,
   trimSize, bodyPt, lineHeight })` (same math used by Stage 6 text-fit).
2. **Pour stream tokens** into the block until the next token would exceed
   capacity (or hit a hard-break anchor — see §5.5).
3. **Record the block:** `reading_field_text`, `reading_field_chars`,
   `reading_field_words`, `fit_status` (computed against the actual capacity
   per §5.7).
4. **If a new entry started inside this block**, set
   `carries_subject = true` and `entry_key = startedEntry.pageKey` for this
   page. If two entries started in the same block (allowed only when soft
   breaks permitted, §5.5), record both in `compacted_entry_keys` and use
   the first as `entry_key`.
5. **If this block contains overflow from a previous block**, set
   `entry_key = openerPageKey`, `page_role = 'continuation'`, increment
   `part_n` over the opener's running counter, `carries_subject = false`.
6. **Advance** to the next layout in the sequence. If the sequence runs out
   before the stream does, append more `LAYOUT_2_TEXT_HEAVY` pages until
   the stream empties.

The engine produces a sequence of `PaginatedPage` records, in order, with
all fields populated. It does not write to the database itself — persistence
is the caller's job.

### 5.2 No splitter, no compactor (deliberate)

Both behaviors emerge from the flow model for free:

- **Splitting** a long entry happens because Reading Block N runs out of
  capacity before the entry's text does; the entry continues into Block
  N+1, automatically a continuation page.
- **Compacting** two short adjacent entries happens because entry N+1's
  first tokens fit inside the trailing room of Block N (when the break
  policy in §5.5 allows it).

No special-case code. The flow engine is the entire mechanism.

### 5.3 Tail rebalance (orphan prevention)

After the flow engine runs, the last printed page may be underfilled. The
tail rebalance step looks at the last 1–2 pages:

1. **Last page < 30% full:** find the most recent low-priority layout in
   the sequence (e.g. an inserted `LAYOUT_3_ILLUSTRATION_DOMINANT` whose
   Reading Block is small), drop it from the sequence, and re-run the flow
   engine from that point forward. Repeat at most twice.
2. **Last page is a continuation carrying < 60 words:** try pulling one
   paragraph back from the previous page. If the previous page would
   exceed its capacity, accept the orphan and emit warning
   `orphan_tail_accepted`.

The tail rebalance never touches the manuscript stream itself — it only
edits the layout sequence and re-flows.

### 5.4 Manuscript-to-stream conversion

The stream is a list of typed tokens preserving entry boundaries and
typographic structure:

```ts
type StreamToken =
  | { kind: 'entry-start'; entryKey: string; entryTitle: string;
      contentType: ContentType; imageSubject: string;
      breakBehavior: 'hard' | 'soft' }
  | { kind: 'paragraph'; markdown: string; chars: number; words: number }
  | { kind: 'section-heading'; markdown: string; chars: number }
  | { kind: 'code-block'; markdown: string; chars: number }   // atomic, never split
  | { kind: 'image-embed'; markdown: string; chars: number }; // atomic, never split
```

`entriesToStream(entries)` walks the PAGE manifests in chapter / planned
page order, emits one `entry-start` token per entry followed by tokens for
the entry's body (parsed from `bodyMarkdown` on paragraph boundaries). The
flow engine consumes tokens left-to-right; it never reorders them.

Code blocks and image embeds are atomic (single tokens) and never split
across Reading Blocks. If an atomic token alone exceeds a block's capacity,
v1 places it whole in that block and flags `fit_status = OVERFLOW`; v2 may
re-route to a higher-capacity layout. Out of scope here.

### 5.5 Entry break policy (hybrid, configurable)

When the flow engine encounters an `entry-start` token while there is room
remaining in the current Reading Block, it consults the break policy.

**Default policy (`config.layoutPolicy.entryBreakPolicy`):**

```ts
{
  kind: 'hybrid',
  softBreakMinLinesRemaining: 8,
  alwaysHardBreak: ['WARNING_PAGE', 'CHAPTER_OPENER',
                    'BOTANICAL_PLATE', 'DIAGNOSTIC_DIAGRAM'],
}
```

Decision per entry-start:

1. If `entry.contentType ∈ alwaysHardBreak`: HARD break. Close the current
   block, advance to the entry's preferred opener layout in the sequence,
   start the entry there.
2. Else if `linesRemainingInCurrentBlock < softBreakMinLinesRemaining`:
   HARD break (not enough room for a clean soft break).
3. Else: SOFT break. Continue the entry in the current block. The page
   then carries both the previous entry and this one — `entry_key` stays
   the first, `compacted_entry_keys` records both in order, and only the
   first entry's `imageSubject` drives the page's illustration.

The `breakBehavior` field on the `entry-start` token is precomputed by
`entriesToStream` so the flow engine doesn't need to know the policy
details — it just reads `token.breakBehavior`.

### 5.6 Layout sequence builder

`buildLayoutSequence(entries, config)` produces an array of `LayoutTemplateId`
representing a provisional page-by-page layout assignment for the whole
book, BEFORE flow. Algorithm:

```
sequence = []
for each entry in entries:
    opener = preferredOpenerLayout(entry.contentType)
    // If the previous entry has soft-broken into this one, no opener page is
    // added — that's resolved at flow time. Worst case: extra layouts go
    // unused (the flow engine just advances past them).
    sequence.push(opener)
    estimatedContinuationCount = roughEstimateContinuationPages(entry, config)
    for i in [1..estimatedContinuationCount]:
        sequence.push('LAYOUT_2_TEXT_HEAVY')
return sequence
```

`preferredOpenerLayout(contentType)`: returns the layout this content type
would prefer to open on. Reuses the existing `chooseLayout` logic from
`plan-pages.ts:217-369` minus the operator-forced and overflow paths, since
overflow no longer triggers a layout swap (the next Reading Block absorbs
it).

`roughEstimateContinuationPages(entry, config)`: very coarse —
`ceil(entry.wordCount / DEFAULT_LAYOUT_CAPACITY.LAYOUT_2_TEXT_HEAVY.targetWords) − 1`.
The estimate exists only to make the provisional sequence long enough that
the flow engine rarely has to append `LAYOUT_2_TEXT_HEAVY` pages at the
end. The actual page count is whatever the flow produces, not what was
estimated.

`LAYOUT_2_TEXT_HEAVY` is the v1 default continuation/reading layout. SPEC
§5.2's earlier note about a future `LAYOUT_17_CONTINUATION` still applies.

### 5.7 Reading Block fit_status

For each Reading Block, after the flow engine fills it:

- `FITS`     — `chars ≤ 0.85 × capacity`
- `TIGHT`    — `0.85 × capacity < chars ≤ capacity`
- `OVERFLOW` — `chars > capacity` (only possible from an atomic token, per
                §5.4; otherwise the engine would have stopped pouring)
- `UNDERFILL` — `chars < 0.30 × capacity`

Computation is unchanged from the prior SPEC — the existing `capacity.ts`
helper that wraps `analyzeTextFit` is the authority.

`OVERFLOW` and `UNDERFILL` block preview approval until the operator
either accepts the warning with a logged reason (SPEC §10 approved
answer 5) or re-paginates.

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
  paginate.ts                 // orchestrator (entries -> stream -> sequence -> flow -> rebalance -> persist)
  stream.ts                   // entriesToStream + StreamToken types + break-behavior derivation
  layout-sequence.ts          // buildLayoutSequence + preferredOpenerLayout + roughEstimate
  flow-engine.ts              // walks the sequence, pours stream into Reading Blocks
  tail-rebalance.ts           // last-page-underfill recovery (replaces orphan-guard)
  capacity.ts                 // wraps stage-6 analyzeTextFit, returns fit_status
  __tests__/
    stream.test.ts
    layout-sequence.test.ts
    flow-engine.test.ts
    tail-rebalance.test.ts
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

`backend/src/db/migrations/0002_pagination_v1.sql` (shipped in commit 241a89c):

- Adds 13 new columns to `pages` (all nullable or with safe NOT NULL DEFAULTs).
- Creates 3 new enums (`page_role`, `fit_status`, `page_approval_decision`).
- Creates `page_approvals` audit table.
- Backfills `entry_key = page_key` on existing rows in the same migration.

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

`stream.test.ts`:
- Three entries with bodies → produces ordered `entry-start` + paragraph
  tokens; entry titles preserved; word/char counts present on every token.
- Entry with a code fence → fence becomes a single atomic `code-block` token.
- Entry with section headings → tokens emitted in source order.
- `entry-start.breakBehavior` resolves to `'hard'` for WARNING_PAGE,
  CHAPTER_OPENER, BOTANICAL_PLATE, DIAGNOSTIC_DIAGRAM; `'soft'` otherwise.

`layout-sequence.test.ts`:
- 3 entries (CHAPTER_OPENER, SPECIES_PROFILE, WARNING_PAGE) →
  sequence starts with LAYOUT_5, then LAYOUT_1, then LAYOUT_4, each
  followed by a rough number of LAYOUT_2_TEXT_HEAVY continuations.
- Entry with 0 body words → no continuation pages added after the opener.
- preferredOpenerLayout reuses the planner's content-type table without
  triggering overflow autoroute.

`flow-engine.test.ts`:
- One short entry (50 words), one opener block of cap 600 → all text fits
  block 1, no continuations created, sequence's extra blocks dropped.
- One long entry (1,500 words), opener cap 200 + continuation cap 720 →
  text spans opener + 2 continuations; `entry_key` consistent across all
  three; `part_n` = 1/2/3; `carries_subject` only on page 1.
- Two short adjacent entries within soft-break threshold → both end up on
  the same page with `compacted_entry_keys = [a, b]`.
- WARNING_PAGE entry following a half-full block → hard break enforced;
  warning starts on a new page even with room remaining.
- Code-block token alone exceeds block capacity → token placed in the
  block whole, `fit_status = OVERFLOW`, warning emitted.

`tail-rebalance.test.ts`:
- Last page < 30% full and sequence contains a discretionary
  LAYOUT_3_ILLUSTRATION_DOMINANT before it → that layout is dropped, flow
  re-runs, last page becomes well-filled.
- No discretionary layouts available → orphan accepted, warning
  `orphan_tail_accepted` emitted.

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
