# Publishing Intelligence Service

## What It Does

Coordinates the Publishing Intelligence Center business workflows:

- record experiments, decisions, standards, SOPs, lessons, costs, and print reviews
- attach supporting evidence
- link related knowledge records
- promote experiments into decisions
- promote decisions into locked standards

## Inputs

Validated request contracts from `@wildlands/shared`, usually received through `/api/intelligence/*` routes.

## Outputs

Shared API contracts such as `KnowledgeItem`, `KnowledgeEvidence`, `KnowledgeLink`, and overview summaries.

## How To Run

The service runs inside the Fastify backend:

```bash
corepack yarn workspace @wildlands/backend dev
```

The production backend runs migrations before start, so new intelligence tables are applied by:

```bash
corepack yarn workspace @wildlands/backend drizzle:migrate
```

## How To Debug

1. Check `/api/intelligence/overview` to confirm database access and counts.
2. Create a small experiment through `/api/intelligence/experiments`.
3. Promote that experiment through `/api/intelligence/experiments/:id/promote-decision`.
4. Confirm `knowledge_links` has a `PRODUCED_DECISION` row.
5. Check `knowledge_events` for audit entries.

If routes fail before hitting this service, inspect `backend/src/api/intelligence.routes.ts`.
If persistence fails, inspect `backend/src/db/repositories/knowledge.repo.ts`.
