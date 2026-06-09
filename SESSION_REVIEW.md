# Session Review — Five-Lens Audit

> Applied to: everything shipped in this session (Geometry reconciliation,
> Patches A–D, Frontend polish, Audit documents, Book Production Supervisor)
> plus the surrounding code each change participates in.
>
> **Lens framework:** Technical Quality · Operator Experience · Automation
> Readiness · Publishing Workflow Fit · Enterprise Readiness.
>
> **Benchmark question:** *If a new employee sat down tomorrow and was told to
> publish Chapter 3, would the work shipped this session make their job
> easier or harder?*

This document records issues found while reviewing each shipped feature
through the five lenses, what was fixed inline this session, and what
remains as recommended follow-up.

---

## Index

1. [Book Production Supervisor (this session's deliverable)](#1-book-production-supervisor)
2. [Patches A–D (pagination calibration)](#2-patches-ad--pagination-calibration)
3. [Geometry reconciliation](#3-geometry-reconciliation)
4. [Frontend polish](#4-frontend-polish)
5. [Audit documents](#5-audit-documents)
6. [Cross-cutting findings](#6-cross-cutting-findings)
7. [Workspace hygiene](#7-workspace-hygiene)
8. [Recommended follow-ups (prioritized)](#8-recommended-follow-ups)

---

## 1. Book Production Supervisor

### 1.1 What shipped

- `services/book-supervisor/policy.ts` — single editable threshold table
- `services/book-supervisor/types.ts` — PipelineReport / snapshot / next-action contract
- `services/book-supervisor/supervisor.ts` — 8-stage orchestrator
- `services/book-supervisor/director-auto-apply.ts` — safe-only Director executor
- `api/supervisor.routes.ts` — `POST /api/projects/:id/run-pipeline`
- Tests + verification script (`scripts/run-supervisor.ts`)

### 1.2 Issues found and **fixed in this pass**

| # | Issue | Lens | Fix |
|---|---|---|---|
| S-01 | Dead code: `compactedTotal` block computed `sum * 0 + 0` then `void`'d — held a stub comment claiming it was "structural". | Technical Quality | Replaced with a real per-chapter sum invariant: per-chapter fit counts must equal `totalPages`; mismatch surfaces as BLOCKER. |
| S-02 | Pagination summary used dev jargon (`FITS / TIGHT / OVERFLOW / UNDERFILL`), contradicting BOOK_PRODUCTION_UI_AUDIT §6. | Operator Experience | Translated PASS summary to plain language: "289 pages — 231 fit comfortably, 54 near capacity, 1 over capacity, 3 under-filled." Raw codes still in `metrics` for the UI to map. |
| S-03 | `executeAction` for `switch_layout` returned `null` silently — operator had no signal that a fix existed and was deliberately reserved. | Automation Readiness · Operator Experience | Caller now adds an explicit `skippedNotAllowed` row with the rationale *"action kind is allowed but reserved by v1 supervisor (mutation seam not yet wired)"*. Test updated. |
| S-04 | `verification-ready` required-stage list omitted `publishing-director`. A BLOCKED ledger would still surface as a finding, but the gate didn't require it explicitly. | Automation Readiness | Added `publishing-director` to the required list with an explanatory comment. |
| S-05 | `Partial<SupervisorPolicy>` made nested fields required (TS strictness). The test fixture had to construct full nested objects. | Technical Quality | New `SupervisorPolicyOverride` deep-partial type. Callers can now tweak one threshold without restating the section. |

### 1.3 Lens read-out (post-fix)

| Lens | Score | Notes |
|---|---|---|
| Technical quality | ✅ | tsc clean; 450 + 8 supervisor tests pass; invariant check added; no silent skips. |
| Operator experience | ⚠ | The endpoint exists but **no UI calls it yet** — by design (next session). A direct API user gets the right data; an operator clicking around the UI doesn't see it. |
| Automation readiness | ✅ | Thresholds centralized; every stage returns structured findings + verdict; nextAction is one-CTA-shaped. The Supervisor can drive automation; the loop just needs UI wiring. |
| Publishing workflow fit | ✅ | One call answers "where is this book in the pipeline?" and "what does the operator do next?". Both questions previously required reading 3–5 panels. |
| Enterprise readiness | ⚠ | Endpoint is undocumented in `/api/docs` for operators (it IS in Swagger via the route schemas). README mention missing. Recommend a short `services/book-supervisor/README.md` next session. |

### 1.4 New-employee test

*Question:* Could a new employee call `POST /api/projects/:id/run-pipeline`,
read the response, and know to either (a) lift the OpenAI billing limit or
(b) resolve an overflow page? **Yes — provided they know the endpoint
exists.** That's the discoverability gap the next session's UI work closes.
Backend-wise: easier, not harder.

---

## 2. Patches A–D — pagination calibration

### 2.1 What shipped

Patches A → D cleared every paginator-side OVERFLOW. Final live state: 1
OVERFLOW (the compacted page CH06_P006_m — outside Patch B/C/D scope by
design).

### 2.2 Issues found

| # | Issue | Lens | Status |
|---|---|---|---|
| P-01 | The 1 remaining OVERFLOW (CH06_P006_m) is "by design" but the operator has **no UI path** to mark it intentional — even though the Director ledger supports `mark_intentional` as an action. | Operator Experience | Recommend (see §8). Backend supports it; just isn't reachable. |
| P-02 | `paginate.ts` calls `resolveGeometry()` and `paginate.integration.test.ts` was updated for the engine's new `partsByEntry` accounting. Both correct. | Technical Quality | ✅ no action |
| P-03 | The `entry-rebalance.ts` was added with separate Patch B / C / D commits. The file header now reflects all three. | Technical Quality | ✅ already done |
| P-04 | Diagnostic script (`scripts/diagnose-rebalance.ts`) was created mid-Patch-C investigation. It's a useful **reusable pattern** for future paginator debugging but was left untracked. | Enterprise Readiness | Recommend committing (small, documented, scoped to one entry's shape). See §7. |
| P-05 | The `redistribute()` signature changed across patches (B: takes `targetParts`; C: takes `targetsByPart`; D: takes `targetsByPart + capacitiesByPart`). All call sites are updated, but a future reader sees the v1 signature in old commits. | Technical Quality · Enterprise Readiness | ⚠ document the API evolution in a top-of-file comment (already partially there). Acceptable. |

### 2.3 Lens read-out

| Lens | Score | Notes |
|---|---|---|
| Technical quality | ✅ | 437 → 442 tests, all green. Algorithm correctness verified live (OVERFLOW 7→11→15→8→1). |
| Operator experience | ⚠ | The math is right but **CH06_P006_m visibility** is operator-friction. Surfaces in the Supervisor's `operatorReviewPages` snapshot — fix is downstream UI work. |
| Automation readiness | ✅ | The supervisor reads pagination state and gates correctly. Threshold (`overflowMax: 2`) accommodates the by-design outlier. |
| Publishing workflow fit | ✅ | Operator no longer has to triage 7–15 OVERFLOW pages per book; just one. |
| Enterprise readiness | ⚠ | A new reader sees PATCH A/B/C/D commits without an index. A `pipeline/stage-1.75-pagination/SPEC_PAGINATION_PATCHES.md` would help — but the commit messages are detailed enough that this is P3. |

---

## 3. Geometry reconciliation

### 3.1 What shipped (previous + earlier in this session)

Single source of truth (`resolveGeometry`), box-model fix, hardening
(required `canvasIn` in 4 production-adjacent helpers), 7×10 integration
guardrail.

### 3.2 Issues found

| # | Issue | Lens | Status |
|---|---|---|---|
| G-01 | The verification script (`scripts/verify-live-geometry.ts`) is a great pattern — exactly the kind of "test the deployment" tooling the platform should have. **Not advertised** in any operator doc. | Enterprise Readiness | Recommend a top-level `SETUP.md` or `OPERATIONS.md` that lists the dev scripts. |
| G-02 | `SUPPORTED_TRIMS` constant in `publishing-standard/geometry.ts` lists `[6×9, 7×10, 8.5×11]`. The shared schema's presets list FOUR (the fourth is `KINDLE_DIGITAL` 6×9 bleed 0). Reading both, they reconcile (bleed isn't in supported-trim equality), but the apparent mismatch is a future-reader risk. | Technical Quality | Recommend a one-line comment in either file linking the two. |
| G-03 | The `SPACING.canvasIn` constant in `publishing-standard/standard.ts` is still there for legacy callers (just no production paths use it). | Technical Quality | Acceptable — flagged in earlier audit. Not removing this session per "don't touch what works." |

### 3.3 Lens read-out

| Lens | Score | Notes |
|---|---|---|
| Technical quality | ✅ | tsc clean; 437 tests green throughout; required-param hardening prevents regression. |
| Operator experience | ✅ | Trim choice now actually flows through to print canvas. Multi-trim is real. |
| Automation readiness | ✅ | Supervisor reads resolved geometry from project config. Threshold-friendly. |
| Publishing workflow fit | ✅ | Operator can pick 7×10 / 8.5×11 / 6×9 and the engine respects it end-to-end. |
| Enterprise readiness | ⚠ | The `SUPPORTED_TRIMS` constant lives in one file; it should be the operator-visible list. Acceptable for now. |

---

## 4. Frontend polish

### 4.1 What shipped

Two-pass design-system polish on `App.css` (174 hex literals → tokens,
typography weights normalized to Inter's 500/600, refined surfaces).

### 4.2 Issues found

| # | Issue | Lens | Status |
|---|---|---|---|
| F-01 | `App.js` itself was deliberately NOT touched — 6,763 lines of single-file React with the wrong terminology baked in (per BOOK_PRODUCTION_UI_AUDIT §6). The polish is real but operator-facing strings are unchanged. | Operator Experience | Documented in audits. P0 next session. |
| F-02 | The polish added Inter via `rsms.me` import + Google Fonts. **First load may flash** if those CDNs are slow. Preconnect hints are added to `index.html` to mitigate. | Technical Quality | Acceptable. Document in a `frontend/README.md` if it doesn't already mention it. |
| F-03 | The shadcn libs are installed but no `components/` directory is scaffolded. The polish layered on top of the existing CSS so a future shadcn migration drops in cleanly. | Technical Quality · Automation Readiness | Acceptable — by design. |

### 4.3 Lens read-out

| Lens | Score | Notes |
|---|---|---|
| Technical quality | ✅ | Build clean three times; no React touched; bundle grew modestly (12.8→79.9 KB CSS minified). |
| Operator experience | ⚠ | Looks professional now. **But** terminology is unchanged (TIGHT / readyForImageSpend still leak). Per BOOK_PRODUCTION_UI_AUDIT P0 #4. |
| Automation readiness | n/a | Frontend doesn't yet call the supervisor. |
| Publishing workflow fit | ⚠ | Polish doesn't change discoverability. The 32–40-click chapter-approval flow still takes 32–40 clicks. |
| Enterprise readiness | ⚠ | A new employee sees a polished UI that hides depth. The polish raised the "professional veneer" score; discoverability score is unchanged. |

---

## 5. Audit documents

### 5.1 What shipped

`BOOK_AUTOMATION_ROADMAP.md` (~470 lines) + `BOOK_PRODUCTION_UI_AUDIT.md` (~430 lines).

### 5.2 Issues found

| # | Issue | Lens | Status |
|---|---|---|---|
| A-01 | The roadmap's P0 list proposed (1) `policy.ts`, (2) `run-pipeline` endpoint, (3) Director auto-apply, (4) pre-flight budget guard. **All 4 are shipped this session.** | Automation Readiness | ✅ — Update roadmap status (recommended below). |
| A-02 | The UI audit listed 12 dev-terminology issues. The new supervisor uses operator-language in summaries (post-fix S-02) but **the rest of the platform doesn't.** | Operator Experience | Recommend a UI terminology pass before the chapter-3 employee test would pass. |
| A-03 | The roadmap mentions a future "Render QA agent" for content-level checks (Lorem-ipsum detection, badge legibility). Not built — supervisor's image-gen path will need this when `with-spend` is implemented. | Automation Readiness | Document as the next session's P1. |
| A-04 | The roadmap describes Director auto-apply as binary on/off. The actual implementation has an **allow-list of action kinds** (more granular). Roadmap text should be updated to match. | Technical Quality · Enterprise Readiness | Minor — recommend at next roadmap refresh. |

### 5.3 Lens read-out

| Lens | Score | Notes |
|---|---|---|
| Technical quality | ✅ | Both docs reference real files / routes / line numbers. |
| Operator experience | n/a | Internal/team-facing docs. |
| Automation readiness | ✅ | P0 items executed = roadmap is now actionable, not aspirational. |
| Publishing workflow fit | ✅ | These docs are the trail for "why the platform looks like this." |
| Enterprise readiness | ✅ | A new employee reading these gets calibrated expectations. |

---

## 6. Cross-cutting findings

### 6.1 Duplicated functionality

| Surface | Duplicate | Recommendation |
|---|---|---|
| **Budget gating** | Backend now has supervisor's `budget-preflight`. Frontend still has the legacy `PAID_ACTION_WARNING` confirm dialog. | Deprecate the frontend confirm in the next UI pass; the supervisor's budget guard is authoritative. |
| **Geometry reads** | `computePageGeometry` is called in 13 places. Most route through `resolveGeometry(config).trimSize` per the reconciliation. Some legacy callers (`render-chapter.ts` etc.) use `config.trimSize` directly. | Acceptable — the production hot path is correct. Convert legacy callers when their stages get touched. |

### 6.2 Hidden functionality

| Capability | Where it lives | Operator visibility |
|---|---|---|
| Publishing Director decision ledger | `POST` (build) / `GET` endpoints exist; UI state wired (`App.js:1422`) | Not surfaced as a primary view |
| Operator Intelligence per chapter | Endpoint exists; chapter-card uses it | Behind chapter selection |
| Cost estimate | Endpoint exists | Only inside chat agent text |
| Production dashboard | Endpoint exists; state in `App.js:1463` | Drives dashboard tiles only |
| Supervisor pipeline run | `POST /api/projects/:id/run-pipeline` — shipped this session | **No UI yet** — by design |

### 6.3 Confusing workflows

| Surface | Issue | Recommendation |
|---|---|---|
| Chapter approval | 32–40 clicks for 8 chapters | Bulk approval (UI audit P1 #6) |
| Verification batch | Concept doesn't exist as a named UI surface | UI audit P0 #3 |
| "Why is this page OVERFLOW?" | Chat agent can answer; operators don't know to ask | Promote chat agent (UI audit P0 #5) |

### 6.4 Dead code / unnecessary complexity

| Location | Issue | Status |
|---|---|---|
| `supervisor.ts:295` (now fixed) | `compactedTotal = sum * 0 + 0` then `void` | ✅ Fixed in S-01 |
| `executeAction` `switch_layout`/`apply_repeating_accent` returning `null` | (now fixed) Silent skip | ✅ Fixed in S-03 |
| `backend/scripts/` untracked older session scripts (`db-probe`, `correct-and-verify-geometry`, `utilization-report`, `visualize-geometry`) | From an older session per the original handoff; not authored this session | Recommend reviewing for commit-or-delete next operations session |

### 6.5 Naming inconsistencies (operator-facing strings)

Per BOOK_PRODUCTION_UI_AUDIT §6 table — still pending. None resolved this
session except the supervisor's PASS summary (S-02).

### 6.6 Missing audit visibility

| What's not visible to the operator | Where it should appear |
|---|---|
| The fact that a page was `mark_intentional`'d | Supervisor `autoFixes` field — surfaced. But no UI yet. |
| The reason a `switch_layout` was reserved | Now surfaces in `skippedNotAllowed` (post S-03 fix) |
| Per-chapter pagination breakdown | `report.snapshot` doesn't include it, but `getPaginationReport().perChapter` does. **Add to snapshot in a future iteration.** |

### 6.7 Missing automation opportunities

| Opportunity | Status |
|---|---|
| Director auto-apply for `switch_layout` (mutation through `forcePageLayoutAndReplan`) | Reserved in code; recommend operator opt-in once UI exposes the supervisor's ledger preview |
| Auto-rerun on transient stage failures | Not present; would help on Railway cold-starts and Claude rate limits |
| Cost-event ledger linkage from supervisor's budget-preflight | Not wired — supervisor estimates but doesn't write to `intelligence/cost-events` |

---

## 7. Workspace hygiene

### Issues found and **fixed in this pass**

| # | Issue | Fix |
|---|---|---|
| H-01 | Repo had 7+ stale session-byproduct files at the root (`forensic_*.txt`, `batch2*.png`, `render_*.png`, `backend/geometry-audit.*`, `backend/utilization-report.png`, `graphify-out/`). | Extended `.gitignore` with explicit rules. |
| H-02 | `scripts/run-supervisor.ts` (the supervisor acceptance-test script) untracked. | Will commit. |

### Recommended for the next operations session

| # | Issue | Recommendation |
|---|---|---|
| H-03 | Older session scripts `backend/scripts/{db-probe, correct-and-verify-geometry, utilization-report, visualize-geometry, diagnose-rebalance}.ts` untracked. | Review each: commit useful diagnostic patterns; delete one-shots. |

---

## 8. Recommended follow-ups (prioritized)

Items NOT done this session but identified by the audit. Bucketed by lens
+ priority.

### P0 — must do before "publish Chapter 3" employee test passes

1. **UI calls the supervisor.** Render `POST /run-pipeline` output as the dashboard hero (`Next Action` tile + Verdict pill). Backend ready; UI wiring is the gap.
2. **Terminology pass on `App.js` and visible strings.** TIGHT → "Near capacity", `readyForImageSpend` → "Ready to generate images", `whole-page-render` → "AI page render", etc. See BOOK_PRODUCTION_UI_AUDIT §6.
3. **Expose `mark_intentional` to the operator** for outliers like CH06_P006_m. Backend supports it; one button + confirmation closes the loop.
4. **Promote the chat agent** to dashboard-primary. It's the strongest "why?" surface and operators don't know it's there.

### P1 — closes the automation loop

5. **Run the verification batch through the supervisor in `with-spend` mode.** Requires: image-gen orchestration + per-page render QA agent (proposed in roadmap §P1 #5).
6. **Backend gate for paid actions** at every API entry point that triggers spend. Today: frontend `PAID_ACTION_WARNING`. Should be supervisor-budget-guard everywhere.
7. **Per-chapter snapshot in `PipelineReport`** — supervisor's snapshot currently rolls up to project totals; add per-chapter breakdown so the UI can render chapter-level supervisor verdicts.

### P2 — discoverability + onboarding

8. **`OPERATIONS.md` at repo root** — list every script in `backend/scripts/`, what it does, what it spends, when to run.
9. **`services/book-supervisor/README.md`** — describe the supervisor's contract, how to add a stage, where the policy lives.
10. **Cost-event linkage**: supervisor writes its budget estimate to `intelligence/cost-events` so it shows up in the Intelligence panel automatically.

### P3 — luxury

11. **Auto-retry on transient stage failures** — supervisor retries with exponential backoff for Claude rate limits and Railway cold-starts.
12. **`switch_layout` opt-in wiring** — operator turns on `policy.director.allowedActions: [...,'switch_layout']` and the supervisor calls `forcePageLayoutAndReplan` directly.

---

## 9. Lens read-out for the session as a whole

The benchmark question: *Would a new employee told to "publish Chapter 3"
tomorrow find their job easier or harder because of this session?*

| Lens | Verdict | Reasoning |
|---|---|---|
| Technical quality | **Easier** ✅ | Geometry correct, pagination correct, supervisor in place, tests + types green throughout. |
| Operator experience | **Same** ⚠ | Frontend looks better; terminology and discoverability unchanged. The supervisor isn't yet UI-visible. |
| Automation readiness | **Significantly easier** ✅ | What was 12 endpoints in 5 panels is now 1 endpoint with 1 report. The next employee can ask "is this book ready?" and get a single answer. |
| Publishing workflow fit | **Easier** ✅ | The book of record is 1 OVERFLOW (a known outlier), polished UI, supervisor-ready pipeline. The first real production run is closer. |
| Enterprise readiness | **Easier** ✅ | Two formal audit documents now anchor the architecture. The supervisor closes the biggest "stop building features, expose them" gap from the audit. |

### What still makes the chapter-3 test fail

The supervisor is built but not surfaced in the UI. Until the dashboard
shows "Verdict: BLOCKED — lift OpenAI billing limit" or "Verdict: PASS —
ready to generate Chapter 3," the new employee still has to know which 4
panels to look at and which 5 buttons to click. That's the **single
biggest** thing the next session should address.

Everything else this session shipped is wins that compound when that
one UI wiring lands.
