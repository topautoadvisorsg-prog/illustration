# UI Exposure Plan — 5 Chunks, One at a Time

> **Backend is frozen.** Every chunk uses endpoints that already exist.
> No new services, no new pipeline stages. The work is exposing what's built.
>
> **Order is locked:** 1 → 2 → 3 → 4 → 5. After each chunk we ask:
> *Can a brand-new publishing employee complete more work than before?*
> If no, simplify.
>
> **End-state shape per the directive:**
> ```
> STATUS
> WHY
> NEXT ACTION
> RUN
> ```

---

## Notes on the current tabs (from the directive: "what are the names of those tabs?")

| Position | Today's label | Today's CSS class | What's inside | Operator translation |
|---|---|---|---|---|
| 1 | 🛠 Control Center | `cc-control` | Production dashboard, chat, review board, render proofs, image review | **Production** |
| 2 | Setup | `cc-setup` | Project create / project list / manuscript upload / format calibration | **Project** |
| 3 | Library | `cc-library` | 16 layout templates (read-only catalog) | **Layouts** |
| 4 | Intelligence | `cc-intel` | Decisions / experiments / standards / SOPs / cost events / print findings | **Decisions** |
| 5 | Export | `cc-export` | Chapter production grid / book parts / preview + download | **Export** *(keep)* |

**Plus a misnamed Sidebar link:** `Settings` (App.js:3851). It is **not** settings — it toggles Advanced Mode ON and scrolls to the Intelligence panel. Will be removed or renamed in chunk 3.

**The rename is part of chunk 3.** Chunks 1 + 2 happen first so we have a working dashboard tile + render UI to apply the rename across.

---

## Chunk 1 — Dashboard Supervisor Tile (this commit)

### Current state
- Operator opens the Production tab and sees: Dashboard Hero (project cover + metric tiles) → Current Stage Result (prose) → Operator Grid (commands + log) → Chat → Review Board.
- "What is happening / what next?" is answered three places (Operator Guidance prose, Production Dashboard tile, sidebar workflow indicator) — none authoritative.
- The supervisor endpoint `POST /api/projects/:id/run-pipeline` exists but **zero UI** calls it.

### Proposed state
A single **Production Status** tile pinned **above** the existing Dashboard Hero on the Production tab. Tile shape:

```
┌──────────────────────────────────────────────────────────┐
│ Production Status                              [Refresh] │
│                                                          │
│  ⚠  BLOCKED               Stage: Text-fit                │
│                                                          │
│  Next: Resolve flagged pages on the Page Plan before     │
│         image generation.                                │
│                                                          │
│  Pages 289 · Over capacity 1 · Spend $14.45 of $25.00    │
│                                                          │
│  [ ▶ Run Pipeline Check ]                                │
└──────────────────────────────────────────────────────────┘
```

- Empty state when no report yet: `"Run a Pipeline Check to see status."` + the same CTA.
- Verdict pill: green / amber / red mapping to PASS / WARNING / BLOCKED.
- One CTA. One refresh. Nothing else competes for attention.

### Screens affected
- `Control Center` tab only. The tile is `cc-control`-tagged.

### Components affected
- `frontend/src/App.js` — inline section (no new file per existing single-file convention).
- `frontend/src/App.css` — `.production-status-tile` rules added in one block.

### Estimated implementation size
- ~120 lines React (state + fetch + render).
- ~80 lines CSS.
- Zero backend changes.

### Acceptance check after chunk 1 ships
*Can a brand-new publishing employee open the project, see the verdict, and know what to click next?* — Yes if the tile renders and the CTA works.

---

## Chunk 2 — Whole-Page Render UI

### Current state
- The whole-page render pipeline (10 backend routes under `/api/experimental/whole-page-render/*`) has **zero UI**.
- Operator UI renders the legacy illustration-only pipeline.
- Per project memory, whole-page render IS the primary active pipeline.

### Proposed state
A new "AI Page Renders" panel under the Production tab's Render Proofs area. For each page:
- Status badge (QUEUED / RENDERING / RENDERED / FAILED).
- Thumbnail of the latest version.
- Inline actions: Render · Regenerate · Approve · Reject · Print-Prep · Select for Book.
- Per-page version history (collapsed by default).

### Screens affected
- `Control Center` → "Render Proofs" section.
- Eventually replaces the legacy `chapter-production-panel` render call path.

### Components affected
- App.js — new section + state for `wholePageRenders` per project.
- ~6 new fetch helpers wrapping the existing endpoints.
- CSS for the new panel + status badges.

### Estimated implementation size
- ~250 lines React (state + 6 fetch calls + grid + per-row actions).
- ~100 lines CSS.
- Zero backend.

---

## Chunk 3 — Publisher Terminology Rename Pass

