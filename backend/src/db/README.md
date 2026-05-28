# db

Drizzle ORM schema + migrations + repository functions.

**Phase 1 tables (locked):**

| Table | Purpose |
|---|---|
| `users` | Single user in v1; multi-user in v2 |
| `projects` | One row per book project |
| `manifests` | Book / chapter / page manifests (JSON column) |
| `pages` | One row per page; FK → projects, manifest_id |
| `images` | One row per image version; FK → pages |
| `jobs` | BullMQ-side mirror — keeps job state outside of Redis for audit |
| `exports` | Final PDF/EPUB exports per project |
| `llm_usage` | Token + cost accounting for Claude/OpenAI |
| `image_events` | Audit log for approvals, regenerations |

**Migrations:**
- Tool: Drizzle Kit
- Migrations live in `src/db/migrations/`
- Generated from schema files in `src/db/schema/`
- Run via `yarn workspace @wildlands/backend drizzle:migrate`

**What can go wrong:**
- Migration drift — schema in code ≠ DB; always run `drizzle:check` in CI
- Postgres connection limit hit — Supabase free tier ~60 connections; use pooled URL
- JSON column too large — Postgres `jsonb` has no hard cap but query perf degrades; keep manifests < 5MB

**Conventions:**
- All tables have `id` (uuid), `created_at`, `updated_at`.
- All FK relations explicit + on-delete cascade or restrict (never default).
- Repository functions live in `src/db/repos/` — one file per table.
