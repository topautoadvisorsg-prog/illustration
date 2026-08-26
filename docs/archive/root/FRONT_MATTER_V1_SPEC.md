# Front Matter V1 — Platform Specification (PRE-IMPLEMENTATION)

**Status:** REVIEW — no code until operator approves.
**Scope:** GENERIC publishing-platform feature. Wild Lands: New England is the
first book through it, never the assumption. No brand, region, genre, or
series hardcoding. Everything book-specific comes from project metadata.
**Supersedes:** `backend/src/pipeline/front-matter/SPEC_FRONT_MATTER.md`
(draft) — taxonomy/spine/migration sections carry forward; this spec adds
the locked page sequences, metadata schema, AI/non-AI split, and prompt
templates.

---

## 1. FRONT OF BOOK — exact sequence

Pages in spine order. Roman numerals are COUNTED from the first interior
page; printed folios follow §4. `[conditional]` pages are skipped when their
input is absent — numbering re-flows automatically.

| # | Page Type | Purpose | Source | Required Inputs | Example Output (New England as sample DATA) |
|---|---|---|---|---|---|
| — | **Front Cover** | Selling face of the book | **Operator-uploaded asset** (v1). NOT part of the interior PDF for print (KDP wrap is a separate file); first page only in digital editions | `coverAssetPath` | uploaded `cover.png` |
| i | **Half Title** | Collector-edition convention; first interior page, title only | Template (deterministic) | `title` | "THE WILD LANDS" centered, ornament below |
| ii | **Blank** (verso of half title) | Parity — title page must land on a recto | Template | — | empty parchment |
| iii | **Title Page** | Full identification | Template | `title`, `subtitle`, `authorName`, `publisher.imprint` | "THE WILD LANDS / A Field Guide to New England / [author] / Wild Lands Press" |
| iv | **Copyright Page** | Legal + bibliographic (MUST be verso of title page) | Template | `copyrightYear`, `copyrightHolder`, `publisher.*`, `isbn.*`, `edition`, `legalNotice`, `disclaimers[]` | © block, rights statement, ISBN, safety disclaimer |
| v | **Dedication** `[conditional]` | Author's dedication | Operator text VERBATIM | `dedication` | "For those who walk quietly." |
| vi | **Blank** `[conditional]` | Verso of dedication | Template | — | empty |
| v/vii | **Table of Contents** | Navigation; recto start | **Generated deterministically** from pagination data (two-pass, §6-R1) | paginated chapter openers (title + body page number) | "CONTENTS / I. Know Your Region … 1 / II. Animals … 23 …" |
| next recto | **Introduction** `[conditional]` | Author's framing of the book | **Manuscript-supplied PREFERRED** (the parser currently drops it — §6-R4); AI fallback ONLY with operator opt-in | manuscript intro section OR `aiIntroduction.enabled` + variables | the author's actual introduction text, typeset like a body page |
| — | **Blank** `[conditional]` | Parity — Chapter 1 must open on a recto | Template | — | empty |

Then **Chapter 1 opens on a recto at arabic page 1.**

Evaluated and EXCLUDED from v1 (justify before adding later): frontispiece
art page, epigraph, foreword/preface by third parties, list of
illustrations.

## 2. BACK OF BOOK — exact sequence

| # | Page Type | Purpose | Source | Required Inputs | Example Output |
|---|---|---|---|---|---|
| n+1 (recto) | **About the Author** | Author credibility | **AI-structured from operator-supplied FACTS** (§3.2) or operator verbatim | `authorBio.facts[]` or `authorBio.verbatim` | 150-word bio over parchment |
| n+2 | **About the Series** `[conditional]` | Cross-sell other volumes | AI-structured (§3.3) when `series.name` exists | `series.name`, `series.description` or volumes list | "The Wild Lands series continues with…" |
| n+3 | **Additional Resources** `[conditional]` | Genre-dependent value page | Operator-provided list, template-typeset | `additionalResources[]` (title + line items) | agencies, further reading |
| last | **Blank(s)** | Even total page count (print requirement) | Template (auto-computed) | total page parity | 1 blank max; error if math needs >2 |
| — | **Back Cover Copy** | Marketing text for the cover wrap + retail listing | AI-drafted (§3.4) → operator-edited. **A text ASSET, not an interior page** | `bookDescription.hooks[]`, `audience` | 180-word back-cover blurb saved as artifact |

