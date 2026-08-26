# Book Production Automation Roadmap

> **Goal:** Generate book #1,000 without an operator sitting and watching.
> A Book Production Supervisor that runs every stage, reads each audit, decides
> pass/fail, auto-fixes known issues, and escalates only unknown ones.

---

## Executive summary — what's already built

Before recommending anything new, the audit found that **substantial supervisor
infrastructure already exists in the backend**. The pieces are in place; what's
missing is the **orchestration loop that runs them automatically without
operator clicks**.

What already exists in code:

| Capability | File | Status |
|---|---|---|
| Publishing Director **policy** with editable thresholds | `backend/src/services/publishing-director/policy.ts` | ✅ shipped |
| Publishing Director **decision ledger** with proposed actions (switch_layout / apply_repeating_accent / mark_intentional) | `backend/src/services/publishing-director/decision-ledger.ts` (318 lines) | ✅ shipped |
| **Page Quality Review** with severity (BLOCKER / WARNING / INFO) across 6 categories | `backend/src/services/page-quality/page-quality-review.ts` (495 lines) | ✅ shipped |
| **Operator Intelligence** (per-chapter analysis) | `backend/src/services/operator-intelligence/operator-intelligence.ts` (498 lines) | ✅ shipped |
| **Production Dashboard** API (totals, status, blockers) | `GET /api/projects/:id/production-dashboard` | ✅ shipped |
| **Project Chat agent** (LLM with project context + recent log) | `POST /api/projects/:id/chat` | ✅ shipped |
| **Cost estimate** API | `GET /api/projects/:id/cost-estimate` | ✅ shipped |
| **Text-fit preview** (no spend) | `POST /api/projects/:id/text-fit-preview` | ✅ shipped |
| **Format calibration** (per-chapter) | `POST /api/projects/:id/chapters/:n/format-calibration` | ✅ shipped |
| **Decision Ledger UI state** in App.js | `publishingDirectorLedger` state at line 1422 | ✅ wired (state) |
| **Production dashboard UI state** | `productionDashboard` state at line 1463 | ✅ wired (state) |
| **Risk levels** (NONE / LOW / WARNING / BLOCKER) and **Fix modes** (AUTOMATIC / MANUAL / DECISION_ONLY / NONE) | `decision-ledger.ts:16` | ✅ shipped |

**What's NOT built:** an orchestrator that walks the stages on a schedule (or in
one shot), reads each audit, checks thresholds, applies AUTOMATIC fixes,
escalates BLOCKERS to a queue, and reports a single pass/fail at the end. The
ingredients exist; nothing is whisking them together.

---

## Current pipeline stages — mapped

From `backend/src/pipeline/`:

```
stage-1-ingestion          Manuscript upload + parse
stage-1.5-manifests        Claude page-manifest extraction
stage-1.75-pagination      v1 pagination (Patches A–D shipped this session)
stage-1.8-preview          Reading-field PDF preview (no spend)
stage-2-planner            Page plan + layout selection (legacy)
stage-3-generation         OpenAI image generation
stage-4-review             Page/image approval gate
stage-5-upscale            Replicate Real-ESRGAN to 300 DPI
stage-6-layout             HTML/PDF render (legacy) + layout zones
stage-7-pdf-compile        Multi-page PDF stitch
stage-8-epub               EPUB export
print-prep                 Lanczos + bleed + badge stamping + folio
book-assembly              Spine order + KDP preflight + interior PDF merge
front-matter               Front-matter SPEC (Cover/Title/TOC/Sources)
qc-text-fidelity           OCR-based text accuracy check (planned)
publishing-standard        Standard tokens + geometry resolver (Patch reconciliation shipped)
subject-badges             Clean subject + hazard/region/source extraction
experimental/              Whole-page render (active main path)
```

**~18 stages.** Most have backend services + API endpoints. Some have UI
surfaces; some don't.

---

## Automation status per stage

Legend: **Auto** = runs without operator clicks once triggered. **Audit** = a
machine-checkable output exists. **Threshold** = pass/fail rule defined.
**Auto-fix** = known issues are corrected without escalation.

