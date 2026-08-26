# SPEC — Book Generation v2.1: Full-Page Illustration + Reading Zone

**Author:** Claudio (CTO)
**Date:** 2026-06-07
**Status:** Active architecture. Supersedes the "renderer must never mask/fade/erase"
rule from v2.0.

---

## Core architecture

```
Layout Blueprint  →  Image Agent  →  Full-page illustration  →  Typography Engine (Reading Zone)  →  Final Page
```

- **Image agent** generates ONE rich, full-page illustration. It is never asked to
  leave a large empty area. The page should feel like a single complete illustrated
  page, not separate boxes.
- **Typography engine (renderer)** owns the **Reading Zone**: wherever the real text
  lands, it creates a clean, readable area by softening/cleaning the artwork directly
  under the text and **feathering the edges organically** into the surrounding
  illustration.

---

## Zone meanings (blueprint — RED / BLUE / ORANGE)

The blueprint is a composition **guide** handed to the image agent. Its colors exist
only in the blueprint, never in the final page.

- **BLUE — PRIMARY_IMAGE_ZONE:** the primary subject / main visual focus.
- **ORANGE — SUPPORTING_IMAGE_ZONE:** supporting artifacts / specimen studies, rendered
  **directly on the bare parchment** (no cards, frames, boxes, or colored backgrounds).
- **RED — READING ZONE GUIDE (only):** approximately where text will live. RED is a
  **small guide**, NOT a demand for a large empty blank area. The image agent should
  avoid placing major subjects / important detail there, but it should still fill the
  page richly — the renderer creates the final readable area.

---

## THE READING ZONE PRINCIPLE (the rule that governs the renderer)

**The renderer MAY create a Reading Zone.**

A **Reading Zone** is a *localized, typography-driven* area where artwork is softened,
cleaned, or removed **only behind the actual text** to support readability, blended
organically into the illustrated page.

This **supersedes** the older rule ("the renderer must never mask/fade/erase/modify
artwork"). That rule existed to stop **large empty masked zones that destroyed the
illustration** — that failure mode is still banned. The Reading Zone is the opposite:
small, local, feathered, and integrated.

**The Reading Zone IS:**
- Localized to where the **actual rendered text** sits (follows the text, not a fixed
  zone-wide wipe).
- Feathered/blended at the edges so it dissolves into the surrounding artwork.
- Subtle — the artwork stays visible (veil ≈ 0.8, not opaque). You still see the whole
  page as one illustration.
- Owned and produced by the renderer/typography engine.

**The Reading Zone IS NOT:**
- A large empty masked area or a zone-wide parchment wipe.
- A card, box, panel, sticky-note, or modern UI surface.
- A hard rectangle, border, or radius.
- A flat overlay that hides the illustration.

**Goal:** make the readable area feel like the page was *designed that way from the
start* — one continuous illustrated page with text that reads cleanly.

---

## Responsibilities (do not combine)

- **Image agent** — illustration only. Full-page, rich. BLUE primary subject, ORANGE
  supporting studies on parchment, RED kept relatively calm as a guide. **No text of
  any kind.**
- **Renderer / typography engine** — places all text, and **owns the final Reading
  Zone** (the feathered clean behind the text). Never paints letters into the image;
  never wipes whole zones to empty parchment.

---

## Implementation (current)

- **Blueprint** (`blueprint.ts`): RED/BLUE/ORANGE, with a clean GUTTER between RED and
  BLUE (no overlap). RED is a smaller guide.
- **Lean prompt** (`plan-pages.ts`): Style DNA + Subject Package (primary / supporting /
  environment / mood) + blueprint pointer + short rules. Supporting studies instructed
  to render directly on parchment (no cards/frames/boxes).
- **Renderer** (`render-html.ts`):
  - Paints the illustration full-bleed and **clean** (no mask stacked over the sheet).
  - Binds the first-page text panel to the RED rect (position).
  - Applies the **Reading Zone veil**: a feathered radial parchment gradient on the
    `.text-panel` background — calm in the text core, fading to transparent at the panel
    edges — plus a per-glyph halo. Localized to the text; blends into the artwork.

---

## Guardrails (unchanged)

- The image agent generates **imagery only** — no readable text anywhere. If text
  appears in image output, the image is incorrect.
- No image spend without explicit operator approval.
- Deterministic where possible; `tsc --noEmit` clean + full test suite green before commit.
- The Reading Zone must never regress into the banned failure mode (large empty masked
  areas / cards / boxes / overlays).

---

## Superseded

- v2.0 rule "Renderer must never mask, fade, erase, or modify artwork" — **replaced** by
  the Reading Zone Principle above. The intent (no large empty masked areas destroying
  the illustration) is preserved; the mechanism (a small feathered local Reading Zone)
  is now allowed and owned by the renderer.
