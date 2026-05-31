# Stage 2 - Page Planner

**Status:** Implemented foundation.

Stage 2 is the first production planning step after Claude manifests. It turns
locked PAGE manifests into operator-visible page plans. It does not spend image
API money yet.

## What It Does

For every persisted PAGE manifest, Stage 2:

- calculates text word count
- classifies content signals
- chooses one of the 9 layout templates
- applies brand typography and rough capacity metadata
- assembles an image-only prompt from the selected layout prompt asset
- hashes the prompt with SHA-256
- updates the `pages` row with `layout_template`, `image_prompt`, and
  `image_prompt_sha256`
- returns agent metadata and decision reason codes to the frontend

## Inputs

- Project ID
- Locked PAGE manifests in the database
- Page rows linked to those manifests through `pages.manifest_id`
- Project config:
  - typography defaults
  - layout prompt assets
  - brand/output profile
- Agent behavior contracts from `backend/src/agents/agent-contracts.ts`

## Outputs

The route response includes:

- `pageId`
- `manifestId`
- `title`
- `wordCount`
- `contentSignals`
- `layoutTemplate`
- `layoutName`
- `typography`
- `capacity`
- `reasonCodes`
- `imagePrompt`
- `imagePromptSha256`
- `status: PENDING_PREVIEW`
- `agent`

The database page row is updated with:

- `layout_template`
- `image_prompt`
- `image_prompt_sha256`

## API

```bash
curl -X POST http://localhost:8001/api/projects/{projectId}/plan
```

The frontend uses this endpoint through the `Plan Pages` button and through the
larger `Run Intake` workflow after manuscript upload and manifest generation.

## Layout Selection

Current deterministic first pass:

```text
danger signal                 -> LAYOUT_4_DANGER_WARNING
chapter opener                -> LAYOUT_5_CHAPTER_OPENER
back matter                   -> LAYOUT_6_BACK_MATTER
comparison or diagnostic      -> LAYOUT_9_DIAGNOSTIC_DIAGRAM
track, habitat, or vignette   -> LAYOUT_7_SCATTERED_VIGNETTES
tree or tall plant            -> LAYOUT_8_MARGIN_ILLUSTRATION
word count < 200              -> LAYOUT_3_ILLUSTRATION_DOMINANT
word count > 400              -> LAYOUT_2_TEXT_HEAVY
otherwise                     -> LAYOUT_1_STANDARD
```

## Important Rules

- Stage 2 is deterministic in v1. It does not call Claude.
- It chooses a layout and prompt plan; it does not generate images.
- The image prompt must describe only the illustration subject and composition.
- The image model must not render page text, headers, page numbers, or the full
  book layout.
- Final text placement belongs to Stage 6.

## Current Limitations

These are known gaps for the next reviewer to check:

- Layout reference images are not uploaded into a canonical library yet.
- Layout capacity is based on default metadata, not measured approved mockups.
- Prompt placeholder enforcement is not yet a hard blocker.
- Stage 6 text-fit preview is not implemented yet.
- Continuation-page splitting for overflow text is not implemented yet.
- Human approval locks are not implemented yet.
- Stage 3 image-generation jobs are not enqueued from this stage yet.

## How To Debug

1. Confirm manifests exist:

```bash
curl http://localhost:8001/api/projects/{projectId}/manifests
```

2. Run the planner:

```bash
curl -X POST http://localhost:8001/api/projects/{projectId}/plan
```

3. Inspect the response:
   - `reasonCodes` explains why the layout was selected.
   - `agent` shows the PAGE_PLANNER behavior contract.
   - `imagePromptSha256` confirms prompt hashing.

4. Inspect pages:

```bash
curl http://localhost:8001/api/projects/{projectId}/pages
```

## Tests

```bash
yarn workspace @wildlands/backend test -- plan-pages
```

The full backend suite also covers Stage 2 behavior:

```bash
yarn workspace @wildlands/backend test
```
