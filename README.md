# The Wildlands Publishing Platform

> Automated book publishing pipeline — manuscript in, print-ready PDF + Kindle EPUB out.

**Status:** Phase 0 — Risk Spikes. No production code yet. No UI.

---

## What This Is

A web-based publishing pipeline built for *The Wildlands* series. It automates the heavy parts of book production:

```
manuscript.md → manifests → image prompts → image generation
   → upscale → DPI gate → layout → chapter PDFs → final book PDF + EPUB
```

Human approval is required at: image review, layout review, final export.

**V1 Scope (locked):**
- Single brand — THE_WILDLANDS
- Adult audience only
- Output: Premium PDF (8.5×11 full color) + Kindle EPUB
- Local file storage, single user (Supabase Auth)
- Cover typography overlaid by layout engine (no AI text on covers)

---

## Repo Layout

```
/backend       Node.js + TypeScript + Fastify — the pipeline + API
/frontend      React + Vite — Phase 3, DO NOT TOUCH until backend is proven
/shared        Zod schemas + TypeScript contracts shared by backend & frontend
/spikes        Phase 0 throwaway code — deleted after pipeline is proven
/docs          Architecture, ADRs, runbook, API contracts, pipeline spec
/memory        Project memory (PRD, test credentials) — agent-managed
```

---

## Quickstart (Day 1 — Scaffold Only)

```bash
# 1. Install deps at the monorepo root
yarn install

# 2. Copy env placeholders
cp .env.example .env
# Edit .env with real API keys when provided

# 3. Run API smoke tests (will fail until real keys are filled in — expected)
yarn smoke
```

---

## Development Philosophy (Locked)

1. **Backend first. UI last.** No frontend code until `manuscript → PDF` works end-to-end.
2. **API layer is the contract.** Every endpoint Zod-validated, OpenAPI-documented, curl-testable.
3. **Documentation always.** Every module has a README answering 5 questions:
   - What it does
   - Input
   - Output
   - How to run locally
   - What can go wrong & how to debug it
4. **Code reads like the spec.** Folder names mirror pipeline stage names. No `utils/`, no `helpers/`, no `lib/` dumping grounds.
5. **No decoration.** Until the pipeline produces a PDF, no UI, no animations, no nice-to-haves.

---

## Phase 0 — Risk Spikes (Current Phase)

10-day risk-reduction sprint. CLI-driven. No UI. Each spike has a pass/fail gate.

| # | Spike | Day | Gate |
|---|---|---|---|
| 1 | PDF engine bake-off (Puppeteer + Paged.js vs `@react-pdf/renderer`) | D4–D6 | Clear winner on 30-page test |
| 2 | End-to-end vertical slice (1 page through every stage) | D2–D3 | Valid print-ready PDF |
| 3 | Image consistency drift (20 sequential images) | D8 | Visual sign-off |
| 4 | Replicate Real-ESRGAN upscale validation | D7 | 5/5 pass DPI gate |
| 5 | EPUB quality on Kindle Previewer + iPad | D9 | Renders cleanly |

See `/docs/phase-0-plan.md` for full plan.

---

## Tech Stack (Locked)

| Layer | Choice | Why |
|---|---|---|
| Backend runtime | Node.js 20 + TypeScript | Type safety, ecosystem |
| Backend framework | Fastify | Fast, native Zod hooks, OpenAPI auto-gen |
| Validation | Zod | TS-native, runtime + static |
| ORM / Migrations | Drizzle ORM | Lightweight, TS inference, raw SQL escape hatch |
| Queue | BullMQ + Upstash Redis | Standard, durable, dead-letter support |
| Logger | Pino | Fast structured JSON logs |
| Error monitoring | Sentry | Free tier sufficient for v1 |
| LLM | Anthropic Claude (Sonnet 4.5) | Manuscript parsing, manifest generation |
| Image gen | OpenAI gpt-image-1 | Illustration generation |
| Image upscale | Replicate Real-ESRGAN | 300 DPI print-ready upscaling |
| Image ops | Sharp | DPI validation, format conversion |
| PDF | Puppeteer + Paged.js | Winner from Spike 1 bake-off; see ADR-003a |
| EPUB | epub-gen-memory | Clean EPUB from manifests |
| Auth | Supabase Auth | Single user v1, multi-user ready for v2 |
| DB | Supabase Postgres | Same vendor as auth |
| Frontend (Phase 3) | React 18 + Vite + Tailwind | Speed + DX |
| Package manager | Yarn workspaces | Monorepo orchestration |

See `/docs/decision-log.md` for ADRs.

---

## Where Things Live

- **Pipeline stages** → `/backend/src/pipeline/stage-N-*`
- **External service clients** → `/backend/src/services/*`
- **Queue workers** → `/backend/src/workers/*`
- **DB schema & migrations** → `/backend/src/db/`
- **API routes** → `/backend/src/api/`
- **Smoke tests** → `/backend/scripts/smoke-test.ts`
- **Spike scripts** → `/spikes/`
- **Shared types & Zod schemas** → `/shared/src/`

---

## Status

See `/docs/decision-log.md` and Phase 0 daily reports in `/docs/phase-0-reports/`.
