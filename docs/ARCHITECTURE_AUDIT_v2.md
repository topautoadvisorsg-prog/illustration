# Architecture Audit v2 — Layered Publishing Model

**Auditor:** Claudio (CTO) · **Date:** 2026-06-01
**Builds on:** `docs/SYSTEM_AUDIT.md` (v1). This v2 focuses on the new architectural
questions — Coverage vs Architecture, Content Architecture, workflow ordering, and a
non-overengineered phased roadmap. Where v1 already answered something (KDP, prompt
system, image/composition split, covers), v2 gives the delta against what's now built.

**Headline:** Your proposed hierarchy is correct and is the right direction. The
current system already separates Coverage and Architecture as data fields but locks
them inside a flat 15-template enum and has **no first-class Content-Type concept** —
that missing layer is the single highest-leverage architectural fix. The good news:
adopting the layered model *reduces* complexity (additive axes instead of a multiplying
template list), so it's the anti-overengineering move, and most of it is a data-model
refactor, not new rendering.

---

## A. CURRENT-STATE AUDIT (delta since v1)

Since v1, the per-page production chain is now built, gated, and deployed:

```
ingest → Claude manifests → page plan (Stage 2) → text-fit gate (Stage 6 analysis)
  → image gen (Stage 3, gpt-image-1) → review (Stage 4) → upscale + 300 DPI (Stage 5)
  → PDF render (Stage 6, Chromium+Paged.js, LIVE in prod)
```

- 72 backend tests; paid APIs dependency-injected (no test spend).
- Clean-art rule enforced in the prompt (image renders zero text).
- Master Style Block wired from `services/style/master-style-blocks.ts`.
- `LAYOUT_PROFILES` already exposes `artAreaFraction` (coverage) and `artSlot`
  (architecture) as distinct fields — but per-template, not as independent axes.

Still unbuilt: multi-page project render, Stage 7 stitch + KDP preflight, Stage 8 EPUB,
covers, frontend, multi-brand/trim schema.

### Agents (unchanged conclusion from v1)
Six behavior contracts; only one runtime LLM call (Stage 1.5 Claude). PAGE_PLANNER /
LAYOUT_SELECTOR / PROMPT_ASSEMBLER are one deterministic function — good (repeatable).
**Improve existing, don't multiply.** Per-agent table is in v1 §A; still accurate.

---

## B–C. MISSING STANDARDS / INSTRUCTIONS (delta)
v1 items 1–4 (style block wiring, color, layout count, in-image annotation) are **fixed**.
Still open and now sharper given the layered model:
- **No Content-Type field.** Page "purpose" is inferred from body keywords at plan time
  and thrown away. It should be a persisted, first-class attribute (see §H).
- **No annotation authority.** Nothing owns label/arrow/callout content+placement for
  diagram pages (see Image Responsibilities).
- **No cover spec** (spine math, CMYK wrap) — unbuilt.
- **No front/back matter** (title page, copyright+ISBN, TOC, index, colophon).
- **No KDP preflight enforcement** (trim/bleed/safe-zone/embedded-fonts/DPI) in code.

---

## D. PUBLISHING BEST-PRACTICE (field-guide / natural-history specifics)
- **Content-type-driven layout** is exactly how professional field guides are built:
  Audubon/Sibley/Peterson guides use a small set of repeating *page templates by purpose*
  (species plate, comparison spread, range map, anatomy diagram). This validates the
  Content-Architecture layer.
- **Consistency over variety.** Scale comes from ~10–15 repeatable page *purposes*, each
  with 1–2 canonical arrangements — not hundreds of bespoke layouts.
- **Plates are text-free; labels are typeset.** Classic natural-history plates (Haeckel,
  Audubon) separate the illustration from the typeset caption/label. Your clean-art
  preference is the historically correct model.
- **Reading order & matter:** half-title, title, copyright (ISBN/CIP), TOC, body by
  chapter, glossary/index, colophon. Required for a credible book and KDP.

---

## E. KDP COMPLIANCE (delta)
Rendering now produces a real bleed-spec PDF (8.625×11.25) with embedded fonts —
verified in prod. Still missing the **automated preflight gate** (assert every page is
exact trim+bleed, fonts embedded, sRGB interior / CMYK cover, ≥300 DPI art) and
**page-count-driven spine/gutter** math. Encode KDP rules as a hard Stage-7 gate.
KDP format rules to encode: hardcover = premium-color OR black-ink only (no standard
color hardcover); paperback color/B&W; 6×9 and 8.5×11 trims; Kindle = reflowable EPUB,
images ≤1600px, EPUBCheck-clean.