| Stage | Auto | Audit | Threshold | Auto-fix |
|---|---|---|---|---|
| Ingestion | ✅ | ✅ word/entry counts | ❌ | n/a |
| Manifests (Stage 1.5) | ✅ (one call) | ✅ entries / chapters / words | ✅ implicit (must be > 0) | ❌ |
| Pagination v1 | ✅ | ✅ `pagination-report` + `paginated-pages` | ⚠ used in chat; not codified | ✅ Patches A–D auto-rebalance |
| Reading-field preview | ✅ (per page) | ✅ PDF rendered | ❌ | ❌ |
| Subject + badges | ✅ | ✅ region audit + recompute report | ✅ implicit | ✅ idempotent recompute |
| Format calibration | ✅ (per chapter) | ✅ best-fit recommendation | ✅ best-fit / not-recommended / risky | ❌ |
| Text-fit preview | ✅ (no spend) | ✅ `readyForImageSpend` boolean | ✅ FITS / TIGHT / OVERFLOW / UNDERFILL | ⚠ partial (Patches A–D) |
| Page Quality Review | ✅ | ✅ findings by severity | ✅ BLOCKER blocks spend; WARNING/INFO advisory | ⚠ Director proposes; operator applies |
| Publishing Director | ✅ | ✅ decision ledger | ✅ overflow/repetition thresholds | ⚠ proposes; operator applies |
| Layout approval | ❌ (operator click) | ⚠ | ❌ | n/a |
| Whole-page render | ✅ (per page) | ✅ render row status | ⚠ no PASS/FAIL on output quality | ❌ |
| Print-prep | ✅ (per render) | ✅ preflight report | ✅ KDP preflight gate | ❌ |
| Book assembly | ✅ (one call) | ✅ validation gate + dimension check | ✅ blocks if missing/wrong size | ❌ |
| KDP preflight | ✅ | ✅ all 7 checks | ✅ each check passes or fails | ❌ |
| Export | ✅ | ✅ proof artifacts | ⚠ | ❌ |

**Read this table carefully:** most stages already produce machine-readable
audits. The gap is in the **outer loop**, not the inner mechanics.

---

## Human touchpoints — categorized per your spec

### 🟢 Automatic — safe to auto-approve

These can be auto-approved once thresholds match. The operator has no taste
input; the math is the answer.

- **Ingestion** — parse error or no error. No taste.
- **Manifest generation** — Claude returns structured data or it doesn't. Errors are real, not taste.
- **Pagination v1** — math fully deterministic post Patches A–D. Audits exist.
- **Subject/badge metadata** — deterministic extraction. Region audit auto-corrects.
- **Text-fit preview** — math. `readyForImageSpend` is a boolean already.
- **Print-prep** — `runPreflight` returns 7 pass/fail checks. No taste.
- **Book assembly validation** — every check is dimensional. No taste.
- **KDP preflight** — every check is a KDP spec line.

### 🟡 Automatic with thresholds — auto-pass within bounds

These need a threshold table. The system already supports it; the table just
isn't centralized.

- **Pagination fit distribution:** `OVERFLOW ≤ 2` → PASS. Currently: 1 (CH06_P006_m, compacted, by-design exclusion). Already auto-passes the math; just isn't gated on a numeric rule.
- **Text-fit OVERFLOW per chapter:** `≤ 0` → PASS. Audit exists.
- **TIGHT page rate per layout:** `≤ 30%` → PASS, `30–50%` → WARNING, `> 50%` → BLOCKER. Data already collected.
- **Layout repetition per chapter:** policy.ts already has `layoutRepetitionPercent: 45` → triggers a finding. Just needs to be wired to auto-PASS or auto-FAIL.
- **Whitespace per page (UNDERFILL):** `policy.ts` has `underfilledFillRatio: 0.25`, `underfilledFullPlateMaxWords: 60` — Director auto-proposes the full-page-plate layout. Currently a proposal; could be auto-applied.
- **Print-prep preflight:** every check has an `ok: boolean`. Need a single roll-up: `all 7 pass` → PASS.
- **Book assembly validation:** same shape. All checks pass → PASS, any block → escalate.
- **Cost estimate:** `≤ budget` → PASS, `> budget` → BLOCKER. Endpoint exists; threshold isn't enforced.

