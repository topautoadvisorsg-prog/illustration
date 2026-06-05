# Architecture

> This is the high-level system view. Detailed per-stage docs live in
> `/backend/src/pipeline/stage-*/README.md`.

---

## System Diagram

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                            HUMAN OPERATOR                                â”‚
â”‚   uploads manuscript Â· approves images Â· approves layout Â· downloads     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                           â”‚ curl / (Phase 3) UI
                           â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                       FASTIFY API  (port 8001)                           â”‚
â”‚   /api/projects Â· /api/projects/{id}/* Â· /api/pages/{id}/*               â”‚
â”‚   Auth: Supabase JWT Â· Validation: Zod Â· Docs: /api/docs (OpenAPI)       â”‚
â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”˜
       â”‚                â”‚                  â”‚                           â”‚
       â–¼                â–¼                  â–¼                           â–¼
  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”         â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
  â”‚  CLAUDE â”‚    â”‚  BULLMQ    â”‚    â”‚   POSTGRES   â”‚         â”‚  LOCAL STORAGE  â”‚
  â”‚ Sonnet  â”‚    â”‚ (Upstash   â”‚    â”‚  (Supabase)  â”‚         â”‚   /backend/     â”‚
  â”‚   4.5   â”‚    â”‚  Redis)    â”‚    â”‚              â”‚         â”‚    storage/     â”‚
  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
   manifests          â”‚
                      â”‚ workers consume jobs
       â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
       â–¼              â–¼              â–¼              â–¼
  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
  â”‚ openai  â”‚   â”‚ replicate â”‚   â”‚  layout   â”‚   â”‚  epub    â”‚
  â”‚ image-1 â”‚   â”‚ realesrg  â”‚   â”‚ engine    â”‚   â”‚ -gen     â”‚
  â”‚  WORKER â”‚   â”‚   WORKER  â”‚   â”‚  WORKER   â”‚   â”‚ WORKER   â”‚
  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                       â”‚
                                       â–¼
                              â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                              â”‚   pdf-lib +     â”‚
                              â”‚   ghostscript   â”‚
                              â”‚  (stitch + ICC) â”‚
                              â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                       â”‚
                                       â–¼
                              FINAL PDF + EPUB
                              (operator uploads to KDP)
```

## Data Flow (Happy Path)

```
1.  manuscript.md  â”€â”€â–¶  Stage 1 (Ingestion)
                          â””â”€â–¶  STORAGE_ROOT/.../manuscripts/

2.  manuscript.md  â”€â”€â–¶  Stage 1.5 (Claude Ã— 1 read)
                          â””â”€â–¶  book_manifest.json
                                CH{NN}_manifest.json Ã— N
                                {book_id}_P{NNN}.json Ã— ~240

3.  page manifests â”€â”€â–¶  Stage 2 (deterministic)
                          â””â”€â–¶  page manifest + image_prompt

4.  prompt  â”€â”€â–¶  Stage 3 (gpt-image-2)
                  â””â”€â–¶  generated/{page_id}_v{N}.png

5.  pending image  â”€â”€â–¶  Stage 4 (HUMAN GATE) â”€â”€â–¶ approved
                                              â”€â”€â–¶ regenerate â†’ back to Stage 3

6.  approved image  â”€â”€â–¶  Stage 5 (Real-ESRGAN + DPI gate)
                          â””â”€â–¶  upscaled/{page_id}_v{N}_300dpi.png

7.  upscaled images + manifests  â”€â”€â–¶  Stage 6 (layout, chapter-by-chapter)
                                       â””â”€â–¶  chapters/{book_id}_CH{NN}.pdf

8.  chapter PDFs  â”€â”€â–¶  Stage 7 (stitch + ICC)
                        â””â”€â–¶  editions/{book_id}_PREMIUM.pdf

9.  page manifests  â”€â”€â–¶  Stage 8 (epub-gen-memory)  [runs parallel w/ 6+7]
                          â””â”€â–¶  editions/{book_id}_KINDLE.epub
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

- âŒ Multi-user / role-based access
- âŒ Real-time progress (WebSockets) â€” polling endpoints sufficient
- âŒ Cloud storage (S3) â€” local FS only, abstraction allows v2 swap
- âŒ Dashboard UI â€” backend-first, UI built only after pipeline proven
- âŒ Mid-Tier, Economic, Large Print, Kids editions
- âŒ KDP API upload â€” files produced for manual upload
- âŒ Brands 2 + 3 (Wild Back Country, The Wild Region)
