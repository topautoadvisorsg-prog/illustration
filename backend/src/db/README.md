# Database

Drizzle ORM schema, migrations, and repository functions.

## Tables

| Table | Purpose |
|---|---|
| `users` | Single user in v1; multi-user later |
| `projects` | One row per book project |
| `manifests` | Book/chapter/page manifests |
| `pages` | One row per planned page |
| `images` | One row per image version |
| `jobs` | BullMQ job mirror for auditability |
| `exports` | Final PDF/EPUB exports |
| `llm_usage` | Token and cost accounting |
| `image_events` | Image approval/regeneration events |
| `knowledge_items` | Common base table for Publishing Intelligence records |
| `experiments` | Hypotheses, tests, results, conclusions |
| `decisions` | Publishing decisions and reasons |
| `standards` | Durable publishing standards |
| `standard_versions` | Version history for standards |
| `sops` | SOP library records |
| `sop_versions` | Version history for SOP bodies/checklists |
| `lessons_learned` | Searchable lessons and prevention notes |
| `print_reviews` | Physical proof copy reviews |
| `print_findings` | Margin, typography, image, KDP, paper, cover findings |
| `cost_events` | API/render/storage cost events |
| `knowledge_evidence` | Evidence files, URLs, proof photos, notes |
| `knowledge_links` | Typed lineage between records |
| `knowledge_events` | Audit trail for knowledge changes |

## Migrations

- Tool: Drizzle Kit
- Schema: `src/db/schema/index.ts`
- Output: `src/db/migrations/`
- Generate: `yarn workspace @wildlands/backend drizzle:generate`
- Apply: `yarn workspace @wildlands/backend drizzle:migrate`

The production backend runs migrations before `node dist/index.js`.

## Publishing Intelligence Model

Publishing Intelligence uses a base/specialist model:

- `knowledge_items` stores shared fields used for search, filtering, status,
  ownership, tags, project scope, and timestamps.
- Specialist tables store type-specific details.
- `knowledge_links` preserves relationships such as
  `EXPERIMENT -> DECISION -> STANDARD -> SOP`.
- `standard_versions` and `sop_versions` preserve rulebook history.
- `knowledge_events` stores audit entries for creates, evidence, links, and
  promotions.

## What Can Go Wrong

| Symptom | Likely Cause | Fix |
|---|---|---|
| Migration drift | Schema in code differs from DB | Generate/apply migrations before deploy |
| Connection limit hit | Too many direct Supabase connections | Use pooled `DATABASE_URL` |
| Missing Intelligence tables | Migration did not run or DB URL points elsewhere | Run `drizzle:migrate` and confirm Railway env |
| Slow knowledge search later | Data volume outgrew simple text search | Add full-text/trigram indexes in the next phase |

## Conventions

- Tables use UUID primary keys.
- FK behavior is explicit.
- Repository functions live in `src/db/repositories/`.
- Routes should not write SQL directly.
- JSONB is used for flexible metadata, but the important workflow fields live in
  typed columns.