### 🔴 Human review required — taste / legal / final

These require an actual person.

- **Manuscript copyright** — entries that quote third-party material. Already part of QC-text-fidelity SPEC.
- **Visual taste** — is the Death Cap illustration *good*? Even if the math passes (1024×1536, sRGB, no bleed-edge content), the operator decides if it ships.
- **Hazard accuracy** — the Black-Legged Tick badge must be visually correct. Wrong badge = liability.
- **Front-matter copy** — title, subtitle, author bio, dedication — taste plus legal.
- **Cover design** — cover is a single image with multiple opinions; needs operator signoff.
- **Final publishing signoff** — uploading to KDP/IngramSpark is a one-way operator action.

---

## Required agents (what the supervisor needs)

The supervisor is the orchestrator. It needs sub-agents to act, audit, and
escalate.

### Already exist (use as-is)

- **Publishing Director** — policy + decision ledger. Already proposes the right actions; just needs an auto-apply mode for AUTOMATIC-fix-mode entries.
- **Page Quality Reviewer** — already categorizes by severity. Already used by the chat agent and the layout approval gate.
- **Chat Agent** — LLM with project context. Today: operator-facing. Could be repurposed as the supervisor's escalation surface (`"BLOCKER on CH02_P022 — review and decide"`).
- **Format Calibration agent** — already runs per chapter, returns best-fit/risky/not-recommended.
- **Operator Intelligence** — per-chapter analysis. Already runs.

### Need to be wired (logic exists, no orchestration)

- **Supervisor Loop** — for each stage, call → read audit → check threshold → branch. ~200 lines, one new file.
- **Threshold Table** — `book-production-policy.json` or extend `policy.ts`. Single editable source.
- **Auto-Apply Adapter** — when the Director proposes `switch_layout` with `fixMode: 'AUTOMATIC'`, actually call the force-layout endpoint instead of waiting for an operator click. The endpoint exists (`POST /api/projects/:id/pages/:pageKey/force-layout`).
- **Escalation Queue** — when a stage returns BLOCKER, enqueue with `{ stage, projectId, pageKey?, reason, suggestedAction }`. Can be Supabase table or in-memory.
- **Stage Runner Registry** — map of `stageKey → runFn(projectId)`. The current `App.js` has the labels and call sites; pull them into one backend module.

### Net new (don't exist today)

- **Pre-flight Budget Guard** — before any spend stage, compare `cost-estimate` to a configured `maxBudgetUsd`. Block if exceeded. Today: PAID_ACTION_WARNING is a frontend confirm, not a backend gate.
- **Render QA agent** — after image generation, verify the output: dimensions match, no text-overflow at the bleed line, fonts rendered, no obvious gibberish. Today: print-prep verifies dimensions and DPI, but doesn't QC the *content* of the image. Whole-page render produces gpt-image-1 output; nothing checks if the model dropped a paragraph or rendered Lorem ipsum.
- **Front-matter Auto-builder** — covers, title page, TOC, sources page. SPEC exists at `pipeline/front-matter/SPEC_FRONT_MATTER.md`; agent doesn't.

---

## Required audits

Almost all of these exist. **You don't need to build them — you need to centralize them.**

