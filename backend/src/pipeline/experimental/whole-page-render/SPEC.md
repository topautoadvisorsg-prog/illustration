# SPEC — Whole-Page Render (Experiment)

**Status:** draft — awaiting operator sign-off
**Branch:** `main` (isolated by flag, not by git branch)
**Flag:** `WHOLE_PAGE_EXPERIMENT_ENABLED` (default `false`)
**Baseline asset:** CH01_P001 — "The Wild Land"

---

## 1. Hypothesis

The layout engine has already solved geometry, text fit, and typography placement.
If we hand the image model a **structured JSON page specification** containing the
exact text, the exact coordinates, the typography DNA, and the illustration DNA,
the model can render a **complete finished page** — illustration + typography +
decorative elements — in a single generation, instead of artwork + a separate
typography pass.

If that succeeds, certain page families could ship as one-shot renders.
If it fails, we delete this module and keep the current renderer.

## 2. Non-goals (explicit)

- **Not** replacing the production renderer.
- **Not** replacing Stage 2 / Stage 3 / Stage 6.
- **Not** modifying production margins, body point size, or pagination.
- **Not** changing `assembleLeanPrompt`, `image-shape.ts`, or `escalateForOverflow`.
- **Not** writing to the production assets directory.
- **Not** wired into the Pagination v1 approval gate.

## 3. Surface

### 3.1 New module
```
backend/src/pipeline/experimental/whole-page-render/
  SPEC.md                          (this file)
  build-page-spec.ts               JSON spec builder
  assemble-experiment-prompt.ts    JSON -> image-model prompt
  render-whole-page.ts             OpenAI call + output writer
  typography-dna.ts                Experiment-only typography DNA constants
  types.ts                         WholePageSpec, TypographyDNA, etc.
```

### 3.2 New route
```
POST /api/experimental/whole-page-render/:pageId
  body: { decidedBy: string, notes?: string }
  returns: { imageUrl, specJson, assembledPrompt, costEstimate, runId }
```
Returns `503` when the flag is off — same pattern as Pagination v1 routes.

### 3.3 Output
```
/data/experimental/whole-page/<projectId>/<pageKey>-<runId>.png
/data/experimental/whole-page/<projectId>/<pageKey>-<runId>.json   (the spec)
/data/experimental/whole-page/<projectId>/<pageKey>-<runId>.prompt.txt
```
Never under the production assets path.

## 4. The JSON page specification

```jsonc
{
  "pageType": "CHAPTER_OPENER",
  "layoutFamily": "LAYOUT_13_FEATURE_BANNER",  // from existing layoutTemplate
  "layoutGeometry": {
    "trim": { "widthIn": 8.5, "heightIn": 11.0 },
    "marginsIn": { "top": 0.75, "bottom": 0.75, "outside": 0.75, "inside": 1.0 },
    "bleedIn": 0.125
  },
  "readingFieldGeometry": {
    "originIn": { "x": 0.6, "y": 7.2 },   // pulled from Stage 1.8 zones
    "sizeIn":   { "w": 7.3, "h": 3.3 },
    "anchor":   "BOTTOM",
    "widerThanProductionPct": 15   // experiment-only widening
  },
  "typographyDNA": {
    "identity": "vintage_naturalist_collector_edition",
    "bodyFamily": "Caslon-class serif (Adobe Caslon, Goudy, or close)",
    "bodyPt": 12,                      // experiment-only: bigger than prod 10.5
    "bodyLineHeight": 1.45,
    "bodyMeasureChars": 65,            // wider than prod
    "titleFamily": "matching serif, small-caps caps",
    "titleHierarchy": ["CHAPTER", "I", "THE WILD LAND"],
    "ornaments": ["botanical_rule_top", "botanical_rule_bottom", "pinecone_motif"],
    "decorativeInitial": "drop_cap_T_illuminated",
    "noModernUi": true,
    "noInfographic": true
  },
  "illustrationDNA": {
    "masterStyleBlock": "<full Master Style DNA from project config>",
    "subject": {
      "primary": "<from page.imageSubject>",
      "supporting": ["<from deriveSubjectPackage>"],
      "environment": "<from deriveSubjectPackage>",
      "mood": "<from deriveSubjectPackage>"
    }
  },
  "pageText": {
    "title": {
      "kicker": "CHAPTER",
      "number": "I",
      "name": "THE WILD LAND"
    },
    "body": "<exact paginated reading-field text, verbatim>",
    "dropCap": "T"
  },
  "decorativeElements": {
    "topRule":    { "kind": "botanical_pinecone_swag", "position": "above_illustration" },
    "bottomRule": { "kind": "botanical_pinecone_swag", "position": "below_body" },
    "badges":     [
      { "label": "FOREST",   "icon": "evergreen_tree", "ring": "green" },
      { "label": "MOUNTAIN", "icon": "peaks",          "ring": "ochre" }
    ]
  }
}
```

