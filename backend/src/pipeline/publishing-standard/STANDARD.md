# Wild Lands Publishing Standard — v1.1

**v1.1 (badge taxonomy):** three badge families locked — Region (8), Hazard/Usage
(9), Source/Confidence (5). Badges are deterministic **stamped overlays**, never
model-drawn; the image model keeps the bottom corners clean. Subjects stay clean;
hazards/region/source live in badge metadata. See `standard.ts` for exact values,
colors, order, and placement.

**Status:** LOCKED. Treat every value in this document as a constant.
**Source of truth:** `backend/src/pipeline/publishing-standard/standard.ts` is the machine version. This document is the human version. If they disagree, the code wins.

## Direction of authority — non-negotiable

```
Standard  →  Render
```

Never:
```
Render → Standard → Render → Standard → ...
```

The Standard is upstream of every render. Renders conform to the Standard. The Standard does not conform to renders.

- Do **not** re-sample paper or ink colors from a generated image to "recalibrate" v1.0.
- Do **not** widen a value because a render came in slightly different.
- Do **not** treat the model's interpretation as feedback that updates the spec.

If a render disagrees with the Standard, the render is wrong — re-prompt, don't re-spec.

Values change ONLY through an explicit version bump (v1.1, v2.0) signed off by the operator. Empirical sampling from renders is forbidden once a version is locked.

---

## Why this exists

Before any single page can know it is about a bear, a moose, a glacial valley, or a maple tree, it must already know it is a **Wild Lands page**. The page knows its paper, its ink, its serif, its hierarchy, and its ornaments before it knows its subject.

Every render — every chapter, every region, every AI run — pulls from this standard. New animals do not require new design. New books in the series do not require new design. The system fills proven templates with new content.

This is what turns the whole-page render experiment into a publishing pipeline.

---

## 1. Color Palette — LOCKED

| Role | Hex | RGB | Use |
|---|---|---|---|
| **Parchment** | `#E0C8A0` | (224, 200, 160) | Page background, paper field, letterbox bars |
| **Ink** | `#543C24` | (84, 60, 36) | All typography (body, title, kicker, subhead). NOT pure black, ever. |
| **Forest Green** | `#3F5A43` | (63, 90, 67) | Forest badge ring, forest-zone botanical accents |
| **Mountain Ochre** | `#A47A3C` | (164, 122, 60) | Mountain badge ring, geology-zone accents |

Ink is the most important rule. The page reads as printed because the ink is warm sepia, not screen black. Any black on the page is a mistake.

---

## 2. Typography System — LOCKED

### Body

| Property | Value |
|---|---|
| Family | Caslon-class old-style serif (Adobe Caslon, Goudy Old Style, Adobe Garamond) |
| Size | **13pt** |
| Line height | **1.5** |
| Measure | **70 characters** per line |
| Color | Ink `#543C24` |
| Style | Letterpress feel, slight printed-ink impression, paper grain visible under type |

### Title (chapter opener)

Three-tier hierarchy, stacked, centered, same ink, never colored:

```
CHAPTER         <- kicker: small caps, tracked +120, hairline rules either side
I               <- Roman numeral: oversized engraved-style, the dominant glyph
THE BONES OF    <- title name: stately serif caps, full reading-measure width
THE LAND
```

### Subhead

| Property | Value |
|---|---|
| Family | Same serif as body, bold weight |
| Size | Body + 1pt (14pt) |
| Color | Ink |
| Use | Section headings inside the body block ("The Ranges", "Spring — The Dangerous Season") |

### Drop cap

| Property | Value |
|---|---|
| Letter | First letter of body |
| Height | ~3 body lines |
| Treatment | Illuminated with engraved botanical surround — leaves, vines, a single small pinecone |
| Color | Ink |

---

## 3. Chapter System — LOCKED

Every chapter opener emits exactly this hierarchy. No exceptions.

| Slot | Rule |
|---|---|
| Kicker | The literal word `CHAPTER`, small caps, tracked, hairline rule each side |
| Number | Roman numeral, oversized, engraved-style, single dominant glyph |
| Name | Entry title from the manifest, rendered in stately serif caps |

The numeral is ALWAYS Roman. Arabic numerals do not appear in the chapter system.

---

## 4. Ornament System — LOCKED

### Family A — Botanical Pinecone

The only ornament family for v1.0. All decorative rules, swags, and medallions come from this family. AI does not get to invent new ornaments per page.

