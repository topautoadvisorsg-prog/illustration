# Architecture

> This is the high-level system view. Detailed per-stage docs live in
> `/backend/src/pipeline/stage-*/README.md`.

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            HUMAN OPERATOR                                │
│   uploads manuscript · approves images · approves layout · downloads     │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ curl / (Phase 3) UI
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       FASTIFY API  (port 8001)                           │
│   /api/projects · /api/projects/{id}/* · /api/pages/{id}/*               │
│   Auth: Supabase JWT · Validation: Zod · Docs: /api/docs (OpenAPI)       │
└──────┬────────────────┬──────────────────┬───────────────────────────┬──┘
       │                │                  │                           │
       ▼                ▼                  ▼                           ▼
  ┌─────────┐    ┌────────────┐    ┌──────────────┐         ┌─────────────────┐
  │  CLAUDE │    │  BULLMQ    │    │   POSTGRES   │         │  LOCAL STORAGE  │
  │ Sonnet  │    │ (Upstash   │    │  (Supabase)  │         │   /backend/     │
  │   4.5   │    │  Redis)    │    │              │         │    storage/     │
  └─────────┘    └────┬───────┘    └──────────────┘         └─────────────────┘
   manifests          │
                      │ workers consume jobs
       ┌──────────────┼──────────────┬──────────────┐
       ▼              ▼              ▼              ▼
  ┌─────────┐   ┌──────────┐   ┌───────────┐   ┌──────────┐
  │ openai  │   │ replicate │   │  layout   │   │  epub    │
  │ image-1 │   │ realesrg  │   │ engine    │   │ -gen     │
  │  WORKER │   │   WORKER  │   │  WORKER   │   │ WORKER   │
  └─────────┘   └──────────┘   └───────────┘   └──────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │   pdf-lib +     │
                              │   ghostscript   │
                              │  (stitch + ICC) │
                              └─────────────────┘
                                       │
                                       ▼
                              FINAL PDF + EPUB
                              (operator uploads to KDP)
```

## Data Flow (Happy Path)

```
1.  manuscript.md  ──▶  Stage 1 (Ingestion)
                          └─▶  STORAGE_ROOT/.../manuscripts/

2.  manuscript.md  ──▶  Stage 1.5 (Claude × 1 read)
                          └─▶  book_manifest.json
                                CH{NN}_manifest.json × N
                                {book_id}_P{NNN}.json × ~240

3.  page manifests ──▶  Stage 2 (deterministic)
                          └─▶  page manifest + image_prompt

4.  prompt  ──▶  Stage 3 (gpt-image-1)
                  └─▶  generated/{page_id}_v{N}.png

5.  pending image  ──▶  Stage 4 (HUMAN GATE) ──▶ approved
                                              ──▶ regenerate → back to Stage 3

6.  approved image  ──▶  Stage 5 (Real-ESRGAN + DPI gate)
                          └─▶  upscaled/{page_id}_v{N}_300dpi.png

7.  upscaled images + manifests  ──▶  Stage 6 (layout, chapter-by-chapter)
                                       └─▶  chapters/{book_id}_CH{NN}.pdf

8.  chapter PDFs  ──▶  Stage 7 (stitch + ICC)
                        └─▶  editions/{book_id}_PREMIUM.pdf

9.  page manifests  ──▶  Stage 8 (epub-gen-memory)  [runs parallel w/ 6+7]
                          └─▶  editions/{book_id}_KINDLE.epub
```

## Component Inventory

| Component | Tech | Lives in |
|---|---|---|
| Web API | Fastify + TypeScript | `backend/src/api`, `backend/src/server.ts` |
| Claude client | `@anthropic-ai/sdk` | `backend/src/services/claude` |
| OpenAI client | `openai` (Node) | `backend/src/services/openai` |
| Replicate client | `replicate` | `backend/src/services/replicate` |
| Queue | BullMQ + Upstash | `backend/src/services/redis` |
| DB | Drizzle + Supabase Postgres | `backend/src/db` |
| Auth | Supabase Auth | `backend/src/services/supabase` |
| Image ops | Sharp | inline in workers |
| PDF stitch | pdf-lib | Stage 7 |
| Layout PDF | Puppeteer+Paged.js *or* `@react-pdf/renderer` | Stage 6 (TBD after Spike 1) |
| EPUB | epub-gen-memory | Stage 8 |
| Logger | Pino | `backend/src/lib/logger.ts` |
| Errors | Sentry | `backend/src/services/sentry` |
| Storage | LocalStorageService (v1) | `backend/src/services/storage` |

## Non-Goals (V1)

- ❌ Multi-user / role-based access
- ❌ Real-time progress (WebSockets) — polling endpoints sufficient
- ❌ Cloud storage (S3) — local FS only, abstraction allows v2 swap
- ❌ Dashboard UI — backend-first, UI built only after pipeline proven
- ❌ Mid-Tier, Economic, Large Print, Kids editions
- ❌ KDP API upload — files produced for manual upload
- ❌ Brands 2 + 3 (Wild Back Country, The Wild Region)