The spec is built by `build-page-spec.ts` by reading:
- `pages` row (paginated, approved) → text + chapter + page number
- `manifests.content` → entryTitle + imageSubject
- `LAYOUT_PROFILES[layoutTemplate]` → coverage + placement
- `computePageGeometry(config.trimSize)` → trim + margins
- `directLayout(...)` → reading-field zone coords
- `config.imageGeneration.masterStyleBlockText` → illustration DNA
- `typography-dna.ts` → experiment typography DNA constants

## 5. Prompt assembly

`assemble-experiment-prompt.ts` converts the JSON spec to the image-model prompt
in this order:

1. **Header** — one sentence: "You are rendering a complete finished
   collector-edition book page. The specification below is authoritative. Render
   it exactly. Do not invent text, do not rearrange the layout."
2. **Typography DNA block** — verbatim from spec.
3. **Illustration DNA block** — Master Style DNA + subject package.
4. **Page geometry block** — trim, margins, bleed.
5. **Reading-field geometry block** — origin, size, anchor.
6. **Page text block** — title parts on separate lines, then body text in quoted
   form ("BODY TEXT TO RENDER VERBATIM (do not paraphrase):").
7. **Decorative elements block** — rules, badges, drop cap.
8. **Hard constraints** — "Render the body text exactly as supplied. Do not
   substitute words. Do not add words. The title hierarchy must read CHAPTER /
   I / THE WILD LAND. Botanical ornaments above and below illustration."

Attached blueprint image: same Stage 1.8 blueprint the production prompt would
attach. Same image model (gpt-image-2). Same output size as the layout would
demand.

## 6. Success criteria (operator judgment)

The experiment is **successful** if a generated CH01_P001 page shows:

- Title hierarchy reads "CHAPTER / I / THE WILD LAND" — character-perfect.
- Body text is legible, paragraph structure preserved, ≥95% character accuracy.
- Illustration quality is at parity with the current production CH01_P001.
- Reading-field area is calm where the text sits.
- Typography feels like a vintage naturalist book, not modern UI.
- Decorative elements (botanical rules, badges) read as period-correct.
- The whole page is publishable as-is.

The experiment is **abandoned** if:

- Title or body text is mangled / hallucinated / unreadable.
- Illustration quality regresses below current production.
- The model treats the spec as suggestion rather than instruction.

## 7. Cost guard

- One generation per `POST /experimental/whole-page-render/:pageId` call.
- Same per-image cost as Stage 3.
- Flag-gated, default off.
- Route refuses if `WHOLE_PAGE_EXPERIMENT_ENABLED` is false.

## 8. Out of scope (v1 of this experiment)

- Frontend UI. Operator hits the route via curl or REST client.
- Persisting runs in the database. Output written to disk only.
- Multi-page tests. CH01_P001 first; expand only if it works.
- Iterative refinement (no "regenerate with feedback" loop yet).

## 9. Test plan

- `tsc --noEmit` clean.
- Vitest: flag-off route returns 503 (mirrors pagination.routes.test.ts pattern).
- Manual: one operator-triggered generation against CH01_P001 once flag flipped
  on staging/local.

## 10. Open questions for operator

None blocking. Proceed-or-revise points:

- **Output dir** — `/data/experimental/whole-page/` OK, or somewhere else?
- **Typography pt/measure numbers** — 12pt body, 65-char measure, line-height
  1.45, wider-than-prod by ~15%. Tune before first generation?
- **Frontend button** — skip for v1 (curl only) or want a minimal "Run
  experimental render" button on the page-detail view?
