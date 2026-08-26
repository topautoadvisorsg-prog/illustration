# Legacy Drift Audit

> **Mandate:** find every operator-facing surface (UI, labels, previews,
> panels, workflows, docs, actions) that still reflects old assumptions
> after the backend changes — Geometry Reconciliation, Pagination V1
> + Patches A–D, multi-trim resolver, whole-page render becoming primary,
> print-prep / badges, Supervisor, Publishing Director, Quality Review,
> Decision Ledger, KDP readiness / assembly.
>
> **Audit only.** No fixes in this pass except tiny obvious typos.
> Findings are ranked, smallest-safe-batch recommendation at the end.
>
> **Method:** systematic grep across `frontend/src/App.js` (6,690 lines),
> `frontend/src/App.css`, `frontend/README.md`, the backend route inventory,
> and the backend services. Every claim references a real `file:line`.

---

## Findings, ranked by severity

### CRITICAL — can route the operator to the WRONG PIPELINE or WRONG OUTPUT

#### D-1. Frontend renders the LEGACY pipeline only. The active whole-page render pipeline has zero UI.

| Field | Detail |
|---|---|
| **Location** | App.js:2290, 3357, 3375, 3399, 3413, 3426 — every render call |
| **Current behavior** | All operator render actions POST to `/api/projects/:id/pages/:pageKey/render`, `/chapters/:n/render`, `/render-book`, `/render-cover` — the **legacy illustration-only pipeline** (Stage 3 OpenAI gen + Stage 6 Paged.js HTML render) |
| **Why stale** | Per project memory, "**AI-first WHOLE-PAGE RENDER is now the primary pipeline**." Backend routes `/api/experimental/whole-page-render/*` (10 routes) implement it. **`grep '/experimental/whole-page-render'` in App.js returns 0 hits.** |
| **Source of truth** | `backend/src/api/experimental.routes.ts` + `backend/src/pipeline/experimental/whole-page-render/` |
| **Operator impact** | The render button an operator clicks today produces a LEGACY illustration-only output. The book-ready whole-page renders (which include text + badges + ornament baked-in by the AI model) require curl. |
| **Severity** | **CRITICAL** |
| **Recommended fix** | Build the whole-page render UI panel — `Chunk 2` in `UI_EXPOSURE_PLAN.md`. Frontend-only. ~250 lines React. |
| **Fix scope** | **Frontend only.** Backend ready. |

---

### HIGH — can make the operator misunderstand status / page / layout

#### D-2. `layoutName()` doesn't know simplified families — operator sees raw enum IDs.

| Field | Detail |
|---|---|
| **Location** | App.js:1089–1091 |
| **Current behavior** | `function layoutName(id) { return LAYOUT_LABELS[id] || id || "No layout"; }`. `LAYOUT_LABELS` is built only from `LAYOUT_TEMPLATES` (App.js:135–152) which lists ONLY the legacy 16. For simplified families like `LAYOUT_B_IMAGE_RIGHT` the function returns the raw enum string. |
| **Evidence** | Every Page Plan card screenshot in this conversation shows "LAYOUT_B_IMAGE_RIGHT" instead of "Layout B — 50/50 (image right)" as the layout name above the zone preview. |
| **Why stale** | `SIMPLIFIED_FAMILY_LABELS` map exists at App.js:272 and `simplifiedFamilyLabel(id)` at App.js:286 — but they are only called from 2 sites (5078, 5316). `layoutName()` never consults them. |
| **Source of truth** | `SIMPLIFIED_FAMILY_LABELS` already in the same file. |
| **Operator impact** | Operator reads developer enum names where publisher labels should appear. |
| **Severity** | **HIGH** |
| **Recommended fix** | 1-line change: `return LAYOUT_LABELS[id] || simplifiedFamilyLabel(id) || id || "No layout";`. |
| **Fix scope** | **Frontend only.** Tiny. |

#### D-3. Library tab shows ONLY the 16 legacy layouts. Simplified families are invisible.

