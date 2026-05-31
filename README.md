# The Wildlands Publishing Platform

Automated book publishing pipeline for The Wildlands field-guide series:

```text
manuscript.md -> manuscript outline -> manifests -> page plan
  -> layout/text-fit approval -> image prompts -> generated art
  -> upscale/DPI gate -> PDF/EPUB exports
```

## Current Status

Phase 1 backend foundation is now underway. This repo is no longer only Phase 0
spikes.

Implemented and testable:

- Fastify backend with health/API routes
- Supabase Postgres schema and migrations
- Project creation with visible project config
- Manuscript upload and local storage
- Deterministic Markdown outline parser
- Claude Stage 1.5 manifest generation
- Locked manifest persistence
- Page rows linked to PAGE manifests
- Stage 2 deterministic page planner
- Stage 2 layout-library validation with written layout metadata
- Agent behavior contracts
- Operator frontend for backend URL, project setup, manuscript upload, manifest
  generation, page planning, layout prompt assets, and output inspection

Not implemented yet:

- Real Stage 3 image generation worker
- Human image approval endpoints
- Upscale worker
- Text-fit preview renderer
- Final PDF/EPUB production exports
- Full auth enforcement

## V1 Scope

- Brand: `THE_WILDLANDS`
- Audience: adult only
- Outputs: premium 8.5 x 11 full-color PDF and Kindle EPUB
- Storage: local file storage for v1
- Auth: single-user Supabase Auth planned
- No mid-tier, no economic, no large print, no kids edition in v1

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | Node.js + TypeScript + Fastify |
| Frontend | React + TypeScript |
| Validation | Zod |
| Database | Supabase Postgres + Drizzle ORM |
| Queue | BullMQ + Upstash Redis |
| LLM | Anthropic Claude |
| Image generation | OpenAI `gpt-image-1` |
| Upscale | Replicate Real-ESRGAN |
| PDF engine | Puppeteer + Paged.js |
| EPUB | `epub-gen-memory` |
| Logging | Pino |

## Repo Layout

```text
backend/   API, DB, pipeline stages, services, workers
frontend/  Operator console
shared/    Zod schemas and shared TypeScript contracts
spikes/    Phase 0 spike/proof code
docs/      Architecture notes and decisions
memory/    Project memory
```

## Current Testable Flow

1. Create a project.
2. Upload/paste a `.md` manuscript.
3. Stage 1 parses the manuscript locally into chapters, entries, sections,
   word counts, source lines, and warnings.
4. Stage 1.5 calls Claude to generate book/chapter/page manifests.
5. Manifest output is locked and persisted.
6. Stage 2 plans pages:
   - counts words
   - classifies content signals
   - selects one of the 9 layout templates
   - validates the written layout library metadata
   - applies layout typography/capacity metadata
   - assembles the image-only prompt
   - reports blockers/warnings before image spend
   - stores `layout_template`, `image_prompt`, and `image_prompt_sha256`

## Railway

Current live backend:

```text
https://wildlandsbackend-production.up.railway.app
```

The backend requires `DATABASE_URL` to use the Supabase shared pooler URL:

```text
postgresql://postgres.<project-ref>:PASSWORD@aws-1-us-west-2.pooler.supabase.com:6543/postgres
```

The frontend uses:

```text
REACT_APP_BACKEND_URL=https://wildlandsbackend-production.up.railway.app
```

## Commands

```bash
yarn install
yarn workspace @wildlands/shared typecheck
yarn workspace @wildlands/backend typecheck
yarn workspace @wildlands/backend test
yarn workspace frontend build
```

Run backend locally:

```bash
yarn workspace @wildlands/backend dev
```

Run frontend locally:

```bash
yarn workspace frontend dev
```

## Handoff Notes For Review

Start with:

- `PIPELINE_ATTACK_PLAN.md`
- `backend/src/pipeline/README.md`
- `backend/src/agents/README.md`
- `backend/src/pipeline/stage-1-ingestion/README.md`
- `backend/src/pipeline/stage-1.5-manifests/README.md`
- `backend/src/pipeline/stage-2-planner/README.md`
- `backend/src/api/README.md`

The highest-value review target is Stage 2 correctness: layout selection,
prompt assembly, missing placeholder detection, capacity risk reporting, and
operator-visible page planning output.
