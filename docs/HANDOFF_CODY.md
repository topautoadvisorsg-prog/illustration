# HANDOFF → CODY

## Project
The Wildlands Publishing Platform. Monorepo (Yarn workspaces): `backend` (`@wildlands/backend`, Fastify+TS), `frontend` (CRA/craco React), `shared` (Zod). Node 20.

- Repo: github.com/topautoadvisorsg-prog/illustration (branch `main`)
- Backend (Railway): https://wildlandsbackend-production.up.railway.app
- Frontend (Railway): https://frontend-production-f65d.up.railway.app
- Live test project id: `1a86155e-fac8-4310-a1e2-1a4c254c1fd1` ("The Wildlands Field Guide", 129 entries / 8 chapters, PLANNED, ch1 layout APPROVED, CH01_P001 has 1 generated image)
- Deploys: backend builds via Dockerfile.backend (node:20 + chromium), ~5 min.
- Commit style: separate `git add` / `git commit -m` / `if ($?) { git push }` (NOT chained `| Out-Null`). PowerShell: `$pid` is reserved — never use it as a var.

## Where I left off (verified working)
The core rendering model is CORRECT and proven end-to-end on the live system. Two PDFs were rendered for the owner to eyeball: `wildlands-ch1-with-image.pdf` (page 1 = real image, pages 2-20 = placeholders) and `wildlands-ch1-placeholders.pdf`.

The placeholder-vs-image distinction is the thing that mattered most, and it now works (commit `a4f7f42`):
- **PLACEHOLDER = planning.** When a page has NO image, `artSlotSizeStyle(slot, coverage, geometry, hasImage=false)` in `backend/src/pipeline/stage-6-layout/render-html.ts` renders a clean reserved zone INSIDE the text frame (no bleed). Text flows around it. This is for review-before-spend. DO NOT remove or replace it with image generation.
- **IMAGE = presentation.** When a page HAS an image (`hasImage=true`), the same function applies negative bleed margins so the art fills the layout composition and bleeds to the page edge — never clipped into the placeholder box.
- Tests: `backend/src/__tests__/render-html.test.ts` (15 pass) pin both behaviors.
- Also shipped: "Book Parts" panel in `frontend/src/App.js` (commit `0319aea`) showing auto-assembled parts (cover/title/copyright/TOC/intro/chapters/index/colophon).

## #1 issue the owner is judging right now
**Image aspect does not match the layout.** gpt-image-2 always returns portrait 1024×1536. Wide layouts (FEATURE_BANNER / TOP_BAND / BOTTOM_BAND) render with `object-fit: cover`, so a tall image gets cropped hard in a wide band and the subject can get cut off. The bleed/placeholder mechanics are fine — the gap is generating each image at the aspect its layout needs. If the owner says the crop bothers him, this is the first fix:
- Map each `ArtSlot` to a target aspect (bands → landscape, full-page/floats → portrait, square → scattered).
- Pass that size to the image generator (`backend/src/pipeline/stage-3-generation/generate-image.ts`, gpt-image-2 size param).
- The image PROMPT already tells the model to leave negative space, but does NOT yet say WHERE per layout — add a per-layout clear-zone instruction so text always lands on calm art.

## Agreed next build order (do NOT reorder without owner OK)
1. **Current Stage Result visibility** — harden the top result panel.
2. **Workflow ordering cleanup** — the guided state machine (`operatorGuidance`, `App.js:1271`) puts render-proof BEFORE images, but the page lays out "3. Image Proofing" BEFORE "4. Render Preview" + there are 3 separate places to render (top next-step, Book Parts, Render Preview). De-duplicate to one canonical render block and match the guided order.
3. **Cost visibility** — endpoint `GET /api/projects/:id/cost-estimate` EXISTS but is never called in the UI. Just SHOW the number on the image stage. Owner does NOT want a spend-blocking gate.
4. **Export clarity** — currently "export" = download the last-rendered PDF blob (`wildlands-preview.pdf`); EPUB button is disabled. Build ONE "Download for KDP" giving interior PDF + cover PDF. Either build EPUB or hide the dead button.
5. **Manifest versioning** — re-breakdown is HARD-BLOCKED (`backend/src/db/repositories/manifests.repo.ts:63` "already has manifests/pages"). This blocks any edit-after-upload loop. Add versioning so a re-uploaded/edited manuscript can re-break-down.

## Do NOT build yet (owner's call)
- Batch image generation (wait until prompts are dialed).
- "Full illustration on every page" model (parked — one image per entry, overflow flows to next page).
- EPUB (print is priority).
- Anything new in the Knowledge/Standards ledger — it's over-built; freeze it (already hidden behind Advanced mode).

## Confusion points to fix along the way
- "0/24 planned" reads as pages; it's entries-with-a-layout. Relabel everywhere.
- Choose File + Upload (two clicks) looks like two uploads.
- Layout Approval doesn't say it unlocks paid image generation.
- Chapter Intelligence checks sit BELOW the render buttons they gate.
- Production dashboard must be manually loaded ("Not Loaded" until clicked).

## How to render/generate via API (for testing)
POST routes need a body or Fastify 400s on empty JSON — send `-d "{}"`.
- Plan: `POST /api/projects/:id/plan`
- Approve chapter layout: `POST /api/projects/:id/chapters/:n/layout-approval` (requires plan done — needs layoutTemplate + imagePrompt + sha on every page)
- Generate image: `POST /api/pages/:uuid/generate-image` (uses page DB UUID, NOT pageKey; requires chapter layout approved; ~135s)
- Render chapter: `POST /api/projects/:id/chapters/:n/render` → application/pdf (x-total-pages header)
- Render book: `POST /api/projects/:id/render-book` ; cover: `POST /api/projects/:id/render-cover`

Full system audit is in chat history; the rendering/placeholder model section is the authoritative reference.
