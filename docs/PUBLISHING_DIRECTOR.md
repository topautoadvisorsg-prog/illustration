# Publishing Director — Design Proposal

**Status:** design only. Nothing in this document is implemented yet.

This is the proposal for the missing layer the audit identified: the system that
owns the final question **"is this actually a good page?"** Today that question
has no owner — every decision component (Manifest Generator, Page Planner, Layout
Director, Text-Fit Analyzer, Page Quality Review) makes its own isolated call,
and Page Quality Review *advises* on the result but cannot act on it.

The Publishing Director is the **deterministic** layer that composes those
components and is allowed to *propose* changes the operator can apply with one
click. It is **not** an LLM agent; it is a service with a clear contract.

---

## 1. Responsibilities

Owns these decisions across a project, with the right to propose changes:

1. **Page balancing** — when a planned layout produces UNDERFILLED or OVERFLOW
   text-fit, propose a different layout (with reason) and queue the change.
2. **Continuation balancing** — when an entry spans an awkward N pages with a
   tiny tail (< 28% of the last page), propose a layout switch that pulls the
   tail back, or split into deliberate pages, or merge into a feature page.
3. **Chapter rhythm** — when a chapter is dominated by one layout (≥ 45%) or
   lacks any feature page despite ≥ 8 pages, propose specific layout changes on
   specific pages to restore variety.
4. **Feature-page distribution** — over the whole book, propose elevating
   chapter-defining subjects to feature treatment per the publishing style's
   targets (`featurePageTargetPercent` in `WILDLANDS_PUBLISHING_STYLE`).
5. **Illustration distribution** — propose where Visual Identity (Layer 3) and
   Supporting Illustration (Layer 2) should appear so no page feels visually
   abandoned, without forcing major artwork everywhere.
6. **Underfilled-page correction** — when a page's fill ratio < 25%, propose
   either an illustration-dominant layout or merging with a related entry, with
   the editorial reason.
7. **Overflow correction** — when an entry overflows its layout's capacity by
   more than the tight band, propose routing to a text-heavier layout or
   splitting the entry into purposeful pages (never silently chopping prose).

What it does NOT own:

- Manuscript content (text is sacred — the Director never rewrites copy).
- Image generation (the Director can propose *when* to regenerate but never
  picks subjects or invents prompts).
- Operator approvals (every proposal is one click to apply or dismiss; the
  Director never mutates state on its own).
- Anything in the production durable-storage / workflow-state-safety layer.

---

## 2. Inputs

A read-only snapshot of project state, gathered in one pass:

```ts
PublishingDirectorInput {
  project: ProjectRow
  config: ProjectConfig                     // including publishingStandard, planMeta, layoutPolicy
  pages: PageRow[]                          // current persisted plan
  manifests: ManifestRow[]                  // chapter + book metadata
  textFit: TextFitProject                   // full text-fit preview
  pageQuality: PageQualityReview            // existing findings
  imageLibrary: { count, byLayout, byStatus }
  publishingStyle: PublishingStyleProfile   // targets, principles, illustration layers
}
```

Note: every input is data the deterministic pipeline already produces. The
Director does not call new services; it *composes* what exists.

---

## 3. Outputs

A list of structured **proposals**, each with full provenance:

```ts
DirectorProposal {
  proposalId: string                        // stable hash, deduplicates across runs
  severity: 'BLOCKER' | 'WARNING' | 'INFO'
  scope: 'BOOK' | 'CHAPTER' | 'PAGE'
  category:
    | 'PAGE_BALANCE'                        // underfilled / overflow
    | 'CONTINUATION'                        // tail / split / merge
    | 'RHYTHM'                              // repetition / monotony
    | 'FEATURE_DISTRIBUTION'                // feature pages too rare / clustered
    | 'VISUAL_IDENTITY'                     // text-only pages w/o any accent
    | 'OVERFLOW' | 'UNDERFILL'
  pageKey?: string
  chapterNumber?: number
  problem: string                           // one sentence
  whyItMatters: string                      // tie to publishing style principle
  proposedAction: DirectorAction            // see below
  alternativeActions: DirectorAction[]
  expectedResult: string                    // what the proof will look like after
  evidence: {                               // every number the proposal relied on
    fillRatio?: number
    wordCount?: number
    estimatedRenderedPages?: number
    chapterDominantLayoutPercent?: number
    bookFeaturePercent?: number
  }
}

DirectorAction =
  | { kind: 'switch_layout'; pageKey: string; from: LayoutTemplateId; to: LayoutTemplateId }
  | { kind: 'force_layout'; pageKey: string; to: LayoutTemplateId; reasonCode: string }
  | { kind: 'reapply_repeatable_accent'; layoutTemplate: LayoutTemplateId; toAllPages: true }
  | { kind: 'split_entry'; pageKey: string; atParagraph: number }
  | { kind: 'merge_with_neighbor'; pageKey: string; neighborPageKey: string }
  | { kind: 'mark_as_intentional'; pageKey: string; note: string }
```

Each `DirectorAction` is something the existing API already supports (or can
support with a thin adapter):

- `switch_layout` / `force_layout` → the existing planner's `forcedLayoutTemplate`
  + `reasonCode` options, applied via re-plan on that single page.
- `reapply_repeatable_accent` → the existing repeating-shared-asset endpoint.
- `split_entry` / `merge_with_neighbor` → manifest edits (require re-breakdown
  versioning to land first).
- `mark_as_intentional` → annotation on the page, used to silence the proposal
  on future runs.

---

## 4. Authority

