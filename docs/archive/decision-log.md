# Decision Log (ADRs)

Architectural decisions, in chronological order. Each ADR is short, explicit, and immutable — superseding entries are added, never edited.

---

## ADR-000 · 2026-01 · V1 Scope Lock

**Decision:** V1 ships ONLY Premium PDF (8.5×11 full color) + Kindle EPUB, for the THE_WILDLANDS brand only, adult audience only. Local storage. Single user (Supabase Auth).

**Context:** Spec listed broader v1; stakeholder narrowed scope to prove the core pipeline first.

**Consequences:** Mid-Tier, Economic, Large Print, Kids, Brands 2+3, and S3 storage are explicitly out of scope until v2.

---

## ADR-001 · 2026-01 · Tech Stack Foundation

**Decision:** Node.js 20 + TypeScript + Fastify + Drizzle ORM + Supabase Auth/Postgres + Upstash Redis + BullMQ + Pino + Zod + Sentry + Yarn workspaces.

**Alternatives considered:**
- Node + Express → rejected (Fastify is faster, has native Zod hooks, native OpenAPI gen)
- Joi → rejected for Zod (TS-native, compile-time + runtime)
- Winston → rejected for Pino (faster, JSON-first)
- Prisma → rejected for Drizzle (lighter, better TS inference, SQL escape hatch)

**Consequences:** All backend code TypeScript. Monorepo via yarn workspaces.

---

## ADR-002 · 2026-01 · Topaz Replaced by Replicate Real-ESRGAN

**Decision:** Replace Topaz Labs upscale with Replicate Real-ESRGAN.

**Context:** Topaz public API access is gated; pricing uncertain. Replicate offers Real-ESRGAN with a clean Node SDK, pay-per-second pricing, and equivalent quality for illustrated content.

**Consequences:** Spec language updated. Replicate API token now required. Spike 4 will validate end-to-end quality before production code.

---

## ADR-003 · 2026-01 · PDF Engine — Decision Deferred (Spike 1)

**Decision:** TBD. Two candidates prototyped in Phase 0:
- Puppeteer + Paged.js (HTML/CSS via Chromium)
- `@react-pdf/renderer`

Phase 0 Spike 1 (D4–D6) renders the same 30-page test through both and a winner is picked.

**Why deferred:** This is the single highest-risk component (per spec Risk 1). Choosing without empirical data is irresponsible.

**Frontrunner:** Puppeteer + Paged.js — better CSS Paged Media support, native font handling, browser-debuggable.

---

## ADR-003a · 2026-01 · PDF Engine — SUPERSEDED → Puppeteer + Paged.js

**Decision:** **Puppeteer + Paged.js wins.** `@react-pdf/renderer` is out.

**Supersedes:** ADR-003.

**Decision date:** Phase 0 Day 4 (ahead of the D6 schedule).

**Evidence (Spike 1, see `/spikes/pdf-engine-bakeoff/RESULTS.md`):**
- Puppeteer + Paged.js: rendered 30-page fixture into a 38-page PDF in 3.5 s, peak heap 20.2 MB, 0.57 MB PDF. Bleed-correct at 8.625 × 11.25 in. Native page-break and continuation handling.
- `@react-pdf/renderer`: **never reached render** — its reconciler ships as CommonJS, conflicts with our `type: module` ESM monorepo, and required multiple unviable workarounds (CJS sub-workspace, bundler wrap, or full ESM downgrade) just to import. The package's CJS-only reconciler is a permanent maintenance burden in a modern ESM Node project.

**Why the call was made early:** Bake-offs end the moment the answer is unambiguous. We spent zero render time on the loser and saved the planned D5+D6 budget for Spike 2 polish and Spike 4/5 prep.

**Consequences:**
- Stage 6 (Layout Engine) builds on top of the Spike 2 Step F code, which already uses Puppeteer + Paged.js.
- Production needs a Ghostscript post-process step for ICC sRGB embedding (Skia/PDF doesn't ship one).
- Chapter-by-chapter rendering hygiene is enforced via per-chapter browser sessions.
- `@react-pdf/renderer` and `react`/`react-dom` deps stay installed for now (low cost) but are not used by production code. Removal scheduled for Phase 1 cleanup.

---

## ADR-004 · 2026-01 · No Python Sidecar

**Decision:** Node-only backend. No Python sidecar service in v1.

**Context:** Replicate is REST-only (no Python advantage). EPUB via `epub-gen-memory`. ICC profile embed via Ghostscript shell-out (Node-compatible). Sharp covers all image ops.

**Consequences:** Single-language team, single deployment artifact. Revisit only if image ML scoring is added in v2.

---

## ADR-005 · 2026-01 · EB Garamond Small-Caps via CSS

**Decision:** CSS `font-variant: small-caps` accepted for small-caps headers in v1.

**Context:** Google Fonts EB Garamond lacks a true small-caps variant. Real OpenType SC would require licensing a commercial font. CSS-faked SC is visually acceptable for the platform's vintage naturalist aesthetic.

**Consequences:** Locked for v1. If a buyer flags the appearance later, switch to a font that ships true SC (e.g., Cormorant SC).

---

## ADR-006 · 2026-01 · Master Style Block — Agent-Drafted V1

**Decision:** A v1 Master Style Block is drafted by the development agent based on the visual system spec (Cinematic Naturalist, pen-and-ink + warm watercolor wash, 19th-century expedition journal). Delivered by D7 for stakeholder review before Spike 3 (D8).

**Consequences:** If stakeholder rejects, Spike 3 (image consistency drift) slips by however long the revision takes.

---

## ADR-007 · 2026-01 · Backend-First Development Philosophy

**Decision:** Zero frontend code is written until the backend can take a manuscript in and produce a print-ready PDF out.

**Consequences:**
- Phase 0–2 are CLI-driven and API-driven.
- The Phase 3 frontend will sit on top of an already-proven API contract.
- The existing `frontend/` directory is frozen and documented as "do not touch."

---

> ADRs are appended only. To change a decision, add a new ADR that supersedes the previous one with explicit reference to the ADR number being replaced.
