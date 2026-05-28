# services/supabase

**Status:** Phase 0 — scaffold only. Implementation in Phase 1 (auth + DB connection).

Supabase Auth + Postgres client wrappers.

**Auth (v1):**
- Single user seeded at first boot
- JWT issued by Supabase, verified by Fastify hook
- Session managed client-side (when Phase 3 starts)

**Postgres:**
- Direct `pg` connection via `DATABASE_URL` for Drizzle ORM
- Supabase JS client used ONLY for auth admin ops, never for data CRUD

**What can go wrong:**
- 401 — wrong key (anon vs service_role mixup)
- Drizzle migration drift — schema in code vs DB out of sync; always run migrations on boot in dev
- RLS rules blocking queries — RLS disabled in v1 single-user mode; revisit in v2

**Conventions:**
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to frontend. Server-only.
- Anon key safe for future browser use.
