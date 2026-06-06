# SPEC — Book Generation v2.0: Layout-First, Composed-at-Generation

**Author:** Claudio (CTO)
**Date:** 2026-06-06
**Status:** Proposed — awaiting approval. **No new build until approved.**
**Supersedes:** the compositor-masking approach (reverted in commit 74760f9).

---

## Objective

Pages must be **composed correctly by the image agent at generation time** — the
illustration itself already leaves the text-safe zone calm, so text drops straight in.

The renderer / typography engine **places text only**. It must **never** erase, fade,
mask, cover, or otherwise repair the illustration after generation. Repairing
composition afterward damages the art (over-wipes, empty parchment gaps) and is the
wrong layer. That approach was tried, proven wrong, and reverted.

```
Layout Blueprint  →  Image Agent  →  Correctly Composed Illustration  →  Typography Engine  →  Final Page
   (structure)        (illustration only)                                  (text only)
```

---

## Why the previous approach was wrong

The compositor masked the text-safe + title zones to parchment **after** generation.
It "worked" for readability but:

- it covered/erased real illustration, leaving visually empty gaps;
- it fought the image instead of fixing the source;
- it treated a generation problem at the render layer.

**Root cause restated:** the image model was not respecting the layout — *because we
never gave it the layout*. We only described zones in words. The fix is to give the
agent the actual **blueprint image** of the page so it composes into the zones.

---

## The fix — teach the image agent to compose from a blueprint image

For every page, generate a **layout blueprint image** (a visual zone map) and hand it
to the image agent together with the Style DNA, the fixed prompt, and the subject. The
blueprint shows the model exactly:

- **IMAGE-PRIORITY zone** — where the main illustration goes.
- **SUPPORTING-ART spots** — where small elements may go (track, pinecone, specimen).
- **TEXT-SAFE zone** — leave visually calm (parchment / sky / low detail). No subjects.
- **TITLE zone** — keep calm enough for display type.

The model then builds the illustration into those regions and leaves the text-safe zone
open **in the image itself**. Typography places text into that reserved zone afterward —
with nothing painted over the art.

**We already have the geometry:** `layout-director.ts` emits `imagePriorityZones`,
`textSafeZones`, `typographyZones` as rectangles (`xPct/yPct/widthPct/heightPct`). The
blueprint image is a direct render of those rectangles — no new layout math needed.

### Open technical choice (lock when the operator's prompt arrives)

1. **Inpainting mask (hard guarantee):** pass the blueprint as an edit **mask** so the
   image API can only paint inside the illustration region; the text-safe zone is
   physically protected at generation. Strongest enforcement.
2. **Reference image (soft guidance):** pass the blueprint as a reference/condition
   image alongside the prompt. Simpler; relies on the model following the reference.

Recommendation: prototype the **reference-image** path first (works with the current
generate call), escalate to the **inpainting mask** if composition isn't reliable.

---

## Phases & priority order

1. **Renderer is clean** — paints the illustration full-bleed, no mask/fade/cover.
   Typography places text only. **(DONE — commit 74760f9.)**
2. **Blueprint-image generator** — render each page's zone rectangles to a blueprint
   image (image-priority / supporting / text-safe / title), driven by the existing
   `LayoutAllocation`. No image spend.
3. **Fix the generation prompt + wire the blueprint to the image agent** — the agent
   receives Style DNA + blueprint image + subject; prompt instructs it to compose the
   illustration into the image zones and leave the text-safe zone calm.
4. **Validate with new images** — generate a small Chapter 1 set; confirm the text-safe
   zone is calm **in the raw image** (no renderer help). Requires a spend green-light.
5. **Then** capacity-char enforcement (self-contained pages) and typography polish.

---

## Acceptance criteria

- The raw generated image already has a calm, low-detail text-safe zone — verifiable
  before any text is placed.
- The renderer adds **zero** parchment, mask, fade, or veil over the artwork.
- Text placed in the reserved zone is readable on the as-generated illustration.
- A small amount of text over low-detail artwork (sky, faded edge) is acceptable;
  paragraphs over forests / wildlife / detailed terrain are not.

---

## Constraints / guardrails

- **No new build until this SPEC is approved.**
- No new image generation until an explicit spend green-light (Phase 4).
- Renderer/typography never modifies the illustration.
- Do not touch Style DNA, the subject system, or the 16 templates as templates.
- Every change: `npx tsc --noEmit` clean + full test suite green before commit.

---

## Open questions

- Blueprint delivery: inpainting **mask** vs **reference image** (see above) — to be
  locked when the operator provides the page-image prompt.
- Blueprint visual encoding: how literal should the zone map look to the model
  (flat color regions vs. labeled boxes vs. a faint parchment+art mock)? Decide in the
  Phase 2 sub-spec.
- Whether the blueprint also encodes supporting-art and decoration spots in v1 or only
  image-priority + text-safe to start.
