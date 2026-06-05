# Workflow Step Polish Audit

Purpose: review every operator workflow step and identify what would make it clearer, faster, and more useful for producing books.

## 1. Project Setup

Current value: creates/selects the book workspace and stores basic identity.

Polish opportunity: add a one-screen "Project Brief" summary: title, region/book type, target reader, chosen standard, and next unfinished step.

Why it helps: the operator can confirm the business intent of the book before the system starts creating artifacts.

## 2. Publishing Standards

Current value: chooses format and geometry before planning. First Chapter Calibration now compares standards without mutation or cost.

Polish opportunity: add "Apply recommended standard" after calibration, with a warning if planning already exists.

Why it helps: calibration should not only report a recommendation; it should give the operator a safe way to accept it.

## 3. Upload Manuscript

Current value: stores the master manuscript and preserves browser cache fallback.

Polish opportunity: show a manuscript intake receipt immediately after upload: filename, word count, detected chapters, detected entries, and any parsing warnings.

Why it helps: the operator knows the system read the right file before breakdown.

## 4. Review Breakdown

Current value: creates the chapter/page-entry map.

Polish opportunity: add a compact chapter distribution chart and "oddities" list: very short chapters, very long entries, duplicate-looking titles, missing chapter titles.

Why it helps: breakdown review becomes editorial QA, not just a list of chips.

## 5. Review Page Plan

Current value: assigns layouts, prompts, capacity notes, and blockers.

Polish opportunity: add a chapter rhythm strip: text-heavy, mixed, feature, reference, warning, and continuation distribution.

Why it helps: the operator can spot mechanical or repetitive design before rendering.

## 6. Text-Fit Check

Current value: flags fit/tight/overflow/underfilled before image spend.

Polish opportunity: add a "Top pages needing review" shortlist with direct page links.

Why it helps: the operator does not need to scan 129 entries to find risky pages.

## 7. Page Quality Review

Current value: publishing director layer for rhythm, whitespace, continuations, and layout diversity.

Polish opportunity: add "Apply/queue fix" actions later: switch layout, reduce/increase art coverage, split/merge continuation, mark acceptable.

Why it helps: recommendations become a workflow, not just a report.

## 8. Approve Layouts

Current value: chapter gate before image spend.

Polish opportunity: make approval explicitly proof-backed: "Approved from Text-Fit only" vs "Approved after rendered proof."

Why it helps: the system can distinguish technical layout approval from visual proof approval.

## 9. Render Proofs

Current value: renders selected page/chapter/book PDFs and shows the proof object.

Implemented first pass: Proof Review Gallery now shows per-page proof cards with layout, text-fit status, proof-page count, art state, warning count, and one-click focused page proof.

Remaining polish opportunity: add actual rendered page thumbnails, selected page large preview, next/previous keyboard navigation, and approve/request changes.

Why it helps: proofing becomes a publishing desk instead of an iframe.

## 10. Manage Images

Current value: generates, reviews, reuses, approves, rejects, and upscales selected-page images.

Polish opportunity: show cost estimate and image scope in the image stage: selected page, missing art count, generated asset count, approved count.

Why it helps: the operator understands spend and scope before image generation.

## 11. Export Book

Current value: render/download current PDF proof, save export report, render cover/full book.

Polish opportunity: one "Download for KDP" package: interior PDF, cover PDF, preflight report, project standard summary.

Why it helps: export becomes a production handoff, not a collection of render buttons.

## Cross-Cutting Improvements

1. Best Next Move panel: always show the recommended next action, why it matters, risk if skipped, and the button.
2. Stage-specific review object: every stage should leave a visible artifact, not only a log entry.
3. Cost visibility: show estimated API cost before image generation and full-book renders.
4. Versioning: allow re-breakdown/re-plan as new versions instead of blocking edits after the first pass.
5. Operator notes: allow notes per chapter/page/image/proof so decisions are not lost between sessions.

## Recommended Next Build Order

1. Proof Review Gallery.
2. Cost visibility in Image Review.
3. Apply recommended publishing standard from calibration.
4. Export clarity / Download for KDP.
5. Manifest and plan versioning.
