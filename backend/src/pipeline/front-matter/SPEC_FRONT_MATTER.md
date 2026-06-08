# SPEC — Front Matter v1

**Status:** draft — awaiting operator sign-off. No code until approved.
**Why first:** front matter changes *what a page can be*. If book assembly is
built before this, assembly gets rebuilt. This locks the page taxonomy and the
page-numbering model so everything downstream (print-prep, assembly, proof)
reads one consistent spine.
**Flag:** new `FRONT_MATTER_V1_ENABLED` (default off). Additive. Legacy untouched.

---

## 0. The book spine (target)

```
i     Cover              (separate print file — see §6)
ii    Title Page
iii   Copyright Page
iv    Contents
1     Chapter I  (body page numbering restarts at 1)
…     Chapter II …
n     Back Matter        (index / about / acknowledgments)
```

Front matter is numbered in lowercase roman (i, ii, iii…). Body restarts at
arabic 1 on the first chapter opener. This is standard book convention and KDP
accepts it.

---

## 1. Page taxonomy — what a page can be now

Today a page is always manuscript-derived content. Front matter adds page kinds
that do NOT come from manuscript prose.

### 1.1 New `section` (every page belongs to exactly one)
```
FRONT_MATTER   -- cover, title, copyright, contents
BODY           -- chapters (today's pages)
BACK_MATTER    -- index, about the author, acknowledgments
```

### 1.2 New `front_matter_type` (only set when section ≠ BODY)
```
COVER          -- front cover art + title + author
TITLE_PAGE     -- title, subtitle, author, publisher
COPYRIGHT_PAGE -- © year, publisher, edition, ISBN, legal text
CONTENTS       -- generated table of contents
BACK_INDEX     -- alphabetical index (deferred to v1.1 — see §9)
BACK_ABOUT     -- about the author / colophon
```

Body pages keep their existing `pageRole` (opener / continuation / compacted)
and `section = BODY`. Nothing about today's pages changes.

### 1.3 New `WholePageSpec.pageType` values
```
COVER · TITLE_PAGE · COPYRIGHT_PAGE · CONTENTS · BACK_MATTER
```
(existing: CHAPTER_OPENER · INTERIOR · COMPACTED · CONTINUATION)

Each gets its own spec-builder branch in `build-page-spec.ts`, all pulling from
the locked Wild Lands Publishing Standard (same paper, ink, serif, ornaments).

---

## 2. Where each front-matter page's content comes from

| Page | Content source |
|---|---|
| **Cover** | `projects.title` + `projects.subtitle` + `projects.authorName` + cover-subject art directive (operator or default series motif) |
| **Title Page** | `projects.title` + `subtitle` + `authorName` + publisher (config) |
| **Copyright** | config: `copyrightYear`, `publisher`, `edition`, `isbn`, plus a Standard legal-text template |
| **Contents** | GENERATED from the paginated body — chapter openers → (title, page number). See §4. |
| **Back matter** | operator-entered / generated (deferred parts in §9) |

New config block on `ProjectConfig` (additive, all optional with sane defaults):
```ts
frontMatter?: {
  publisher?: string;          // default "Wild Lands Press"
  copyrightYear?: number;      // default current year
  edition?: string;            // default "First Edition"
  isbn?: string;               // default "" (blank until assigned)
  coverSubject?: string;       // art directive for the cover; default series motif
  dedication?: string;         // optional dedication page text
}
```

---

## 3. Data model

Reuse the `pages` table — front-matter pages are page rows so the whole-page
render pipeline (`whole_page_renders` → render → approve → select-for-book)
works on them with ZERO changes. Assembly reads ALL pages in spine order,
front matter and body alike.

### 3.1 Migration `0004_front_matter.sql` (additive)
```
CREATE TYPE page_section AS ENUM ('FRONT_MATTER','BODY','BACK_MATTER');
CREATE TYPE front_matter_type AS ENUM
  ('COVER','TITLE_PAGE','COPYRIGHT_PAGE','CONTENTS','BACK_INDEX','BACK_ABOUT');

ALTER TABLE pages ADD COLUMN section page_section DEFAULT 'BODY' NOT NULL;
ALTER TABLE pages ADD COLUMN front_matter_type front_matter_type;  -- null for BODY
ALTER TABLE pages ADD COLUMN spine_order integer;   -- absolute order in the book
ALTER TABLE pages ADD COLUMN page_label text;       -- 'i','ii','1','2' as PRINTED
```

- `section` defaults to BODY so every existing row is correct with no backfill.
- `spine_order` is the single sort key assembly uses (front matter < body < back).
- `page_label` is the human-printed folio (roman for front, arabic for body),
  distinct from `plannedPageNumber` (the internal sequence).

### 3.2 No new table
Front-matter pages live in `pages`. Their `entryKey` is null (not manuscript-
derived). `readingFieldText` holds their text payload (copyright legal text,
TOC lines, etc.) so the existing render path reads it unchanged.

---

## 4. The Contents (TOC) problem — two-pass

The TOC lists each chapter's *starting page number*. Those numbers depend on the
fully paginated body. But the TOC appears BEFORE the body. Chicken-and-egg.

