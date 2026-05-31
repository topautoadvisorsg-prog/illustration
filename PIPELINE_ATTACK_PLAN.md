# Wildlands Pipeline Attack Plan

Last updated: 2026-05-30

## Current Reality

The production backend proves project creation, manuscript storage, Claude-based
manifest generation, and page row persistence. It does not yet prove a full book
pipeline. Stages 2-9 are still contracts, spikes, or worker shells.

## Priority 0 - Stop Data Loss And Build The Real Planning Spine

1. Manifest persistence must be append-safe.
   - Do not delete existing manifests/pages during reruns.
   - Lock Stage 1.5 manifests after writing.
   - Block reruns until explicit manifest versioning/replacement is implemented.
   - Every page row must reference its PAGE manifest through `pages.manifest_id`.

2. Stage 1 manuscript parsing must become deterministic.
   - Parse Markdown locally before Claude.
   - Produce chapter/entry/section IDs, source offsets, word counts, and warnings.
   - Claude may enrich structure, but it must not be the only source of truth.

3. Stage 2 page planner must exist as production code.
   - Calculate page word count and content type.
   - Classify danger/comparison/tall-subject/back-matter/page-role signals.
   - Select one of the 9 layouts using approved layout capacity metadata.
   - Record reason codes and text-fit requirements.
   - Assemble final prompt templates and prompt hashes.

4. The 9-layout reference library must become canonical.
   - Store the 9 mockup images and a `manifest.json`.
   - Require `capacityTestStatus: APPROVED` before production layout selection.
   - Keep each mockup, prompt template, placeholders, word range, and image slot
     rule together.

## Priority 1 - Approval And Artifact Locks

1. Add image review endpoints.
   - Approve, reject, request regeneration, and select active image version.
   - Store image events for audit history.

2. Freeze approved draft artifacts.
   - Lock prompt hash, layout template, source image version, crop box, dimensions,
     reviewer, and approval timestamp.
   - Upscale/final image stages must reference the approved image ID.

3. Enforce prompt completeness.
   - Fail if placeholders remain.
   - Fail if subject/scientific/context fields are empty.
   - Fail if prompt exceeds model budget.
   - Store prompt hashes for idempotency.

## Priority 2 - Layout, PDF, EPUB

1. Promote Stage 6 layout from spike to production.
   - One render component per layout.
   - Text-fit preview before image spend.
   - Overflow/missing asset failures must be explicit.

2. Implement PDF compilation and KDP preflight.
   - Page dimensions, trim/bleed boxes, margins, font embedding, DPI, page count,
     missing pages, checksums, and ICC/profile checks.

3. Implement EPUB export from manifests, not PDF.
   - Reflow-friendly content.
   - Kindle Previewer validation checklist.

## Immediate Sprint

1. Fix manifest persistence/linking.
2. Add deterministic Markdown outline parser.
3. Build Stage 2 planner skeleton with fixture tests.
4. Add layout reference manifest loader and validator.
5. Add operator-visible stage report output.