| Audit | Endpoint | Returns |
|---|---|---|
| Pagination math | `GET /api/projects/:id/pagination-report` | totals + fit distribution |
| Per-page detail | `GET /api/projects/:id/paginated-pages` | every page row |
| Per-page deep audit | `GET /api/projects/:id/pages/:pageKey/inspector` | manifest + fit + layout decision + blueprint status |
| Page Quality findings | `POST /api/projects/:id/page-quality-review` | severity-categorized findings |
| Publishing Director ledger | `GET /api/projects/:id/publishing-director/decision-ledger` | proposed actions per page |
| Cost estimate | `GET /api/projects/:id/cost-estimate` | total + per-stage breakdown |
| Production dashboard | `GET /api/projects/:id/production-dashboard` | totals / status / blockers |
| Per-chapter intelligence | `GET /api/projects/:id/chapters/:n/operator-intelligence` | chapter health |
| Render preflight | embedded in render row + print-prep result | dimensions / DPI / safe area |
| Assembly validation | `assembleBook()` returns full validation | per-page checks |
| Text-fit preview | `POST /api/projects/:id/text-fit-preview` | per-page fit + `readyForImageSpend` |
| Format calibration | `POST /api/projects/:id/chapters/:n/format-calibration` | best-fit recommendation |

**12 audit surfaces, all returning structured data, none currently rolled up into a single "Run all and report PASS/FAIL".** That roll-up is the missing piece.

---

## Pass/fail thresholds (the policy table to centralize)

Most of these values already exist scattered across files. Centralizing them
into one editable policy is the highest-leverage missing piece.

```ts
// proposed: backend/src/services/book-supervisor/policy.ts

export const BOOK_SUPERVISOR_POLICY = {
  pagination: {
    overflowMax: 2,                         // currently observed: 1
    tightRatePerLayoutMax: 0.45,            // observed post-D: 13-50% by layout
    underfillMax: 5,                        // observed: 3
    crossChapterCompactionMax: 0,           // hard zero
  },
  textFit: {
    readyForImageSpendRequired: true,       // gate already exists
    perChapterOverflowMax: 0,               // gate already exists
  },
  pageQuality: {
    blockersMax: 0,                         // gate already exists
    warningsAdvisoryOnly: true,             // warnings don't block; track for review
  },
  imageGen: {
    maxBudgetUsd: 5.00,                     // pre-flight budget gate
    perPageMaxAttempts: 3,                  // soft cap exists at 5; tighten for auto
    requiresApprovedLayout: true,           // existing gate
  },
  printPrep: {
    preflightAllChecksPass: true,           // 7 checks, all must be ok
    dimensionsExact: true,                  // tolerance ≤ 1 pt
    dpiExact: 300,
  },
  assembly: {
    everyPageBookReady: true,
    everyPagePreflightPassed: true,
    pageDimensionsUniform: true,
    pageCountEvenForKdp: true,              // KDP requirement
    minKdpPages: 24,                        // KDP minimum
  },
};
```

These are the same numbers the system already uses internally. Pulling them
into one file makes them tunable per project and lets the supervisor read one
source of truth.

---

## The fully automated workflow

```
[Operator]                                [Supervisor Loop]
   │
   │ Upload manuscript ────────────────► Stage 1 Ingestion
   │                                        │ audit: word/entry counts OK
   │                                        ▼
   │                                     Stage 1.5 Manifests (Claude)
   │                                        │ audit: chapter count, total words
   │                                        ▼
   │                                     Format calibration (per chapter)
   │                                        │ audit: best-fit picked, risky/not-recommended threshold check
   │                                        ▼
   │                                     Stage 1.75 Pagination (Patches A-D)
   │                                        │ audit: OVERFLOW ≤ 2, TIGHT% per layout ≤ 45%, UNDERFILL ≤ 5
   │                                        │ auto-fix: rebalance fires automatically
   │                                        ▼
   │                                     Text-fit preview (no spend)
   │                                        │ audit: readyForImageSpend per chapter
   │                                        │ auto-fix: Publishing Director proposes layout swaps
   │                                        ▼
   │                                     Page Quality Review
   │                                        │ audit: 0 BLOCKERS
   │                                        │ auto-fix: Director applies AUTOMATIC-fix-mode proposals
   │                                        ▼
   │                                     Layout approval (chapter-by-chapter)
   │                                        │ ⚠ TODAY: operator clicks. Could be auto if quality + fit pass.
   │                                        ▼
   │                                     Cost estimate
   │                                        │ audit: ≤ maxBudgetUsd
   │ ━━ESCALATION QUEUE◄────────────────────│
   │                                        ▼
   │                                     Whole-page render (per page, image spend)
   │                                        │ audit: render row status RENDERED, dimensions correct
   │                                        │ retry: up to perPageMaxAttempts
   │                                        ▼
   │                                     Render QA (NEW — content-level)
   │                                        │ audit: text fidelity OCR, no Lorem ipsum, badges legible
   │                                        ▼
   │                                     Print-prep (Lanczos + bleed + stamps)
   │                                        │ audit: 7-check preflight, all ok
   │                                        ▼
   │                                     Book assembly
   │                                        │ audit: validation gate (every-page-ready + dims + count)
   │                                        ▼
   │                                     KDP preflight
   │                                        │ audit: each KDP spec line
   │                                        ▼
   │ ◄────── EXPORT READY ────────────── Done; one click to download or upload
   │                                     OR
   │ ◄────── ESCALATION ────────────── BLOCKER with reason + proposed action
```

