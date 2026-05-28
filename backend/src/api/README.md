# api

Fastify route handlers.

**Phase 1 routes:**
- `POST /api/projects` — create project + config
- `GET /api/projects` — list projects
- `GET /api/projects/{id}` — get project + status
- `POST /api/projects/{id}/manuscript` — upload manuscript (Stage 1)
- `POST /api/projects/{id}/manifests` — trigger Stage 1.5
- `POST /api/projects/{id}/plan` — trigger Stage 2
- `POST /api/projects/{id}/generate-images` — enqueue Stage 3 jobs
- `GET  /api/projects/{id}/images` — list images by status
- `POST /api/pages/{page_id}/images/{version}/approve` — Stage 4 approve
- `POST /api/pages/{page_id}/images/{version}/regenerate` — Stage 4 regen
- `POST /api/projects/{id}/export/premium-pdf` — Stage 6+7
- `POST /api/projects/{id}/export/kindle-epub` — Stage 8

**Conventions:**
- One file per route group (`projects.routes.ts`, `images.routes.ts`, ...).
- All routes use Zod schemas from `@wildlands/shared` via `fastify-type-provider-zod`.
- OpenAPI docs auto-published at `/api/docs` via `@fastify/swagger-ui`.
- Auth: `preHandler` hook validates Supabase JWT.
- No business logic in handlers — handlers call pipeline services.

**Testing:**
- Every route has a Vitest test using `fastify.inject()`.
- Tests run against an in-memory test DB + mocked external services.