| Slot | Components | Placement |
|---|---|---|
| **Top swag** | Pine branches with cones, oak leaves with acorns, fern fronds, symmetrical, centered pinecone medallion | Above the illustration on chapter openers |
| **Bottom swag** | Mirror of top swag, slightly slimmer, centered pinecone medallion | Below the body block on chapter openers |
| **Hairline rules** | Thin engraved single line, paired around the kicker and the title | Flanking `CHAPTER` and the title name |
| **Drop-cap surround** | Engraved botanical wreath — leaves, vines, single pinecone | Around the body's drop cap |

**Treatment**: line engraving, warm sepia ink, period-correct. Never clip art. Never digital flourish. Never gradients. Never drop-shadows.

---

## 5. Badge System — LOCKED for v1.1

Badges are **deterministic stamped overlays** — the image model never draws them.
The model keeps both bottom corners (≈0.9in square) visually quiet; print-prep
stamps the badges identically on every page (consistent, searchable, reusable).
Three families. Exact values, colors, order, and contradictions live in
`standard.ts`. Page subjects stay clean; these values come from page metadata.

**Region (8)** — bottom-left: `FOREST · MOUNTAIN · RIVER · WETLAND · COASTAL ·
ALPINE · FIELD · GENERAL`

**Hazard / Usage (9)** — bottom-right, most-severe-first, multiple allowed when
non-contradictory: `DEADLY · TOXIC · VENOMOUS · AGGRESSIVE · CAUTION ·
EXPERT_REVIEW · EDIBLE · MEDICINAL · NONE`

**Source / Confidence (5)** — small sepia seal: `SCIENTIFIC_LITERATURE ·
FIELD_GUIDE · TRADITIONAL_USE · HISTORICAL_SOURCE · GENERAL_REFERENCE`

Colors are within the warm-sepia world (no screen-bright reds); the v1.1 palette
is proposed and locked in `standard.ts` pending physical-proof tuning.

---

## 6. Layout Families — LOCKED (reference)

Already locked in `LAYOUT_PROFILES`. Listed here for completeness:

| Family | Composition | Use |
|---|---|---|
| **A** | Full text + full illustration (paired pages) | Major content |
| **B** | 50/50 split (image-left or image-right) | Standard interior |
| **C** | 25% corner illustration | Text-dominant interior |
| **D** | Pure text | Text-only interior |
| **LAYOUT_13_FEATURE_BANNER** | Top-band illustration + body | Chapter openers |
| **LAYOUT_4_DANGER_WARNING** | Image-left + caution treatment | Hazard pages |

No new layouts get invented mid-book.

---

## 7. Page Hierarchy — LOCKED

A Wild Lands page assembles in this exact order, top to bottom:

1. **Top swag** (chapter openers only)
2. **Title block** — `CHAPTER` / Roman numeral / title name
3. **Title-flanking rules** — hairlines either side of kicker and title
4. **Illustration zone** — per the page's layout family
5. **Body block** — opens with drop cap, flows at 13pt / 70-char measure
6. **Subheads** — inline section breaks, bold serif
7. **Bottom swag** (chapter openers only)
8. **Badges** — bottom-corner region (chapter openers only)

Interior pages skip slots 1, 2, 3, 7, 8 and keep 4, 5, 6.

---

## 8. Spacing Rules — LOCKED

| Element | Spacing |
|---|---|
| Trim size | 8.5 × 11.0 in |
| Bleed | 0.125 in each side |
| Canvas | 8.75 × 11.25 in |
| Body line height | 1.5 × body pt |
| Title kicker-to-numeral gap | ~1 body line |
| Numeral-to-name gap | ~1.5 body lines |
| Top swag to title block | ~2 body lines |
| Body to bottom swag | ~2 body lines |
| Badges to trim edge | ~0.5 in clear |

---

## 9. What the AI is allowed to vary

- The **illustration content** (subject, environment, mood) within the illustration zone.
- The **micro-composition** of the swag (which leaves go where) provided the family stays Botanical Pinecone.
- The **drop-cap motif** within the engraved botanical treatment.

## 10. What the AI is NOT allowed to vary

- The paper color
- The ink color
- The font family
- The body size, line height, or measure
- The chapter hierarchy structure
- The ornament family
- The badge designs
- The layout family selected for the page

---

## 11. How the standard is consumed

`standard.ts` exports `WILDLANDS_STANDARD`. Every prompt-assembly, every renderer, every spec builder imports from there. No string-literal color values, no inline typography numbers, no hardcoded font names anywhere else in the codebase. Drift is a bug.
