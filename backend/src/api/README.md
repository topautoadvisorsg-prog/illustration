# API

Fastify route handlers for the Wildlands operator console and pipeline stages.

## Current Status

Implemented foundation routes:

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/health` | Backend and database health check |
| `POST` | `/api/projects` | Create a project with default Wildlands config |
| `GET` | `/api/projects` | List projects |
| `GET` | `/api/projects/:id` | Read one project |
| `PATCH` | `/api/projects/:id/config` | Save visible operator config, including layout library metadata |
| `POST` | `/api/projects/:id/manuscript` | Store manuscript and run deterministic Stage 1 outline parsing |
| `POST` | `/api/projects/:id/manifests` | Run Stage 1.5 Claude manifest generation and persist locked manifests |
| `GET` | `/api/projects/:id/manifests` | Read persisted manifests |
| `POST` | `/api/projects/:id/plan` | Run Stage 2 page planning |
| `GET` | `/api/projects/:id/pages` | Read persisted page rows and planner output fields |
| `POST` | `/api/projects/:id/text-fit-preview` | Run text-fit preview before image spend |
| `GET` | `/api/projects/:id/cost-estimate` | Estimate project image cost from generated-image count |
| `POST` | `/api/projects/:id/chapters/:chapterNumber/render` | Render one chapter PDF preview |
| `POST` | `/api/projects/:id/render-book` | Render/stitch book PDF and run KDP preflight |
| `GET` | `/api/agents` | Read backend agent contracts for the operator UI |
| `POST` | `/api/pages/:pageId/generate-image` | Generate one page illustration from its locked prompt |
| `GET` | `/api/pages/:pageId/images` | List generated image versions for one page |
| `POST` | `/api/pages/:pageId/images/:version/approve` | Approve and lock an image version |
| `POST` | `/api/pages/:pageId/images/:version/reject` | Reject an image version with an optional note |
| `POST` | `/api/pages/:pageId/images/:version/set-active` | Set a historical version active |
| `POST` | `/api/pages/:pageId/regenerate` | Regenerate one page image with an operator addendum |
| `POST` | `/api/pages/:pageId/upscale` | Upscale approved art and run the DPI gate |
| `GET` | `/api/content-types` | Read the content-type guide used by the planner |
| `GET` | `/api/render-check` | Render one sample PDF page without DB dependency |
| `GET` | `/api/render-check-chapter` | Render one sample chapter PDF without DB dependency |
| `GET` | `/api/intelligence/overview` | Read Publishing Intelligence dashboard counts |
| `GET` | `/api/intelligence/items` | Search/list knowledge records |
| `POST` | `/api/intelligence/experiments` | Record an experiment |
| `POST` | `/api/intelligence/decisions` | Record a publishing decision |
| `POST` | `/api/intelligence/standards` | Lock a versioned publishing standard |
| `POST` | `/api/intelligence/sops` | Create a versioned SOP |
| `POST` | `/api/intelligence/lessons` | Record a lesson learned |
| `POST` | `/api/intelligence/print-reviews` | Start a print proof review |
| `POST` | `/api/intelligence/print-findings` | Add a print proof finding |
| `POST` | `/api/intelligence/cost-events` | Record an API/render/storage cost |
| `POST` | `/api/intelligence/evidence` | Attach evidence to a knowledge record |
| `POST` | `/api/intelligence/links` | Link records for lineage |
| `POST` | `/api/intelligence/experiments/:id/promote-decision` | Promote experiment into a decision |
| `POST` | `/api/intelligence/decisions/:id/promote-standard` | Promote decision into a locked standard |

Routes not implemented yet:

- EPUB export endpoints
- auth-protected operator sessions

## Conventions

- Route groups live in one file per domain.
- Handlers validate request and response payloads with Zod schemas from
  `@wildlands/shared`.
- Handlers call backend services and pipeline stages; business logic should not
  live inside route functions.
- Route responses should expose enough state for the operator UI and reviewer
  debugging.
- Publishing Intelligence routes should preserve lineage and auditability; do
  not replace promotion workflows with ad hoc notes.

## Auth Status

Auth is not enforced yet. V1 plans single-user auth, but current route tests and
Railway smoke checks run without a bearer token.

Do not assume these routes are production-secure until auth middleware and tests
are added.

## Debugging

Health check:

```bash
curl http://localhost:8001/health
```

Create a project:

```bash
curl -X POST http://localhost:8001/api/projects \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"The Wildlands Field Guide\"}"
```

Run planner:

```bash
curl -X POST http://localhost:8001/api/projects/{projectId}/plan
```

Refresh Publishing Intelligence:

```bash
curl http://localhost:8001/api/intelligence/overview
curl "http://localhost:8001/api/intelligence/items?type=STANDARD"
```

Record a small experiment:

```bash
curl -X POST http://localhost:8001/api/intelligence/experiments \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Typography Test\",\"hypothesis\":\"11.5pt improves readability\",\"testPerformed\":\"Compare rendered pages\",\"tags\":[\"typography\"]}"
```

Save project config before planning:

```bash
curl -X PATCH http://localhost:8001/api/projects/{projectId}/config \
  -H "Content-Type: application/json" \
  -d "{\"config\":{...}}"
```

## Tests

```bash
yarn workspace @wildlands/backend test
```
