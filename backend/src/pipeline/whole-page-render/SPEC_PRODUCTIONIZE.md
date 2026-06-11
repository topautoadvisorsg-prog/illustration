# SPEC — Move #1: Productionize Whole-Page Render

**Status:** draft — awaiting operator sign-off. No code until approved.
**Depends on:** whole-page experiment (commits `3f4d706`…`0b6f82a`), Standard v1.0.
**Flag:** reuses `WHOLE_PAGE_EXPERIMENT_ENABLED` (no new flag).
**Branch:** `main`, additive only. Legacy Stage 2/3/6 untouched.

---

## 0. What this move does and does not do

**Does:**
- Persist every whole-page render to the database (was: disk-only).
- Version renders per page (v1, v2, v3…) exactly like the existing `images` table does for illustration-only art.
- Track render status through a lifecycle (queued → rendering → rendered → approved/rejected/failed).
- Store the JSON spec, the assembled prompt, the image path, dimensions, model, and error text alongside each render.
- Add approve / reject / regenerate operations.
- Handle errors and retries deterministically.
- Leave clean seams for the frontend (move #4) to call.

**Does NOT:**
- Touch legacy Stage 2 (`assembleLeanPrompt`), Stage 3 (`generate-image.ts`), or Stage 6 (HTML render). They stay dormant behind their existing paths.
- Do print-prep (that's move #2).
- Do book assembly (move #3).
- Build any frontend (that's move #4).
- Generate in bulk (that's move #5, gated behind the small-batch proof).

---

## 1. Data model

### 1.1 New enum — `whole_page_render_status`

```
'QUEUED'      -- row created, generation not yet started
'RENDERING'   -- OpenAI call in flight
'RENDERED'    -- image produced, awaiting operator decision
'APPROVED'    -- operator accepted this version (MANY versions may be APPROVED)
'REJECTED'    -- operator rejected this version
'FAILED'      -- generation threw; error_message populated
```

Mirrors the spirit of `imageStatusEnum` but is its own enum so the two pipelines never share a lifecycle and can't interfere.

### 1.1b Approval vs. book-selection — TWO distinct concepts (operator decision)

`status = APPROVED` means "operator likes this version." Multiple versions of
the same page can be APPROVED simultaneously (v1, v2, v3 all good).

`approved_for_book = true` means "this is THE version that goes in the book."
Exactly ONE version per page may carry it. It moves together with `active`.

```
RENDERED  →  APPROVED            (status; many allowed)
          →  approved_for_book=true + active=true   (book selection; one allowed)
```

Book assembly (move #3) reads ONLY:  `active = true AND approved_for_book = true`.

This removes all ambiguity when three approved versions exist but only one is
meant for the PDF.

### 1.2 New table — `whole_page_renders`

Mirrors the `images` table pattern (versioned, one active per page):

```ts
export const wholePageRenders = pgTable(
  'whole_page_renders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pageId: uuid('page_id').notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),

    version: integer('version').notNull(),         // 1,2,3… per page
    status: wholePageRenderStatusEnum('status').default('QUEUED').notNull(),

    // The inputs that produced this render — full audit trail.
    specJson: jsonb('spec_json').notNull(),         // the WholePageSpec
    assembledPrompt: text('assembled_prompt').notNull(),
    promptSha256: text('prompt_sha256').notNull(),
    standardVersion: text('standard_version').notNull(), // 'WILDLANDS_STANDARD.version'

    // The output.
    imagePath: text('image_path'),                  // storage relative path; null until RENDERED
    specPath: text('spec_path'),                    // stored .json
    promptPath: text('prompt_path'),                // stored .prompt.txt
    widthPx: integer('width_px'),
    heightPx: integer('height_px'),
    model: text('model'),

    // Which version is the current pick for this page (UI selection).
    active: boolean('active').default(false).notNull(),
    // THE version that goes in the book. One per page. Moves with `active`.
    // Book assembly reads only (active=true AND approved_for_book=true).
    approvedForBook: boolean('approved_for_book').default(false).notNull(),

    // Operator decision trail.
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),

    // Error handling.
    attempts: integer('attempts').default(0).notNull(),
    errorMessage: text('error_message'),

    ...timestamps,
  },
  (table) => ({
    pageVersionIdx: uniqueIndex('wpr_page_version_idx').on(table.pageId, table.version),
    pageActiveIdx: index('wpr_page_active_idx').on(table.pageId, table.active),
    projectStatusIdx: index('wpr_project_status_idx').on(table.projectId, table.status),
  }),
);
```

**Why a new table, not columns on `pages` or rows in `images`:**
- `images` carries illustration-only semantics (upscaledPath, the clean-art contract). Whole-page renders are a different product (text baked in). Mixing them invites the exact drift we're avoiding.
- A separate table lets the legacy `images` pipeline keep working untouched as the fallback.
- Versioning + active-flag pattern is copied verbatim from `images`, so the repo code is familiar.

### 1.3 Migration

`0003_whole_page_renders.sql`, drizzle-generated, hand-verified to match the 0002 style:
- `CREATE TYPE "whole_page_render_status"`
- `CREATE TABLE "whole_page_renders"` with the three indexes
- No `ALTER` on existing tables. Purely additive.

---

## 2. Render lifecycle (state machine)

```
   POST /render
        │
        ▼
   ┌─────────┐   generate     ┌───────────┐   ok      ┌──────────┐
   │ QUEUED  │ ─────────────▶ │ RENDERING │ ────────▶ │ RENDERED │
   └─────────┘                └───────────┘           └──────────┘
                                    │ throw                │  │
                                    ▼                       │  │
                                ┌────────┐                  │  │
                                │ FAILED │                  │  │
                                └────────┘                  │  │
                                    │ retry                 │  │
                                    └──── back to QUEUED    │  │
                                                            │  │
                       operator approve ◀───────────────────┘  │
                                │                               │
                                ▼                               ▼
                          ┌──────────┐                   operator reject
                          │ APPROVED │                          │
                          └──────────┘                          ▼
                                                          ┌──────────┐
                                                          │ REJECTED │
                                                          └──────────┘
```

- Exactly **one** APPROVED + active render per page at a time. Approving vN clears active on all other versions of that page (transaction, copied from `insertImage`'s active-clearing logic).
- REJECTED and FAILED versions are retained for audit; they never become active.
- Regenerate = create version N+1 in QUEUED, leave prior versions intact.

---

## 3. Module changes

### 3.1 `render-whole-page.ts` — split into persisted flow

Current `renderWholePage()` does: load → spec → prompt → blueprint → OpenAI → write disk → return. Refactor into:

```
createRenderRow(pageId, decidedBy)
  → inserts QUEUED row at version = max(version)+1, returns renderId

executeRender(renderId)
  → load row, set RENDERING, build spec+prompt+blueprint, call OpenAI,
    write artifacts to storage, set RENDERED (or FAILED + errorMessage),
    increment attempts
```

The existing one-shot path stays callable (for a synchronous "render now and wait" operator action) but writes through the persistence layer instead of returning ephemeral paths. Disk paths still under `experimental/whole-page/` (unchanged).

### 3.2 New repo — `whole-page-render.repo.ts`

```
createRenderRow(input): { renderId, version }
markRendering(renderId)
markRendered(renderId, { imagePath, specPath, promptPath, widthPx, heightPx, model })
markFailed(renderId, errorMessage)
approveRender(renderId, decidedBy): clears active on siblings, sets APPROVED+active
rejectRender(renderId, decidedBy, reason)
listRendersForPage(pageId): RenderRow[]      -- newest first
getActiveRenderForPage(pageId): RenderRow | undefined
getRenderById(renderId): RenderRow | undefined
listRendersForProject(projectId, status?): RenderRow[]
```

### 3.3 Routes — extend `experimental.routes.ts` (all flag-gated)

| Method + path | Purpose |
|---|---|
| `POST /api/experimental/whole-page-render/:pageId` | **Existing.** Now persists: creates row, executes synchronously, returns renderId + status + paths. |
| `POST /api/experimental/whole-page-render/:pageId/regenerate` | Create version N+1 and execute. |
| `GET  /api/experimental/whole-page-render/page/:pageId/versions` | List all renders for a page. |
| `POST /api/experimental/whole-page-render/:renderId/approve` | Mark a version APPROVED (many allowed). |
| `POST /api/experimental/whole-page-render/:renderId/select-for-book` | Set approved_for_book+active on this version, clear on siblings. Requires APPROVED. |
| `POST /api/experimental/whole-page-render/:renderId/reject` | Reject a version (+ reason); clears approved_for_book+active if set. |
| `GET  /api/experimental/whole-page-render/project/:projectId` | Project-wide render dashboard data (status counts + rows). |
| `GET  /api/experimental/whole-page-render/file` | **Existing.** Serve artifact by path. |

All return 503 when `WHOLE_PAGE_EXPERIMENT_ENABLED` is false. Unchanged contract.

---

## 4. Error handling & retries

- **Generation throws** (OpenAI timeout, content rejection, no image bytes): catch in `executeRender`, set `FAILED`, write `errorMessage`, increment `attempts`. The POST returns 200 with `{ status: 'FAILED', errorMessage }` so the operator sees the failure rather than a 500 (a failed render is an expected outcome, not a server error). A true 500 is reserved for DB/storage faults.
- **Retry**: `POST …/:pageId/regenerate` on a FAILED page creates a fresh version. No silent auto-retry — operator-driven, because each attempt costs an image credit.
- **Attempt cap**: soft cap of 5 attempts per page surfaced as a warning in the response; not a hard block (operator can override). Prevents runaway spend from a stuck loop.
- **Idempotency**: synchronous execution + unique `(pageId, version)` index means a double-submit can't create two rows at the same version. Concurrent POSTs to the same page serialize on the version computation (SELECT max+1 inside the insert transaction).
- **Timeouts**: OpenAI call is ~150s. Route handler timeout raised accordingly for this endpoint only.

---

## 5. Compatibility with current flags

- **`WHOLE_PAGE_EXPERIMENT_ENABLED`** (off in prod by default; you flipped it on for testing): gates every route. Off ⇒ 503, the new table simply sits empty.
- **`PAGINATION_V1_ENABLED`**: required ON, because whole-page render reads paginated `pages` rows for the body text. Already on in your prod.
- **`LAYOUT_SIMPLIFIED_V1`**: orthogonal. Whole-page reads whatever `layoutTemplate` the row carries.
- The migration runs regardless of flags (additive table); flags only gate the routes that read/write it.

## 6. Legacy path — explicitly preserved

- `images` table, `generate-image.ts`, `assembleLeanPrompt`, Stage 6 HTML render: **untouched**.
- The `pages.status` enum and existing image-spend gate keep working for the legacy illustration-only flow.
- A page can have BOTH an `images` row (legacy) and `whole_page_renders` rows (new). They don't collide.
- Nothing in this move deletes, renames, or alters a legacy code path. Removal is move #9, post-proof, operator-gated.

## 7. Frontend integration seams (for move #4, not built now)

The routes above are the contract the future GENERATE and APPROVE tabs consume:
- GENERATE tab → `POST :pageId` and `POST :pageId/regenerate`, polls `GET project/:projectId`.
- APPROVE tab → `GET page/:pageId/versions`, `POST :renderId/approve`, `POST :renderId/reject`, image via `GET file`.
No frontend code in this move. Just stable JSON shapes.

## 8. Tests

- Unit: repo version-increment, active-flag clearing on approve, status transitions.
- Route: 503-when-flag-off for every new route (mirrors existing test).
- State machine: approve clears siblings; reject doesn't set active; failed render stores errorMessage.
- No OpenAI spend in tests — the generator is injected/mocked, same as the existing generate-image tests.
- `tsc --noEmit` clean; full vitest green.

## 9. Out of scope (later moves)

- Print-prep (move #2)
- Book assembly + KDP preflight (move #3)
- Frontend (move #4)
- Bulk generation (move #5)
- BullMQ async queue — **deferred.** v1 runs synchronously (one render per request, ~150s). The `jobs` table + BullMQ wiring is a later optimization once the small-batch proof validates the flow. Synchronous is simpler to reason about for the proof.

## 10. Deliverable on completion

- Migration `0003_whole_page_renders.sql` applied.
- New repo + persisted render flow + 5 new routes.
- All tests green, tsc clean.
- One manual persisted render of CH01_P001 through the new path, showing: row created → RENDERED → approve → active, with the artifact served via `GET file`.
- Commit + push. No legacy code touched.

---

## Open questions for operator (answer before I code)

1. **Synchronous vs. async**: SPEC §9 defers BullMQ; v1 renders synchronously (request blocks ~150s). For a 10–20 page batch that's fine (fire them in parallel like we did manually). Confirm synchronous-for-now is acceptable, or do you want the BullMQ queue built into move #1?
2. **Attempt cap**: soft cap at 5 (warn, don't block). Good, or different number / hard block?
3. **Approve semantics**: approving a whole-page render — should it ALSO flip the legacy `pages.status` to APPROVED (so downstream book-assembly can read one status field), or keep whole-page approval entirely separate in `whole_page_renders.status`? I lean separate (cleaner), with book-assembly reading the new table directly.
```