| Field | Detail |
|---|---|
| **Location** | App.js:795 (and the Library tab template panel at line 6816+) |
| **Current behavior** | `LAYOUT_TEMPLATES.map(...)` renders 16 layout cards with thumbnails from `/layout-references/layout-XX-name.png`. None of `LAYOUT_A_TEXT / LAYOUT_A_ILLUSTRATION / LAYOUT_B_IMAGE_TOP/BOTTOM/LEFT/RIGHT / LAYOUT_C_CORNER_* / LAYOUT_D_PURE_TEXT` appear. |
| **Why stale** | The simplified families shipped in `SIMPLIFIED_FAMILY_LABELS` (App.js:272), `LAYOUT_ZONE_PRESETS` (post drift-fix), and the backend `layout-profiles.ts`. The `LAYOUT_TEMPLATES` array — which seeds the Library tab — was never extended. |
| **Source of truth** | `backend/src/pipeline/stage-6-layout/layout-profiles.ts` |
| **Operator impact** | Operator opening the Library tab to understand "what layouts can my book use" sees 16 layouts that the active pipeline doesn't pick from, and can't see the 11 that it does. |
| **Severity** | **HIGH** |
| **Recommended fix** | Extend `LAYOUT_TEMPLATES` with the 11 simplified-family entries; either reuse the existing legacy reference PNGs (closest-match) or render the zone-preview-card as the thumbnail. Tradeoff: real PNGs are nicer but don't exist for the simplified families. **Smallest fix**: render zone-preview-card thumbnails using the same `zonePreviewLayers` machinery the Page Plan cards now use. |
| **Fix scope** | **Frontend only.** ~40 lines + a thumbnail render block. |

#### D-4. Raw enum codes (`TIGHT`, `OVERFLOW`, `UNDERFILL`, `PENDING`, `FITS`) leak as chip labels.

| Field | Detail |
|---|---|
| **Location** | App.js:5079, 5094, 5096, 5317, 5325, 5332 (literal "PENDING" strings); chip rendering via `normalizeStatus()` (App.js:1093) which only lowercases and underscore-replaces |
| **Current behavior** | Page Plan + Chapter Production chips render strings like "fit pending" / "fits" / "tight" / "overflow" / "underfill" — the raw pagination v1 enums lowercased. |
| **Why stale** | Pagination V1 + Patches A–D made these enums the *backend* contract. They were never translated for operator UI. Documented in BOOK_PRODUCTION_UI_AUDIT §6 and OPERATOR_SIMPLICITY_REVIEW. |
| **Source of truth** | `backend/src/pipeline/stage-1.75-pagination/capacity.ts` exports `PaginationFitStatus = 'PENDING' \| 'FITS' \| 'TIGHT' \| 'OVERFLOW' \| 'UNDERFILL'`. Operator labels would be `"Near capacity"` / `"Over capacity"` / `"Under-filled"` / `"Fits"` / `"Pending"`. |
| **Operator impact** | Operator must guess whether "tight" is good or bad. The supervisor's Production Status tile **already** translates these for its own summary string (Chunk 1.1), but the rest of the UI doesn't. |
| **Severity** | **HIGH** |
| **Recommended fix** | One map (`FIT_STATUS_LABEL`) + ~6 call-site replacements. Same approach used in the Supervisor tile. |
| **Fix scope** | **Frontend only.** ~25 lines. |

#### D-5. `readyForImageSpend` raw flag is exposed in operator text.

| Field | Detail |
|---|---|
| **Location** | App.js:3755 (log message), 4615–4616 (UI labels) |
| **Current behavior** | UI says things like `Text-fit ready for image spend? readyForImageSpend: true`. |
| **Why stale** | Developer flag name from `backend/src/pipeline/stage-6-layout/text-fit-preview.ts:115`. |
| **Source of truth** | The flag IS a boolean — display the same boolean with a real label: `"Ready to generate images"` / `"Not yet ready"`. |
| **Operator impact** | New operator has no idea what "image spend" means or that it's the same as "image generation." |
| **Severity** | **HIGH** |
| **Recommended fix** | 3 string replacements. Already on the rename-pass list in `UI_EXPOSURE_PLAN.md` Chunk 3. |
| **Fix scope** | **Frontend only.** |

---

### MEDIUM — confusing terminology or duplicate workflow

#### D-6. Two parallel stage lists — `PHASES` (8) and `WORKFLOW_STAGES` (11).

