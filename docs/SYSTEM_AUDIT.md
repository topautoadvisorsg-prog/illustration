# Wildlands Publishing Platform — System Audit

**Auditor:** Claudio (CTO)
**Date:** 2026-06-01
**Question:** Can the current system consistently produce a professional, fully
illustrated, KDP-ready book from a finished manuscript with minimal manual work?

**Short answer:** Not yet — but the *architecture* is sound and, importantly, the
system already embodies the clean-art / layout-owns-text separation you're proposing.
The gap is implementation depth (Stages 3–8 are specs, not code) and several
consistency drifts between the documented design and the current code. No swarm of
new agents is needed. The existing 6 agent contracts + deterministic stages are the
right model. Two genuinely new responsibilities are justified: an **Annotation/Diagram
Compositor** and a **Cover Art Director**.

---

## A. CURRENT-STATE AUDIT

### What "agents" actually are here
These are **behavior contracts** (`backend/src/agents/agent-contracts.ts`) — typed
role/rules/IO definitions — not a fleet of live LLM agents. Only **one** stage calls
an LLM at runtime (Stage 1.5 → Claude). The planner agents (PAGE_PLANNER,
LAYOUT_SELECTOR, PROMPT_ASSEMBLER) are all implemented by a single **deterministic**
function, `planPage()`. That is a strength: deterministic = repeatable. The contracts
give auditability (operator sees which agent decided what and why).

### Pipeline implementation reality

| Stage | Spec | Code | Status |
|---|---|---|---|
| 1 Ingestion | ✅ | ✅ `ingest-manuscript.ts` + outline parser | **Working** |
| 1.5 Manifests (Claude) | ✅ | ✅ `generate-manifests.ts` | **Working** (validated vs deterministic outline) |
| 2 Page Planner | ✅ | ✅ `plan-pages.ts` | **Working** (layout select + prompt assembly + hashing) |
| 3 Image Gen (OpenAI) | ✅ | ❌ worker is a 3-line stub | **Not built** |
| 4 Human Review Gate | ✅ | ❌ no approve/reject/regenerate routes | **Not built** |
| 5 Upscale + DPI gate | ✅ | ❌ stub | **Not built** |
| 6 Layout Engine (Puppeteer+Paged.js) | ✅ | ❌ stub; spike `step-f` proves concept | **Not built** |
| 7 PDF Compile (stitch+ICC) | ✅ | ❌ stub | **Not built** |
| 8 EPUB Export | ✅ | ❌ stub; spike proves concept | **Not built** |
| — Cover (front/wrap/back) | ⚠️ blueprint only | ❌ nothing | **Not built** |
| — QA / preflight | partial in contracts | ❌ no automated preflight | **Not built** |

So today the system reliably does: **manuscript → outline → manifests → page plans +
image-only prompts (hashed) + layout selection + capacity/blocker reporting.** Zero
image cost up to here. Everything after prompt assembly is specification.

### Per-agent assessment

| Agent | Responsibility | Instructions complete? | Standardized output? | Enough info to be consistent? | Overlap? | Verdict |
|---|---|---|---|---|---|---|
| MANUSCRIPT_ANALYST | Deterministic parse → chapters/entries/sections/word counts | ✅ Strong | ✅ | ✅ | none | **Keep** |
| PAGE_PLANNER | Word count, content signals, layout intent, reason codes | ✅ Good | ✅ | ⚠️ depends on layout library being populated | folds in LAYOUT_SELECTOR + PROMPT_ASSEMBLER today | **Improve** |
| LAYOUT_SELECTOR | Pick 1 of N templates + attach mockup/prompt asset | ✅ | ✅ | ❌ capacity is **untested estimates**, mockups not stored durably | merged into planPage | **Improve** |
| PROMPT_ASSEMBLER | Fill prompt template, image-only, hash it | ✅ Excellent (clean-art rule explicit) | ✅ hashed | ⚠️ master-style block not wired (see B) | merged into planPage | **Improve** |
| TEXT_FIT_QA | Block overflow before image spend | ✅ contract | ❌ **no renderer exists** | ❌ needs Stage 6 preview | none | **Build** |
| IMAGE_QA | Check drift/accuracy/print-readiness | ✅ contract | ❌ not wired | ❌ needs Stage 3/5 | none | **Build** |

Responsibilities **do not dangerously overlap** — the three planner agents are
deliberately one deterministic function. The contracts are the targets; the code is
behind them. **Recommendation: improve existing agents, do not multiply them.**

---

## B. MISSING STANDARDS

1. **Master Style Block is not wired to runtime.** The rich, locked v1 style DNA lives
   in `backend/master-style-blocks/THE_WILDLANDS_v1.md`, but the planner injects
   `config.imageGeneration.masterStyleBlockText`, whose **default is a 5-word stub**
   ("Vintage Naturalist master visual identity."). Nothing loads the file. → Every
   image would be generated with a placeholder style unless the operator manually
   pastes the full block into config. **This is the single highest-impact consistency
   bug.**

