# HANDOFF TO CODY — The Wild Lands Publishing Platform

**From:** Claudio (CTO). **Verified via:** Repomix full-repo pack (`repomix-output.xml`, 239 files), targeted code scans, and live end-to-end tests against production this session. **Be strict. Read this before touching anything.**

---

## ⛔ DO NOT REBUILD — these already exist and work. Verify before you "add" them.

| Thing | Where | Proof |
|---|---|---|
| **Chapter reviewer** | `frontend/src/App.js` §"4. Render Preview + Export" → `.pdf-preview-frame` **iframe** (86vh) + Download link + per-chapter buttons | Renders the chapter PDF inline; browser gives page thumbnails + page nav + zoom. **It is the reviewer.** |
| **Multi-page content flow** | `render-html.ts` `buildChapterHtml` + Paged.js | A 1,839-word entry rendered to **4 pages, zero text lost** (live test). Content already drives page count at render time. |
| **Image generation** | `POST /api/pages/:id/generate-image` → `stage-3-generation` → OpenAI `gpt-image-2` | Reaches OpenAI, authenticates, correct model. **Only blocked by the user's OpenAI account billing limit — NOT a code bug.** |
| **Typography role system + config-driven fonts** | `shared` `TypographyConfigSchema`, `render-html.ts` `googleFontsHref`/`typographyStyleBlock` | Cormorant Garamond (display) + EB Garamond (body), 7×10 default. Done this session. |
| **Project create/name/delete, operator chat, manuscript upload (md/txt)** | `projects.routes.ts`, `App.js` | Done this session. |

If you think one of these is missing, you are looking in the wrong place. Ask first.

---

## ✅ Current state (working pipeline)
Upload manuscript → Breakdown (Claude, stage 1.5) → Page Plan (deterministic `plan-pages.ts`) → Text-Fit (`text-fit-preview.ts`) → Generate Image (gpt-image-2) → Review/Approve images (stage 4) → Render Chapter/Book PDF (Paged.js + Chromium) → preview in iframe. Chromium works on Railway. 105 backend tests pass.

---

## 🔧 WHAT'S LEFT — do these IN ORDER. Each has acceptance criteria. Don't gold-plate.

### P0 — Honesty/correctness bugs (small, surgical)
1. **Page count is a lie.** Breakdown estimates **1 page per entry**; the renderer actually produces N (e.g. 4). 
   - Fix: compute a **content-aware page estimate** = entry word count ÷ readable words-per-page (derive from `page-geometry` text area + `typography.bodyPt`×`lineHeight`). Apply in `text-fit-preview.ts` and the manifest summary.
   - **Accept:** estimated pages within ±1 of the rendered `X-Total-Pages` for a 200/800/1800-word entry.
2. **Reviewer shows "? rendered page(s)".** Backend CORS doesn't expose custom headers, so the browser can't read `X-Total-Pages`.
   - Fix: in `server.ts` CORS config add `exposedHeaders: ['x-total-pages','x-page-count','x-preflight-passed']`.
   - **Accept:** reviewer meta shows the real count.
3. **Text-fit over-blocks.** Long entries are flagged `OVERFLOW` / `readyForImageSpend:false` from static word bands — but they flow fine across pages.
   - Fix: reframe — long content is "spans N pages", not overflow. Only block on genuinely broken cases (e.g. art-dominant layout chosen for huge text). `text-fit.ts` / `text-fit-preview.ts`.
   - **Accept:** a 1,500-word entry is not blocked solely for length.

### P1 — Make the REAL book ingest correctly
4. **Strip meta sections from breakdown.** The real manuscript (`The-Wild-Lands-New-England-MASTER.md`) has non-chapter `#` sections — `FULL CHAPTER OUTLINE`, `WRITING PROGRESS TRACKER`, `FRONT MATTER & INTRODUCTION`, `BACK MATTER` — plus front/back matter sitting BETWEEN chapter 7 and chapter 8. Current parser only treats `# CHAPTER N` as chapters, so meta lands as junk and front/back matter folds into chapter 7's scope.
   - Fix in `parse-manuscript-outline.ts`: explicitly ignore known meta headings; cap a chapter's scope at the next `#` heading (any), not just the next `# CHAPTER`; route front/back matter to their own buckets.
   - **Accept:** uploading the master file yields exactly **8 chapters (1–8)**, no junk entries, front/back matter not inside chapter 7.
5. **Front matter rendering.** Book has a title page + introduction before Chapter 1; renderer skips them.
   - Fix: front-matter builder in `render-html.ts`/`render-chapter.ts` using the **Book Title** and **Chapter Title** typography roles.
   - **Accept:** full-book render opens with a title page + intro.
6. **Manifest rerun is blocked** ("Project already has manifests/pages. Rerun is blocked"). Operator can't re-breakdown after a re-upload.
   - Fix: on re-breakdown, clear prior manifests/pages for the project (transaction) or version them. `generate-manifests` + `manifests.repo`.
   - **Accept:** re-upload + re-breakdown succeeds.

### P2 — Spec features
7. **Trim-size presets + `format` field** (paperback / hardcover / digital) in `ProjectConfigSchema` + Project Setup UI. KDP recs in `docs/TYPOGRAPHY_SPEC.md` (default 7×10; offer 6×9, 8.5×11). Digital = relative sizing.
8. **Layout Director consolidation** (deterministic — operator picked this). One module, fed by book format, owns typography sizing + density + layout choice + page flow; capacity computed from real geometry. Replace the scattered static `DEFAULT_LAYOUT_CAPACITY` word bands. See `docs/CHAPTER_RENDERING_AUDIT.md`.
9. **EPUB export** — button is "Not Wired"; an `epub-export.worker.ts` exists but no route. Wire an endpoint, or hide the button until ready.

### P3 — Hygiene / red flags
10. **Stray Python server.** `backend/server.py` + `backend/requirements.txt` + `.emergent/` are template cruft. Deploy uses `Dockerfile.backend` → `node dist/index.js`. **Verify nothing references server.py, then delete it** (CLAUDE.md: single server, one port).
11. **Unused UI scaffolding.** `frontend/src/components/ui/*` (shadcn) appears unused by `App.js`. Verify, then prune.
12. **Dead workers.** `src/workers/*` (image-generation/upscale/layout/pdf-compile/epub) are not run on Railway (only the API server runs; pipeline uses synchronous endpoints). Either document them as the future queue path or remove to avoid confusion.

---

## HARD RULES (non-negotiable)
- `npx tsc --noEmit` clean **and** `vitest run` all green before every commit.
- **No second HTTP server, no second port.** (See P3.10.)
- Tests must pin their own trim/typography (don't depend on schema defaults — see existing `render-html.test.ts`).
- Don't touch the OpenAI billing or keys — that's the user's account.
- Don't claim "done" without the acceptance criterion met. Report what changed + the proof.

## Suggested order
P0 (1→3) → P1 (4→6) → P2 (7→9) → P3 (10→12). P0+P1 are what let the operator finally review their real book honestly.
