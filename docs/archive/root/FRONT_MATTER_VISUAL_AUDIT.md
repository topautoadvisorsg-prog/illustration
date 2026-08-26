# Front & Back Matter — Visual Design Audit

**Status:** REVIEW — no implementation. Supersedes the typesetting-only
assumption in `FRONT_MATTER_V1_SPEC.md`.

**Gap acknowledged:** FM v1 was built as typeset text on parchment for every
front-matter page. The platform produces premium illustrated collector
editions. Cover, title page, intro opener, author/series pages, back cover
all deserve the same Cinematic Naturalist illustration treatment as the body
pages. This document fixes that by auditing every non-chapter page.

---

## 1. Per-page audit

For each page: visual treatment, text-only vs illustrated, page-level
prompt? (a unique prompt per book), master prompt family? (a reusable prompt
template across books).

| # | Page | Visual Treatment | Text-only or Illustrated | Page Prompt | Master Prompt Family |
|---|---|---|---|---|---|
| 1 | **Front Cover** | Full-page cinematic illustration — the book's signature regional scene. Title typography overlaid in print-prep (deterministic, not model-drawn). House ornaments frame the title block. | **Illustrated** (full-page) | **YES** — per-book (regional/subject) | **YES** — Cover family |
| 2 | **Half Title** | Text + small centered botanical/specimen vignette (~0.5×1.0 in). Restrained per collector convention. | Illustrated (vignette) | YES (light) | YES — Vignette family |
| 3 | **Blank** (parity) | Plain parchment | Text-only (empty) | NO | NO |
| 4 | **Title Page** | Upper 55% = engraved title scene (the book's signature image, mood-matched to cover but composed for portrait page). Lower 45% = title typography + ornamental rule + author + imprint. | **Illustrated** (signature) | **YES** — per-book | **YES** — Title-page family |
| 5 | **Copyright Page** | Text block over parchment; engraved top swag + bottom swag matching body-page rhythm. | Text + reused ornaments | NO | NO (reuses body swag) |
| 6 | **Disclaimer** *(recovered manuscript section)* | Text + reused body-page swag top/bottom. Author's text is authoritative — illustration would distract. | Text + reused ornaments | NO | NO |
| 7 | **Dedication** *(if any)* | Text-only, centered, no ornament — convention | Text-only | NO | NO |
| 8 | **Table of Contents** | Text + reused body-page swag top/bottom. Chapter list IS the visual content; over-illustration would compete. | Text + reused ornaments | NO | NO |
| 9 | **Introduction Opener** *(recovered or AI)* | Chapter-opener treatment: top illustration band + INTRODUCTION title block + drop cap body. Subsequent intro continuation pages = LAYOUT_2_TEXT_HEAVY with body-page swag. | **Illustrated** (opener) | **YES** — per-book (book's overall mood-establishing scene) | **YES** — Intro-opener family |
| 10 | **Chapter Opener** | Already handled by body pipeline (whole-page-render, chapter-opener content type). Confirmed in production. | Illustrated | YES (per-chapter) | YES (exists) |
| 11 | **About the Author** | Bordered naturalist frame OR portrait vignette (operator decides). Bio typeset inside the frame. Frame is engraved botanical/wildlife motif consistent with the book's region. | **Illustrated** (frame/vignette) | YES | **YES** — Author-page family |
| 12 | **About the Series** | Series-spanning thematic vignette — what the SERIES is about (multi-regional motif), not just this book. Below: typeset series description + volume list. | **Illustrated** (thematic) | YES | **YES** — Series-page family |
| 13 | **Additional Resources** | Text + reused body-page swag. Practical reference list — no illustration needed. | Text + reused ornaments | NO | NO |
| 14 | **Glossary** *(future)* | Letter-grouped entries. Each letter section gets a small specimen ornament (botanical sprig, animal track, tool — book-themed). | Illustrated (small ornaments) | NO (light, reusable) | **YES** — Glossary-ornament family |
| 15 | **Index** *(future)* | Pure utility. Text + reused body-page swag. | Text + reused ornaments | NO | NO |
| 16 | **Back Cover** | Background illustration mood-twin to front cover (different composition, same world). Mid-page parchment cartouche (same backing pattern we built for badges) carries marketing copy. ISBN block bottom-right. | **Illustrated** (full-page) | **YES** — per-book | **YES** — Cover family |

## 2. Master prompt families required

These are the REUSABLE templates new books will plug their data into. Build
each once; every future book inherits it.

| Family | Purpose | Variables | Composition contract |
|---|---|---|---|
| **Cover** | Front cover, back cover, optional spine | `{{region}} {{subjectKeywords}} {{toneKeywords}} {{seasonOrMood}}` | Front: signature landscape, room for title overlay in upper 35%. Back: mood-twin scene with calm centre for copy cartouche. |
| **Title-page** | Engraved signature scene for the title page | `{{region}} {{signatureMotif}}` | Upper 55% of page, opens organically into typography below. Quieter than the cover — supports the title, not competes. |
| **Intro-opener** | The book's mood-establishing illustration | `{{bookMoodKeywords}}` | Top illustration band (chapter-opener composition), opens into reading field below. Distinct from chapter openers because the subject is the whole book, not one entry. |
| **Author-page** | Decorative naturalist frame OR portrait vignette | `{{region}} {{authorFraming}}` | Border/frame composition with calm centre for typeset bio. Naturalist engraving style, not photographic. |
| **Series-page** | Series-spanning thematic illustration | `{{seriesName}} {{seriesScope}}` | Multi-regional motif (a tree, a compass, a mountain range across volumes). Smaller than full-page; sits above the typeset description. |
| **Vignette** | Small ornamental sprigs (half-title, glossary letters) | `{{vignetteSubject}}` | Single specimen, ~0.5×1.0 in canvas, transparent / parchment background, no border, naturalist engraving. |

## 3. Treatments that DO NOT need new prompts

These reuse what already exists (body-page swag ornaments — same engraved
botanical garland used at the top/bottom of every chapter page):

- Copyright Page
- Disclaimer
- Table of Contents
- Additional Resources
- Index (future)

The body-page swag is already AI-generated and stamped — same source for
front-matter consistency. No new prompt; print-prep just composes text +
existing swag PNG onto parchment.

## 4. Current FM v1 vs target

| Page | Current FM v1 build | Target (this audit) | Action |
|---|---|---|---|
| Half Title | text-only | text + vignette | needs Vignette prompt |
| Title Page | text-only (clipped — now fixed) | illustrated upper, typeset lower | needs Title-page prompt |
| Copyright | text-only | text + reused swag | add swag composition |
| Disclaimer | text-only | text + reused swag | add swag composition |
| TOC | text-only | text + reused swag | add swag composition |
| Introduction | typeset paragraphs across 12 pages | chapter-opener treatment on page 1, text continuations after | needs Intro-opener prompt; planner change |
| About Author | not built | illustrated frame + bio | needs Author-page prompt |
| About Series | not built | thematic vignette + description | needs Series-page prompt |
| Additional Resources | not built | text + reused swag | add swag composition |
| Cover (front) | operator-uploaded | AI-generable with Cover prompt | needs Cover prompt; operator override stays |
| Cover (back) | not handled | AI-generable with Cover prompt | needs Cover prompt + cartouche overlay |
| Glossary | future | letter ornaments | future (Vignette family covers it) |
| Index | future | text + swag | future |

## 5. Spend implication (for budgeting before approval)

Per book, NEW AI pages this audit adds (assuming defaults):

- Cover front: 1 render
- Cover back: 1 render
- Title page illustration: 1 render
- Intro opener: 1 render
- Half title vignette: 1 render
- Author page frame: 1 render (if operator wants it)
- Series page vignette: 1 render (if `series.name` exists)

**~6 additional renders per book ≈ $0.30 at current rates.** Negligible
against the body book.

## 6. Recommended implementation order (NOT NOW — needs approval first)

1. **Cover family prompt + master template + front/back wiring.** Highest
   visible payoff; today's books literally cannot ship a cover.
2. **Title-page prompt + composer slot.** Second highest visible payoff.
3. **Reused-swag composition** for Copyright / TOC / Disclaimer / Resources.
   Cheap, raises the consistency floor across all text-frame FM pages.
4. **Intro-opener prompt + planner rewrite** (page 1 of intro = opener, rest
   continuations). Fixes the 12-page wall of typography.
5. **Author + Series prompts.** Optional pages; ship the templates so an
   operator who adds the metadata gets the page.
6. **Vignette family.** Half-title sprig today; glossary letters when
   Glossary v1 ships.

## 7. Hard rules that don't change

Pulling forward from the locked badge system (L-7.2) and the Standard:

- **AI never typesets exact data.** Folios, ISBNs, page numbers, TOC entries,
  © lines stay deterministic. Illustration is illustration; data is data.
- **Print-prep stamps the title overlay on the cover, not the model.** The
  cover prompt produces the illustration; the title typography is composed
  on top in print-prep (same pattern as the badge cartouche).
- **No model-drawn page numbers / badges anywhere.** Existing rule, applies
  to FM/BM pages identically.
- **Parchment cartouche backing** is reusable: marketing copy on back
  cover, author bio frame interior, anywhere we need a clean type block
  on top of an illustration.
- **Genericness.** Every prompt above takes `{{region}} {{subjectKeywords}}
  {{toneKeywords}}` from project metadata. No book-specific strings in
  templates.

## 8. Decisions needed from operator before any of this ships

- **A.** Approve this audit's page-by-page treatment list.
- **B.** Approve the 6 master prompt families.
- **C.** Approve the implementation order in §6.
- **D.** Cover behaviour: when operator uploads `coverAssetPath`, it wins
  over the Cover prompt? (Recommend: yes — operator upload always wins;
  prompt is the fallback / digital-edition variant.)
- **E.** Author-page illustration mode: frame-only (safer, no portrait
  ambiguity) vs portrait-vignette (premium, but the model can fabricate a
  face). Recommend: **frame-only** as the default; portrait vignette only
  if the operator supplies a reference image.
- **F.** Introduction recovery: the recovered text is currently flowed
  across 12 typeset pages. Under this audit, page 1 becomes a chapter-
  opener-style illustrated spread; the remaining ~11 pages remain text
  continuations. Confirm that's correct (the alternative is shortening the
  recovered intro to fit fewer pages, which would discard the author's
  text — recommend against).
