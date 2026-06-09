# Operator Simplicity Review

> **Question framework (per feature):**
>
> 1. Can a new employee find it?
> 2. Can a new employee understand it?
> 3. Can a new employee use it successfully without a developer?
>
> No new features are recommended unless the capability genuinely does not
> exist. Focus is on **exposing what's built**, not building more.

**Method:** Grep every UI string in `frontend/src/App.js` (6,763 lines) for each
feature. Compare to backend route inventory. Apply the three questions cold.

---

## The 8 features

### 1. Run Pipeline (the Supervisor's endpoint)

| Question | Answer |
|---|---|
| Find? | **❌ NO** |
| Understand? | n/a — can't find |
| Use? | n/a |

**Why no:** Endpoint `POST /api/projects/:id/run-pipeline` shipped this
session. UI grep returns zero matches. A new employee cannot reach it from the
UI. Acceptance test confirms the endpoint works (PipelineReport returns
correctly with snapshot, blocking issues, and next action — see live run
output).

**Simplest fix:** Add ONE button to the dashboard hero — *"Run Pipeline
Check"*. POSTs to the endpoint, displays the returned `nextAction.label` as the
primary CTA. Zero new backend work; ~80 lines of React. This single button
gives a new employee an answer to "what should I do next?" in one click.

---

### 2. Supervisor

| Question | Answer |
|---|---|
| Find? | **❌ NO** |
| Understand? | n/a |
| Use? | n/a |

**Why no:** "Supervisor" doesn't appear in the UI at all. The concept and
endpoint exist; the operator has no idea.

**Simplest fix:** Same fix as #1 — the Run Pipeline button is the Supervisor's
operator face. Label it "Pipeline Status" or "Production Check." Don't call
it "Supervisor" to operators (dev term).

---

### 3. Verification Batch

| Question | Answer |
|---|---|
| Find? | **❌ NO** |
| Understand? | n/a |
| Use? | Partially — they can render one page at a time |

**Why no:** "Verification Batch" is not a UI concept. The operator must KNOW
to pick 4 representative pages (image-top / image-right / pure-text /
continuation) and render each manually. That's developer-level knowledge.

**Simplest fix:** Add a "Verification Batch" tile on the Render Proofs
panel that:
- Auto-picks 4 pages of different layouts (already-FITS pages)
- Lists them with one "Render Batch" button
- Shows status as renders complete

Every action already exists (`POST .../pages/:pageKey/render`); this is a
50-line component over existing endpoints.

---

### 4. Quality Review

| Question | Answer |
|---|---|
| Find? | **✅ YES** — workflow stage labeled "Page Quality Review" + a clear "Run Page Quality Review" button |
| Understand? | **⚠ PARTIAL** |
| Use? | **✅ YES** |

**Why ⚠ on Understand:** Success message says *"Page Quality Review found N
publishing director recommendation(s)."* A new employee won't know who
"publishing director" is or what a "recommendation" means in this context.
The findings panel does label things as BLOCKER / WARNING / INFO with
descriptions — that part is good.

**Simplest fix:** Rename "publishing director recommendation" → "review item"
or "page issue" in the success message and chip labels. One string change.

---

### 5. Chapter Approval

| Question | Answer |
|---|---|
| Find? | **✅ YES** — workflow stage "Approve Layouts" + per-chapter button |
| Understand? | **⚠ PARTIAL** |
| Use? | **⚠ PARTIAL** |

**Why ⚠ on Understand:** The flow uses the term "Layout Approval" but the
actual gate is "approve this chapter for image generation spending." The
hint text at `App.js:4414` literally says *"This is the spend gate"* — that's
internal language leaking through.

**Why ⚠ on Use:** Approval is per-chapter. 8 chapters = 8 click sequences =
~32–40 clicks total. A new employee will not realize they need to repeat the
flow for each chapter.

**Simplest fix:** 
- Rename "Layout Approval" → "Approve Chapter for Image Generation."
- Add a single "Approve All Eligible Chapters" button that batch-approves
  chapters that have passed Quality Review. (Backend endpoint exists per
  chapter; bulk is a frontend `for` loop.)

---

### 6. Render Queue

| Question | Answer |
|---|---|
| Find? | **❌ NO** |
| Understand? | n/a |
| Use? | Partial — they can fire renders but not see them queued |

**Why no:** "Render Queue" returns zero matches in the UI. The backend
endpoint `GET /api/experimental/whole-page-render/project/:projectId` returns
the full list of renders with status (QUEUED / RENDERING / RENDERED / FAILED).
None of this surfaces.

**Simplest fix:** Add a *"Recent Renders"* tile on the Render Proofs panel
that hits the existing endpoint and shows status badges. One read endpoint,
one list component. No new backend work.

---

### 7. Print Prep

| Question | Answer |
|---|---|
| Find? | **❌ NO** |
| Understand? | n/a — label not present |
| Use? | Partial — happens implicitly inside render approval |

**Why no:** "Print Prep" / "print-prep" / "printPrep" returns zero matches in
the UI. The action runs (via the backend `POST .../print-prep` route) but
operator-side there's no label saying *"this page is print-prepped"* or *"X
of Y pages print-prepped."*

