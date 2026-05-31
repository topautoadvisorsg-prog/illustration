# Pipeline

The backend pipeline is the product. UI exists only to operate and inspect the
pipeline.

## Stages

```text
Stage 1     Manuscript Ingestion        implemented foundation
Stage 1.5   Manifest Generation         implemented foundation
Stage 2     Scene & Page Planner        implemented foundation + layout validation
Stage 3     Image Generation            worker shell only
Stage 4     Image Preview & Review      README contract only
Stage 5     Upscale                     worker shell only
Stage 6     Layout Engine               spike only / production pending
Stage 7     Final PDF Compilation       README contract only
Stage 8     Ebook Export                README contract only
```

## Implemented Flow

1. `POST /api/projects`
   - Creates a project and stores full project config.
2. `POST /api/projects/:id/manuscript`
   - Stores the Markdown manuscript.
   - Parses deterministic outline locally.
   - Returns chapter/entry/word totals and warnings.
3. `POST /api/projects/:id/manifests`
   - Reads the stored manuscript.
   - Calls Claude with the deterministic outline.
   - Validates Claude output against local structure.
   - Persists locked book/chapter/page manifests.
   - Seeds page rows linked to PAGE manifests.
4. `POST /api/projects/:id/plan`
   - Reads PAGE manifests.
   - Counts words and classifies page signals.
   - Selects one of the 9 layout templates.
   - Applies layout typography/capacity metadata.
   - Assembles an image-only prompt and SHA-256 hash.
   - Saves `layout_template`, `image_prompt`, and `image_prompt_sha256`.

## Agent Contracts

Agent behavior contracts live in `backend/src/agents`.

Current contracts:

- `MANUSCRIPT_ANALYST`
- `PAGE_PLANNER`
- `LAYOUT_SELECTOR`
- `PROMPT_ASSEMBLER`
- `TEXT_FIT_QA`
- `IMAGE_QA`

The Stage 2 API response includes the `PAGE_PLANNER` contract metadata plus
layout-library issues, written layout instructions, capacity status, blockers,
warnings, and prompt hashes.

## Current Gaps

- Stage 2 does not yet split long entries into multiple continuation pages.
- Stage 2 reports prompt/capacity blockers, but Stage 3 is not wired yet to
  enforce those blockers.
- Layout mockups are still stored inside project config rather than durable
  standalone layout-library records.
- Stage 6 text-fit preview is not implemented in production.
- Stage 3 image generation is not wired to prompt approval.
- Stage 4 human approval/version locking is not implemented.
- Stage 5-8 workers are not production-ready.

## Test Commands

```bash
yarn workspace @wildlands/backend typecheck
yarn workspace @wildlands/backend test
yarn workspace frontend build
```

## Debugging

If Railway shows `502`, check backend logs first:

```bash
npx -y @railway/cli logs \
  --project 9490de69-ba24-4da8-abe7-a9234457ad8d \
  --environment production \
  --service @wildlands/backend \
  --latest \
  --lines 120
```

If startup dies at `drizzle-kit migrate`, check `DATABASE_URL`. It should use
the Supabase pooler host, not the direct `db.<project>.supabase.co:5432` host.