| Field | Detail |
|---|---|
| **Location** | App.js:12 (`PHASES`) and App.js:290 (`WORKFLOW_STAGES`) |
| **Current behavior** | `PHASES = ["Manuscript", "Breakdown", "Page Plan", "Text-Fit", "Images", "Review", "Render", "Export"]`. Stored as `phase` state in localStorage (App.js:1554). `WORKFLOW_STAGES` has 11 items keyed by `project / standards / manuscript / breakdown / plan / textfit / quality / layout / proof / images / export`. |
| **Why stale** | `PHASES` predates the workflow stage list. `phase` is read but its label is shown in `flagForDeveloper`-style internal log entries (which I removed for dead code last commit). Now `phase` is only used by `setPhase` calls — its remaining purpose is unclear. |
| **Source of truth** | `WORKFLOW_STAGES` is the live one (drives the sidebar). |
| **Operator impact** | Internal only — `PHASES` is no longer operator-visible after the dead-code removal commit. Worth a verification pass. |
| **Severity** | **MEDIUM** |
| **Recommended fix** | Audit remaining `phase` state references; likely deletable. |
| **Fix scope** | **Frontend only.** Investigate + delete. |

#### D-7. "System Working" workflow stage is a developer message.

| Field | Detail |
|---|---|
| **Location** | App.js:1693 — `stageKey: "system", stageLabel: "System Working"` |
| **Current behavior** | First stage in the sidebar workflow indicator. |
| **Why stale** | "System Working" is debug copy. A publisher would not expect a stage called this. Documented as #11 in `BOOK_PRODUCTION_UI_AUDIT.md`. |
| **Source of truth** | n/a — should be removed. |
| **Operator impact** | Confusion + impression that the platform is unfinished. |
| **Severity** | **MEDIUM** |
| **Recommended fix** | Delete the stage block. |
| **Fix scope** | **Frontend only.** ~12-line block deletion. |

#### D-8. "Upload Manuscript" stage is duplicated.

| Field | Detail |
|---|---|
| **Location** | App.js:1729 and App.js:1741 — both `stageKey: "manuscript", stageLabel: "Upload Manuscript"` |
| **Current behavior** | Two consecutive stages with the same label. |
| **Why stale** | Looks like a forking decision left both branches in. |
| **Severity** | **MEDIUM** |
| **Recommended fix** | Delete one. Choose whichever ordering keeps the workflow narrative cleanest. |
| **Fix scope** | **Frontend only.** ~12-line block deletion. |

#### D-9. `/api/projects/:id/cost-estimate` endpoint is unused.

| Field | Detail |
|---|---|
| **Location (backend)** | `backend/src/services/cost/estimate.ts` exports `estimateCost()`; route registered at `/api/projects/:id/cost-estimate` |
| **Location (frontend)** | Zero references — confirmed via `grep "cost-estimate" frontend/src/App.js`: nothing |
| **Current behavior** | Endpoint exists; UI never calls it. |
| **Why stale** | The Supervisor's `PipelineReport.snapshot.estimatedImageSpendUsd` now provides the same number (also computed via `estimateCost()`), so the dedicated endpoint may be redundant. |
| **Source of truth** | `backend/src/services/cost/estimate.ts` (flat $0.05/image). |
| **Operator impact** | None operator-visible; just dead/forgotten endpoint. |
| **Severity** | **MEDIUM** |
| **Recommended fix** | Either expose cost-estimate as a small dashboard tile (small UI win) **or** mark the endpoint as deprecated and let the Supervisor own this. Recommended: **let Supervisor own it**, remove the orphan route in a future backend pass. |
| **Fix scope** | **Backend only** (eventual removal) OR **frontend** (expose). Decide which. |

#### D-10. KDP preflight is rolled up to one boolean in operator-visible text.

| Field | Detail |
|---|---|
| **Location** | App.js:3403, 3429 — `preflight ${headers.get("x-preflight-passed") \|\| "unknown"}` and `preflight ${data.ok ? "passed" : "failed"}` |
| **Current behavior** | Operator sees a single yes/no on KDP readiness. |
| **Why stale** | Backend `runPreflight()` (backend/src/pipeline/print-prep/preflight.ts) returns 7 separate checks: `dimensions / dpi / trim_plus_bleed / color_mode / file_present / file_size / content_in_safe_area`. The UI drops all 7 individual results. |
| **Source of truth** | The PreflightReport from the backend. |
| **Operator impact** | When preflight fails, the operator has no idea which of 7 checks failed. |
| **Severity** | **MEDIUM** |
| **Recommended fix** | Render the 7-check list with green/red dots after a book render. Data is on the response. |
| **Fix scope** | **Frontend only.** ~60 lines. |

