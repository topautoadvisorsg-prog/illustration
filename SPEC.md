# SPEC — Book Generation v2.0: Layout-First Enforcement

**Author:** Claudio (CTO)
**Date:** 2026-06-06
**Status:** Proposed — awaiting approval. **No code until approved.**
**Supersedes:** Milestone 1 (Manuscript → Manifests) — preserved in git history.

---

## Objective

Make the publishing pipeline **deterministic and self-enforcing** so that text is
always readable and pages are always self-contained.

Three engines, three responsibilities, never combined:

- **Layout engine** owns *structure* (the zone map).
- **Image generator** owns *illustration* (fills artwork zones only).
- **Typography engine** owns *text* (fills text zones only, fitted to capacity).

The image model must **never** decide where text goes, and we must **never** rely on
the image model obeying a "keep this area calm" instruction. We proved it does not
obey reliably. Enforcement moves to the compositor and the planner, where it is math,
not hope.

---

## Background — why this milestone exists

Current behaviour (verified in the live Chapter 1 proof):

1. The renderer paints the generated image **full-bleed across the entire sheet**
   (`artworkSheetCss` in `backend/src/pipeline/stage-6-layout/render-html.ts`). Nothing
   physically keeps artwork out of the text zone — so text lands on busy illustration.
2. When an entry's text exceeds one page, it **spills onto continuation sheets** that
   reuse the same full-bleed art, producing text-on-illustration and half-empty pages.
3. Prompt-level "text-safe zone" language (already strengthened) helps but is **not a
   guarantee** — the image model still paints detail into text zones, especially in
   side-column and scattered layouts.

What already exists and will be **reused, not rebuilt**:

- **Zone rectangles** — `LayoutAllocation` (`layout-director.ts`) already emits
  `textSafeZones`, `typographyZones`, `imagePriorityZones`, each a `PlanningZone` with
  `xPct / yPct / widthPct / heightPct`. The blueprint is already computed per page.
- **Character capacity per zone** — `text-fit.ts` already computes `capacityChars`
  (`charsPerLine × usableLines`) for every page. The counter exists; it is currently a
  soft warning, not a hard constraint.

This milestone turns existing data into **enforced rules**.

---

## Core rules (non-negotiable)

```
TEXT_SAFE_ZONE   = HARD LOCK   (no primary illustration content, ever)
TITLE_ZONE       = HARD LOCK   (no busy artwork behind display type)
IMAGE_PRIORITY_ZONE = where artwork is allowed
```

- Hard-locked zones are rendered as **clean parchment** (paper texture / subtle grain /
  faint decorative treatment only).
- The boundary between artwork and a locked zone is a **soft feather/fade**, not a hard
  rectangle — the page still reads as one continuous premium illustration, not a boxed
  image. "The image IS the page" survives; the text zone is simply *guaranteed* clean.
- Enforcement happens at **render/composite time** using the existing zone rectangles —
  independent of what the image model painted.

What is explicitly **out of scope / unchanged**:

- **Style DNA** (Vintage Naturalist) — untouched.
- **Subject system** — untouched.
- **The 16 layout templates** — untouched as templates; only their rendering is enforced.
- Agents stay advisory/read-only; no new live LLM calls.

---

## Technical approach

### Phase 1 — Hard-lock TEXT-SAFE and TITLE zones (compositor enforcement)

**Where:** `render-html.ts` (and its chapter/book/page callers in `render-chapter.ts`).

**Change:** stop painting the image full-bleed as the sheet background. Instead:

1. Read the page's `imagePriorityZone` / `textSafeZones` / `typographyZones` rects
   (already available from the allocation; thread them into the renderer).
2. Paint the artwork positioned to the **artwork (image-priority) region**.
3. Over the **text-safe and title rects**, composite a **parchment mask** with a soft
   feathered edge (CSS gradient mask keyed to the zone rect, or a pre-composited PNG
   alpha mask) so those rects resolve to clean parchment regardless of the underlying
   image.
4. Remove the residual reliance on the per-glyph scrim as a readability crutch — the
   zone is now genuinely clean beneath the text.

**Determinism:** the mask is derived purely from the zone geometry, so the result is
identical every render and never depends on image-model compliance.

