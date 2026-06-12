# Visual System — Final Audit (Cover Through Back Cover)

**Status:** REVIEW ONLY — no implementation until operator approves.
Supersedes `FRONT_MATTER_V1_SPEC.md` (typesetting-only) and extends
`FRONT_MATTER_VISUAL_AUDIT.md` (front/back matter pass) with a coordinated
cover system and the full set of master prompt families.

**Goal of this document:** prove that EVERY page from front cover through
back cover has an intentional visual design, prompt strategy, and production
path. No page is an afterthought.

**Render-type vocabulary (used per page below):**
- **AI** — image-model render through the whole-page-render pipeline.
- **Deterministic** — composed in code (SVG → sharp → PDF), no AI.
- **Hybrid** — AI illustration with deterministic typography stamped on top
  in print-prep (the existing pattern used for folios, badges, and the
  L-7.2 cartouche).

---

## 1. Per-page audit — 16 page types

### FRONT OF BOOK

**1. Front Cover**
| Field | Spec |
|---|---|
| Visual Treatment | Full-bleed cinematic illustration: signature regional scene. Calm upper-third reserved for the title block. |
| Illustration Strategy | Full-page cinematic illustration. Mood-twin to back cover. |
| Prompt Family | **Cover-Front** |
| Text Treatment | Title + subtitle + author + series stamped DETERMINISTICALLY in print-prep over a soft parchment cartouche (same backing technique L-7.2 ships for badges). Engraved-serif caps for the title, italic subtitle, hairline rules. |
| Metadata Inputs | `title`, `subtitle`, `authors[]`, `series.name`, `series.volumeNumber`, `region`, `subjectKeywords[]`, `toneKeywords[]`, `seasonOrMood`, optional `coverAssetPath` (operator override) |
| Render Type | **Hybrid** (AI illustration + deterministic title overlay). When `coverAssetPath` is set, operator upload replaces AI; deterministic overlay still applies. |

**2. Half Title Page**
| Field | Spec |
|---|---|
| Visual Treatment | Title in tracked small caps, vertically centred at ~28% page height, single small specimen vignette beneath. Restrained per collector convention. |
| Illustration Strategy | Small centred vignette (~0.5 × 1.0 in) — single botanical sprig, feather, or specimen, naturalist engraving style. |
| Prompt Family | **Vignette** |
| Text Treatment | Deterministic typesetting of `title` only — no subtitle, no author. |
| Metadata Inputs | `title`, `region`, `signatureMotif` (e.g. "oak sprig", "compass rose") |
| Render Type | **Hybrid** (vignette AI + typeset title). |

