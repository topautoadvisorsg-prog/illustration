# Book Production UI Audit

> **Mandate:** Audit the platform like a publishing operations manager
> reviewing the software for daily use, not like a developer looking for new
> features to build.
>
> **Method:** Read the actual code before claiming anything is missing.
> Only flag a true gap when the capability genuinely does not exist OR is
> structurally hidden from a normal operator.

This audit is based on direct inspection of:
- `frontend/src/App.js` (6,763 lines, 258 unique CSS classes)
- All 8 backend route files (`backend/src/api/*.ts`)
- All 14 backend services (`backend/src/services/*/`)
- All 18 pipeline stages (`backend/src/pipeline/*/`)

---

## 1. Current workflow map — what an operator actually sees

### Top navigation (sidebar)

The platform has **5 views**, defined at `App.js:3798-3803`:

| Tab | Label | What it contains |
|---|---|---|
| `control` | 🛠 Control Center | Dashboard hero + production-dashboard + chat + page-quality + agent roster |
| `setup` | Setup | Project create/select + manuscript upload + publishing standard + format calibration |
| `library` | Library | Asset library + layout templates (gated behind Advanced or this tab) |
| `intelligence` | Intelligence | Decisions / experiments / standards / SOPs / cost events / print findings |
| `export` | Export | Render proof, final PDF/EPUB, KDP preflight outputs |

### Workflow sidebar (below top nav)

A second navigation list — workflow stages — at `App.js:3815-3831` driven by
`workflowSnapshot`. Each stage shows: number, label, state (done / current /
locked). Click jumps to the relevant view + scrolls to the right panel.

Stages registered (`App.js:1617-1763`):
1. system
2. project
3. standards
4. manuscript
5. breakdown
6. plan
7. textfit
8. quality
9. layout
10. proof
11. images
12. export

### Advanced Mode toggle (topbar)

A checkbox at `App.js:3866-3869`. Off = simpler operator view. On = power
features unlock. **Many controls are advanced-only** (10 `advancedMode &&` gates
across the file). This is the platform's biggest discoverability question and
gets its own section below.

---

## 2. Production Workflow Visibility — your 12 touchpoints, answered

For each requested touchpoint: where it lives, how many clicks, and whether an
operator who has never seen the app would find it.

| Touchpoint | Exists? | Where (file:line) | Click depth from home | Discoverable? |
|---|---|---|---|---|
| **Manuscript Breakdown** | ✅ | Setup tab → upload + Stage 1.5 manifests panel | 2 clicks (sidebar Setup, paste/upload) | ✅ "Setup" is a clear label |
| **Pagination** | ✅ (Pagination v1) | Control Center, behind `PAGINATION_V1_ENABLED` flag; jumpable from workflow sidebar | 1 click (workflow stage) when flag on | ⚠ Hidden behind flag; not in main nav |
| **Layout Selection** | ✅ | Control Center, chapter-card with `force-layout` action | 2 clicks (workflow stage `layout` → chapter card) | ⚠ The "force-layout" power is per-page and lives under Advanced |
| **Page Audits** | ✅ | `/pages/:pageKey/inspector` endpoint exposed via Page Production tab inspector | 3 clicks (Control → select chapter → select page) | ⚠ Term "inspector" is dev-flavored |
| **Overflow Review** | ✅ (data exists) | Surfaced as `fitStatus` chip on each page card + via Page Quality Review findings | 2-3 clicks | ⚠ No dedicated "Overflow Queue" view; mixed in with FITS pages |
| **Underfill Review** | ✅ (data exists) | Same as Overflow — `fitStatus` chip + Publishing Director ledger entry with `apply_repeating_accent` action | 2-3 clicks | ⚠ Same — no dedicated queue |
| **Verification Batch** | ❌ as a named concept | Closest analog: render single page via `POST /api/projects/:id/pages/:pageKey/render` | n/a — no "batch" UI surface | ❌ Not exposed |
| **Render Queue** | ⚠ partial | Control Center → "Render" section with per-chapter render button; `whole_page_renders` table queryable via `GET /api/experimental/whole-page-render/project/:projectId` | 1-2 clicks | ⚠ No queue *view* — only counts |
| **Print Prep** | ✅ | `POST /api/experimental/whole-page-render/:renderId/print-prep` exposed via render approval panel | 3 clicks (Control → chapter → render → approve+print-prep) | ⚠ Buried in approve flow |
| **Assembly** | ✅ | `POST /api/experimental/whole-page-render/project/:projectId/assemble` exposed via Export tab | 2 clicks | ✅ |
| **KDP Validation** | ✅ | Rolled into Assembly endpoint result + Export tab proof artifacts | 2 clicks | ⚠ KDP-named UI element missing; called "preflight" |
| **Export / Download** | ✅ | Export tab → proof artifacts list with file URLs | 1-2 clicks | ✅ |

