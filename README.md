# The Wildlands Publishing Platform

Turns a finished manuscript into a print-ready, fully illustrated KDP book:

```text
manuscript.md -> breakdown (chapters/entries) -> page plan (layout + image prompt)
  -> text-fit -> page quality review -> layout approval
  -> image generation -> proof render -> book + cover -> KDP
```

Live backend: `https://wildlandsbackend-production.up.railway.app`
Live frontend: `https://frontend-production-f65d.up.railway.app`

---

## Read these first (authoritative, current)

| Doc | What it covers |
|---|---|
| `docs/RENDER_MODEL.md` | How pages render — **full-page artwork + text-safe zones** (the model that matters most) |
| `docs/AGENT_LAYER.md` | What actually runs in the agent/LLM layer + the **metadata-not-pixels** rule |
| `docs/PUBLISHING_DIRECTION.md` | Illustration density / page-design guidance (three layers, controlled variety) |
| `docs/runbook.md` | Operations — including the **production durable-storage requirement** + `/health` check |
| `docs/TYPOGRAPHY_SPEC.md` | Cormorant Garamond + EB Garamond, role-based, default 7×10 |
| `docs/LAYERED_LAYOUT.md` / `docs/LAYOUT_ALLOCATION_MAP.md` | Content type → coverage → architecture; per-layout coverage map |

## The render model (the thing to understand)

The generated image **IS the page** — full-bleed artwork painted on the Paged.js
sheet, not a boxed `<img>`. Layout coverage describes **where the text-safe zone
is**, not how big the image is.

- **Title** sits on the artwork, bold, with a paper halo so it stays readable.
- **Body** sits **directly on the artwork** in the reserved text-safe zone, kept
  legible by a soft, edgeless scrim + light glyph halo — **no opaque paper card**.
- Text on the image is allowed **when it's readable** — not a ban, a readability rule.
- Continuation pages reuse the same entry artwork (visually unified).
- The **planning preview** (no image yet) shows a three-zone overlay —
  Image-Priority Zone, Typography Zone, Text-Safe Zone — outlines only on a
  clean paper page. It teaches the model; it is never the image's frame.

Code: `backend/src/pipeline/stage-6-layout/render-html.ts` (`buildEntryArticle`,
`artworkSheetCss`, `fullPageArtworkCss`). Render via Paged.js + Chromium
(`Dockerfile.backend`).

The image model is taught the same model via the **PAGE COMPOSITION BRIEF** in
every prompt (`artBriefText` in `stage-2-planner/plan-pages.ts`) — three explicit
zones, no boxes. `LayoutAllocation` exposes `priorityEdge` + `imagePriorityZone`
(new names) alongside `architecture` + `artBox` (deprecated aliases). The legacy
`art slot` / `image slot` vocabulary has been swept out of code, docs, and UI;
any remaining occurrence is an explicit reference to the retired term so Cody
recognizes legacy material.

## Workflow state safety (don't regress these)

- **Plan staleness:** Page Plan stamps a `planMeta` snapshot; the UI shows a banner
  when the publishing standard / trim / typography changed since planning.
- **Approval protection:** re-planning refuses to silently reset approved pages/
  images — operator chooses *skip approved*, *re-plan all*, or *cancel*.
- **Manuscript iteration:** re-upload → **Re-run Breakdown (replace)** clears the old
  breakdown/plan/approvals/images and rebuilds. (Plain re-run is still blocked.)

## Durable storage (production requirement)

Generated images and rendered PDFs **must** use Supabase Storage. In production the
backend **fails loud** rather than silently falling back to ephemeral local disk
(which Railway wipes on redeploy). Confirm any deploy with one call:

```
GET /health  =>  { "storage": "supabase", "storageDurable": true, "db": "connected" }
```

## What's implemented

- Fastify backend; Supabase Postgres + Drizzle migrations; durable Supabase Storage.
- Project setup with **publishing standards** (Hardcover 7×10 / Paperback 6×9 /
  Large 8.5×11 / Kindle) + first-chapter format calibration.
- Manuscript upload (md/txt/docx/pdf) → **deterministic** breakdown (no LLM) →
  deterministic Stage-2 page plan (layout + locked, hashed image prompt).
- Text-Fit + advisory **Page Quality Review** (rhythm, continuations, balance).
- Per-chapter layout approval gate.
- Stage-3 image generation via OpenAI **`gpt-image-2`** (spend-gated, layout-aware
  aspect, dependency-injected so tests never call the paid API).
- Stage-4 image review (approve / reject / regenerate / set-active / reuse), plus
  **repeating shared assets** (one border image reused across a layout's pages).
- Stage-5 upscale + 300 DPI print gate (Replicate Real-ESRGAN).
- Stage-6/7 full-page-artwork chapter/page proof render + book stitch + KDP
  preflight + full-wrap cover (spine from page count).
- Operator console: guided next-step engine, per-stage review (advisory agent),
  image library with coverage metadata, proof preview, Book Parts panel.

## Not implemented yet

- Kindle EPUB export (button hidden/disabled).
- Batch image generation (one-by-one today).
- BullMQ background workers (pipeline runs synchronously per request).
- Single-user auth enforcement.

## The two live LLM agents (everything else is deterministic)

Only **OPERATOR_ADVISER** (chat) and **STAGE_REVIEWER** (per-stage verdict) call
Claude — both text-only, read-only, capped. No agent reads image pixels (see
`docs/AGENT_LAYER.md`). The 8 design contracts in `agent-contracts.ts` are enforced
by deterministic code, not running agents.

## Tech stack

Node + TypeScript + Fastify · React · Zod · Supabase Postgres + Drizzle · Anthropic
Claude · OpenAI gpt-image-2 · Replicate Real-ESRGAN · Puppeteer + Paged.js · Pino.

## Commands

```bash
yarn install
yarn workspace @wildlands/shared build
yarn workspace @wildlands/backend run typecheck
yarn workspace @wildlands/backend run test
yarn workspace frontend build
```

Run locally: `yarn workspace @wildlands/backend dev` · `yarn workspace frontend dev`.

## Deploy / Railway gotchas

- Backend builds via `Dockerfile.backend` (node:20 + chromium); ~5–6 min deploys.
- Each push restarts the build — the latest push wins.
- API POSTs need a JSON body or send `{}` — bodyless POST + `content-type:
  application/json` is rejected by Fastify. `/plan` and `/manifests` accept a
  bodyless POST (no body schema) by design.
- `generate-image` takes the page **UUID**, not the page key.
- PowerShell: `$pid` is reserved — never use it as a variable. Commit with separate
  `git add` / `git commit` / `if ($?) { git push }` (not chained `| Out-Null`).