**3. Title Page**
| Field | Spec |
|---|---|
| Visual Treatment | Upper ~55% of page = engraved title scene (the book's signature illustration, mood-matched to cover but composed for a portrait page that opens organically into typography). Lower ~45% = title block + ornamental rule + author + imprint. |
| Illustration Strategy | Per-book signature illustration, restrained, lower edge dissolves into parchment so the typography reads cleanly underneath. |
| Prompt Family | **Title-Page** |
| Text Treatment | Deterministic: title (small-caps engraved serif), subtitle (italic), hairline + diamond ornament, author, imprint at the foot. |
| Metadata Inputs | `title`, `subtitle`, `authors[]`, `imprint`, `region`, `signatureMotif`, `toneKeywords[]` |
| Render Type | **Hybrid**. |

**4. Copyright Page**
| Field | Spec |
|---|---|
| Visual Treatment | Engraved top swag + bottom swag (same body-page garland), typeset © block centred between them. Same body-page rhythm so this page reads as part of the book, not a corporate insert. |
| Illustration Strategy | NO new illustration. Reuses body-page swag ornaments. |
| Prompt Family | NONE new (reuses body swag). |
| Text Treatment | Deterministic template — © year, holder, rights line, edition, publisher, ISBN(s), disclaimer summary, credits, "Printed in" line. |
| Metadata Inputs | `copyrightYear`, `copyrightHolder`, `edition`, `publisher.*`, `isbn.*`, `printedIn`, `credits` |
| Render Type | **Deterministic**. |

**5. Dedication**
| Field | Spec |
|---|---|
| Visual Treatment | Centred italic text, vertically centred, ample whitespace, no ornament — convention. |
| Illustration Strategy | None. |
| Prompt Family | NONE. |
| Text Treatment | Deterministic typesetting of operator `dedication` verbatim, never modified. |
| Metadata Inputs | `dedication` |
| Render Type | **Deterministic**. Page omitted entirely when no dedication. |

**6. Table of Contents**
| Field | Spec |
|---|---|
| Visual Treatment | Top swag (body-page rhythm) → "CONTENTS" heading in tracked small caps → chapter list with leaders → bottom swag. |
| Illustration Strategy | Reuses body-page swag. |
| Prompt Family | NONE new. |
| Text Treatment | Deterministic two-pass TOC generator: chapter label + title + leader dots + arabic page number, reads from the paginated body's chapter openers. NEVER AI. |
| Metadata Inputs | paginated chapter openers (title + body page number) |
| Render Type | **Deterministic**. |

**7. Introduction Opener (page 1 of the intro section)**
| Field | Spec |
|---|---|
| Visual Treatment | Chapter-opener treatment: top illustration band (~36% of page) → "INTRODUCTION" title block (tracked small caps) → engraved hairline + ornament → drop-cap body text below. |
| Illustration Strategy | Per-book mood-establishing scene — what the WHOLE BOOK is about. Distinct from chapter openers (whose subject is one entry). |
| Prompt Family | **Intro-Opener** |
| Text Treatment | Manuscript-recovered intro text PRIORITIZED. Drop cap deterministically stamped in print-prep over a parchment cartouche. |
| Metadata Inputs | `bookMoodKeywords[]`, `region`, recovered `introduction` text (or operator replacement; AI fallback only if both absent and `aiIntroduction.enabled`) |
| Render Type | **Hybrid**. |

**8. Introduction Continuation Pages**
| Field | Spec |
|---|---|
| Visual Treatment | Top swag → flowed body text → bottom swag. Same rhythm as body continuation pages. |
| Illustration Strategy | Reuses body-page swag. |
| Prompt Family | NONE new. |
| Text Treatment | Deterministic typesetter, flows the remaining recovered intro text across N pages. |
| Metadata Inputs | overflow text from page 7 |
| Render Type | **Deterministic**. |

### BODY

**9. Chapter Opener Pages**
| Field | Spec |
|---|---|
| Visual Treatment | Top illustration band → chapter kicker ("CHAPTER I") → oversized Roman numeral → chapter title (engraved caps) → drop cap body. The grand opener pattern locked in the Standard. |
| Illustration Strategy | Per-chapter signature illustration — the chapter's signature subject. |
| Prompt Family | **Chapter-Opener** (already in production as the `CHAPTER_OPENER` content-type branch of `assemble-experiment-prompt.ts`). |
| Text Treatment | Title hierarchy stamped through the existing chapter-opener spec branch. |
| Metadata Inputs | chapter number, chapter title, opener's body text, subject metadata |
| Render Type | **Hybrid** (existing). |

**10. Standard Content Pages**
| Field | Spec |
|---|---|
| Visual Treatment | One of the body layout families (LAYOUT_B 50/50, LAYOUT_C 25% accent, LAYOUT_D pure-text + ornament, LAYOUT_2 text-heavy continuation). Mirrored variants for spread rhythm. |
| Illustration Strategy | Per-page illustration matched to the entry's subject. Accent (LAYOUT_C) for long entries; 50/50 (LAYOUT_B) for compact entries; pure-text (LAYOUT_D) for reference. |
| Prompt Family | **Whole-Page Body** (already in production). |
| Text Treatment | Manuscript prose flowed through the deterministic markdown→blocks parser (F-9 horizontal-rule filter applied); composition contract (F-8) enforces placement. |
| Metadata Inputs | entry, allocation, badge context, layout family |
| Render Type | **Hybrid** (existing). |

**11. Full Illustration Break Pages (LAYOUT_F hero)**
| Field | Spec |
|---|---|
| Visual Treatment | Full-page cinematic illustration. No body text. Used 3–5% of the book at major transitions, iconic species, dramatic environments. |
| Illustration Strategy | Per-instance cinematic showcase. Composition opens to all four edges. |
| Prompt Family | **Hero-Break** (NEW — currently scoped under P2d but had not been carved out as its own family; doing so here). |
| Text Treatment | None. Optional folio drop per L-7.2 O-7. |
| Metadata Inputs | subject, mood, region, season |
| Render Type | **AI** (no body text means no deterministic typography). |

### BACK OF BOOK

**12. About the Author**
| Field | Spec |
|---|---|
| Visual Treatment | Engraved naturalist FRAME (border ornament: leaves, branches, regional motif) with a calm parchment interior carrying the bio. Default frame-only. Optional portrait vignette mode requires operator-supplied reference. |
| Illustration Strategy | Frame composition with calm centre — same compositional trick used by the body 25% accent layouts but inverted (decoration outside, calm inside). |
| Prompt Family | **Author-Page** |
| Text Treatment | Bio typeset deterministically inside the frame. Priority order: verbatim author bio → AI-structured from `authorBio.facts[]` → omit page entirely. |
| Metadata Inputs | `authorName`, `authorBio.verbatim` or `authorBio.facts[]`, `region`, `authorFraming` (style hint), optional `authorPortraitRef` (asset path) |
| Render Type | **Hybrid**. |

**13. About the Series**
| Field | Spec |
|---|---|
| Visual Treatment | Thematic vignette spanning the series (multi-regional motif: a tree, a compass, a panoramic horizon line) at the top half; series description typeset below. |
| Illustration Strategy | Series-spanning, not book-specific. Same vignette can be reused across volumes. |
| Prompt Family | **Series-Page** |
| Text Treatment | Deterministic typesetting of series description, volume list. AI-structured (no fabrication) when `series.description` is empty but `series.name` exists. |
| Metadata Inputs | `series.name`, `series.description`, `series.volumeNumber`, `series.otherVolumes[]`, `seriesScope` |
| Render Type | **Hybrid**. Page omitted when no `series.name`. |

**14. Additional Resources**
| Field | Spec |
|---|---|
| Visual Treatment | Top swag → heading → list of operator-provided resources → bottom swag. |
| Illustration Strategy | Reuses body-page swag. |
| Prompt Family | NONE new. |
| Text Treatment | Deterministic typesetting of operator-supplied list (agencies, further reading, regional resources). |
| Metadata Inputs | `additionalResources.heading`, `additionalResources.items[]` |
| Render Type | **Deterministic**. Page omitted when no resources. |

**15. Glossary (future)**
| Field | Spec |
|---|---|
| Visual Treatment | Per-letter sections; each letter heading carries a small specimen ornament. Body of each entry is typeset reference text. |
| Illustration Strategy | One tiny botanical/specimen vignette per letter section (reuses Vignette family). |
| Prompt Family | **Vignette** (reused, not a new family). |
| Text Treatment | Deterministic typesetting; entries supplied by glossary builder (future). |
| Metadata Inputs | glossary entries, per-letter `vignetteSubject` |
| Render Type | **Hybrid**. |

**16. Index (future)**
| Field | Spec |
|---|---|
| Visual Treatment | Top swag → "INDEX" heading → two-column typeset entries with page references → bottom swag. |
| Illustration Strategy | Reuses body-page swag. |
| Prompt Family | NONE new. |
| Text Treatment | Deterministic typesetter, output of index builder (future, deferred). |
| Metadata Inputs | index entries with page references |
| Render Type | **Deterministic**. |

---

## 2. Cover System — coordinated wrap

The cover is ONE design decision, not three. Front, spine, and back are
panels of a single physical sheet. KDP, IngramSpark, and any pro print
shop require the wrap delivered as one file with all three regions correct.

### 2.1 Geometry (parameterised — no hardcoded numbers)

| Region | Width | Height | Notes |
|---|---|---|---|
| Front panel | `trim.widthIn` | `trim.heightIn` | Full bleed (+0.125 in on every outer edge) |
| Spine | `spineWidthIn` (computed) | `trim.heightIn` | spineWidthIn = `totalBookPages × paperStock.thicknessIn` (KDP white: 0.002252; cream: 0.0025) |
| Back panel | `trim.widthIn` | `trim.heightIn` | Full bleed (+0.125 in on every outer edge) |
| Wrap total | `2 × trim.widthIn + spineWidthIn + 0.25 in bleed` | `trim.heightIn + 0.25 in bleed` | one PNG + one PDF |

For The Wildlands New England at 7×10, ~270 pages, white paper:
spine ≈ 0.608 in; wrap PNG ≈ 14.86 × 10.25 in ≈ 4458 × 3075 px @ 300 DPI.

### 2.2 Safe zones (deterministic, locked, mirror the body-page model)

| Zone | Position | Purpose |
|---|---|---|
| Bleed | 0.125 in outer ring | Trimmed off; nothing critical inside |
| Trim safe | bleed + 0.25 in KDP safe | All critical content inside |
| Title block (front) | upper 35% of front panel | Title + subtitle overlay |
| Author block (front) | bottom 12% of front panel | Author name + optional series tag |
| Spine title | centred along spine, 0.25 in margin left/right of spine edges | Title (top→bottom or bottom→top per regional convention) |
| Spine metadata | bottom 1.5 in of spine | Volume # + Author + Imprint mark |
| Barcode safe zone | bottom-right of back panel: 2.0 × 1.2 in, inset 0.25 in from trim | Reserved EMPTY parchment; barcode + ISBN stamped here deterministically |
| Back marketing block | upper-mid of back panel, ~5.0 × 4.0 in, centred horizontally | Marketing copy block over a parchment cartouche |
| Review quote zone (optional) | top of back panel, full-width, 0.8 in tall | Italic, single review quote when supplied |
| Publisher block | bottom-left of back panel, 2.0 × 0.6 in | Imprint name + URL |

### 2.3 Prompt strategy — TWO illustrations, one composed wrap

Front and back are SEPARATE prompts (mood-twin scenes). The spine is
composed deterministically with parchment background + ornamental rule
+ engraved-caps typography stack — avoids the spine being a low-resolution
sliver of an illustration (which is what happens when the model is asked
to produce a wrap).

Print-prep stitches: back panel (left) + spine (centre) + front panel
(right) → one wrap PNG → one wrap PDF.

### 2.4 Typography placement (deterministic stamping)

Identical pattern to L-7.2 badge cartouche: every typography element sits
in a known rect, on top of a soft parchment cartouche so the underlying
illustration shows through cleanly without competing.

- Front: title cartouche (upper 35%), author cartouche (bottom 12%)
- Back: marketing cartouche (centred), publisher cartouche (bottom-left),
  barcode rect (bottom-right, harder edges — barcode needs hard contrast)
- Spine: title text along the spine, volume + author + imprint stack at base

### 2.5 Metadata required for the cover system

| Field | Required | Notes |
|---|---|---|
| `title`, `subtitle`, `authors[]` | YES | typography source |
| `imprint`, `series.name`, `series.volumeNumber` | YES if series | spine + back footer |
| `isbn.print`, `isbn.ebook` | YES at export | barcode generated from `isbn.print`; placeholder until supplied |
| `bookDescription.hooks[]` | YES | back-cover marketing copy source (AI-structured from facts) |
| `reviewQuote` (optional) | NO | top of back panel when present |
| `audienceDescription`, `toneKeywords[]` | YES | feed back-cover prompt |
| `region`, `subjectKeywords[]`, `seasonOrMood` | YES | feed both front + back prompts |
| `coverAssetPath` (front) | NO | operator override; bypasses AI front prompt |
| `backCoverAssetPath` | NO | operator override; bypasses AI back prompt |
| `paperStock` | YES | spine width math: `'WHITE_BOND' | 'CREAM_BOND' | 'PREMIUM_COLOR'` |
| `pageCountForSpine` | YES (computed) | total interior pages incl. FM + BM + parity blanks |

---

## 3. Master prompt families — locked at 7

Confirming the prompt families from the previous audit + one carve-out.

| # | Family | Status | Scope |
|---|---|---|---|
| 1 | **Cover-Front** | NEW | Front panel of the wrap; signature regional scene. |
| 2 | **Cover-Back** | NEW | Back panel of the wrap; mood-twin with calm centre + clear barcode zone. |
| 3 | **Title-Page** | NEW | Engraved signature scene for the title page, upper 55% composition. |
| 4 | **Intro-Opener** | NEW | Book mood-establishing illustration for the intro opener page. |
| 5 | **Author-Page** | NEW | Decorative naturalist frame (or portrait vignette if reference supplied). |
| 6 | **Series-Page** | NEW | Series-spanning thematic vignette. |
| 7 | **Vignette** | NEW | Small specimen sprigs (half-title, glossary letter ornaments). |

**Already in production** (not new): Chapter-Opener prompt branch, Whole-
Page Body prompt, Hero-Break (under P2d as `LAYOUT_F_FULL_ILLUSTRATION`).

**Total prompt families across the platform when complete: 10.**

No spine prompt — spine is deterministic. No Copyright/TOC/Resources/Index
prompts — those are deterministic. No Dedication prompt — text only.

### 3.1 Cover-Front prompt template
```
You are illustrating the FRONT COVER of a premium collector-edition field
guide titled "{{title}}" ({{seriesContext}}). House style is vintage
natural-history monograph — engraved botanical and wildlife illustration,
warm sepia ink on parchment, no modern UI, no flat icons.

Subject and mood: {{subjectKeywords}}. Region: {{region}}. Season / mood:
{{seasonOrMood}}. Tone keywords: {{toneKeywords}}.

Composition contract (the cover wrap depends on this):
- Upper third (top 35% of the page) is CALM and atmospheric — soft sky,
  light mist, distant landscape — so the title typography can sit cleanly
  on top. Do NOT place the focal subject in the upper third.
- The focal subject lives in the middle band.
- Bottom 12% is calm parchment / soft ground so the author block can sit
  on top.
- Do NOT render any text, letters, numbers, or symbols.
- Do NOT draw a frame, border, panel, or card around the artwork; the
  illustration runs to the bleed edges.
- Full bleed: extend artwork past the trim on all four sides.
```

### 3.2 Cover-Back prompt template
```
You are illustrating the BACK COVER of the same field guide. The back is a
MOOD TWIN of the front — same world, same season, same tone, different
composition.

Subject and mood: {{subjectKeywords}}. Region: {{region}}. Tone:
{{toneKeywords}}. Optional supporting motif: {{backSupportingMotif}}.

Composition contract:
- Upper 12% is calm so an optional review quote sits cleanly.
- Centre of the page (a region ~5×4 in) is CALM, soft, low-detail
  parchment field — marketing copy will sit on top of it in a parchment
  cartouche. Do NOT concentrate detail in the centre.
- BOTTOM-RIGHT 2×1.2 in is RESERVED: clean parchment, no artwork, no
  ornament, no tendrils. A printed barcode will be stamped here.
- BOTTOM-LEFT 2×0.6 in is calm — small publisher block sits on top.
- The illustration runs to the bleed on the left, top, and bottom edges;
  do NOT extend critical detail into the right 0.4 in (this edge meets
  the spine).
- Do NOT render text, letters, numbers, symbols, frames, panels, or cards.
```

### 3.3 Title-Page prompt template
```
You are illustrating the TITLE PAGE of a vintage natural-history field
guide titled "{{title}}". This is the page READERS SEE INSIDE THE BOOK, a
quieter cousin of the cover.

Subject: {{signatureMotif}}. Region: {{region}}. Tone: {{toneKeywords}}.

Composition contract:
- The illustration occupies the UPPER 55% of the page only. The lower 45%
  is calm parchment for the typeset title block beneath.
- The lower edge of the illustration must OPEN ORGANICALLY into the
  parchment field below — no hard horizontal seam, no panel edge, no
  rectangle. Use mist, soft terrain, low atmospheric fade, or paper-tone
  dissolution.
- Concentrate focal detail in the upper-middle of the band; the outer
  edges should breathe.
- Do NOT render text, letters, numbers, symbols, frames, or borders.
```

### 3.4 Intro-Opener prompt template
```
You are illustrating the INTRODUCTION OPENER of a vintage natural-history
field guide. This image establishes the mood for the entire book — broader
than any single chapter, narrower than the cover.

Book mood keywords: {{bookMoodKeywords}}. Region: {{region}}. Tone:
{{toneKeywords}}.

Composition contract:
- Top band only (top 36% of the page). Below it: calm parchment field for
  the typeset INTRODUCTION title block + drop-cap body text.
- Lower edge opens organically into the parchment — no seam, no border.
- Concentrate focal detail in the upper-middle of the band.
- Do NOT render text, letters, numbers, frames, borders, or page numbers.
```

### 3.5 Author-Page prompt template
```
You are illustrating the ABOUT THE AUTHOR page of a vintage natural-history
field guide. Output: an engraved decorative FRAME with a calm centre
where the typeset bio will be placed.

Frame motif (regional / book-themed): {{authorFraming}}. Region:
{{region}}. Tone: {{toneKeywords}}.

Composition contract:
- The illustration is a BORDER around the page: top swag, side flourishes,
  bottom swag. Engraved botanical / wildlife elements consistent with the
  book's region.
- The CENTRE of the page (~5.5 × 7.0 in) is CALM parchment — no artwork,
  no detail, no ornament. The bio sits here.
- The frame elements may extend to the bleed.
- Do NOT render text, letters, numbers, or a portrait of any person.
- Do NOT draw a hard rectangular frame edge — the ornament IS the frame.
```

### 3.6 Series-Page prompt template
```
You are illustrating the ABOUT THE SERIES page for the {{seriesName}}
series. Output: a single thematic vignette that represents the SERIES,
not any one volume.

Series scope: {{seriesScope}} (e.g. "a regional field-guide series across
North American wilderness"). Tone: {{toneKeywords}}.

Composition contract:
- Centred vignette in the upper half of the page (~5 × 3 in working area).
- A single naturalist motif that represents the series as a whole — a
  tree at the centre of a panoramic horizon, a compass rose, a layered
  ridge line. Engraved, restrained, no card or panel around it.
- Calm parchment fills the rest of the page; the series description will
  be typeset below.
- Do NOT render text, letters, numbers, frames, or borders.
```

### 3.7 Vignette prompt template
```
You are illustrating a small naturalist VIGNETTE — a single specimen, no
background, no border, transparent / parchment-tone field.

Subject: {{vignetteSubject}}. Region: {{region}}. Style: engraved
botanical / wildlife study, warm sepia ink, restrained.

Composition contract:
- The vignette is approximately {{vignetteSizeIn}} on a transparent /
  parchment background.
- ONE subject only. No grouped composition, no environment, no frame.
- Do NOT render text, labels, frames, panels, or borders.
- Edges fade softly into the parchment — no hard outline.
```

---

## 4. Back-Cover Specification (detailed)

Pulled out separately per operator request.

### 4.1 Illustration strategy

A mood-twin to the front. The reader picks the book up; the front sells
the world; the back proves it. Same region, same season, same tone,
different composition. Calm centre engineered for the marketing cartouche;
calm bottom-right engineered for the barcode.

Single AI render via the **Cover-Back** prompt family (§3.2).

### 4.2 Text-block locations (deterministic stamping)

| Block | Location | Contents |
|---|---|---|
| Review quote (optional) | Top 0.8 in, full-width | Italic single quote + attribution |
| Marketing cartouche | Centred, ~5.0 × 4.0 in | Tagline (≤12 words) + 120–200 words of body copy |
| Publisher block | Bottom-left, 2.0 × 0.6 in | Imprint name + URL |
| Barcode zone | Bottom-right, 2.0 × 1.2 in | Barcode generated from `isbn.print`; price line below if supplied |
| Spine seam | Right edge | Reserved 0.125 in dead zone — no text crosses |

### 4.3 Barcode zone — locked

- Position: bottom-right of back panel, inset 0.25 in from trim edges.
- Size: 2.0 × 1.2 in (industry standard EAN-13 + ISBN-A safe area).
- Background: SOLID PARCHMENT (cartouche backing, but with crisp edges —
  barcodes need high contrast for scanning).
- Foreground: barcode generated deterministically from `isbn.print` (we
  use a stock EAN-13 generator; never AI).
- Below barcode: optional `priceLine` (e.g. "USD 32.00").

### 4.4 ISBN placement

The barcode encodes `isbn.print`. The human-readable ISBN sits ABOVE the
barcode bars (standard EAN-13 format).

When no ISBN is supplied, the barcode zone shows a parchment placeholder
labelled "ISBN PENDING" — export gate blocks unless operator passes
`allowMissingIsbn`.

### 4.5 Series / Publisher / Author placement

| Element | Panel | Location |
|---|---|---|
| Series name + volume | Spine + back footer | spine: vertical stack at base; back: small line above publisher block |
| Publisher imprint | Spine base + back bottom-left | spine: tiny imprint mark; back: 2.0 × 0.6 in cartouche |
| Author name | Front bottom 12% + spine bottom block | front: under title; spine: vertical text |
| Author bio reference | NONE on back cover (lives on About the Author page inside) | — |

### 4.6 Required metadata for back cover

```ts
backCover: {
  // illustration inputs (passed to Cover-Back prompt)
  backSupportingMotif?: string;
  // copy inputs (passed to AI marketing-copy generator that fills the cartouche)
  taglineSupplied?: string;        // operator-provided tagline overrides AI
  bookDescription: { hooks: string[] };
  audienceDescription: string;
  toneKeywords: string[];
  // optional review quote
  reviewQuote?: { text: string; attribution: string };
  // identification (deterministic stamps)
  publisher: { imprint: string; url?: string };
  isbn: { print: string };         // export gate blocks if missing
  priceLine?: string;              // optional, e.g. "USD 32.00"
  paperStock: 'WHITE_BOND' | 'CREAM_BOND' | 'PREMIUM_COLOR';
}
```

### 4.7 Back-cover marketing-copy prompt (in addition to the illustration)

The marketing copy itself is AI-generated (operator-edited), filling the
cartouche over the illustration. This prompt was already specified in
`FRONT_MATTER_V1_SPEC.md` §3.4; re-stated here for completeness:

```
Write back-cover copy for "{{title}} — {{subtitle}}".
Audience: {{audienceDescription}}. Selling points from the publisher:
{{hooks}}. Tone: {{toneKeywords}}.
Output: one optional tagline line (≤12 words), then 120–200 words of
body copy. Concrete and specific; no marketing clichés ("ultimate",
"essential companion", "like never before"). Use ONLY supplied selling
points — do NOT invent statistics, endorsements, or claims.
```

---

## 5. Visual Map — every page accounted for

| # | Page | Family | Render Type | New Build? |
|---|---|---|---|---|
| 1 | Front Cover | Cover-Front | Hybrid | YES |
| 2 | Half Title | Vignette | Hybrid | YES |
| 3 | Title Page | Title-Page | Hybrid | YES |
| 4 | Copyright | (reuses body swag) | Deterministic | yes (swag wiring only) |
| 5 | Dedication | none | Deterministic | already shipping |
| 6 | TOC | (reuses body swag) | Deterministic | yes (swag wiring only) |
| 7 | Intro Opener | Intro-Opener | Hybrid | YES |
| 8 | Intro Continuation | (reuses body swag) | Deterministic | yes (swag wiring only) |
| 9 | Chapter Opener | Chapter-Opener | Hybrid | already in production |
| 10 | Standard Content | Whole-Page Body | Hybrid | already in production |
| 11 | Hero Break (LAYOUT_F) | Hero-Break | AI | scoped under P2d |
| 12 | About the Author | Author-Page | Hybrid | YES |
| 13 | About the Series | Series-Page | Hybrid | YES (conditional) |
| 14 | Additional Resources | (reuses body swag) | Deterministic | yes (conditional) |
| 15 | Glossary (future) | Vignette (reused) | Hybrid | future |
| 16 | Index (future) | (reuses body swag) | Deterministic | future |
| — | Back Cover | Cover-Back | Hybrid | YES |
| — | Spine | (none — deterministic) | Deterministic | YES |

**Total page types with a locked design: 17 (16 + spine). Zero left to chance.**

---

## 6. Decisions required from operator before any of this ships

- **A.** Approve the per-page audit (§1).
- **B.** Approve the cover-system geometry (§2.1) and safe zones (§2.2).
- **C.** Approve the 7 master prompt families (§3) — Cover-Front, Cover-
  Back, Title-Page, Intro-Opener, Author-Page, Series-Page, Vignette —
  and lock the templates as written.
- **D.** Approve the Back Cover layout (§4) including barcode zone,
  publisher block, optional review quote.
- **E.** Cover override rule: operator-uploaded `coverAssetPath` /
  `backCoverAssetPath` ALWAYS wins over AI prompt. Confirm.
- **F.** ISBN gate: export blocks when `isbn.print` is missing unless
  operator passes `allowMissingIsbn`. Confirm.
- **G.** Author-page default mode: FRAME-ONLY (no portrait) by default;
  portrait vignette only when operator supplies a reference image.
  Confirm.
- **H.** Recovered Introduction handling: page 1 = chapter-opener style
  spread (Intro-Opener prompt); pages 2–N = text continuations with body
  swag. Confirm.

Once these are approved, the implementation order is the one already in
the previous audit's §6 (Cover → Title-Page → reused-swag wiring →
Intro-Opener → Author/Series → Vignette → Back Cover wrap), now extended
with the cover SYSTEM (wrap geometry + spine compositor) as a single
deliverable rather than two separate front/back builds.