**Simplest fix:** Surface a "Print-Prep Status" line on the Render Proofs
panel: `"X / Y renders have a print-ready PDF (300 DPI, KDP canvas)."` Data
is already on the render row.

---

### 8. KDP Readiness

| Question | Answer |
|---|---|
| Find? | **⚠ PARTIAL** — appears as `pdfTarget: "KDP premium color..."` strings + a "KDP Target" config field |
| Understand? | **⚠ PARTIAL** |
| Use? | **⚠ PARTIAL** |

**Why ⚠ on all three:** The book-render endpoint sets an `x-preflight-passed`
header and the operator log shows *"preflight passed/failed."* A new employee
sees the word "preflight" (industry term but unexplained) and doesn't know
which of the 7 KDP checks ran or which failed. The check exists and the data
exists; only the surface is missing.

**Simplest fix:** Rename operator-visible *"preflight"* → *"KDP check"*. Add a
"KDP Readiness" tile after a book render that lists the 7 checks individually
with green/red dots. The data is in the assembly endpoint's return.

---

## Backend capabilities NOT visible in the UI

Beyond the 8 features above, this grep audit found backend endpoints that
have ZERO call sites in `App.js`:

| Capability | Endpoint | Operator impact |
|---|---|---|
| **Whole-page render orchestration** (the PRIMARY pipeline per project memory) | `/api/experimental/whole-page-render/*` (10 routes) | A new employee using the UI today is operating the **legacy illustration-only pipeline**. The active AI pipeline is invisible. |
| Cost events ledger | `/api/intelligence/cost-events` | Operator can't see real spend; only chat can summarize |
| Intelligence overview | `/api/intelligence/overview` | The "Intelligence" tab exists but doesn't call this aggregator |
| Print findings | `/api/intelligence/print-findings` | Print proof feedback hidden |
| Print reviews | `/api/intelligence/print-reviews` | Same |
| Decisions ledger | `/api/intelligence/decisions` | Auto-decision history hidden |
| Subject + badges recompute | `/api/projects/:id/recompute-subject-badges` | Has no UI; only callable via curl |
| Backfill continuation prompts | `/api/projects/:id/backfill-continuation-prompts` | Used during pagination v1 cutover; only via API |
| **Run Pipeline (Supervisor)** | `/api/projects/:id/run-pipeline` | This session's deliverable. No UI yet. |

**The single biggest UI gap by impact:** the **whole-page render** route family.
Memory says this is the PRIMARY pipeline ("AI-first WHOLE-PAGE RENDER is now
the primary pipeline"). The UI operator clicks through the LEGACY illustration
pipeline; the WHOLE-PAGE pipeline is invisible. A new employee told to
publish Chapter 3 today would use the wrong path entirely.

---

## Summary

Counting only the 8 requested features:

| Feature | Find? | Understand? | Use? |
|---|---|---|---|
| Run Pipeline | ❌ | n/a | n/a |
| Supervisor | ❌ | n/a | n/a |
| Verification Batch | ❌ | n/a | partial |
| Quality Review | ✅ | ⚠ | ✅ |
| Chapter Approval | ✅ | ⚠ | ⚠ |
| Render Queue | ❌ | n/a | partial |
| Print Prep | ❌ | n/a | partial |
| KDP Readiness | ⚠ | ⚠ | ⚠ |

- **3 features fully invisible** (Run Pipeline, Supervisor, Verification Batch)
- **3 features hidden / unnamed** (Render Queue, Print Prep). KDP Readiness exists in fragments.
- **2 features are findable** (Quality Review, Chapter Approval) but use dev terminology and lack bulk action.

The pattern is consistent: **the capability is built; the surface is missing or named wrong.**

---

## The simplest possible session-1 fix

Don't build features. Wire the supervisor's output into one dashboard tile.

```
┌─────────────────────────────────────────────────────────────┐
│ Production Status                                  [Refresh] │
│                                                              │
│  ⚠  BLOCKED                                                  │
│                                                              │
│  Next action:                                                │
│    Resolve flagged pages on the Page Plan before image       │
│    generation.                                               │
│                                                              │
│  Snapshot:                                                   │
│    Trim:           7 × 10 in                                 │
│    Pages:          289                                       │
│    Over capacity:  1 (CH06_P006_m — accepted outlier)        │
│    Estimated spend: $14.45 of $25.00 budget                  │
│                                                              │
│  [▶ Run Pipeline Check]                                      │
└─────────────────────────────────────────────────────────────┘
```

One tile. One POST. Renders the supervisor's PipelineReport. Answers the
new-employee question in one screen: *what is happening, what's the verdict,
what do I do next?*

After that one tile lands, the other six issues above (rename / surface /
bulk-approve) are each individually small.

**If you do nothing else from this review, do that tile.**

---

## What this review is NOT recommending

- No new backend features.
- No pipeline changes.
- No layout work.
- No image generation (per session constraint).
- No "Supervisor v2" — what shipped is the right scope.

The work the platform needs next is overwhelmingly **exposure**, not
construction. Every capability the new-employee benchmark requires already
exists somewhere; it just isn't in front of their eyes.
