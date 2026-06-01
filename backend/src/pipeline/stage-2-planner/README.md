# Stage 2 - Page Planner

**Status:** Implemented foundation with layout-library validation.

Stage 2 turns locked PAGE manifests into operator-visible page plans. It does
not spend image API money yet.

## What It Does

For every persisted PAGE manifest, Stage 2:

- validates the configured layout prompt/reference library
- calculates text word count
- classifies content signals
- chooses one of the configured layout templates
- uses written layout metadata as the main decision input
- applies typography and capacity metadata
- assembles an image-only prompt from the selected layout prompt asset
- hashes the prompt with SHA-256
- reports blockers, warnings, and prompt readiness
- updates the `pages` row with `layout_template`, `image_prompt`, and
  `image_prompt_sha256`

## Layout Library Model

The uploaded layout image is the visual source of truth during setup, but the
planner should not need to inspect the image every time. After the mockup is
analyzed, the written metadata becomes canonical:

- layout description
- use cases
- avoid rules
- text zone description
- image zone description
- min/target/max word capacity
- recommended body size and line height
- capacity approval status
- prompt template and required placeholders
- inherited Master Style DNA through `{MASTER_STYLE_DNA}`

Layouts are strong reference templates, not rigid cages. They provide image
placement, negative space, reading flow, content zones, and hierarchy. They do
not provide article text or detailed educational analysis.

The core invariant is text-area preservation: future educational content zones
must remain clear. The planner appends layout-system safety rules to every
image prompt so generated images do not consume reserved text areas or create
readable fake text.

## Inputs

- Project ID
- Locked PAGE manifests in the database
- Page rows linked to those manifests through `pages.manifest_id`
- Project config with layout prompt assets
- Agent behavior contracts from `backend/src/agents/agent-contracts.ts`

## Outputs

The route response includes:

- `layoutLibrary`
- `plannedPages`
- page word count
- selected layout
- layout instructions
- capacity status
- prompt hash
- prompt readiness
- blockers and warnings
- PAGE_PLANNER agent metadata

The database page row is updated with:

- `layout_template`
- `image_prompt`
- `image_prompt_sha256`

## API

```bash
curl -X POST http://localhost:8001/api/projects/{projectId}/plan
```

The frontend saves the visible project config through
`PATCH /api/projects/{projectId}/config` before planning, so Stage 2 uses the
current layout library values.

## Layout Selection

Current deterministic first pass:

```text
danger signal                 -> LAYOUT_12_DIAGNOSTIC_DIAGRAM
chapter opener                -> LAYOUT_5_CHAPTER_OPENER
progression or life cycle     -> LAYOUT_15_PROGRESSION_STUDY
cutaway or layered subject    -> LAYOUT_16_CUTAWAY_FEATURE
comparison or look-alike      -> LAYOUT_4_DANGER_WARNING
diagnostic diagram            -> LAYOUT_12_DIAGNOSTIC_DIAGRAM
feature/banner overview       -> LAYOUT_13_FEATURE_BANNER
track, habitat, or vignette   -> LAYOUT_7_SCATTERED_VIGNETTES
tree or tall plant, short     -> LAYOUT_8_MARGIN_ILLUSTRATION
tree or tall plant, longer    -> LAYOUT_14_SIDEBAR_FEATURE
word count < 200              -> LAYOUT_3_ILLUSTRATION_DOMINANT
word count > 400              -> LAYOUT_2_TEXT_HEAVY
otherwise                     -> LAYOUT_1_STANDARD
```

## Important Rules

- Stage 2 is deterministic in v1. It does not call Claude.
- It chooses a layout and prompt plan; it does not generate images.
- Image generation remains blocked when required layout assets or placeholders
  are missing.
- Every layout prompt must inherit the active Master Style DNA so subject/page
  choices can change without losing the book's visual identity.
- The image prompt must describe only illustration subject, composition, and
  reserved content zones.
- Layouts are allowed minor subject-specific composition adjustments when they
  improve readability or page quality.
- Text areas win over visual density. When in doubt, preserve more negative
  space.
- The image model must not render paragraphs, article text, captions,
  educational content, fake encyclopedia text, page numbers, headers, reference
  notes, or unrequested labels.
- If the approved layout needs visible image text, it must be an exact
  subject-name label supplied by the prompt. It should be large, legible, and
  the only readable text in the generated image.
- Annotations should be minimal: 0-2 major, obvious educational features per
  subject, never dense scientific poster labeling.
- Final text placement belongs to Stage 6.

## Current Limitations

- Layout reference images are captured in project config, but not yet stored as
  durable standalone layout-library records.
- Measured capacity still needs to be filled in from real mockup tests.
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
   - `layoutLibrary.issues` explains missing/incomplete layout metadata.
   - `reasonCodes` explains why the layout was selected.
   - `blockers` explains why a page cannot move toward image spend yet.
   - `warnings` shows capacity/text-fit risks.
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