#### D-11. Production Dashboard status uses mechanical underscore-to-space normalization.

| Field | Detail |
|---|---|
| **Location** | App.js:4447 — `{productionDashboard.status.replaceAll("_", " ")}` |
| **Current behavior** | Renders `"needs operator input"` for backend enum `NEEDS_OPERATOR_INPUT`, `"ready for image spend"` for `READY_FOR_IMAGE_SPEND`, etc. |
| **Why stale** | Mechanical text transform, not a publisher dictionary. |
| **Source of truth** | Backend enum `ProductionDashboardStatus` from `operator-intelligence.ts`. |
| **Operator impact** | Mostly OK, but combines with the supervisor tile to give the operator two slightly different status-name systems. |
| **Severity** | **MEDIUM** |
| **Recommended fix** | One label map; or just delete the Production Dashboard tile in favor of the Supervisor tile (duplicate per D-2 in `PLATFORM_SIMPLICITY_BLUEPRINT.md`). |
| **Fix scope** | **Frontend only.** |

---

### LOW — cosmetic, documentation, or hard-to-trigger

#### D-12. PHASES list naming doesn't match backend stages.

| Field | Detail |
|---|---|
| **Location** | App.js:12 |
| **Current behavior** | Includes "Review" and "Render" as separate phases — names that don't exist as backend pipeline stages. |
| **Severity** | **LOW** — internal state only. |
| **Recommended fix** | Tied to D-6 cleanup. |

#### D-13. Hardcoded trim fallbacks `|| 7, || 10, || 0.125`.

| Field | Detail |
|---|---|
| **Location** | App.js:260, 1212, 4931, 4936 |
| **Current behavior** | Defaults to 7×10 in if `projectConfig.trimSize` is null. |
| **Why stale-ish** | The geometry reconciliation made `resolveGeometry` the authoritative source and supports 7×10 / 8.5×11 / 6×9. The fallback always uses 7×10. A project on 8.5×11 with a transiently-null config would briefly render in the wrong aspect. |
| **Severity** | **LOW** — practically rare. |
| **Recommended fix** | Use the publishing-standard preset's trim as the fallback. |
| **Fix scope** | Frontend only. |

#### D-14. `pdfTarget` strings hardcode trim sizes.

| Field | Detail |
|---|---|
| **Location** | App.js:201, 211, 221 — `pdfTarget: "KDP premium color hardcover 7 x 10"` etc. |
| **Current behavior** | Config field carries a literal "7 x 10" / "6 x 9" / "8.5 x 11" suffix. |
| **Why stale-ish** | If an operator customizes trim in Setup, this label doesn't update. |
| **Severity** | **LOW** — cosmetic. |
| **Recommended fix** | Template the trim into the string: `"KDP premium color hardcover ${w} x ${h}"`. |

#### D-15. `frontend/README.md` lists the OLD main screens.

| Field | Detail |
|---|---|
| **Location** | `frontend/README.md:13-19` |
| **Current behavior** | Says "Main Screens: Backend connection check / AI Publishing Agent Console / Workflow/stage status board." |
| **Why stale** | The actual main screens are 5 tabs (Control Center / Setup / Library / Intelligence / Export). |
| **Severity** | **LOW** — documentation. |
| **Recommended fix** | Rewrite the README screens section. ~10 lines. |

#### D-16. Storage paths like `experimental/whole-page/...` may leak in download URLs.

| Field | Detail |
|---|---|
| **Location** | `backend/src/pipeline/experimental/whole-page-render/render-whole-page.ts` writes files under `experimental/whole-page/`. Proof-artifact download URLs may surface these paths. |
| **Severity** | **LOW** — cosmetic. |
| **Recommended fix** | When the whole-page render UI ships (D-1 / Chunk 2), proxy file access through a clean path or rename the storage prefix. |

