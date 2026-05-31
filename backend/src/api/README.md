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
| `POST` | `/api/projects/:id/manuscript` | Store manuscript and run deterministic Stage 1 outline parsing |
| `POST` | `/api/projects/:id/manifests` | Run Stage 1.5 Claude manifest generation and persist locked manifests |
| `GET` | `/api/projects/:id/manifests` | Read persisted manifests |
| `POST` | `/api/projects/:id/plan` | Run Stage 2 page planning |
| `GET` | `/api/projects/:id/pages` | Read persisted page rows and planner output fields |

Routes not implemented yet:

- `POST /api/projects/:id/generate-images`
- `GET /api/projects/:id/images`
- image approve/reject/regenerate endpoints
- PDF export endpoints
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

## Tests

```bash
yarn workspace @wildlands/backend test
```
