# SPEC — Milestone 1: Manuscript → Manifests (Real & Persisted)

**Author:** Claudio (CTO)
**Date:** 2026-05-30
**Status:** Proposed — building foundation, checkpoint before migration + Claude spend

---

## Goal

Turn the first real vertical slice of the pipeline from stub into working code:
**upload a manuscript → Claude generates book/chapter/page manifests → persist to
Supabase → expose via the API.** Testable end-to-end with only the **Anthropic +
Supabase** keys. No image generation, no print cost.

This is the smallest slice that produces real, inspectable output (DB rows + JSON
API responses) and proves the Claude integration works.

---

## In Scope

1. **DB persistence layer** (`backend/src/db/repositories/*`) — typed CRUD over the
   existing Drizzle schema (projects, manifests, pages, llm_usage). Schema already
   exists; nothing to migrate beyond running the existing migration.

2. **Claude service client** (`backend/src/services/claude/claude.ts`) — typed
   Anthropic SDK wrapper: tool-calling JSON mode, temperature 0, 3× retry with
   backoff, writes token usage to `llm_usage`. Per the service README contract.

3. **Stage 1.5 manifest generator** (`backend/src/pipeline/stage-1.5-manifests/`) —
   reads the stored manuscript once, calls Claude (one call per chapter max),
   produces book + chapter + page manifests, persists them to `manifests` and
   seeds `pages` rows. Runs **synchronously** in the request for now (one-shot per
   project; BullMQ worker wiring deferred to a later milestone).

4. **Real API routes** (replace current stubs in `projects.routes.ts`):
   - `POST /api/projects` → persist project, return it
   - `GET /api/projects` → list from DB
   - `GET /api/projects/:id` → fetch one
   - `POST /api/projects/:id/manuscript` → ingest markdown, store, set status `MANUSCRIPT_UPLOADED`
   - `POST /api/projects/:id/manifests` → run Stage 1.5, persist, set status `MANIFESTED`, return summary
   - `GET /api/projects/:id/manifests` → list manifests
   - `GET /api/projects/:id/pages` → list pages

5. **Run the Drizzle migration** against Supabase (creates all tables).

6. **Deploy + end-to-end test** with the `chanterelle.md` fixture (or a real
   manuscript you provide).

---

## Out of Scope (later milestones)

- Image generation (OpenAI), upscale (Replicate), layout/PDF, EPUB
- Frontend UI
- Supabase Auth / JWT (V1 is single-user; routes stay open for now — flagged as a
  known gap to close before any public exposure)
- BullMQ workers (Stage 1.5 runs inline this milestone)

---

## Known Risks / Flags

- **Railway filesystem is ephemeral.** `LocalStorageService` writes manuscripts to
  local disk, which is wiped on every redeploy. Manifests live in Postgres (durable),
  so this only means a manuscript must be re-uploaded after a redeploy to re-run
  Stage 1.5. Acceptable for testing; real fix is object storage (S3/Supabase Storage)
  in a later milestone — the storage service is already abstracted for this swap.
- **Open endpoints.** No auth yet. Fine for private testing, must be closed before
  the URL is shared.
- **Claude manifest parsing** depends on manuscript heading structure. Mitigated with
  strict tool-call schema + retries; malformed output dead-ends with a clear error
  rather than corrupt data.

---

## Done = 

`POST /api/projects` → `POST .../manuscript` → `POST .../manifests` produces real
manifest + page rows in Supabase, visible via `GET .../manifests` and `GET .../pages`,
on the live Railway URL.