**Resolution (deterministic, no guessing):**
1. Front-matter page COUNT is fixed once the front-matter plan exists
   (cover + title + copyright + contents = a known N).
2. Body page 1 = N + 1 (arabic). Pagination already produces chapter-opener
   planned page numbers; assembly offsets them by N.
3. The **TOC builder** runs AFTER body pagination: it reads each chapter
   opener's body page number, formats `Chapter I — Title …… p`, and writes the
   result into the CONTENTS page's `readingFieldText`.
4. If the TOC itself spills to 2 pages, N grows by 1 and step 2 re-resolves.
   v1 caps TOC at 1 page (a ~12-chapter book fits); multi-page TOC is a v1.1
   refinement noted in §9.

So: pagination → front-matter plan → TOC build → (render any page) → assembly.

---

## 5. Page numbering rules (locked)

| Range | Numbering | Printed on page? |
|---|---|---|
| Cover | none | no folio |
| Title Page | i (counted, not shown) | no |
| Copyright | ii (counted, not shown) | no |
| Contents | iii… (shown, roman) | yes |
| Body | 1, 2, 3… (arabic) | yes |
| Back matter | continues arabic | yes |

`page_label` stores exactly what prints. The whole-page render does NOT invent
folios (Standard already forbids unlisted page numbers); assembly/print-prep
owns folio placement, OR the spec passes the label explicitly when a folio is
wanted. **Decision needed — open question Q3.**

---

## 6. Cover — the special case

KDP paperback cover is a SEPARATE upload: one wrap image = back cover + spine +
front cover, where **spine width depends on final page count + paper stock**.
That can't be known until the body is assembled.

**v1 scope:**
- Generate the **front cover** as a whole-page render (`pageType: COVER`),
  using title + author + cover art directive. This is the sellable digital
  cover and the thing we visually test.
- **Defer** the full print wrap (back + spine + front, spine-width math) to the
  print/assembly move, where final page count exists. Noted, not built here.

So front matter v1 delivers a front-cover image; the print-ready wrap cover is a
later, page-count-dependent step.

---

## 7. Whole-page render integration

`build-page-spec.ts` gains a branch per front-matter type. Each builds a
`WholePageSpec` from the Standard + the page's content:

- **COVER** — dominant title (largest type on any page), author, full-bleed
  cover art, series ornament. No body text. Possibly different composition
  weighting than interior.
- **TITLE_PAGE** — centered title + subtitle + author + publisher, generous
  white space, a single restrained ornament. Calm, formal.
- **COPYRIGHT_PAGE** — small-type legal block, bottom or center, lots of paper.
  Verbatim copyright text from the template + config values.
- **CONTENTS** — "CONTENTS" heading + generated chapter list with leaders and
  page numbers. Verbatim from the TOC builder.

All obey Standard v1.0: parchment #E0C8A0, ink #543C24, Caslon-class serif,
Botanical Pinecone ornaments. A title page is unmistakably the same publishing
house as a chapter opener.

---

## 8. Build flow (where this slots)

```
Breakdown → Pagination(body) → Front-Matter Plan → TOC build
          → [whole-page render any page] → Approve → Select-for-book
          → Print-Prep(move #2) → Book Assembly(move #3)
```

Front-Matter Plan = create the FRONT_MATTER + BACK_MATTER page rows with
section, type, spine_order, page_label, and (for cover/title/copyright) their
text payload. Idempotent: re-running replaces the front-matter rows, never the
body rows.

---

## 9. v1 scope vs. deferred

**In v1:**
- section + front_matter_type + spine_order + page_label schema
- Front-matter plan builder (cover, title, copyright, contents rows)
- Config block (publisher, copyright year, edition, isbn, cover subject)
- TOC builder (single page, reads paginated body)
- Spec-builder branches for COVER / TITLE_PAGE / COPYRIGHT_PAGE / CONTENTS
- Front cover image (whole-page render)

**Deferred (v1.1+), noted so assembly doesn't have to be rebuilt:**
- Full print-wrap cover (back + spine + front, spine-width math) — needs final
  page count, belongs to print/assembly move
- Multi-page TOC
- Alphabetical back index (BACK_INDEX) — needs term extraction
- Dedication / epigraph pages (schema supports via config.dedication; render
  branch deferred)

---

## 10. Open questions for operator

1. **Cover art subject** — for the Wild Lands cover, what's the default art
   directive? (e.g. "sweeping New England wilderness panorama — mountains,
   river, forest, the series' signature landscape.") I can set a sensible
   default and you tune later.

2. **Copyright text** — do you have exact legal/publisher text (publisher name,
   rights statement), or should I write a standard collector-edition copyright
   block with placeholders you fill in config?

3. **Folio ownership** — who draws the printed page number (folio)?
   (a) The whole-page render draws it (spec passes `page_label`), OR
   (b) Print-prep/assembly stamps it on after generation.
   I lean **(b)** — keeps folios perfectly consistent and out of the image
   model's hands (it's bad at small exact numbers), and matches the Standard's
   "no model-drawn page numbers" rule. Confirm.

4. **Title page vs cover overlap** — some collector editions repeat the cover
   art softly on the title page; others keep the title page clean and
   typographic. v1 default: **clean typographic title page** (no art), cover
   carries the art. Confirm or override.
```