### Current state
Operator UI uses developer codes: `TIGHT`, `OVERFLOW`, `UNDERFILL`, `readyForImageSpend`, `whole-page-render`, `preflight`, `decision-ledger`, `Force layout`, `Layout Approval`, `System Working`, `Settings` (which isn't), 5 ambiguous tab names.

### Proposed state
String-only replacements. **Renames only — zero logic changes.**

| Today | Renamed |
|---|---|
| 🛠 Control Center | **Production** |
| Setup | **Project** |
| Library | **Layouts** |
| Intelligence | **Decisions** |
| Export | Export |
| Sidebar "Settings" link | **Power Tools** (or remove if chunk 1 makes it redundant) |
| Workflow stage "System Working" | *removed* (dev message) |
| Workflow stage "Upload Manuscript" (one of the two duplicates) | *removed* |
| Workflow stage "Approve Layouts" | **Approve Chapter for Image Generation** |
| `TIGHT` chip | **Near capacity** |
| `OVERFLOW` chip | **Over capacity** |
| `UNDERFILL` chip | **Under-filled** |
| `FITS` chip | **Fits** |
| `readyForImageSpend` | **Ready to generate images** |
| `whole-page-render` (button text) | **AI Page Render** |
| `preflight` (in book render results) | **KDP check** |
| `Publishing Director recommendation` | **Page issue** |
| `Force layout` | **Override layout** |
| `Operator Preview` panel | *removed* (duplicate of Preview Review) |
| `PAID_ACTION_WARNING` confirm dialog | *removed* — supervisor budget guard covers it |

### Screens affected
- Sidebar (tab labels, stage labels, Settings link).
- Every chip / badge / button label across the Production / Layouts / Decisions / Export tabs.
- Topbar (eyebrow + h1 may stay; verify).

### Components affected
- App.js — bulk string replacements.
- A small map of stage labels (already exists as the workflowSnapshot generator).

### Estimated implementation size
- ~80 string replacements.
- ~150 lines touched.
- No new components.

---

## Chunk 4 — Render Queue Visibility

### Current state
- `GET /api/experimental/whole-page-render/project/:projectId` returns the entire render list with status. **No UI calls it.**
- Operator doesn't see "what's in flight."

### Proposed state
A "Recent Renders" list in the Production tab (sub-section of chunk 2's panel, or stand-alone):
- Polled every 15 s while any row is `RENDERING` or `QUEUED`.
- Rows are sortable by chapter / status / age.
- Failed rows expose a Retry button.

### Screens affected
- `Control Center` → Render Proofs section.

### Components affected
- One new fetch helper.
- Either folded into Chunk 2's panel or a separate stand-alone.

### Estimated implementation size
- ~100 lines React if separate.
- ~30 lines if folded into chunk 2 (preferred).
- Zero backend.

**Note:** Chunk 4 overlaps significantly with Chunk 2. May collapse into one
implementation depending on how chunk 2 lands.

---

## Chunk 5 — Bulk Approval Actions

### Current state
- Chapter approval is per-chapter button. 8 chapters → 8 clicks (plus per-chapter PAID_ACTION_WARNING confirm).
- Image approval is per-image button. 30 images → 30 clicks.
- Upscale is per-page button. 30 upscales → 30 + confirms.

### Proposed state
- "Approve all eligible chapters" button — calls per-chapter layout-approval endpoint in a `Promise.all` over chapters that PASS Page Quality Review.
- "Approve all flagged-clean images" — approves images that have no quality findings.
- "Print-prep all approved renders" — calls per-render print-prep endpoint in a loop.
- One confirmation modal showing exactly what will be acted on before firing.

### Screens affected
- Chapter Production panel (Export tab).
- Image Review section (Production tab).
- Render Proofs section.

### Components affected
- Three bulk-action buttons added next to their per-item counterparts.
- One shared "Bulk Action Preview" modal component.

### Estimated implementation size
- ~150 lines React.
- ~30 lines CSS.
- Zero backend.

---

## Sequencing — why this order

| Order | Reason |
|---|---|
| 1. Dashboard Tile | Gives the operator a single answer to "what's happening / what next?" — replaces 3 partial answers. Unblocks the rest. |
| 2. Whole-Page Render UI | The biggest exposure: the active pipeline becomes visible. Without it, every later chunk is decorating the wrong path. |
| 3. Rename Pass | After chunks 1 + 2 have new strings, do the rename in one sweep so we don't rename then add then re-rename. |
| 4. Render Queue Visibility | Likely already half-built inside chunk 2. Folds in. |
| 5. Bulk Approval Actions | The final efficiency lift once everything else makes sense to the operator. |

The directive: **stop after each chunk and ask the new-employee question
before starting the next one.**

---

## Chunk 1 is happening in this commit. The rest queued in order.