---

## F. PROMPT-SYSTEM REVIEW (delta)
Structure is sound (placeholder template + hashing + clean-art rule), now wired to the
real style DNA. The layered model improves prompt **scalability** directly: the prompt
becomes `MasterStyle(brand) + Subject + CoverageHint + ArchitectureHint` — four
orthogonal inputs composed, instead of one prompt per named template. Negative-prompt
strategy and text-safe-zone instructions are strong; keep them in the composed prompt.
Reliability across models: keep the prompt model-agnostic (subject + composition +
style), since gpt-image-1 has no true negative-prompt field — negatives stay inline.

---

## G. LAYOUT ARCHITECTURE REVIEW — Coverage vs Architecture

**Recommendation: YES — separate them into two independent axes.** They are already two
fields (`artAreaFraction`, `artSlot`) but locked together inside each named template, so
you can't currently say "50% coverage, arrangement C." Decoupling them is correct.

**But cap the real options to prevent explosion (your overengineering concern):**

- **Coverage** = a small set of buckets, not a continuum: `{15, 25, 40, 50, 60, 75, 100}`%.
- **Architecture** = the arrangement of the image area. You already have 7 (`FLOAT_LEFT`,
  `FLOAT_RIGHT`, `TOP_BAND`, `BOTTOM_BAND`, `FULL_PAGE`, `SIDEBAR_RIGHT`, `SCATTERED`).
  That set covers your examples (top-half = TOP_BAND@50; two diagonal blocks = SCATTERED@50;
  three blocks = SCATTERED; central wrap = a new `CENTER_WRAP`). Add `CENTER_WRAP` and
  maybe `SPLIT_DIAGONAL`; stop there.

Composing 7 coverage × ~8 architecture = 56 *possible* combos, but you only ever
*render* the handful a content-type asks for. The combinatorial space exists in data,
not in hand-built templates. **This is fewer artifacts than 15+ named templates, not
more.**

---

## H. CONTENT ARCHITECTURE REVIEW — the missing top layer

**Recommendation: YES — make Content-Type a first-class, persisted concept. This is the
most important change in this audit.**

Today the planner derives purpose from body keywords (`danger`, `comparison`,
`diagnostic`, `progression`, `cutaway`, `opener`, `feature banner`, `tracks`…) — those
ARE proto content-types — then immediately collapses them into a layout template and
discards the classification. Promote it:

```
Content Type   (Species Profile, Comparison, Diagnostic Diagram, Chapter Opener,
                Habitat Overview, Progression Study, Cutaway, Sidebar Feature,
                Reference, Warning, Botanical Plate, Field Notes, Encyclopedia Entry, …)
   ↓ chooses sensible defaults for
Coverage       (e.g. Species Profile → 40%, Botanical Plate → 100%, Comparison → 50%)
   ↓ and
Architecture   (e.g. Comparison → SPLIT or SCATTERED; Cutaway → TOP_BAND; Profile → FLOAT)
   ↓ rendered in
Master Style   (brand visual DNA — orthogonal, applied to every image)
   ↓ depicting
Subject        (the page's actual organism/scene)
```

