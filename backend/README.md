# Backend — Wildlands Publishing Platform

The pipeline. The API. The product.

**Status:** Phase 0 — scaffold only. Smoke tests for all 6 external services. No real pipeline code yet.

---

## What's Here

```
src/
  api/                Fastify routes (Phase 1+)
  db/                 Drizzle schema + migrations (Phase 1)
  pipeline/           The 8-stage pipeline
    stage-1-ingestion/
    stage-1.5-manifests/
    stage-2-planner/
    stage-3-generation/
    stage-4-review/
    stage-5-upscale/
    stage-6-layout/
    stage-7-pdf-compile/
    stage-8-epub/
  services/           Typed wrappers for every external API
    claude/           Anthropic Claude SDK
    openai/           OpenAI gpt-image-1
    replicate/        Real-ESRGAN upscaling
    storage/          StorageService interface (local FS for v1, S3 v2)
    supabase/         Auth + Postgres client
    redis/            Upstash Redis connection
    sentry/           Error monitoring setup
  workers/            BullMQ workers for async pipeline stages
  lib/                Cross-cutting code (logger, errors)
  env.ts              Zod-validated env loading
  server.ts           Fastify server factory
  index.ts            App entry point

scripts/
  smoke-test.ts       Day 1 smoke tests for all external APIs
```

Each subdirectory has its own README. Read those for stage-by-stage detail.

---

## How To Run Locally

```bash
# From repo root
yarn install

# Copy & fill env vars
cp .env.example .env
# Edit .env with real keys

# Run smoke tests (validates all 6 external APIs reachable)
yarn smoke

# Run backend dev server (Phase 1+ — once routes exist)
yarn dev:backend

# Type-check
yarn workspace @wildlands/backend typecheck
```

---

## What Can Go Wrong

| Symptom | Likely Cause | Fix |
|---|---|---|
| `Env validation failed` at boot | Missing or placeholder values in `.env` | Fill required keys; check `src/env.ts` schema |
| `ECONNREFUSED` on Redis | Upstash URL wrong or BullMQ using REST URL instead of TCP | Use TCP/native Redis URL from Upstash, not REST |
| Anthropic 401 | Bad / missing `ANTHROPIC_API_KEY` | Regenerate at console.anthropic.com |
| OpenAI 403 on gpt-image-1 | Org not verified | Complete OpenAI org verification |
| Replicate 401 | Bad token | Regenerate at replicate.com/account/api-tokens |
| Supabase 401 | Wrong key (anon vs service_role) | Service-role key required for server-side ops |
| Sharp install fails | Native binary missing | `yarn install` with platform-correct prebuilds |

---

## Conventions

- **One file = one responsibility.** Max 200 lines.
- **One function = one job.** Max 50 lines.
- **No `any`.** Ever.
- **Every external API call** goes through a typed service wrapper in `src/services/*`. Never raw `fetch` in pipeline code.
- **All async pipeline stages are idempotent.** Re-running produces the same output.
- **All errors logged via Pino with `stage`, `book_id`, `page_id`, `correlation_id` fields.**
