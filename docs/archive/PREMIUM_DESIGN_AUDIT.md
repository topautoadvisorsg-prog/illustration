# Premium Design Audit — Typography, Decoration, Supporting Zones, Blueprint Colors

Recommendations only. No implementation until approved. Framed as **current (what
you have) → recommended (what it can be)**, using the "Wild Land" mockup as the target
and the "Bones of the Land" render as the current baseline.

Determinism stays intact: **the image model generates imagery only** (landscape + small
specimen studies). **All text, ornaments, badges, dividers, and drop caps are produced
by the typography/layout engine** (CSS/SVG, no image spend, never baked into the image).

---

## 1. Premium typography

**Current:** fonts are already good — Cormorant Garamond (display) + EB Garamond
(body). But the page just sets a plain uppercase title flush top-left, a small-caps
section header, and paragraphs. No drop cap, no dividers, no chapter-opener treatment,
flat spacing. It reads "text placed on a page," not "collector's edition."

**Recommended:**

- **Chapter opener (like the mockup):** a dedicated typographic block —
  `CHAPTER` small-caps label (letter-spaced) → large display numeral (`I`) → display
  title in Cormorant with generous tracking, centered → ornamental divider → a
  drop-cap intro paragraph, centered, ragged. This is its own template, not the entry
  title style.
- **Entry title:** keep Cormorant but add optional small-caps variant, tighter
  leading, an oldstyle-figures option, and a thin rule or flourish beneath it.
- **Section headers:** small-caps + wider tracking (0.08–0.12em) + a hairline rule or
  a tiny ornament glyph, with more space above than below (clear grouping).
- **Hierarchy (lock a scale):** chapter title > entry title > section header > body >
  caption, with consistent ratio (~1.25 step). Captions in italic Cormorant.
- **Spacing:** increase body leading (~1.5), add paragraph spacing OR first-line
  indent (pick one — recommend indent for book feel), widen the text measure to
  ~60–66 chars, enable hyphenation + hanging punctuation.
- **Drop caps:** decorative initial on the first paragraph of each entry and chapter
  (the mockup's botanical `T`). Engine-drawn (CSS `::first-letter` + an optional SVG
  frame), never from the image model.
- **Ornamental dividers between sections:** a pinecone/botanical divider glyph instead
  of a blank line, so sections read as designed units.
- **Refinements:** real em-dashes, true small caps, ligatures, oldstyle numerals,
  consistent quote glyphs.

## 2. Decorative element system (engine-drawn, reusable)

**Current:** one Layer-3 ornament (two rules + a `❦`) on continuation pages. That's it.

**Recommended — a small reusable ornament library (CSS/SVG, deterministic):**

- **Top frieze / border band** (the mockup's botanical header bar) — chapter openers.
- **Pinecone divider** — between sections and as a footer ornament.
- **Section flourish** — small rule-with-center-motif under headers.
- **Drop-cap frame** — optional botanical box around the initial.
- **Corner ornaments** — subtle, for openers/plates.
- **Range / zone badges** (the mockup's FOREST / MOUNTAIN circular icons) — driven by
  the page's wilderness-zone tags; engine-rendered chips, not image content.

Applied **per layout type**: chapter opener gets the full frieze + numeral + badges;
ordinary entries get a restrained divider + drop cap. Tasteful, not busy.

## 3. Supporting illustration zone system (ORANGE)

**Current:** a few layouts (scattered) have `supporting-art` zones, but there's no
consistent supporting-subject derivation and the blueprint only weakly marks them.

**Recommended:**

- Formalize an **ORANGE supporting-image zone** in the layout allocation for layouts
  that should carry small studies (standard, margin, sidebar, text-heavy, banner).
- **Derive 1–2 supporting motifs** per page from the subject/zone context (pinecone,
  track, leaf, mushroom, antler, flower, compass) — a small deterministic vocabulary,
  same spirit as the hero-subject derivation.
- The **blueprint** marks these zones ORANGE; the **image agent** fills them with small
  specimen studies — **no text**.
- This is what gives text areas "life" (small botanical studies in the margins) without
  clutter — the field-guide feel.

## 4. Blueprint color standardization

**Current blueprint colors:** blue = image, green = text-safe, yellow = title,
purple = supporting. **Does not match your standard.**

**Recommended (your standard):**

| Zone | Color |
|---|---|
| `TEXT_SAFE_ZONE` | **RED** |
| `PRIMARY_IMAGE_ZONE` | **BLUE** |
| `SUPPORTING_IMAGE_ZONE` | **ORANGE** |

- Remap the blueprint generator + the composition-instruction legend to RED / BLUE /
  ORANGE.
- **Open question — the TITLE zone:** your standard lists 3 colors and no title color.
  Two options: (a) fold the title zone into `TEXT_SAFE` (RED) since it's also
  text-only / no-image, or (b) add a 4th color for title. **Recommend (a)** — title is
  a text zone; keeping the palette to 3 colors matches your spec. Confirm.
- These colors **only ever exist in the blueprint**; they never appear in the final
  page (already true — the blueprint is a separate reference image).

## 5. Premium text areas without clutter (readability)

**Current:** text sits directly on the baked-calm zone (good, post-blueprint). On busy
pages the title can still blend into art.

**Recommended — a SUBTLE, typography-level readability treatment (never an artwork
mask):**

- Treat readability as **type rendering**, not artwork modification: a light per-glyph
  paper halo (soft `text-shadow`), slightly heavier display weight, and generous
  leading — applied to the **text**, leaving the illustration untouched. This honors
  "artwork dominant; the renderer adds only a localized feathered Reading Zone behind the text (SPEC.md)."
- Apply it **only where text overlaps artwork** (titles on busy openers); pure
  parchment zones need none.
- Add **life, not noise:** the ORANGE supporting studies + restrained ornaments +
  drop cap + dividers make the text area feel composed and premium without crowding.
- Keep negative space generous; one drop cap, one divider per section, 1–2 small
  studies — a clear ceiling so it never becomes cluttered.

---

## Critical rule (reaffirmed)

The image model generates **imagery only** — no titles, labels, captions, notes, page
numbers, specimen names, or any readable text. If readable text appears in image
output, the image is incorrect. All text + ornaments + badges + drop caps come from the
typography engine. (Already enforced in the prompt safety rules; recommend keeping the
post-generation check.)

---

## Proposed build order (after approval)

1. **Blueprint colors → RED/BLUE/ORANGE** (small, unblocks the zone language) + confirm
   title-zone handling.
2. **Supporting-zone system** — derivation + ORANGE zones + blueprint + prompt legend.
3. **Premium typography** — chapter-opener template, hierarchy, spacing, drop caps.
4. **Decorative element library** — frieze, dividers, badges, drop-cap frame.
5. **Subtle readability treatment** — glyph-level, where text meets art.

Each step deterministic; only re-generating illustrations costs spend (and only when we
choose to regenerate to pick up ORANGE supporting zones).