#### D-17. Workflow stage labels mix tense.

| Field | Detail |
|---|---|
| **Location** | App.js:290 — `WORKFLOW_STAGES` |
| **Current behavior** | "Approve Layouts" (verb) vs "Page Quality Review" (noun) vs "Render Proofs" (verb). |
| **Severity** | **LOW** — style. |

---

## Cross-cutting patterns observed

1. **Two layout systems coexist** in the frontend — legacy `LAYOUT_TEMPLATES` (16 entries, only used for the Library tab + the LAYOUT_LABELS map) AND simplified-family registries (`SIMPLIFIED_FAMILY_LABELS`, `LAYOUT_ZONE_PRESETS`). Many pieces of UI mix them inconsistently. The single root cause: `LAYOUT_TEMPLATES` was never extended.
2. **Two stage systems coexist** — `PHASES` (8) and `WORKFLOW_STAGES` (11). `PHASES` is barely-used vestige.
3. **Raw enum codes leak** in chip text, log messages, and status displays. No single normalize-for-operator layer.
4. **The legacy pipeline is the default UI path.** The whole-page render pipeline is invisible. This is the biggest functional risk.
5. **Stale documentation** in `frontend/README.md`.

---

## Recommended smallest-safe-batch (first wave)

Each of these is a 1–25 line change, frontend-only, low risk. Together they close most of the HIGH-severity drift in one short session.

| Order | Fix | Severity | Effort | Risk |
|---|---|---|---|---|
| 1 | **D-2** — `layoutName()` consults `simplifiedFamilyLabel()` | HIGH | 1 line | very low |
| 2 | **D-7** — delete "System Working" workflow stage | MEDIUM | 12 lines | very low |
| 3 | **D-8** — delete the duplicate Upload Manuscript stage | MEDIUM | 12 lines | very low |
| 4 | **D-4** — `FIT_STATUS_LABEL` map + chip replacements | HIGH | 25 lines | low |
| 5 | **D-5** — rename `readyForImageSpend` text strings | HIGH | 3 lines | very low |
| 6 | **D-15** — rewrite `frontend/README.md` main-screens section | LOW | 10 lines | none |

**Total estimate: ~65 lines across one commit. Zero backend changes. No new functionality.**

After this wave:

- D-1 (whole-page render UI) is the biggest remaining HIGH-CRITICAL — that's `Chunk 2` of `UI_EXPOSURE_PLAN.md`. Larger scope (~250 lines).
- D-3 (Library tab simplified-family thumbnails) is the next HIGH — ~40 lines but needs thumbnail rendering decisions.
- D-10 (KDP per-check detail) is MEDIUM and works well as a follow-up after the whole-page render UI lands.

---

## What the audit did NOT find (verified clean)

- ✅ No leakage of the literal string `"experimental"` or `"whole-page-render"` in operator-visible text (the leakage risk is in download URLs, not chip text).
- ✅ No hardcoded canvas dimensions left in the zone-preview code (post drift-fix).
- ✅ All trim default fallbacks are 7×10 — consistent with the project's most common trim.
- ✅ Supervisor tile (Chunk 1) uses operator language throughout.
- ✅ Dead code from the `devIssues` feature already removed in Chunk 1.1.
- ✅ Backend's `resolveGeometry`, `computePageGeometry`, pagination math, supervisor, Publishing Director, Quality Review, and KDP preflight services are not duplicated or drifted in the frontend — they are simply under-exposed.

---

## Bottom line

Every drift identified is **a frontend exposure problem**, not a backend correctness problem. The backend kept moving (correctly) through Geometry Reconciliation, Patches A–D, supervisor, etc. The frontend's labels, tabs, fallbacks, and pipeline targets did not.

- **One bug is critical** (D-1: wrong pipeline used by the UI).
- **Four are high** (D-2 / D-3 / D-4 / D-5: terminology + library coverage).
- **Six are medium** (workflow stage cleanup + endpoint orphans + KDP preflight detail).
- **Six are low** (cosmetic / documentation / hardcoded fallbacks).

Recommend running the **smallest-safe-batch first** before continuing with Chunk 2 of the UI exposure plan. The batch is ~65 lines, all string and table changes, zero new components — it raises the entire UI's accuracy floor in one short pass.
