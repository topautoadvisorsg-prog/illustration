# Wildlands Pipeline Attack Plan

Last updated: 2026-05-31

## Current Reality

The production backend now proves the no-image-cost intake spine:

```text
project -> stored manuscript -> deterministic outline -> Claude manifests
  -> locked manifest persistence -> PAGE rows -> deterministic page plans
```

This is enough to test manuscript intake, manifest quality, page breakdown, and
initial layout/prompt planning. It is not yet a full book-production pipeline.

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
   - Builds image-only prompts from layout prompt assets.
   - Stores prompt hashes.
   - Returns decision reason codes and agent metadata.

5. Agent contracts
   - Backend-owned behavior contracts now exist for manuscript analysis, page
     planning, layout selection, prompt assembly, text-fit QA, and image QA.
   - Stage 2 exposes the `PAGE_PLANNER` contract in its response.

## Highest-Risk Gaps Still Open

1. Canonical 9-layout library
   - Need upload/storage for the 9 mockup layout images.
   - Need manifest metadata for image slots, text zones, word ranges,
     typography ranges, and prompt placeholders.
   - Production selection should require approved capacity metadata.

2. Prompt placeholder enforcement
   - Stage 2 assembles prompts and hashes them.
   - It still needs a hard fail if placeholders remain or required subject
     fields are empty.

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