2. **Two sources of truth for color, and they disagree.**
   - Style block: paper `#F5EDD6`, ink `#2C1A0E`, green `#3A5C3A`, warning `#8B2020`.
   - `ColorPaletteSchema` defaults: paper `#f4f1ea`, ink `#1b332d`, accent `#2f5d50`,
     warning `#9f2d20`.
   Layout/typography color and image color will not match.

3. **Layout library count drift: docs say 9, code has 16 — with a duplicate.**
   `LayoutTemplateIdSchema` defines 16 templates; `LAYOUT_9_DIAGNOSTIC_DIAGRAM` and
   `LAYOUT_12_DIAGNOSTIC_DIAGRAM` are duplicates. `planPage()` routes to 12–16 but
   **never selects 9, 10, or 11.** Every human-facing doc, the agent contracts, the
   layout-references README, and the blueprint still say "9 layouts." → The canonical
   set is undefined. Pick one number, dedupe, and align code + docs + mockups.

4. **Layout capacity is untested estimates.** All word ranges are hardcoded guesses
   (`DEFAULT_LAYOUT_CAPACITY`) with `capacityTestStatus: UNTESTED`. The two-pass
   text-fit workflow that would *prove* them (Stage 6 preview) isn't built. Until then
   "will the text fit" is a guess.

5. **No KDP preflight standard implemented.** Trim/bleed/safe-zone/ICC are described
   in Stage 7 spec but there is no automated validator. No embedded-font check, no
   page-size assertion, no margin/safe-zone check, no min-DPI gate in code.

6. **Single brand / single trim hardcoded in the type system.** `BrandSchema =
   z.literal('THE_WILDLANDS')` and `AudienceSchema = z.literal('ADULT')`. The blueprint
   defines **3 brands, 5 formats, 2 trim sizes (8.5×11 and 6×9), and B&W (Classic Ink)
   editions.** The schema cannot express any of that yet. Multi-brand/trim/edition is
   a schema-level gap, not just config.

7. **EditionSchema only has PREMIUM + KINDLE_EPUB.** Blueprint requires MIDTIER (B&W
   hardcover), ECONOMIC (6×9 paperback), LARGEPRINT. (These are intentionally out of
   V1 scope — flagged so the roadmap stays honest.)

---

## C. MISSING INSTRUCTIONS

- **No annotation/label authority.** Contracts forbid the image model from rendering
  text, and say "Stage 6 owns composition" — but **no agent owns deciding what the
  labels/callouts/arrows say or where they go.** For diagnostic/diagram/comparison
  pages this is a real undefined responsibility (see Image Workflow section).
- **No cover instructions anywhere** beyond the blueprint line "full cinematic art,
  typography overlaid." No agent, no stage, no prompt template, no trim math for spine
  width / wrap dimensions.
- **No reading-order / front-matter / back-matter standard** (title page, copyright,
  TOC, index, colophon) — required for a professional book and for KDP.
