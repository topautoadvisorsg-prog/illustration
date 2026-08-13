# SPEC — Book Intake: drop a manuscript, get a project

Status: **PROPOSED, awaiting approval.** Nothing in here is built yet.

## The complaint, restated precisely

"Every time I drop a book in here, you gotta rewrite the wheel."

That is accurate, and it is measurable:

| Evidence | Count |
|---|---|
| `.ts` files in `backend/scripts` | **234** |
| One-off `_`-prefixed throwaway scripts | **~120** |
| Per-book `fix-*-subjects.ts` scripts | 5 (bushcraft, mushroom, survival, terrain, tree) |
| MCP servers exposing this platform | **0** |
| Endpoints that take a manuscript and return a ready project | **0** |

`docs/NEW_BOOK_PARITY_PLAN.md` diagnosed this in 2026 and recommended two
no-spend audit layers. Layer 1 (regression tests) was built. **Layers 2 and 3
were never built.** This spec is those layers plus the intake operation they
were meant to hang off.

## What is already right — do not rebuild it

The registry pattern is correct and in place in three spots. Adding a book
*type* is genuinely a registered entry, not an engine change:

- `pipeline/production-profiles/registry.ts` — 2 profiles
- `pipeline/typeset/layout-standards/` — versioned, pinned per project, resolver throws on unknown id
- `pipeline/publishing-standard/style-dna.ts`

The problem is not the registries. It is that **nothing drives them**, so every
book is driven by hand-written scripts instead.

## What actually has to be hand-done today

Traced against the real code, this is the current cost of one new book.

| Step | Today | Cost |
|---|---|---|
| Create project | `POST /api/projects` with a full config blob, or 1 UI form | config assembled by hand |
| Set trim / paper / profile / binding | Step 3 form, 12+ fields | manual, no validation that the combination is producible |
| Upload manuscript | Step 2 | fine |
| Breakdown → paginate | Steps 4–5 | fine |
| **New region biome** | **edit `REGION_DEFAULT_ENVIRONMENT` in `stage-2-planner/plan-pages.ts:545`, redeploy** | **code change + deploy** |
| **Per-page illustration subjects** | **edit the `SUBJECTS` map in `scripts/render-illustration.ts:313`** | **code change, ~11 hand-written prompts** |
| Manuscript path for that script | `WL_QA_MANUSCRIPT` env or a hardcoded Downloads path (`render-illustration.ts:36`) | machine-specific |
| Know whether it is safe to spend | nothing tells you | manual hunt, or find out after paying |

The last row is the expensive one. There is no pre-spend gate. `production-dashboard`
reports the status of work already queued; it does not answer "is this book set up
correctly enough to start paying for renders?"

## The design

Three pieces. Each is additive — none changes the render or typeset engines.

### 1. `POST /api/books/intake` — one call, manuscript in, project out

```jsonc
{
  "brief": {
    "title": "…",
    "subtitle": "…",              // also the region string the planner reads
    "authorName": "…",
    "trimPreset": "5.5x8.5",      // or explicit trimSize
    "paperStock": "cream",
    "productionProfileId": "bw-educational-nonfiction",
    "binding": "paperback",
    "editions": ["paperback", "kindle"]
  },
  "manuscript": { "filename": "book.md", "contentBase64": "…" }
}
```

Does, in order: validate the brief against the registries (unknown profile =
422, not a silent field-guide fallback); create the project; ingest the
manuscript; run breakdown; run pagination; run the readiness audit; return
`{ projectId, readiness, nextAction }`.

Idempotent on a `briefHash` so a retry does not create a second project — the
failure mode that produced two identical "THE WILDLANDS" rows.

### 2. `GET /api/projects/:id/readiness` — the pre-spend gate (free)

Layer 3 of the parity plan, generalized past "New England". Every check is
deterministic and costs nothing:

- profile, layout standard, and style DNA all **resolve** — none silently fell back
- entry counts match the source's numbered headings per chapter
- **zero occurrences of any OTHER project's region string** in the prompt path
- byline present on openers; body does not double-print it
- bottom anchor present on every text-bearing page
- 0 stranded, 0 underfilled, 0 overflow
- pilot spans ≥3 distinct layouts, not a monoculture
- cover geometry computable at the current page count
- every font face the standard names is vendored and loadable

Returns `READY | BLOCKED` with a per-check reason and the exact fix. This is the
thing that turns "the agent caught it" into "the platform caught it."

### 3. MCP server — same operations, agent-callable

A thin server in `backend/src/mcp/` exposing the existing REST operations as
tools. **No business logic** — it calls the same handlers, so there is one
implementation and the UI and the agent cannot drift.

`book_intake` · `book_readiness` · `book_status` · `page_set_subject` ·
`cover_preflight` · `cover_upload` · `build_interior` · `build_cover` ·
`delivery_check`

Every paid tool is split into a free preflight and an explicit spend call, so an
agent cannot spend by accident. Matches the cost-control policy already in force.

### 4. Retire the two per-book code edits — AFTER the printed proof

- `REGION_DEFAULT_ENVIRONMENT` → `imageGeneration.defaultEnvironment` on the
  config, seeded from the current table. New region becomes a field.
- `SUBJECTS` → per-page rows in the DB, set via `page_set_subject` / a Step 7
  field. New book becomes data.

Both touch the render path, which is frozen until a printed proof exists
(`docs/` freeze rule). They are phased last deliberately.

## Phasing

| Phase | Content | Touches frozen paths? |
|---|---|---|
| 1 | readiness audit + tests | No — new read-only endpoint |
| 2 | `POST /api/books/intake` + UI "New book from manuscript" | No — composes existing stages |
| 3 | MCP server | No — wraps existing routes |
| 4 | region + subjects to data | **Yes — after printed proof** |

## What this does not do

- Does not change typesetting, pagination, or image generation.
- Does not replace the 8-step console. Intake fills the steps in; the operator
  can still drive each one.
- Does not delete the 120 scratch scripts. It removes the *reason* to write the
  next 120.

## Open question for approval

Phases 1–3 are safe to build now and are where the rewriting actually goes away.
Phase 4 is the one that needs the printed proof first.

**Approve 1–3 now, hold 4?** That is the recommendation.
