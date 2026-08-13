# API

Fastify route handlers for the Wildlands operator console, the MCP server, and
the pipeline stages.

## The route list is generated, not written here

A hand-maintained table of every endpoint is how this file went stale: it
claimed auth was unenforced (it is enforced), described the breakdown stage as
"Claude manifest generation" (it is deterministic and calls no model), and was
missing seven of the twelve route modules.

**The live list is the OpenAPI spec**, registered in `server.ts` and served at:

```
/api/docs
```

That is generated from the Zod schemas on the routes themselves, so it cannot
drift from the code.

## Route modules

One file per domain, all registered in `server.ts`.

| Module | Domain |
|---|---|
| `health.routes.ts` | liveness + database check |
| `projects.routes.ts` | projects, config, manuscript, manifests, cover, typeset preview |
| `books.routes.ts` | **book intake** and the **readiness gate** |
| `pagination.routes.ts` | Pagination v1 (self-gates on `PAGINATION_V1_ENABLED`) |
| `pages.routes.ts` | per-page image generation, versions, approval, upscale |
| `whole-page.routes.ts` | AI whole-page render track (self-gates on `WHOLE_PAGE_RENDER_ENABLED`) |
| `subject-badges.routes.ts` | deterministic subject/badge metadata cleanup |
| `supervisor.routes.ts` | no-spend pipeline supervisor, returns a PipelineReport |
| `epub.routes.ts` | Kindle EPUB build + preview |
| `review-workflow.routes.ts` | review queues and sign-off |
| `agents.routes.ts` | agent contracts for the operator UI |
| `diagnostics.routes.ts` | environment and storage diagnostics |

## Starting points

**Onboarding a book** — `POST /api/books/intake` takes a brief plus a manuscript
and returns a project that is already ingested, broken down where the track uses
it, paginated, and audited. `GET /api/books/intake-options` returns what a brief
may legally name, so a client never has to guess a profile id.

**Before spending** — `GET /api/projects/:id/readiness`. Free, deterministic,
read-only. Returns `READY | WARNING | BLOCKED` with a per-check reason and fix.
See `docs/DROP_A_BOOK.md`.

**Before a paid cover** — `GET /api/projects/:id/cover/preflight` shows the exact
geometry, blueprint, prompt and cost that a generation would use, and fails
closed. Nothing about a cover should be run before reading it.

## Auth

Enforced. `server.ts` installs an `onRequest` hook: when `CONSOLE_PASSWORD` is
set, every request must present it as `Authorization: Bearer <password>`, or as
a `k=` query parameter for `<img>` / `<iframe>` / PDF loads that cannot send a
header.

## Conventions

- One route group per domain file.
- Validate request and response payloads with Zod schemas from
  `@wildlands/shared`. The response schemas are what generate `/api/docs`.
- Business logic lives in `pipeline/` and `services/`, not in handlers. The
  intake route composes other routes through `app.inject` for exactly this
  reason: intake and the console then run the same code and cannot drift.
- Errors go through the centralized handler and carry
  `{ message, fields, action, errorCode, correlationId }` — never raw Zod paths.
  See `docs/ERROR_HANDLING_STANDARD.md`.
- Anything that spends money is split into a free preflight and an explicit
  spend call. See `docs/COST_CONTROL_POLICY.md`.

## Debugging

```bash
curl http://localhost:8001/health
```

```bash
curl -H "Authorization: Bearer $CONSOLE_PASSWORD" http://localhost:8001/api/projects/{id}/readiness
```

## Tests

```bash
yarn workspace @wildlands/backend test
```
