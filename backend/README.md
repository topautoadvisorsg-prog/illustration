# Backend - Wildlands Publishing Platform

The backend owns the pipeline, API, database schema, workers, and durable
Publishing Intelligence records.

**Status:** Phase 1 backend foundation. Real routes exist for projects,
manuscript ingestion, manifest generation, page planning, PDF preview/render
work, and the Publishing Intelligence Center. External image/export spend is
still gated behind later stages.

## What's Here

```text
src/
  api/                Fastify route groups
  db/                 Drizzle schema, migrations, repositories
  pipeline/           The 8-stage publishing pipeline
  services/           External clients and domain services
    claude/           Anthropic Claude SDK wrapper
    openai/           OpenAI gpt-image-2 wrapper
    publishing-intelligence/
                      Experiments, decisions, standards, SOPs, costs,
                      print reviews, lessons, evidence, lineage
    replicate/        Real-ESRGAN upscaling
    storage/          Local file storage for v1
    supabase/         Supabase client notes
    redis/            Upstash Redis/BullMQ connection
    sentry/           Error monitoring setup
  workers/            BullMQ workers for async pipeline stages
  lib/                Cross-cutting code
  env.ts              Zod-validated env loading
  server.ts           Fastify server factory
  index.ts            App entry point

scripts/
  smoke-test.ts       External API smoke tests
  audit-manuscript.ts Deterministic manuscript parser audit
  storage-prune.ts    R2 cleanup (yarn storage:prune --dry-run | --confirm)
  build-local2.ts     Assemble the interior PDF to local disk
  printprep-local.ts  Local 300-DPI print-prep (folio centered, badges gated)
  _*.ts               Ad-hoc operator/QA tools (render, inspect, fix, audit) — disposable
```

Each major subdirectory has its own README. Read those for stage-by-stage detail.

## Operating rules & ops

- **`/CLAUDE.md`** (repo root) — agent operating rules: strict scope, render-once,
  reproduce-the-approved-blueprint, the R2 storage policy, and the build→local→KDP flow.
  Read it before working in this repo.
- **`KNOWN_BUGS.md`** — tracked platform bugs (e.g. per-page blueprint overrides not
  applying to opener pages).
- **Storage:** writes are R2-only. Run `yarn storage:prune` (dry-run) to review junk,
  `--confirm` to delete. ACTIVE / FINAL_EXPORT / APPROVED_BACKUP are never deleted.
- **Build:** `build-local2.ts <projectId> <outDir>` (node `--max-old-space-size=8192`)
  writes the interior PDF locally; validate with `validate-delivery.ts`. Use the
  hardcover cover, not `build-local2`'s auto paperback cover.

## How To Run Locally

```bash
yarn install
yarn workspace @wildlands/backend typecheck
yarn workspace @wildlands/backend test
yarn dev:backend
```

Run migrations:

```bash
yarn workspace @wildlands/backend drizzle:migrate
```

Run smoke tests when keys are present:

```bash
yarn smoke
```

## What Can Go Wrong

| Symptom | Likely Cause | Fix |
|---|---|---|
| `Env validation failed` at boot | Missing or placeholder env values | Fill required keys; check `src/env.ts` |
| `/api/intelligence/*` missing table | Drizzle migration has not run | Run `yarn workspace @wildlands/backend drizzle:migrate` |
| `DATABASE_URL is still a placeholder` | Backend tried DB access without Supabase URL | Set the Supabase Postgres pooler URL |
| `ECONNREFUSED` on Redis | Wrong Upstash URL type | Use the native Redis URL for BullMQ |
| Anthropic 401 | Bad or missing `ANTHROPIC_API_KEY` | Regenerate the key |
| OpenAI 403 on image model | Org/key access problem | Confirm org access and key permissions |
| Supabase 401 | Wrong anon/service role key | Use service role only on backend |
| Sharp install fails | Native binary mismatch | Reinstall dependencies on the target platform |

## Conventions

- Keep pipeline stages idempotent.
- Keep routes thin; business workflows live in services.
- Keep persistence in repository files.
- Validate public API payloads with Zod contracts from `@wildlands/shared`.
- Avoid unrelated refactors while pipeline stages are under test.
