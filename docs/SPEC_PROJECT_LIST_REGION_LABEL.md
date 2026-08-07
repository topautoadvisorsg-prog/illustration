# SPEC — Project-list region label (series-aware disambiguation)

**Status:** write-up for approval. NOT built. Non-blocking for Canadian Rockies render.
**Date:** 2026-07-04

## Problem
Every Wildlands volume shares `title = "THE WILDLANDS"` by design (the cover
convention). The console project list renders **title + status only**, so two
books read identically:

```
THE WILDLANDS · MANIFESTED   ← New England (66c1c69c, shipped)
THE WILDLANDS · MANIFESTED   ← Canadian Rockies (8c1e161a, in-progress)
```

This is structural, not a one-off — Series 3 (Southern Appalachians), 4, … all add
another identical row. It's an operational hazard right before the most expensive
step (render). Fix the class: label the list from clean data so books are never
mixable. Same lesson as the parser allow-list and the region sweep — build
series-aware, don't hardcode around one book.

## Current code (grounding)
- Backend list contract `toContract()` — `backend/src/api/projects.routes.ts:~207`
  returns `{ id, brand, audience, title, status, manuscriptPath, createdAt, updatedAt }`.
  **No subtitle** (subtitle lives in `config`, not a column).
- Frontend list — `frontend/src/ProductionConsole.js:530-533`
  `projects.map(p => <button>{p.title} · {p.status}</button>)`.
  Active line (`:512`) and the "Opened …" notice (`:532`) also use `p.title` only.

## Change

### 1. Backend — expose the region on list items
In `toContract()`, add `subtitle` derived from the project config
(`parseProjectConfig(row).publishing.subtitle ?? …subtitle`). One field, additive,
no schema break. (Region is now clean data thanks to the sweep — `CANADIAN ROCKIES`,
`NEW ENGLAND`, later `SOUTHERN APPALACHIANS`.)

### 2. Frontend — show region + state in the list
`ProductionConsole.js` list row becomes:

```
THE WILDLANDS — CANADIAN ROCKIES   (in-progress)
THE WILDLANDS — NEW ENGLAND        (shipped)
```

- Title — subtitle(region), then a state badge.
- Also update the active-project line (`:512`) and the "Opened …" notice to include
  the region, so the confirmation reads `Opened "THE WILDLANDS — CANADIAN ROCKIES"`.
- Fully series-agnostic: pulls region from `config.subtitle`; no book names in code.

### 3. State badge: shipped vs in-progress — ONE open decision
"Shipped" is **not currently tracked** — both books are pipeline-status `MANIFESTED`,
so raw status can't distinguish them. Options (pick one):

- **(A, recommended)** Add an explicit `config.lifecycle: 'in_progress' | 'shipped'`
  (default `in_progress`); operator flips it to `shipped` when a book's KDP files are
  uploaded. Explicit, honest, one toggle. Never guesses.
- **(B)** Derive `shipped` from artifact state (has approved renders + a built export
  package). Zero operator action, but "shipped" then means "export exists," which can
  be true mid-work — softer signal.

Recommend **A** — it's a real lifecycle fact the operator owns, not something to infer.
If you prefer no new field for now, the badge can simply show the pipeline status
(what the list shows today) until lifecycle is added.

## Scope / non-goals
- No change to the cover convention (title stays `THE WILDLANDS`).
- No change to render, pagination, or breakdown.
- Frontend build via `CI=false node_modules/.bin/craco build`; verify the list renders
  both books distinctly before deploy.

## Acceptance
- Project list shows `TITLE — REGION (state)` for every project; the two Wildlands
  books are visually distinct at a glance.
- Works unchanged for a third same-title volume (series-agnostic).
- No new test failures.