Why first-class:
1. **Stable vocabulary** for operators, prompts, QA, and analytics ("show me all
   Comparison pages").
2. **Defaults + override**: content-type sets default coverage/architecture; operator
   can override per page without inventing a new template.
3. **Claude already classifies it** — the manifest generator can emit `contentType`
   alongside `category` in one pass (near-zero added cost).
4. It makes the system **brand- and trim-agnostic**: the same "Comparison" content-type
   renders correctly in any brand/trim because style and geometry are separate layers.

**Verdict on the proposed hierarchy:** adopt it as written
(Content → Coverage → Architecture → Master Style → Subject). It is a clean separation
of concerns and it *reduces* total artifacts.

---

## Image Generation vs Composition Responsibilities (reaffirmed)

Your split is correct and already the enforced design (v1 §G): the image model produces
**clean, text-free art** (subject, composition, visual storytelling, style, placement
intent); the layout system adds **all** labels, arrows, captions, callouts, annotations,
typography. This improves consistency, edit flexibility, print quality (vector text is
crisp; model text is garbled raster), error rate (text is the #1 hallucination), prompt
simplicity, and localization/scale. Keep it.

**One new agent justified — but phased:** `ANNOTATION_COMPOSITOR` decides label/arrow/
callout *content + anchor position* for diagram/comparison/cutaway pages and feeds the
layout engine to typeset them as vector overlays. **Do not build until those content-
types are actually in production** (Phase 3) — a Species Profile needs no annotations.

---

## CURRENT PRODUCTION WORKFLOW REVIEW — ordering

Two candidates:
- **(1) Image-first:** generate → approve → build page around image → flow text in.
- **(2) Layout-first:** select layout → generate image for the slot → insert text.

**Best today AND long-term: (2) Layout-first — which is what's already built.** Reasons:
- Text-fit is *proven before* any image spend (your text-fit gate); image-first risks
  paying for art that won't fit the copy.
- Deterministic, repeatable pages → consistent book + clean KDP preflight.
- Image-first is the *art-book* workflow (image is the hero, text is incidental). A
  field guide is text-led with supporting art → layout-first is correct.

**Refinement (the one change):** drive layout selection from **Content-Type + text
volume**, not body-keyword scraping (which v1 fixed partially). So the real flow is:

```
classify Content-Type (Stage 1.5) → derive Coverage+Architecture (defaults, overridable)
  → assemble clean-art prompt for that slot → text-fit preview gate → generate → review
  → upscale → compose page (art + typeset text/labels) → render
```

Keep image-first only as a future "art-led" mode for covers/full-page plates.

---

## Cover Workflow Review
Fully AI-generated, **text-free** cover art + layout-typeset title/author/spine/blurb is
the right model and matches the clean-art principle. Unsupported today (no cover stage,
no spine math, no CMYK). Needs `COVER_ART_DIRECTOR` + a cover composition stage that
computes wrap geometry from final page count and exports a CMYK full-wrap PDF. **Phase 4.**

---

## J. GENUINELY NECESSARY NEW AGENTS
Only two, both phased — everything else is "improve existing":
1. `ANNOTATION_COMPOSITOR` — diagram/comparison label+arrow placement (Phase 3).
2. `COVER_ART_DIRECTOR` — text-free cover art + wrap geometry + CMYK (Phase 4).
Plus one non-agent gate: `PREFLIGHT_QA` (KDP hard checks) in Stage 7.
Also extend the existing Stage 1.5 contract to **classify Content-Type** (no new agent).

---

## K. PHASED IMPLEMENTATION ROADMAP (anti-overengineering)

**Phase 1 — Layered data model (cheap, highest leverage, little/no new rendering):**
- Add `contentType` to the page manifest; have Stage 1.5 Claude classify it (alongside
  `category`) in the existing single call.
- Introduce `Coverage` (bucket enum) and `Architecture` (the existing 7 artSlots +
  `CENTER_WRAP`) as independent fields.
- Replace the flat 15-template enum with a **content-type → {coverage, architecture}
  default policy table**, operator-overridable. Keep the SAME ~8 rendered arrangements.
- Net effect: same visual output, far cleaner model, brand/trim-agnostic.

**Phase 2 — See real books + compliance:**
- Project-level multi-page render (real manuscript → preview PDF).
- Stage 7 stitch + `PREFLIGHT_QA` (trim/bleed/fonts/DPI hard gate).
- Stage 8 EPUB (no browser).

**Phase 3 — Annotations:** `ANNOTATION_COMPOSITOR` for diagram/comparison/cutaway pages
(only once those content-types are produced in volume).

**Phase 4 — Covers:** `COVER_ART_DIRECTOR` + cover composition stage (CMYK wrap, spine).

**Phase 5 — Scale-out:** generalize schema for 3 brands / 2 trims / 5 editions (brand &
audience are currently `z.literal`, single-value); Classic Ink B&W style block; object
storage (Railway FS is ephemeral); single-user auth enforcement.

---

## L. PRIORITY ORDER (one line)
1) Content-Type + Coverage/Architecture decoupling → 2) project render + KDP preflight →
3) EPUB → 4) annotation compositor → 5) covers → 6) multi-brand/trim scale-out.

Do Phase 1 first: it's mostly a data-model refactor with no new rendering, it removes the
flat-enum smell, and every later phase is cleaner on top of it.