| Authority | Yes / No | Note |
|---|---|---|
| Read all project state | ✅ | Single read-only snapshot per run. |
| Compute proposals | ✅ | Pure function of input snapshot + policy. |
| Persist proposals for review | ✅ | Stored with the project so they survive refresh. |
| **Apply a proposal automatically** | ❌ | **Operator-approve only.** |
| Mutate text content | ❌ | Never. |
| Call OpenAI / Anthropic | ❌ | Deterministic only. |
| Reset approvals | ❌ | Goes through the existing approval-protection gate. |

The Director's authority is to **propose with provenance**, not to act. Every
proposal carries the evidence it was computed from, so a reviewer can audit the
chain at any time.

---

## 5. Override rules

The operator always wins:

1. **`mark_as_intentional`** — explicit operator decision that a finding is
   editorial intent. The Director skips that page/category in future runs.
2. **`forcedLayoutTemplate`** — once an operator forces a layout on a page, the
   Director cannot propose changing it (only flag with INFO severity).
3. **Approval-protected pages** — pages with APPROVED images are off-limits to
   layout proposals unless the operator opts in (consistent with the existing
   approval-protection gate).
4. **Policy thresholds** — every threshold the Director uses
   (`feature_min_pct`, `dominant_layout_threshold`, `tail_ratio_floor`,
   `fill_ratio_underfilled`) lives in editable config so the operator can tune
   sensitivity without forking code.

---

## 6. Operator interaction

The Director surfaces in three places in the UI, all read-mostly:

### a. Per-page badge (already groundwork in place via the decision-trace panel)
A small inline indicator on each page-plan card when a proposal exists for that
page. Click → opens the proposal with the apply / dismiss / mark-intentional
buttons.

### b. Chapter summary
A "Director recommendations" strip on the chapter card showing the count of
proposals by category and a one-click "Review proposals for this chapter" entry.

### c. Book overview
A top-level panel listing **book-scope** proposals (feature distribution, layout
diversity across chapters). Same review/apply pattern.

Every interaction is opt-in: dismissing a proposal records why; applying one
opens the existing approval-protected re-plan flow.

---

## 7. Where it sits in the pipeline

```
Stage 1.5  Breakdown       ─┐
Stage 2    Page Plan       ─┤
Stage 6a   Text-Fit        ─┤──> PUBLISHING DIRECTOR  ──> proposals (stored)
           Page Quality    ─┘     (deterministic;          │
                                   pure of snapshot)       │
                                                           ▼
                                                 Operator review UI
                                                           │
                                                           ▼
                                               (existing planner/router endpoints)
```

The Director sits **after** all the existing measurement and **before** the
operator approves. It never replaces Text-Fit or Page Quality Review — it
*composes* them and produces actions instead of observations.

---

## 8. Editable policy (already mostly exists; consolidate)

```ts
PublishingDirectorPolicy {
  enabled: boolean
  // Page balance
  fillRatioUnderfilledThreshold: number     // currently text-fit 0.25 hardcoded
  fillRatioOverflowThreshold: number        // currently text-fit 1.0 + textLight rule
  // Continuation
  tailRatioFloor: number                    // currently page-quality 0.28 hardcoded
  longEntryPageThreshold: number            // currently page-quality 4 hardcoded
  // Rhythm
  dominantLayoutThresholdPct: number        // currently page-quality 45 hardcoded
  minChapterPagesForRhythm: number          // currently page-quality 8 hardcoded
  // Feature distribution
  bookFeatureTargetPct: { min: number; max: number }   // from WILDLANDS_PUBLISHING_STYLE
  bookMixedTargetPct: { min: number; max: number }
  bookTextFirstTargetPct: { min: number; max: number }
  // Visual identity
  requireVisualIdentityOnTextOnlyPages: boolean
}
```

Every threshold above is already a hardcoded constant somewhere in the codebase.
Lifting them into one named policy block (per project config) is the operator
visibility win — it makes the Director's behavior **tunable per book** without
code changes.

---

## 9. Build phases (when we eventually build it)

Strict deferral order:

1. **Phase A — Read-only proposer.** Implement the Director as a function that
   returns proposals; no UI integration. Validate offline against the live
   project. (No risk to current workflow.)
2. **Phase B — Operator UI.** Add the per-page badge + chapter strip + book
   overview, with apply buttons that route through the existing `planPage`
   forced-layout path. (Reversible: dismissing restores the original plan.)
3. **Phase C — Policy editor.** Surface the `PublishingDirectorPolicy` in the
   project setup UI so operators can tune thresholds.
4. **Phase D — Mark-as-intentional persistence.** Per-page annotations that
   silence proposals; replaces the audit's "we keep getting the same advice"
   problem with explicit operator memory.

Phases A and B together are the real unlock; C and D are quality-of-life.

---

## 10. What the Director is NOT

- **Not an LLM agent.** Deterministic; the only LLMs in the system remain the
  Operator Adviser and Stage Reviewer chat-only roles.
- **Not a planner replacement.** The Page Planner still picks the initial
  layout; the Director only proposes *changes* to that plan.
- **Not a quality scorer.** Page Quality Review keeps producing findings; the
  Director composes them into actionable proposals.
- **Not an autopilot.** Every proposal requires operator approval.

---

## 11. Why this is the right next thing

Today's system produces a plan, advises on it, and stops. The operator is left
to translate advisory findings into actions by hand. The Director closes that
loop: every finding becomes a one-click proposal with full reasoning, every
override is explicit, every threshold is editable.

That is the difference between *"a collection of rules"* and *"a publishing
workflow with a director."*
