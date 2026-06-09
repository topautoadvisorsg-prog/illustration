# Platform Simplicity & Operator Experience Blueprint

> **The mandate:** Stop thinking like a developer. The operator only wants
> to know — *What is happening? What should I do next? Can I do it from here?*
>
> **The benchmark:** If a publishing employee hired tomorrow was told to
> publish Chapter 3, could they do it without a developer? Today: **No.**
> This document maps why and what to do.
>
> **Grounded in code:** every claim references actual file:line. No
> assumptions. No invented features.

---

## Index

- [Phase 1 — Current UI inventory](#phase-1--current-ui-inventory)
- [Phase 2 — Duplication](#phase-2--duplication)
- [Phase 3 — Hidden functionality](#phase-3--hidden-functionality)
- [Phase 4 — Operator journey: publish Chapter 3](#phase-4--operator-journey-publish-chapter-3)
- [Phase 5 — Ideal dashboard](#phase-5--ideal-dashboard)
- [Phase 6 — Supervisor review](#phase-6--supervisor-review)
- [Phase 7 — Future state](#phase-7--future-state)
- [Final answer to the benchmark](#final-answer-to-the-benchmark)

---

## Phase 1 — Current UI inventory

### A. Sidebar (left rail, always visible)

| Section | Items | File:line |
|---|---|---|
| Brand | "Wildlands" + "Publishing Platform" + WL mark | App.js:3789 |
| Top-nav (Views) | 5 tabs: 🛠 Control Center / Setup / Library / Intelligence / Export | App.js:3798–3803 |
| Workflow stages | 12 numbered stages (see below) | App.js:3815–3831 |
| Resources | Asset Desk · Project Files · Activity Log · Settings | App.js:3833–3853 |

**Workflow stage labels** (visible to operator, App.js:1617–1764):

| # | Label | Maps to topnav |
|---|---|---|
| 1 | System Working | control |
| 2 | Project Setup | setup |
| 3 | Publishing Format | setup |
| 4 | Upload Manuscript | control |
| 5 | Upload Manuscript (dup) | control |
| 6 | Review Breakdown | control |
| 7 | Review Page Plan | control |
| 8 | Text-Fit Check | control |
| 9 | Page Quality Review | control |
| 10 | Approve Layouts | control |
| 11 | Render Proofs | control |
| 12 | Manage Images | control |
| 13 | Export Book | export |

> ⚠ Already a problem in this list — stages 4 and 5 are both "Upload Manuscript."
> Stage 1 "System Working" is a developer message, not a publishing step.

### B. Topbar (top of main area)

| Element | Content | File:line |
|---|---|---|
| Eyebrow | "Wildlands Publishing Workspace" | App.js:3859 |
| H1 | "Project Dashboard" | App.js:3860 |
| Actions | "Ask Agent" button · "Advanced" checkbox · "Backend online" / "Backend unchecked" status pill | App.js:3863–3870 |

### C. Main content panels (gated by topNav via `cc-*` CSS classes)

Every panel is tagged with one or more of: `cc-control`, `cc-setup`, `cc-library`, `cc-intel`, `cc-export`. The CSS (App.css:3791–3814) hides any panel not tagged for the current tab.

#### Control Center tab (`cc-control`)

| Panel | What it shows | What you can do | File:line |
|---|---|---|---|
| **Dashboard hero** | Project cover + project name + current step + progress % + metrics tiles (pages / chapters / images / approved) | None inline — informational | App.js:3894 |
| **Current Stage Result** | Prose describing what just happened + a primary CTA button | "Open Result" jump button | App.js:3969 |
| **Operator Grid** (split) | Command panel (left) + Flow panel (right) | Various stage triggers | App.js:4037 |
| · Command panel | Manuscript text + quick actions (Upload / Breakdown / etc.) | Stage trigger buttons | App.js:4038 |
| · Flow panel | Operator log (recent activity) | Read-only log | App.js:4144 |
| **Chat panel** | Conversation with the project chat agent | Type + Send | App.js:4166 |
| **Review board** | Multi-card stack: Operator Guidance → Production Dashboard → Review cards → Decision Ledger → Page Quality Review → Chapter Production → Image Review → Book Parts → Preview Review | Dozens of context-specific buttons | App.js:4200 |

#### Setup tab (`cc-setup`)

| Panel | What it shows | What you can do | File:line |
|---|---|---|---|
| Backend panel (Advanced only) | Backend URL input | Change backend URL | App.js:3875 |
| **Setup panel** | "1. Project Setup" — project list, create new, manuscript upload, publishing standard chooser, format calibration | Pick / create project; choose format | App.js:6143 |
| Two Review cards (also tagged cc-control) | Project intake form + standards ledger | Save fields | App.js:4361, 4410 |

#### Library tab (`cc-library`)

| Panel | What it shows | What you can do | File:line |
|---|---|---|---|
| **Template panel** | 16 Layout Templates with thumbnails (LAYOUT_1_STANDARD through LAYOUT_16_CUTAWAY_FEATURE) | View only | App.js:6744 |
| Asset Library panel | (referenced from sidebar Resources but renders in Control) | Browse assets | (in review-board) |

#### Intelligence tab (`cc-intel`)

| Panel | What it shows | What you can do | File:line |
|---|---|---|---|
| **Intelligence panel** | Standards / Experiments / Decisions / SOPs / Cost events / Print findings — searchable list | Promote experiment → decision; promote decision → standard | App.js:5766 |
| Pipeline grid (Advanced only) | Agent roster + manifest output | Read agent contracts | App.js:6061 |

#### Export tab (`cc-export`)

| Panel | What it shows | What you can do | File:line |
|---|---|---|---|
| Chapter Production panel | Per-chapter render status grid | Render chapter proof | App.js:4834 |
| Book Parts panel | Front cover · Title page · Body · etc. — render-sized parts | Render full book / cover | App.js:5500 |
| Preview Review panel | Last render's PDF preview | Approve / reject preview | App.js:5520 |

#### Floating UI

| Element | What | File:line |
|---|---|---|
| Notice strip | Success / error toast at top of main | App.js:3892 |
| Reject modal | Confirm-before-reject for images | App.js:5196 |
| PAID_ACTION_WARNING | Browser-native `confirm()` before any paid API call | App.js:13, 2349 |

### Inventory totals

- **5 top-nav tabs**
- **12 workflow stages** (one duplicate, one developer-only)
- **~18 distinct panels**
- **~9 panels gated by Advanced Mode**
- **3 places that display "current stage / next action"** — Operator Guidance prose, Production Dashboard tile, Sidebar workflow indicator
- **0 dedicated surface for the Supervisor / Run Pipeline endpoint** (shipped this session, not exposed)
- **0 dedicated surface for the whole-page render pipeline** (the *primary* active pipeline per project memory)

---

## Phase 2 — Duplication

For every duplicate: which one should survive, which should be removed, why.

| # | Duplicated capability | Surface A (file:line) | Surface B (file:line) | Keep | Remove | Why |
|---|---|---|---|---|---|---|
| D-1 | "What stage am I in / what do next?" | Operator Guidance prose (App.js:4216) | Sidebar workflow-stage current indicator (App.js:3815) | **Sidebar (visual, single-glance)** | The 2-3 sentence operator-guidance card | Two surfaces saying the same thing, one wordy. Replace the prose with one big "Next Action" button (the dashboard tile in Phase 5). |
| D-2 | Project-level totals (pages, chapters, images, approved) | Dashboard hero metrics tiles (App.js:3894) | Production Dashboard tile (App.js:4260) | **Production Dashboard** (it's the supervisor-fed surface) | The four hero metric tiles | Hero hits the same numbers from a stale local count; Production Dashboard reads `/api/projects/:id/production-dashboard`. Authoritative wins. |
| D-3 | Publishing Director output | Decision Ledger panel (App.js:4444) | Page Quality Review panel (App.js:4552) | **Page Quality Review** (operator language already) | Decision Ledger | Both render the same backend's findings. Decision Ledger leaks the term "Publishing Director" which means nothing to a publisher. Fold the ledger's *actions* into the Quality Review row. |
| D-4 | Budget / cost gating | Frontend `confirm("This calls a paid external API. Continue?")` (App.js:13) | Supervisor's `budget-preflight` stage (services/book-supervisor/supervisor.ts) | **Supervisor budget-preflight** | The frontend confirm dialog | Frontend confirm is per-button and uses dev language; the supervisor's check is policy-driven and tells the operator the actual dollar estimate vs cap. |
| D-5 | "Upload Manuscript" workflow stage | App.js:1654 | App.js:1666 | **One** | The duplicate (line 1666) | Two identical stages. Pick one; delete the other. |
| D-6 | "Render Chapter Proof" action | Render Proofs workflow stage button (App.js:1745) | Chapter Production panel button (App.js:4834) | **Chapter Production panel** | Workflow-stage-level button | Both call `/api/projects/:id/chapters/:n/render`. The panel context is better because the operator sees which chapter they're on. |
| D-7 | "Book preview" | Operator Preview panel (App.js:6704, Advanced only) | Preview Review panel (App.js:5520) | **Preview Review** | Operator Preview | One is a styled book mock-up, the other is the actual render output. The actual render is what matters. |
| D-8 | "Apply layout override" | Force-Layout button in Page Plan card (Advanced) | Director's `switch_layout` proposal (Decision Ledger) | **Director-proposed** (one source of truth) | Force-Layout button as a separate action | Both ultimately call `/api/projects/:id/pages/:pageKey/force-layout`. Convert Force-Layout to the *acceptance* of a Director proposal so there's one decision trail. |

**Sum:** 8 duplicated capabilities. **All resolvable by exposure / consolidation**, not deletion of backend logic.

---

## Phase 3 — Hidden functionality

Capabilities that exist in code but a new employee cannot find from the UI.

| # | Capability | Backend | UI? | Find / Understand / Use | Simplest exposure |
|---|---|---|---|---|---|
| H-1 | **Run Pipeline / Supervisor** | `POST /api/projects/:id/run-pipeline` (shipped this session) | None | ❌ / ❌ / ❌ | **One tile on the dashboard** rendering the report — see Phase 5. |
| H-2 | **Whole-page render pipeline** (the *primary* active pipeline per project memory) | 10 routes under `/api/experimental/whole-page-render/*` | None | ❌ / ❌ / ❌ | Replace the legacy "Render Proofs" stage with the whole-page render flow. **Biggest gap by impact** — the operator is using the wrong pipeline. |
| H-3 | Render Queue | `GET /api/experimental/whole-page-render/project/:projectId` | None | ❌ / n/a / n/a | A list with status badges (QUEUED / RENDERING / RENDERED / FAILED) under the Render Proofs panel. |
| H-4 | Per-render Print-Prep status | Each whole-page-render row carries `printPdfPath`, `preflightPassed` | Not labeled | ❌ / ❌ / partial | One line "X / Y print-ready" on the same render row. |
| H-5 | KDP preflight detail | `assembleBook()` returns 7 individual checks | Aggregated to one boolean `x-preflight-passed` header | ⚠ / ❌ / ⚠ | Per-check green/red dots after a book render. Data already on the response. |
| H-6 | Decision Ledger | `GET /api/projects/:id/publishing-director/decision-ledger` | State wired at App.js:1422 but no view | partial / ❌ / ❌ | Fold the auto-fixable / needs-decision counts into the Quality Review summary. |
| H-7 | Cost Events | `GET /api/intelligence/cost-events` | None | ❌ / n/a / n/a | A "Spend so far" line on the Production Status tile. |
| H-8 | Intelligence overview | `GET /api/intelligence/overview` | Intelligence tab exists but doesn't call this aggregator | partial / ❌ / partial | Wire it. The Intelligence panel already exists; just fetch this and render. |
| H-9 | Subject + badges recompute | `POST /api/projects/:id/recompute-subject-badges` | curl-only | ❌ / n/a / n/a | Hide it from operator UI; expose only as a Supervisor auto-action. |
| H-10 | Backfill continuation prompts | `POST /api/projects/:id/backfill-continuation-prompts` | curl-only | ❌ / n/a / n/a | Same — keep it as a Supervisor / dev tool. Don't surface to operator. |
| H-11 | Per-page Inspector | `GET /api/projects/:id/pages/:pageKey/inspector` | Wired but called only behind Advanced | partial / ⚠ / partial | Make the inspector the per-page "Why?" surface. Single button on every page card: "Explain this page." |
| H-12 | Format Calibration | `POST /api/projects/:id/chapters/:n/format-calibration` | Wired into Setup panel as "Format Calibration" sub-panel | ✅ / ⚠ / ✅ | Already exposed. Rename "Calibration" → "Format Recommendation." |

**Pattern:** the capability exists; the surface is missing, mislabelled, or buried behind Advanced Mode.

---

## Phase 4 — Operator journey: publish Chapter 3

### Today's click trail (counted from App.js, assumes manuscript already uploaded)

Walking the actual UI for "render and proof Chapter 3, then approve and export."

```
01. Click sidebar workflow stage "Review Page Plan"            (1 click)
02. (If page plan not run) click "Generate Page Plan"          (1 click)
03. PAID_ACTION_WARNING confirm (Claude call)                  (1 click)
04. Wait ~2 min
05. Click sidebar workflow stage "Text-Fit Check"              (1 click)
06. Click "Run Text-Fit for Book"                              (1 click)
    — Note: BOOK-level, not per-chapter. No way to run on Ch 3 only.
07. Wait
08. Click sidebar workflow stage "Page Quality Review"          (1 click)
09. Click "Run Page Quality Review"                            (1 click)
10. Wait
11. Scroll through findings list, find Chapter 3 findings      (scroll + read)
12. For each finding requiring a decision: click [Accept]/[Fix]/[Defer]/[Override]
    (typical: 2-5 findings per chapter × 1 click each)         (~3 clicks)
13. Click sidebar workflow stage "Approve Layouts"             (1 click)
14. Find Chapter 3 in chapter card list                        (scroll + 1 click)
15. Click "Approve Layout for Chapter 3"                       (1 click)
16. PAID_ACTION_WARNING confirm                                (1 click)
17. Wait
18. Click sidebar workflow stage "Render Proofs"               (1 click)
19. Click "Render Chapter 3 Proof"                             (1 click)
20. PAID_ACTION_WARNING confirm                                (1 click)
21. Wait ~5-15 min while ~30 page renders run
22. Click sidebar workflow stage "Manage Images"                (1 click)
23. For each page in Chapter 3 (~30 pages):
    - View image
    - Click Approve / Reject                                  (~30 clicks)
24. For each approved page, click Upscale + confirm           (~30 × 2 clicks)
25. Click sidebar workflow stage "Export Book"                 (1 click)
26. Click "Render Full Book"                                   (1 click)
27. PAID_ACTION_WARNING confirm                                (1 click)
28. Wait
29. Click download                                              (1 click)
─────────────────────────────────────────────────────────────────────
Estimated total: ~90 clicks + waits, assuming clean run.
With any quality findings or rejected images: 120-200 clicks.
```

### Decisions the operator must make (clean path)

1. *Did the Page Plan output look right?* (read prose, no clear pass/fail signal)
2. *Did text-fit pass?* (look for `readyForImageSpend` boolean in a small chip)
3. *Are the quality findings real or noise?* (per-finding judgment)
4. *Is the chapter ready to approve?* (no checklist; vibes)
5. *For each image: is it good enough?* (30 × yes/no)
6. *Did the KDP preflight pass?* (one boolean in the log)

**6 different decision shapes in 30 places.** No single "is this book ready?" view today.

### Redesigned journey using existing functionality

Same outcome, post-rebuild, no new backend work:

```
01. Open project                                               (1 click)
02. Dashboard tile shows status: "BLOCKED — text-fit needs to run"
    Click [Run Next Step]                                      (1 click)
03. Tile updates: "BLOCKED — 3 pages need decisions"
    Click [Open Decisions]                                     (1 click)
04. Decide on the 3 items (Accept / Fix / Defer)               (3 clicks)
05. Tile updates: "READY — chapter 3 ready to render"
    Click [Render Chapter 3]                                   (1 click)
06. Wait
07. Tile updates: "30 images ready for review"
    Click [Review Images]                                      (1 click)
08. Bulk-action UI:
    "Approve all 28 (rejecting 2 flagged by quality model)?"
    Click [Approve Batch]                                      (1 click)
09. Tile updates: "READY — assemble and export"
    Click [Assemble + Export]                                  (1 click)
10. Download                                                    (1 click)
─────────────────────────────────────────────────────────────────────
Estimated total: ~13 clicks + waits. ~85% click reduction.
```

The capability for every step in the redesign **already exists in code**. The change is purely surface.

---

## Phase 5 — Ideal dashboard

The first screen the operator sees. Single purpose: answer **WHAT IS HAPPENING / WHY / WHAT NEXT?** Every item has an action attached.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Production Status                          Project: Wild Lands FG    │
│                                                                       │
│ ┌────────────────────────────┐ ┌────────────────────────────────┐    │
│ │ STATUS                     │ │ NEXT ACTION                    │    │
│ │                            │ │                                │    │
│ │ ⚠  BLOCKED                  │ │ Resolve flagged pages on the   │    │
│ │ Stage: Text-fit            │ │ Page Plan before image gen.    │    │
│ │ 1 of 8 chapters open       │ │                                │    │
│ │                            │ │ [ ▶ Open Page Plan ]           │    │
│ └────────────────────────────┘ └────────────────────────────────┘    │
│                                                                       │
│ ┌────────────────────────────┐ ┌────────────────────────────────┐    │
│ │ BLOCKERS                   │ │ APPROVAL QUEUE                 │    │
│ │                            │ │                                │    │
│ │ • 1 page over capacity     │ │ • 3 chapters waiting for       │    │
│ │   (CH06_P006_m, accepted)  │ │   layout approval              │    │
│ │   [ Mark Intentional ]     │ │   [ Bulk Approve ]             │    │
│ │ • Text-fit stale           │ │ • 30 images waiting             │    │
│ │   [ Re-run Text-Fit ]      │ │   for review                   │    │
│ │                            │ │   [ Review Images ]            │    │
│ └────────────────────────────┘ └────────────────────────────────┘    │
│                                                                       │
│ ┌────────────────────────────┐ ┌────────────────────────────────┐    │
│ │ BUDGET                     │ │ BOOK PROGRESS                  │    │
│ │                            │ │                                │    │
│ │ Estimated:    $14.45       │ │ ████████████░░░░░  62%         │    │
│ │ Cap:          $25.00       │ │                                │    │
│ │ Spent so far: $0.00        │ │ 289 pages · 8 chapters         │    │
│ │                            │ │ 5 ch ready · 3 in review       │    │
│ │ [ Adjust Cap ]             │ │   [ View Chapter List ]        │    │
│ └────────────────────────────┘ └────────────────────────────────┘    │
│                                                                       │
│   [ ▶ Run Pipeline Check ]    [ Ask Agent ]   [ View Activity Log ]  │
└──────────────────────────────────────────────────────────────────────┘
```

**Every tile reads from an endpoint that already exists:**

| Tile | Reads | Source |
|---|---|---|
| Status + Next Action | `POST /api/projects/:id/run-pipeline` | Supervisor (this session) |
| Blockers | Supervisor `blockingIssues[]` | Supervisor |
| Approval Queue | `production-dashboard.waitingOnOperator` | Production Dashboard service |
| Budget | Supervisor `snapshot.estimatedImageSpendUsd`, `imageBudgetUsd` | Supervisor + cost-events |
| Book Progress | `production-dashboard.totals` | Production Dashboard service |

**No new backend.** Six tiles, each a thin wrapper on one endpoint.

---

## Phase 6 — Supervisor review

Audit checklist, with verified answers from the live endpoint run on this session's project (`9e46d6b9-...`, mode `no-spend`):

| Question | Yes / No | Evidence |
|---|---|---|
| Can it run the entire no-spend pipeline? | ✅ | 8 stages run end-to-end; 1.3 s; no API spend. |
| Can it identify blockers? | ✅ | `blockingIssues[]` populated correctly — text-fit stage flagged as BLOCKED. |
| Can it identify next actions? | ✅ | `nextAction.label = "Resolve flagged pages on the Page Plan before image generation."` |
| Can it estimate costs? | ✅ | `snapshot.estimatedImageSpendUsd = 14.45` against `imageBudgetUsd = 25.00`. |
| Can it stop image generation when requirements fail? | ✅ | The endpoint returns `verificationBatchReady: false` when text-fit BLOCKED; current implementation runs no-spend only — `with-spend` mode is reserved for a follow-up. |
| Can it notify the operator when manual intervention is required? | ⚠ | The report contains everything; **no notification channel** (Slack/email/in-app toast). Listed as roadmap P1 in BOOK_AUTOMATION_ROADMAP. |

**What is missing (specific):**

1. **`with-spend` mode is unimplemented.** Today the endpoint always runs as if mode were `no-spend`. To actually orchestrate image generation, the supervisor needs to call the whole-page render orchestrator (which itself exists per-page). Roadmap-known; not a regression.
2. **No notification channel.** Today the operator must call the endpoint themselves. The supervisor should be runnable on a schedule (cron) and post results to chat / email when the verdict changes.
3. **Director auto-apply `switch_layout`** is wired as a seam but reserved (returns null + a `skippedNotAllowed` entry). The mutation seam needs to call `forcePageLayoutAndReplan()` once operator-opt-in is wired.
4. **No persistence of supervisor runs.** Today each run is fresh; there's no history of past verdicts. Adding a small `supervisor_runs` table would let the dashboard show "Last green: 2 days ago."

Everything else the audit asked about is **answered yes by the current implementation.**

---

## Phase 7 — Future state

The target state described as the operator sees it.

### What exists today

- 18 panels, 5 tabs, 12 workflow stages, ~50 backend endpoints.
- 1 supervisor endpoint that already gives a unified verdict + next action.
- 2 separate pipelines (legacy illustration-only + AI whole-page) — operator sees only the legacy one.
- 8 duplicated capabilities, 10 hidden capabilities (per Phases 2–3).

### What is duplicated → consolidate

See Phase 2 table. Net: **8 duplications resolvable**. Most by deletion of the worse surface.

### What is hidden → expose

See Phase 3 table. Net: **10 hidden capabilities surfaceable** with thin UI wrappers. No new backend.

### What is confusing → rename

Operator-facing rename list (no backend change):

| Today | Rename to |
|---|---|
| `TIGHT` (page chip) | "Near capacity" |
| `OVERFLOW` (page chip) | "Over capacity" |
| `UNDERFILL` (page chip) | "Under-filled" |
| `FITS` (page chip) | "Fits" |
| `readyForImageSpend` (label) | "Ready to generate images" |
| `whole-page-render` (button) | "AI Page Render" |
| `preflight` (in render results) | "KDP check" |
| `decision-ledger` / "Publishing Director recommendation" | "Page issue" |
| `Force layout` | "Override layout" |
| `Layout Approval` | "Approve Chapter for Image Generation" |
| `System Working` (workflow stage 1) | Remove — it's a developer message |
| `Operator Preview` (Advanced) | Remove (duplicate of Preview Review) |

### What should be removed

- Workflow stage `System Working` (line 1617). Dev message.
- Duplicate "Upload Manuscript" stage (line 1666). Keep line 1654.
- Operator Preview panel (line 6704). Preview Review is the real one.
- Frontend `PAID_ACTION_WARNING` confirm dialog. Supervisor budget-preflight replaces it.
- Operator Guidance prose card (line 4216). Sidebar workflow status + dashboard "Next Action" tile cover it.
- Advanced Mode toggle. Replace with per-feature progressive disclosure (one toggle per power feature, not one global gate).

### What should be exposed

- **Run Pipeline button** (the dashboard tile, Phase 5).
- **Whole-page render pipeline UI** — the primary active pipeline. Should replace the legacy "Render Proofs" flow's wiring.
- **Render Queue list** — `GET /api/experimental/whole-page-render/project/:projectId` returns it.
- **Per-render print-prep status badge.**
- **KDP check per-line detail** (the 7 checks).
- **Bulk chapter approval button** ("Approve all eligible").
- **Spend-so-far line** from cost-events.

### What should become automated

The supervisor's `with-spend` mode + Director auto-apply for `switch_layout`. Both are seam-ready; need the operator-opt-in UI + the orchestration loop. The threshold table (`policy.ts`) is already centralized.

### Implementation order (single-session-sized chunks)

| # | Chunk | New backend? | UI scope |
|---|---|---|---|
| 1 | **Dashboard tile** rendering supervisor report (Phase 5) | 0 | ~80 lines React |
| 2 | **Bulk chapter approval** button (existing endpoint, frontend loop) | 0 | ~40 lines |
| 3 | **Rename pass** (the operator-facing rename table above) | 0 | string-only |
| 4 | **Whole-page render UI** — wire the existing endpoint family into a Render Queue view | 0 | ~200 lines |
| 5 | **Remove duplicates** (Operator Preview, Operator Guidance, Backend URL field, etc.) | 0 | deletion |
| 6 | **KDP per-check detail tile** after book render | 0 | ~60 lines |
| 7 | **Supervisor `with-spend` mode** orchestrator | yes — small | wires the existing per-page render |

Chunks 1–6 are **pure UI work**. Chunk 7 is the next supervisor evolution.

---

## Final answer to the benchmark

> **If I hired a publishing employee tomorrow, could they successfully
> publish Chapter 3 without asking a developer for help?**

**No.**

The specific reasons:

1. **They wouldn't find the right pipeline.** The active AI pipeline (`whole-page-render`) has zero UI. The UI they'd use renders the legacy illustration-only output.
2. **They'd hit "PAID_ACTION_WARNING" 5+ times** with no idea what they're authorizing. The supervisor's budget-preflight ($14.45 / $25.00) already exists; it's not visible.
3. **They'd encounter the word "TIGHT" / "OVERFLOW" / "TEXT-FIT" / "readyForImageSpend"** with no glossary. The terms come from the codebase, not from publishing.
4. **They'd need to know the workflow stages map onto the topnav tabs.** That mapping isn't obvious; the sidebar uses one set of labels (12 stages) and the topnav uses another (5 tabs) and they cross-cut each other.
5. **They'd approve each chapter individually** — 8 chapters × 3-4 clicks each = 24–32 clicks just for approval.
6. **They wouldn't know to mark CH06_P006_m as an "accepted outlier."** That action exists in the Director's `mark_intentional` proposal; no UI surfaces it.
7. **They wouldn't know to upscale each approved image.** Upscale is a separate per-page click after approval. No bulk button.
8. **They wouldn't know if KDP preflight passed.** The boolean is in a header; the 7 individual checks are hidden.

**Every single one of these reasons is fixable with UI exposure work.** No backend gap. No new feature. The hardest one (whole-page render UI) is the biggest single lift, but the codebase is ready.

> **Test passes when:** the operator opens the project, sees one Production Status tile, clicks one CTA, and the supervisor walks them through every stage until "Export Ready" — using the *whole-page render* pipeline, with bulk actions, in operator language, behind one approval per chapter at most.

That's the rebuild target. It's a UI session, not an architecture session.