**Summary:** 12/12 capabilities exist. **3 truly exposed and discoverable; 7 exist but
need a click trail or term decoded; 1 missing as a UI concept (Verification Batch);
1 partially exposed (Render Queue — counts, no list).**

---

## 3. Manual override capability — per stage

For each pipeline stage, can the operator: **run it manually / re-run / skip /
approve / reject / view logs / view audit**?

| Stage | Run | Re-run | Skip | Approve | Reject | Logs | Audit |
|---|---|---|---|---|---|---|---|
| Ingestion (manuscript upload) | ✅ | ✅ | n/a | implicit | ✅ (delete project) | ✅ operator-log | ✅ word count |
| Manifests (Claude) | ✅ | ✅ | ❌ | implicit | ❌ no per-entry reject | ✅ operator-log | ✅ chapters/words |
| Pagination v1 | ✅ (`POST .../paginate`) | ✅ (mode=replace) | ❌ | implicit | ❌ | ✅ | ✅ report |
| Reading-field preview | ✅ (per page) | ✅ | ❌ | ✅ `POST .../preview/approve` | ✅ `POST .../preview/reject` | ✅ | ✅ |
| Subject + badges | ✅ (`recompute-subject-badges`) | ✅ idempotent | ❌ | implicit | ❌ | ✅ | ✅ region audit |
| Format calibration | ✅ | ✅ | ❌ | ❌ no explicit accept | ❌ | ✅ | ✅ best-fit + risk |
| Text-fit preview | ✅ | ✅ | ❌ | n/a (advisory) | n/a | ✅ | ✅ per-page |
| Page Quality Review | ✅ | ✅ | ❌ | per-finding resolutions | per-finding resolutions | ✅ | ✅ findings |
| Layout approval | ✅ per chapter | ✅ | ❌ | ✅ `POST .../layout-approval` | ❌ no explicit reject (just don't approve) | ✅ | ✅ |
| Whole-page render | ✅ per page | ✅ regenerate | ❌ | ✅ `approve` | ✅ `reject` | ✅ render row | ✅ render row |
| Print-prep | ✅ per render | ✅ | ❌ | implicit on success | ❌ | ⚠ result only | ✅ preflight |
| Book assembly | ✅ per project | ✅ | ❌ | implicit | ❌ | ✅ assembly report | ✅ validation |
| KDP preflight | ✅ embedded | ✅ embedded | n/a | implicit | n/a | ⚠ | ✅ checks |
| Export | ✅ | ✅ | n/a | n/a | n/a | ✅ proof artifacts | ✅ artifacts |

**Where manual control is missing or weak:**

- **No "skip stage" anywhere.** This is structurally correct for most stages (you can't skip pagination), but worth noting: there's no way to mark a stage as "intentionally skipped for this book."
- **No per-entry manifest reject.** If Claude misreads one manifest, the operator must re-run the whole Stage 1.5 (or edit manuscript and re-upload).
- **Format calibration has no "accept this recommendation" persistence.** You can run it; the result is shown; but applying it is implicit.
- **Print-prep logs are thin.** You see preflight pass/fail but not the Lanczos pipeline trace.
- **No per-page "Skip image, use stock illustration"** — only approve/reject. A real publishing workflow needs a "this page won't get a fresh render."

---

## 4. Operator testing mode — can the operator test one X without running the whole book?

For each granularity, the answer based on the actual code:

| Test scope | Possible today? | How |
|---|---|---|
| One page | ✅ | Select page → "Render Page" (`POST .../pages/:pageKey/render`) or "Generate Image" |
| One entry (single manifest) | ✅ | Each entry has a 1:1 page (or multi-part chain); selecting the opener tests the entry |
| One chapter | ✅ | "Render Chapter" (`POST .../chapters/:n/render`); also chapter-scoped operator intelligence and approval |
| One layout | ⚠ partial | Can `force-layout` on a single page and re-render that page; but no "test this layout across N chapters" surface |
| One render | ✅ | Whole-page-render is per-page by design |
| One print-prep output | ✅ | `POST .../whole-page-render/:renderId/print-prep` is per render |

**Verdict:** **5/6 testing scopes are fully covered.** The one gap is
**"test this layout choice across N chapters"** — useful when an operator
wants to A/B a layout family before committing the whole book. Not blocking
for day-to-day production.

---

## 5. Audit visibility — "why did this happen?"

The user asked specifically: can the operator inspect why a page was split / a
layout was chosen / a page is TIGHT / a page is OVERFLOW / a prompt was
generated / a page compacted?

| Question | Inspectable? | Where | Quality of explanation |
|---|---|---|---|
| Why was this page split? | ⚠ partial | `pagination-report` shows totals; per-page chars/words on each card. No "this paragraph triggered the split" trace. | Numeric only |
| Why was this layout chosen? | ✅ | `/pages/:pageKey/inspector` returns `planPage()` decision incl. `reasonCode` | Named reason codes |
| Why is this page TIGHT? | ✅ | Each paginated page row carries `fitStatus`, `readingFieldChars`, `readingFieldWords`; the operator can compute fillRatio | Numbers; no narrative |
| Why is this page OVERFLOW? | ✅ | Same — plus chat agent can answer in natural language given the recent log | Numbers + chat narrative |
| Why was this image prompt generated? | ⚠ partial | Prompt visible on render row; reasoning is in the prompt-assembly code, not surfaced to operator | Result only |
| Why did this page compact? | ✅ | `compactedEntryKeys` field shows which entries are on the page; flow-engine code documents the soft-break rules | Field shows result; no per-page trace |
| Why was image spend gated? | ✅ | `assertLayoutApprovedForImageSpend` returns a clear "not covered by approved chapter layout" message | Clear |

**The pattern:** decisions are inspectable as **outcomes**, less so as
**reasoning traces**. The chat agent (`/api/projects/:id/chat`) already
swallows the operator log and project context to answer "why is X happening?"
— that's actually the platform's strongest audit-visibility surface, and
it's underused because operators don't realize they can ask.

---

## 6. Production dashboard review — what's confusing for a non-developer

Reviewed App.js the way an ops manager would. Issues found:

### Naming / terminology issues

| Current label | Problem | Better |
|---|---|---|
| "Control Center" | Vague — could mean settings, dashboard, or status | "Production" |
| "Setup" | Includes both project create AND manuscript upload AND publishing standard — three different things | "Project" or split into "New Project" + "Standards" |
| "Library" | Includes layout templates AND uploaded asset library — two different things | Split into "Layouts" + "Assets" |
| "Intelligence" | Generic; could mean AI features or analytics | "Decisions" or "Audit Log" |
| "fit_status: TIGHT" | Dev term — operators won't know if "tight" is good or bad | "Near capacity" |
| "readyForImageSpend" | Dev term in UI labels | "Ready to generate images" |
| "whole-page-render" | API path leaks into chat / logs | "AI Page Render" |
| "experimental/" | Path appears in storage URLs the operator sees | "renders/" — the term should not be visible |
| "preflight" | KDP industry term but misleading at first glance | "KDP check" |
| "decision-ledger" | Library-of-congress flavor | "Director's Notes" or "Auto Decisions" |

### Discoverability issues

| Issue | Where it bites |
|---|---|
| Advanced Mode toggle is the ONLY way to find Backend URL, settings, intelligence panel inputs, log thresholds, etc. | An operator who never toggles it sees ~40% fewer controls |
| Workflow stages in sidebar are clickable but the **active stage indicator** doesn't update reliably — `getActiveStageState()` infers state from data presence, not from operator intent | Operator can't tell "what should I do next?" without reading prose hints |
| "Run all" or "Auto-pilot" does not exist | Every stage requires a manual button press |
| Per-chapter approval requires drilling into the chapter card, finding the approval button, confirming a paid-action prompt | 4-5 clicks per chapter; 8 chapters in this book = 32-40 clicks just for approval |
| Cost estimate exists (`GET /cost-estimate`) but is shown only in the chat agent's text, not in a visible dashboard tile | Operator doesn't see budget before committing |

### Implementation details leaking through

| What the operator sees | What they shouldn't have to see |
|---|---|
| `PAGINATION_V1_ENABLED` flag affecting whether buttons exist | Flag is a deploy concern, not an operator one |
| Storage paths like `experimental/whole-page/...` in download URLs | Path is internal |
| Chapter approval gate language: "this is the spend gate" (`App.js:4414`) | Dev framing; operator wants "approve this chapter for image generation" |
| Operator-log entries with `req-1`, `status-code`, hostnames | Network log, not publishing log |
| Backend URL field in Setup — visible by default until you uncheck Advanced | Should be hidden unless something is broken |

### Action-discovery issues

| Action | Behind how many clicks? |
|---|---|
| Approve a chapter layout | 3 (workflow stage `layout` → chapter card → approve button) |
| Re-paginate | 2 (workflow stage `pagination` → re-paginate button) |
| Force a layout on one page | 4 (workflow stage `layout` → chapter → page → force-layout dropdown, only in Advanced) |
| See why a page is OVERFLOW | Workflow stage `quality` → Page Quality Review → find the page in the findings list |
| Render a single page (verification) | 3 (workflow stage `images` → select page → render) |
| Print-prep a render | 4 (Control → render row → approve → print-prep button) |
| Assemble the book | 2 (Export → assemble) |
| Download the final PDF | 2 (Export → proof artifacts → click file) |

The platform has the depth. **The depth is too deep for daily use.**

---

## 7. Enterprise readiness review

Comparison against OpenAI, Claude, Notion, Airtable on **operational readiness
dimensions** (not aesthetics — aesthetics were addressed in the recent polish
commits).

| Dimension | Wildlands score | Notes vs. industry |
|---|---|---|
| **Discoverability** | 4/10 | Workflow sidebar is good. But: Advanced Mode hides too much; testing-mode actions are scattered across panels. Notion/Linear show every action via a global command palette (⌘K) — no command palette here. |
| **Workflow clarity** | 6/10 | 12 explicit stages with state indicators is genuinely good. But: "what should I do next?" requires reading 2-3 sentences of guidance prose instead of seeing one clear "Next Action" button. |
| **Operator efficiency** | 3/10 | Chapter-level approval is 3-4 clicks each. Bulk approval doesn't exist. Notion / Airtable bulk-select-and-act is the standard. |
| **Error recovery** | 5/10 | Operator log shows errors with timestamps. But: no "undo" anywhere; re-running a stage often requires manual data reset; no error → suggested-action linking. Claude's UX surfaces "retry" buttons inline on every failed call. |
| **Auditability** | 7/10 | Every backend decision is logged; chat agent can summarize. **This is the platform's strongest dimension.** Decision ledger exists. Cost events exist. Intelligence panel has all the data. |
| **Production readiness** | 5/10 | Works for one project at a time. No multi-tenancy, no role-based access, no usage limits per user. Backend URL field in the operator UI is a giveaway — production tools hide their plumbing. |
| **Onboarding for a new employee** | 3/10 | The 12 workflow stages each have a label, but no documented "what this stage means" pop-out. A new operator hitting "TIGHT", "FITS_THRESHOLD", "carriesSubject" cold has no glossary. |

**Overall: 4.7/10 vs. SaaS publishing-industry tools.** The backend is at 8/10
of where it needs to be; the UI hides that capability. Closing this gap is
mostly a wrapper exercise, not a build exercise.

### Top blockers preventing a new employee from learning the platform quickly

1. **No glossary / no in-app help.** Every dev term should hover-explain.
2. **Advanced Mode all-or-nothing.** Power features should be per-user "show advanced" settings, not a single global toggle.
3. **No "next action" CTA on the dashboard.** The dashboard hero shows status; it doesn't tell the operator what to click next.
4. **No bulk actions.** Approving a book chapter-by-chapter is a multi-minute task; should be one click.
5. **No "test this on one chapter first" wizard.** The capability exists; the surface doesn't.
6. **Chat agent buried.** It can answer almost every operational question, but operators don't know it's there or how to ask it.

---

## 8. Recommendations — prioritized, only for genuine gaps

Per the mandate: **only recommend new functionality when the capability truly
does not exist OR is structurally hidden / fundamentally inadequate.**

### P0 — Discoverability fixes (no new functionality, just exposure)

| # | Recommendation | Backed by |
|---|---|---|
| 1 | **Dashboard "Next Action" tile** that reads `operatorGuidance.stageKey` (already computed) and renders ONE primary CTA button. Removes "what do I do next?" friction. | `App.js:1614-1781` already has the data |
| 2 | **Global "Run Pipeline" button** wired to a new `POST /api/projects/:id/run-pipeline` (see Roadmap). Operator picks `with-spend` or `no-spend`. | Endpoints exist for every stage; loop is missing |
| 3 | **"Verification Batch" UI** — name the existing per-page render action what the operator calls it. Pick 4 pages, render, print-prep, show side-by-side. | The actions all exist (`pages/:pageKey/render`, render approval, print-prep) |
| 4 | **In-app glossary** — hover on any `fitStatus`, `carriesSubject`, `readingFieldChars` chip explains what it means. ~50 terms, one JSON file. | None — pure UX |
| 5 | **Promote the chat agent** — surface it on the dashboard as the primary "Ask why" surface. Today it lives in a side panel that operators don't notice. | `/api/projects/:id/chat` already works |

### P1 — Bulk + filter (no new capability, scale existing actions)

| # | Recommendation | Backed by |
|---|---|---|
| 6 | **Bulk chapter approval** — "Approve all chapters that pass Page Quality" → one click instead of 8. | Per-chapter approval endpoint exists; bulk is a frontend loop |
| 7 | **Filterable page list** — filter `paginated-pages` by `fitStatus`, `pageRole`, `layoutTemplate`. Today the list is presented in book order only. | Data exists; UI doesn't filter |
| 8 | **"Show OVERFLOW only" / "Show UNDERFILL only" views** for fast triage. | Data exists; a 5-line filter on the page list. |
| 9 | **Command palette (⌘K)** indexing every operator action (workflow stages, chapter approvals, force-layout, run audit). | All actions exist as functions in App.js |

### P2 — Real gaps (genuinely missing functionality)

| # | Recommendation | Why it's truly missing |
|---|---|---|
| 10 | **Skip stage / mark intentional** for outlier pages like `CH06_P006_m` so they don't keep failing audits | No equivalent today — operator can dismiss findings on a per-finding basis, but cannot say "this OVERFLOW is intentional, accept and move on." Ties into the Director's `mark_intentional` action which exists in the backend but isn't reachable in UI |
| 11 | **Render Queue view** — list pending/running/done renders with retry-on-failure UI | `whole-page-render/project/:projectId` returns the list, but no queue UI |
| 12 | **Cost estimate tile on the dashboard** — show estimated spend vs budget BEFORE the operator clicks "Render Book" | `cost-estimate` endpoint exists; not displayed |
| 13 | **Renaming pass** — kill dev terminology in operator-visible text (see §6 table) | Pure UX rename — every label exists |

### P3 — Enterprise polish

| # | Recommendation | |
|---|---|---|
| 14 | **Per-user "advanced" preference** instead of a global toggle | |
| 15 | **Read-only / collaborator role for client review** | |
| 16 | **Hide implementation paths** in download URLs (`/experimental/` should be invisible) | |
| 17 | **Glossary popout + "what changed?" since last visit** | |

---

## 9. Enterprise readiness score — final

| Area | Score (1-10) |
|---|---|
| Backend capability | 8/10 |
| Audit data exists | 9/10 |
| UI exposure of that data | 4/10 |
| Operator efficiency | 3/10 |
| Workflow clarity | 6/10 |
| Terminology | 4/10 |
| Discoverability | 4/10 |
| Onboarding readiness | 3/10 |
| **Overall** | **5.1/10** |

The platform is operationally strong under the hood and operationally weak at
the surface. Almost every "missing" feature is actually built; it just isn't
exposed where a normal operator would find it.

---

## 10. The bottom line — read this if you read nothing else

**Stop building features. Start exposing them.**

The biggest single intervention isn't a new endpoint, a new agent, or a new
audit — it's a UI pass that:

1. Renames developer terms to publisher terms.
2. Surfaces the **chat agent** as the primary "Why?" interface.
3. Adds one big **"Run Pipeline"** button backed by the orchestration loop in BOOK_AUTOMATION_ROADMAP.md.
4. Adds **one "Next Action"** tile that reads what the platform already knows.
5. Adds **bulk approval** so chapter-by-chapter doesn't take 40 clicks.

Do those five things and the operator scoresheet moves from 4.7 to 7+, with
zero new pipeline work.

Then the automation roadmap takes you from "operator launches the pipeline"
to "operator approves only the exceptions."

Book #1,000 becomes a notification, not a workflow.