Evaluated and EXCLUDED from v1: index (needs term extraction — already
deferred), glossary, acknowledgments page (folds into copyright credits
line unless operator supplies text — then it becomes a `[conditional]`
back page before About the Author).

## 3. AI-GENERATED CONTENT — every page, with prompt templates

Platform rule for ALL AI text: **the model structures and polishes
operator-supplied facts. It never invents facts, credentials, places,
dates, ISBNs, or biography details.** Each template ends with the
anti-fabrication clause.

### 3.1 Introduction (FALLBACK ONLY — manuscript text wins when present)
- **Purpose:** orient the reader; what the book is, how to use it.
- **Trigger:** no manuscript introduction AND `aiIntroduction.enabled: true`.
- **Variables:** `{{title}} {{subtitle}} {{audienceDescription}} {{chapterList}} {{bookPurpose}} {{toneKeywords}}`
- **Length:** 350–500 words. **Reading level:** general adult (grade 8–10).
- **Tone:** from `toneKeywords` metadata — never hardcoded.
- **Prompt template:**
```
You are writing the Introduction for "{{title}} — {{subtitle}}".
Audience: {{audienceDescription}}.
The book's purpose, in the publisher's words: {{bookPurpose}}.
The book contains these chapters: {{chapterList}}.
Write a 350–500 word introduction that orients the reader: what this book
is, who it is for, and how to use it. Tone: {{toneKeywords}}. Reading
level: accessible general adult. Do NOT invent facts, statistics, place
names, species, or claims not present in the inputs above. Do NOT mention
page numbers. Output plain prose paragraphs only — no headings, no lists,
no markdown.
```

### 3.2 About the Author
- **Purpose:** credibility without fabrication.
- **Variables:** `{{authorName}} {{authorFacts}}` (operator-entered bullet
  facts: background, credentials, residence — ONLY what the operator
  supplies). If `authorBio.verbatim` exists, AI is skipped entirely.
- **Length:** 100–180 words. **Reading level:** general adult. **Tone:**
  third-person, warm-professional.
- **Prompt template:**
```
Write an "About the Author" page for {{authorName}} using ONLY these
facts, supplied by the publisher: {{authorFacts}}.
100–180 words, third person, warm and professional. Every statement must
trace to a supplied fact — do NOT add credentials, employers, awards,
locations, or personal details that are not listed. No contact info.
Plain prose, no headings.
```

### 3.3 About the Series `[conditional]`
- **Purpose:** position the volume inside the series; invite the next book.
- **Variables:** `{{seriesName}} {{seriesDescription}} {{thisVolumeTitle}} {{otherVolumes}}` (may be "none announced yet").
- **Length:** 80–150 words. **Tone:** inviting, consistent with `toneKeywords`.
- **Prompt template:**
```
Write an "About the Series" page for the {{seriesName}} series.
Publisher's series description: {{seriesDescription}}.
This volume: {{thisVolumeTitle}}. Other volumes: {{otherVolumes}}.
80–150 words. Invite the reader to the rest of the series without
overselling. If other volumes are "none announced yet", speak to the
series' intent without naming unannounced titles. Do NOT invent titles,
dates, or regions. Plain prose.
```

### 3.4 Back Cover Copy (asset, not a page)
- **Purpose:** retail/back-wrap selling text.
- **Variables:** `{{title}} {{subtitle}} {{audienceDescription}} {{sellingHooks}}` (operator bullets) `{{toneKeywords}}`
- **Length:** 120–200 words + optional 1-line tagline. **Reading level:**
  general adult, punchy. **Tone:** confident, concrete, zero clichés.
- **Prompt template:**
```
Write back-cover copy for "{{title}} — {{subtitle}}".
Audience: {{audienceDescription}}. Selling points from the publisher:
{{sellingHooks}}. Tone: {{toneKeywords}}.
Output: one optional tagline line (≤12 words), then 120–200 words of
body copy. Concrete and specific; no marketing clichés ("ultimate",
"essential companion", "like never before"). Use ONLY supplied selling
points — do NOT invent statistics, endorsements, or claims.
```

## 4. NON-AI CONTENT — templates + metadata only

| Page | Generation | Notes |
|---|---|---|
| Half Title | deterministic template | title + house ornament |
| Blank pages | deterministic | parity engine inserts |
| Title Page | deterministic template | typographic, no AI |
| Copyright Page | deterministic template | text block below |
| Table of Contents | **deterministic two-pass generator** | reads paginated chapter openers; NEVER AI (see R2) |
| Dedication | operator text verbatim | typeset center-page |
| Additional Resources | operator list, template-typeset | |