**Proof without spend:** because this is render-time only, it runs against the images
**already generated** — no new image generation. (Priority #1 and #2 below.)

### Phase 2 — Character-capacity as a hard rule (self-contained pages)

**Where:** planner / breakdown (`stage-2-planner`), `text-fit.ts`, and the
manifest/page split logic.

**Change:**

1. Treat `capacityChars` per zone as a **hard budget**, not a warning.
2. The text-breakdown fits each entry's body to the budget of its page's text-safe zone.
3. If an entry exceeds one page's budget, **split deterministically into N planned
   pages** at paragraph boundaries. Each split page is **self-contained**: its own clean
   text-safe zone and its own calm composition — **never** the same busy image dumped
   under overflow text.
4. Continuation sheets get their own calm treatment (parchment + Layer-3 ornament, or
   their own subject art), not the reused full-bleed image with a half-empty bottom.

**Result:** overflow becomes *planned additional pages*, eliminating the broken
continuation sheets (proof sheets 2, 4, 5, 8).

### Phase 3 — Typography polish

- Increase body text size to the readable target; reposition titles within the locked
  title zone.
- Align layout coverage to the page-type ratios:
  - Chapter opener 60 / 40 · Educational 35 / 65 · Feature 75 / 25 · Reference 20 / 80.
- Fix the LAYOUT_5 / LAYOUT_10 asset data bug (`{SUBJECT}` declared but missing from the
  template body) so the opener and full-page-plate layouts are usable.

### Phase 4 — Layout-image / mask input to the image generator (v2)

- Use the image **edits/inpainting API**: hand the model the parchment page with only
  the artwork zone open as a mask, so it paints **into the zone shape** directly.
- This is the strongest form of the lock and matches the "send a picture of the layout
  to the image generator" approach. Also resolves subject/layout mismatches (e.g. the
  vignettes "scene instead of studies" case, proof sheet 9).

---

## Zone-map contract (formalizes the three-engine separation)

Every page emits an explicit zone map consumed by the renderer and (Phase 4) the image
generator:

```
ZONE_A  IMAGE_PRIORITY   artwork allowed
ZONE_B  TEXT_SAFE        HARD LOCK — typography only
TITLE   TITLE            HARD LOCK — display type only
ZONE_C  SUPPORTING_ART   optional, 5–15% of page
ZONE_D  FIELD_NOTE       optional
ZONE_E  DECORATION       optional, non-critical
```

The image generator receives **Style DNA + zone map + subject only** — never body text,
captions, labels, page numbers, callouts, or diagrams.

---

## Priority order (locked)

1. **Re-render existing generated pages with TEXT-SAFE + TITLE masking enforced** (Phase 1).
2. **Show before/after proof using the same images — no new image generation.**
3. **Enforce `capacityChars` as a hard rule** so overflow becomes planned additional
   pages, not broken continuation sheets (Phase 2).
4. **Typography polish** (Phase 3).
5. **Phase 4** layout-image / mask input to the image generator.

---

## Acceptance criteria

**Phase 1**
- No primary illustration content appears in any TEXT_SAFE or TITLE rect on any rendered
  Chapter 1 page.
- Boundaries read as a soft feather, not a hard box; pages still feel like one
  continuous premium illustration.
- Proof produced from **existing** images only — zero new image spend.
- A clear before/after for the same pages.

**Phase 2**
- No rendered page shows text overlapping illustration outside the artwork zone.
- No half-empty continuation sheet with image showing through under absent text.
- Every page is self-contained; overflow is N planned pages, each clean.

**Phase 3**
- Body text at the readable target size; titles positioned cleanly in their locked zone.
- Page-type ratios match the spec.

**Phase 4**
- Image generator paints only inside the masked artwork zone; text zones are clean by
  construction at generation time.

---

## Constraints / guardrails

- **No code until this SPEC is approved.**
- Phase 1 must produce its proof with **no new image generation** (no OpenAI spend).
- Do not touch OpenAI billing or keys.
- Do not alter Style DNA, the subject system, or the 16 layout templates as templates.
- Every phase: `npx tsc --noEmit` clean + full test suite green before commit.
- Deterministic, auditable; agents remain advisory.

---

## Risks & open questions

- **CSS mask vs. pre-composited PNG mask:** CSS gradient masks keyed to zone rects are
  simplest and need no image reprocessing; a pre-composited alpha PNG gives pixel-exact
  feathering but adds a processing step. Phase 1 will start with the CSS approach and
  escalate only if the feather quality is insufficient.
- **Organic / scattered zones:** non-rectangular zones (`shape: 'organic' | 'path'`)
  need feathered masks beyond simple rects; Phase 1 covers rect zones first.
- **Deterministic split points (Phase 2):** splitting on paragraph boundaries must never
  orphan a heading or a single line; rules to be finalized in the Phase 2 sub-spec.
- **Phase 4 inpainting** depends on the image edits API and mask generation; treated as a
  separate milestone with its own spec.

---

## Anticipated files touched (for reference, not a commitment)

- Phase 1: `backend/src/pipeline/stage-6-layout/render-html.ts`,
  `render-chapter.ts`; tests in `backend/src/__tests__/render-html.test.ts`,
  `render-chapter.test.ts`.
- Phase 2: `backend/src/pipeline/stage-2-planner/*`, `text-fit.ts`, manifest/page split.
- Phase 3: `layout-profiles.ts`, typography config, layout prompt assets (LAYOUT_5/10 fix).
- Phase 4: new `stage-3-generation` mask/inpaint path.