- **No image regeneration policy** wired (Stage 4 contract exists; routes don't).
- **No font-embedding / licensing instruction** for the layout engine (EB Garamond +
  Inter must be embedded and licensed for embedding).

---

## D. PUBLISHING BEST-PRACTICE RECOMMENDATIONS

1. **Front/back matter as a first-class stage**: half-title, title, copyright (with
   ISBN), dedication, TOC, body, index/glossary, colophon. KDP and reviewers expect it.
2. **Typographic hierarchy spec** beyond fonts/size: baseline grid, paragraph indents
   vs spacing, widow/orphan control, running heads, folio (page number) placement,
   chapter-opener drop logic. Currently only font/size/leading/smallcaps exist.
3. **Image placement standards**: define art-slot boxes per layout in real units (in/
   mm) with safe-zone offsets, not just prose ("small corner image"). The renderer
   needs geometry, not adjectives.
4. **Color management**: interior sRGB for premium color; cover **CMYK (US Web Coated
   SWOP v2)** per blueprint. Two distinct profiles — make that explicit in config.
5. **Black-and-white path** (Classic Ink): generate B&W from source (do NOT desaturate
   color) — the blueprint is explicit about this. Needs its own master style block.
6. **Bleed/gutter discipline**: 0.25in safe zone inside trim; KDP gutter grows with
   page count — compute gutter from final page count, don't hardcode.

---

## E. KDP COMPLIANCE REVIEW

| Requirement | Spec'd? | Implemented? | Note |
|---|---|---|---|
| Trim size exact (8.5×11 / 6×9) | ✅ | ⚠️ only as config default | enforce in renderer + preflight |
| Bleed (0.125in → 8.625×11.25) | ✅ Stage 7 | ❌ | must assert every page |
| Safe zone 0.25in | ✅ blueprint | ❌ | no checker |
| Interior color: premium color OR black ink only (no standard color hardcover) | ✅ blueprint note | n/a | correctly understood; encode as edition rule |
| Embedded fonts | ✅ Stage 6 note | ❌ | must verify in preflight |
| sRGB interior / CMYK cover | ✅ | ❌ | Ghostscript ICC embed planned, not built |
| Min 300 DPI interior art | ✅ Stage 5 | ❌ | DPI gate spec'd, not built |
| Cover spine width from page count + paper | ❌ | ❌ | **not addressed at all** |
| EPUB: EPUBCheck clean, ≤1600px images, alt text | ✅ Stage 8 | ❌ | spike only |

**Verdict:** KDP knowledge is captured well in specs; **enforcement code is absent.**
A single automated **Preflight/QA stage** should own all of these as hard gates.

---

## F. PROMPT-SYSTEM REVIEW

**Structure (good):** placeholder template per layout —
`{MASTER_STYLE_DNA}` + `{SUBJECT}` + `{SCIENTIFIC_DETAILS}` + `{COMPOSITION_NOTES}` —
with required-placeholder validation, unresolved-placeholder blockers, and SHA-256
hashing for idempotency/audit. This is a professional, standardized prompt architecture.

**Consistency / reliability:**
- ✅ Hashing + locked manifests = reproducible prompts.
- ✅ Per-layout templates = standardization across pages.
- ⚠️ **Style DNA not wired** (see B-1) — biggest reliability risk for cross-page drift.
- ⚠️ Drift mitigations beyond the style block (style reference images re-fed as
  anchors; per-chapter visual QA) are documented but not implemented.
- ⚠️ Model portability: prompts are tuned for `gpt-image-1`. No abstraction for an
  alternate image model; negative-prompt handling differs across models.

**Negative-prompt strategy:** strong and explicit in the style block (no photo, no
vector/anime, no borders, no in-image text blocks, no watermarks). But it lives in the
unwired file, and `gpt-image-1` has no true negative-prompt field — negatives are
inlined as "DO NOT…" text, which is weaker. Worth encoding negatives as a first-class
config field and validating they're present in the assembled prompt.

**Text-safe zones:** the planner's `IMAGE_PROMPT_SAFETY_RULES` is excellent — it tells
the model to protect future text areas and leave negative space. This is exactly right.

**CRITICAL CONTRADICTION (must resolve):** The legacy v1 style block still says
annotations are *"short hand-lettered field notes, 2–5 words, in the image."* The newer
planner + PROMPT_ASSEMBLER contract say *"never render text/labels; layout owns it."*
**These conflict.** See next section for the resolution — which matches your preference.

---

## G. IMAGE GENERATION vs PAGE COMPOSITION — should they be separate?

**Yes. Unambiguously. And the system already leans this way — just not consistently.**

Your proposed architecture (image model produces **clean artwork only**: subject,
composition, placement, style; the **layout/composition system** adds labels,
annotations, arrows, captions, callouts, typography afterward) is already the
**documented intent** in three places:
- `PROMPT_ASSEMBLER` hard rule: "Never ask the image model to render page text, labels,
  captions, titles, page numbers, or typography."
- `plan-pages.ts` safety rules: "Do not generate readable text by default… layout
  defines placement, not subject matter."
- `layout-references/README.md`: "The image-generation model must create the subject
  illustration only. It must not bake page text into the image."

The **only** thing fighting this is the legacy v1 Master Style Block's 2–5-word
in-image annotation allowance. **Recommendation: delete that allowance; commit fully to
clean art.**

**Does full separation improve things?** Evaluated against your criteria:

| Criterion | Effect | Why |
|---|---|---|
| Consistency | ✅ Strong + | Typography/labels become deterministic vector overlays, identical every run; no model variance in text |
| Editing flexibility | ✅ Strong + | Fix a label typo or reposition an arrow without regenerating (or paying for) art |
| Print quality | ✅ Strong + | Vector/HTML text is crisp at any DPI; model-rendered text is raster, often malformed, never 300-DPI-clean |
| Image-gen errors | ✅ Reduced | Removing text is the #1 way to stop `gpt-image-1` hallucinating garbled words/labels |
| Prompt simplicity | ✅ Simplified | Prompt = subject + style + composition only; no label payloads |
| Localization/scale | ✅ Major + | Same artwork, translated overlays → multi-language/multi-brand reuse for free |

**The one new responsibility this creates:** *someone must decide what the labels/
arrows/callouts say and where they sit*, then render them as an HTML/SVG overlay in
Stage 6. No current agent owns this. For diagnostic/comparison/anatomy pages
(LAYOUT_4/12/16, look-alike warnings) this is essential — a clean illustration of a
chanterelle is useless as ID material without "false gills — blunt, forking ridges"
pointing at the right spot.

→ **Justified new agent: `ANNOTATION_COMPOSITOR`** (a.k.a. Diagram Compositor). It
consumes the page manifest's scientific details + the generated art's known geometry
and emits structured overlay instructions (label text, anchor point, leader-line/arrow,
callout box) that Stage 6 renders as typeset vector elements. It is **not** a separate
image model — it's a composition agent feeding the layout engine. This is the single
most valuable new piece for ID-guide quality.

---

## COVER REVIEW

**Current support: none.** No cover edition, no cover stage, no cover prompt, no spine/
wrap math. Stage 8 literally says "Cover image (TBD)." The blueprint requires
**full cinematic front art with typography overlaid by the layout engine**, CMYK cover
profile, across multiple brands/trims.

Your lean toward **fully AI-generated cover artwork** (front, full-wrap, back) is sound
and fits the same clean-art principle: **generate the cover *art* with no text; overlay
title/author/spine/back-blurb/barcode with the layout engine.** KDP needs a single
full-wrap PDF (back + spine + front) sized to trim + bleed, with spine width computed
from final page count and paper stock.

→ **Justified new agent: `COVER_ART_DIRECTOR`** + a **Cover Composition stage**:
- generates front (and optional full-wrap) cinematic art via the same style DNA, text-free;
- computes wrap geometry (spine width from page count, bleed, safe zones);
- overlays title/subtitle/author/spine text/back blurb/ISBN barcode as vector;
- exports CMYK full-wrap PDF for KDP.
This is genuinely new and not covered by any existing agent.

---

## H. GENUINELY NECESSARY NEW AGENTS

Only **two** are justified. Everything else is "improve existing."

1. **`ANNOTATION_COMPOSITOR`** — decides label/arrow/callout content + placement for
   diagram/ID pages; feeds the layout engine. Enables the clean-art separation to
   actually produce ID-grade pages. **High value.**
2. **`COVER_ART_DIRECTOR`** — text-free cover art generation + wrap geometry + typographic
   overlay + CMYK export. **Required for a sellable book.**

Plus one **non-agent** structural addition: a **`PREFLIGHT_QA` gate** (could live under
the existing IMAGE_QA/TEXT_FIT_QA umbrella) that hard-enforces KDP rules (trim, bleed,
safe zone, embedded fonts, ICC profile, DPI, page-size). This is enforcement code, not
a new "thinker."

---

## I. IMPLEMENTATION PRIORITY ORDER

**P0 — Consistency fixes (cheap, unblock everything, no new features):**
1. Wire the Master Style Block file → config at project creation (kill the stub). (B-1)
2. Reconcile color: one palette source, matching the style block. (B-2)
3. Resolve layout count: dedupe LAYOUT_9/12, pick the canonical set, align code+docs+mockups. (B-3)
4. Delete the in-image-annotation allowance from the style block; commit to clean art. (F/G)

**P1 — Prove the spine end-to-end (1 page → real PDF), build the missing core:**
5. Stage 6 text-fit preview renderer (Puppeteer+Paged.js) → proves capacity ranges. (B-4)
6. Stage 3 image generation worker, gated on approved plan + no blockers.
7. Stage 4 human review routes (approve/reject/regenerate, version locking).
8. Stage 5 upscale + **DPI gate**.
9. Stage 6 final render → Stage 7 stitch + **ICC/bleed/page-size preflight** (PREFLIGHT_QA). (E)
10. Stage 8 EPUB from manifests + EPUBCheck.

**P2 — The two new agents:**
11. `ANNOTATION_COMPOSITOR` + Stage 6 overlay rendering (labels/arrows/callouts).
12. `COVER_ART_DIRECTOR` + cover composition stage (front/wrap, CMYK, spine math).

**P3 — Multi-brand / multi-format scale (matches the blueprint's full vision):**
13. Generalize schema: Brand/Audience/Trim/Edition as real enums (3 brands, 5 formats,
    6×9 + 8.5×11). (B-6, B-7)
14. Classic Ink B&W master style block + B&W generation path.
15. ECONOMIC/LARGEPRINT/MIDTIER edition switching.

**P4 — Hardening:** single-user auth enforcement, object storage (Railway FS is
ephemeral — generated art and manuscripts must move to Supabase Storage/S3), per-chapter
visual QA + style-reference-image anchoring for drift control.

---

## Bottom line

The blueprint and architecture are professional-grade. The agent model is right and
should be *improved, not multiplied*. The clean-art / layout-owns-text separation you
want is already the design intent — finish committing to it. The real work is (a) four
cheap consistency fixes, (b) building Stages 3–8 which are still specs, and (c) two new
agents (annotation compositor, cover art director) plus a KDP preflight gate. Do P0
this week; it's nearly free and removes the biggest silent-quality risks.
