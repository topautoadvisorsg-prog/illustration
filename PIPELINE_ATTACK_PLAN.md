# Wildlands Pipeline Attack Plan

Last updated: 2026-06-01

## Current Reality

The backend now implements the full per-page production chain (each stage gated;
paid APIs are dependency-injected so they never run in tests):

```text
project -> stored manuscript -> deterministic outline -> Claude manifests
  -> locked manifest persistence -> PAGE rows -> deterministic page plans (Stage 2)
  -> text-fit preview gate (Stage 6, browser-free analysis)
  -> image generation (Stage 3, gpt-image-2, spend-gated)
  -> human review: approve/reject/regenerate/set-active (Stage 4)
  -> upscale + 300 DPI print gate (Stage 5, Real-ESRGAN)
```

Remaining to produce a finished book: Stage 6 final render + Stage 7 stitch/
preflight (both need a Chromium binary on the host) and Stage 8 EPUB (no browser).

All P0 audit consistency fixes are done: master style block wired, color unified,
layouts deduped to 15, clean-art prompt rule enforced.

## Completed Since The Review

1. Manifest persistence hardening
   - Stage 1.5 no longer deletes prior manifests/pages during reruns.
   - Manifests are written locked.
   - Reruns are blocked until explicit versioning/replacement exists.
   - Page rows reference PAGE manifest IDs through `pages.manifest_id`.

2. Deterministic manuscript outline parser
   - Parses Markdown chapters, entries, sections, source lines, word counts, and
     warnings before Claude runs.
   - Ignores headings inside fenced code blocks.
   - Upload responses expose the parsed structure for operator review.

3. Claude manifest guardrails
   - Claude output is validated against the deterministic outline.
   - Missing manuscript storage returns a clear 404.
   - Chapter number/title and page alignment are checked before persistence.

4. Stage 2 page planner foundation
   - Calculates word count.
   - Classifies content signals.
   - Selects one of the 9 layout templates.
   - Uses written layout metadata from the mockup library.
   - Builds image-only prompts from layout prompt assets.
   - Stores prompt hashes.
   - Returns decision reason codes, blockers, warnings, capacity state, layout
     instructions, and agent metadata.

5. Agent contracts
   - Backend-owned behavior contracts now exist for manuscript analysis, page
     planning, layout selection, prompt assembly, text-fit QA, and image QA.
   - Stage 2 exposes the `PAGE_PLANNER` contract in its response.

## Highest-Risk Gaps Still Open

1. Canonical 9-layout library
   - Project config now stores the written metadata and uploaded mockup data URL.
   - Need durable standalone records/files for the 9 mockups.
   - Need measured capacity approval from real text-fit tests.

2. Prompt placeholder enforcement
   - Stage 2 now reports blockers for missing required placeholders and
     unresolved placeholders.
   - Next step is preventing Stage 3 enqueue whenever any blocker exists.

3. Text-fit preview before image spend
   - Stage 6 preview renderer is not production yet.
   - The pipeline must prove text fits the chosen layout before Stage 3 image
     generation runs.

4. Human approval and artifact locks
   - Need approve/reject/regenerate endpoints.
   - Approved records must lock layout, prompt hash, image version, crop box,
     dimensions, reviewer, and timestamp.

5. Stage 3+ production workers
   - Image generation worker is not wired to the page plan yet.
   - Upscale, DPI gate, PDF compile, EPUB export, and final preflight remain
     pending.

6. Auth
   - Current routes are useful for testing but not production-secure.
   - Single-user auth still needs enforcement and route tests.

## Next Sprint

1. Build the layout reference library
   - Add backend storage/metadata for the 9 layouts.
   - Add upload/update API routes.
   - Add validator for required prompt placeholders and capacity fields.
   - Surface the library in the operator UI.

2. Harden Stage 2
   - Require approved layout capacity before production planning.
   - Fail on unresolved prompt placeholders.
   - Add manual layout override support.
   - Add page continuation planning for overflow risk.

3. Add Stage 6 text-fit preview foundation
   - Render placeholder layout previews without final generated art.
   - Detect overflow and overlap.
   - Return preview artifacts and QA status to the operator.

4. Add approval workflow
   - Page plan approval.
   - Prompt approval.
   - Image approval.
   - Immutable approved artifact records.

5. Then wire Stage 3 image generation
   - Only run after page text/layout/prompt approval.
   - Store prompt hash and generated image version.
   - Make regeneration auditable.

## Reviewer Focus

Claude should focus on:

- whether Stage 1 deterministic outline parsing matches the intended manuscript
  rules
- whether Stage 1.5 validation prevents Claude from inventing/removing pages
- whether Stage 2 layout selection is too naive for real manuscript pages
- whether prompt assembly can leak layout/text instructions to the image model
- whether the operator can see enough state to approve or reject decisions
- whether current docs accurately separate implemented code from planned stages