**Copyright page template (fields in [brackets]):**
```
[title] — [subtitle]
Copyright © [copyrightYear] [copyrightHolder]. All rights reserved.
No part of this publication may be reproduced, stored, or transmitted
in any form without prior written permission of the publisher, except
brief quotations in reviews.
[edition] · Published by [publisher.imprint]
[publisher.location?] · [publisher.url?]
ISBN [isbn.print?]  ·  ISBN [isbn.ebook?] (e-book)
[disclaimers — one paragraph each, e.g. genre safety disclaimer]
[credits? — design/illustration credit line]
Printed in [printedIn?]
```

## 5. METADATA SCHEMA (additive `publishing` block on ProjectConfig)

```ts
publishing?: {
  // identification
  title: string;                 // defaults from project.title
  subtitle?: string;
  authors: string[];             // multi-author from day one
  language?: string;             // default 'en'
  // publisher
  publisher: { imprint: string; location?: string; url?: string };
  copyrightYear: number; copyrightHolder: string;
  edition?: string;              // default "First Edition"
  isbn?: { print?: string; ebook?: string };   // optional until export gate
  printedIn?: string;
  // optional content
  dedication?: string;
  disclaimers?: string[];        // genre-specific safety/legal text
  credits?: string;
  additionalResources?: { heading: string; items: string[] };
  // series
  series?: { name: string; description?: string; volumeNumber?: number; otherVolumes?: string[] };
  // AI-text inputs (facts in, prose out)
  audienceDescription?: string;
  bookPurpose?: string;
  toneKeywords?: string[];
  authorBio?: { verbatim?: string; facts?: string[] };
  bookDescription?: { hooks?: string[] };
  aiIntroduction?: { enabled: boolean };       // default false
  // assets
  coverAssetPath?: string;
}
```
Schema carried forward from the draft spec: `pages.section`
(FRONT_MATTER/BODY/BACK_MATTER), `front_matter_type`, `spine_order`,
`page_label` (migration 0004, additive, BODY default — zero backfill).

## 6. RISKS & EDGE CASES

- **R1 — TOC two-pass loop.** TOC page numbers depend on body pagination;
  body start depends on front-matter page count. Resolve: freeze the
  front-matter plan → count N → offset body folios → generate TOC. If the
  TOC spills past one page, N grows by 2 (recto discipline) and re-resolve
  ONCE; >1 iteration = hard error for operator review.
- **R2 — never let the image model typeset exact data.** The platform
  already stamps folios/badges because the model mangles small text. TOC
  entries, ISBNs, and © lines are the same class: front-matter TEXT pages
  are composed deterministically (template over parchment background +
  house ornaments), NOT whole-page AI renders. AI renders for front matter
  are limited to optional decorative pages. This is the single biggest
  defect-avoidance decision in v1.
- **R3 — recto/verso parity.** Title recto, copyright verso, TOC recto,
  Chapter 1 recto, even total count. Parity engine inserts blanks;
  conditional pages re-flow numbering. Unit-test the parity math hard.
- **R4 — the dropped Introduction.** The parser silently discards H1
  sections outside `# CHAPTER N` (documented). Front Matter v1 must
  RECOVER manuscript front-matter sections (`# Introduction`, `# Preface`,
  `# Foreword`, `# Dedication`) and route them to front-matter pages —
  generic heading recognition, configurable per project.
- **R5 — re-pagination interplay.** Front-matter rows live in `pages`; the
  F-6 freeze guard and the front-matter plan must re-run as one unit or
  spine_order drifts.
- **R6 — missing ISBN.** Common at production time. Render "ISBN pending"
  placeholder; EXPORT gate blocks on placeholder unless operator passes
  `allowMissingIsbn` — never silently ship it.
- **R7 — multi-author.** `authors[]` joins as "A and B" / "A, B, and C" in
  templates; bio page becomes "About the Authors".
- **R8 — empty-body guard.** Front-matter/blank pages have no body; the
  render-spend guard must exempt non-BODY sections (same seam as the hero-
  page exemption).
- **R9 — folio printing rules.** No printed folio on half title, title,
  copyright, dedication, blanks. TOC prints roman. Body prints arabic
  from 1. Back matter continues arabic. `page_label` stores exactly what
  prints; print-prep stamps it (existing cartouche carries it).