The operator's role becomes: **upload, glance at escalations, approve final
publishing signoff.** Everything in between is the loop.

---

## Priority-ranked roadmap

### P0 — ship within the next session

1. **Centralized policy file** (`book-supervisor/policy.ts`). 1 file, no logic — just the threshold table above. Unblocks every downstream step.
2. **Single "Run Book Pipeline" endpoint** (`POST /api/projects/:id/run-pipeline`). Calls each stage in order, reads each audit, checks each threshold, returns a unified report. Doesn't spend image dollars unless `mode: 'with-spend'`.
3. **Director auto-apply mode** — when a ledger entry has `fixMode: 'AUTOMATIC'`, call the corresponding endpoint instead of waiting. Single flag: `policy.publishingDirector.autoApply`.
4. **Pre-flight budget guard** — backend check `costEstimate ≤ maxBudgetUsd` before any image-spend stage. Replaces the frontend PAID_ACTION_WARNING confirm. Returns 402-style block with the estimate + budget.

**Outcome:** "Run pipeline → 1 OVERFLOW (CH06_P006_m, expected, marked intentional) → 0 BLOCKERS → ready for image spend → ready for assembly → done."

### P1 — next 1–2 sessions

5. **Render QA agent** — content-level check on generated images. Could be Claude-as-judge ("does this image show a Death Cap with the priority badge intact?") + deterministic checks (no text overflow at bleed margin, expected number of badges stamped).
6. **Escalation queue with Slack/email** — when supervisor escalates, write to a DB table + send a notification. Operator clicks "approve" or "modify" without opening the app.
7. **Front-matter auto-builder** — implement the SPEC at `pipeline/front-matter/SPEC_FRONT_MATTER.md`. Cover, title, copyright, TOC, sources. Sources page can be fully automated from `intelligence/print-findings`.
8. **Manuscript validation pre-stage** — copyright check (LLM-as-judge on lift detection) before pagination.

### P2 — when scaling to many books

9. **Multi-project queue** — Book #1 finishes → automatically pull Book #2 from the queue. Today the system handles one active project at a time.
10. **A/B layout testing per chapter** — run two layout candidates, compare image-gen quality + reader feedback signals (if any), promote winner. The infrastructure is there (force-layout + comparison runs).
11. **Cover Art Director agent** — proposed in `docs/SYSTEM_AUDIT.md`. Not built. Cover signoff stays human, but the *generation* of cover candidates should be automated.

### P3 — luxury

12. **Visual regression on layout changes** — when the Standard version bumps, re-render a representative page and diff against last-known-good. Catch silent regressions.
13. **Sales feedback loop** — pull KDP review/sales data, feed into intelligence layer, adjust layout/illustration choices for next book.

---

## The bottom line

The system is closer to "Book Production Supervisor" than the operator UI
suggests. Most audits, most thresholds, and most actions already exist. The
gap is **one orchestrator file**, **one policy table**, **one auto-apply
flag**, and **one budget guard** — and you go from "watch the build" to
"glance at exceptions."

The 1,000th book is a small backend lift away from the 10th.
