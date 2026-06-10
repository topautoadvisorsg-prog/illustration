# Breakdown — Missing Pages (Operator Punch List)

**Project:** The Wildlands Field Guide — `e51e5b4c-05c7-4d6e-8c00-60aa15de8992`
**Breakdown run:** 2026-06-09
**Status after breakdown:** `MANIFESTED` — 8 chapters, 129 entries, 129 pages.

**What this doc is:** a frozen list of every page the breakdown SHOULD eventually produce
but did NOT in this run. We are NOT fixing these now. Captured here so nothing is
lost when we revisit front-matter / back-matter work.

---

## 1. Front matter — missing entirely

The breakdown produced zero front-matter rows. Today's pipeline only emits BODY
pages (chapter entries). None of the following exist in the project after
breakdown:

- **COVER** — front cover (title + author + cover art). Operator-uploaded for
  this run (Path A decision). The breakdown does not register a row for it.
- **TITLE_PAGE** — title + subtitle + author + publisher, centered, formal.
- **COPYRIGHT_PAGE** — © year, publisher, edition, ISBN, legal text.
- **DEDICATION / EPIGRAPH** — optional; the manuscript may contain one and the
  breakdown silently drops it (manuscript parser only emits chapter entries).
- **CONTENTS / TABLE OF CONTENTS** — chapter list with page numbers. Cannot be
  generated today; depends on front-matter taxonomy + post-pagination TOC builder.
- **FOREWORD / PREFACE / INTRODUCTION** — if present in the manuscript as a
  prose section before Chapter 1, the breakdown either ignores it or folds it
  into Chapter 1. Needs verification on this manuscript specifically.
- **HALF-TITLE PAGE** — optional but standard in collector editions.

## 2. Back matter — missing entirely

- **BACK INDEX** — alphabetical index of terms with page references. Requires
  term extraction across the body; deferred in `SPEC_FRONT_MATTER §9`.
- **ABOUT THE AUTHOR** — biography + portrait page.
- **ACKNOWLEDGMENTS** — operator-entered prose.
- **COLOPHON** — typeface, paper, printing notes (matches collector-edition tone).
- **GLOSSARY** — definitions of field-guide terminology.
- **BIBLIOGRAPHY / SOURCES / REFERENCES** — cited works for the field-guide
  content.

## 3. Chapter-level pages — likely missing

- **Chapter title pages** — a standalone page with just `CHAPTER 1 — KNOW YOUR
  REGION` and ornament, BEFORE the first entry of the chapter. Today's
  breakdown attaches the chapter title to the first entry's page (chapter
  opener), not a separate page.
- **Chapter intro spreads** — optional one-page intro per chapter (e.g. "What
  to expect in this chapter").
- **Part / section dividers** — for books grouped into multi-chapter parts
  (e.g. PART ONE: THE LAND / PART TWO: SURVIVAL). Not applicable to this book
  unless added.

## 4. Page numbering / folio system — missing

- **Roman-numeral folios** for front matter (i, ii, iii…) — not produced.
- **Arabic-folio reset** at Chapter 1 — not produced. Today every page is
  numbered straight through 1..129.
- **`page_label` column** distinguishing printed folio from internal sequence —
  spec'd in `SPEC_FRONT_MATTER §3.1`, not migrated yet.

## 5. Spine ordering — missing

- **`spine_order` column** — the single sort key book-assembly needs to lay
  front matter < body < back matter. Spec'd, not built.
- **`section` enum** (FRONT_MATTER / BODY / BACK_MATTER) — spec'd, not built.
- Today `book-assembly` reads pages in `plannedPageNumber` order only, so
  inserting any non-body page in the right spot is structurally impossible
  without the new columns.

## 6. Cover-specific gaps

- **Front-cover upload path on the new pipeline** — does not exist. Legacy
  endpoint `POST /api/pages/:pageId/images/upload` writes to the old `images`
  table and does NOT flow through whole-page-render / proof-package / print-prep.
- **DPI preflight on uploaded covers** — does not exist. An operator-uploaded
  cover today has no automatic check that it meets 300 DPI at trim+bleed.
- **Wrap cover (back + spine + front)** — deferred in `SPEC_FRONT_MATTER §6`.
  Spine width depends on final page count and paper stock; only possible after
  body assembly.

## 7. Manuscript-prose front/back matter — CONFIRMED silent-drop

**Root cause located in `parse-manuscript-outline.ts:161-164`:**
```js
const explicitChapterHeadings = headings.filter(
  h => h.level === 1 && /^chapter\s+\d+/i.test(h.title)
);
const chapterHeadings = explicitChapterHeadings.length > 0
  ? explicitChapterHeadings      // ← ONLY "# CHAPTER N" wins
  : headings.filter(h => h.level === 1);
```

When the manuscript has any `# CHAPTER N` headings, every other H1 is
**silently dropped** — no warning, no log entry, no breakdown summary line.
Headings the parser *does* warn about: only `NO_CHAPTERS_DETECTED` (zero H1s
in file) and `DEEP_HEADING_IGNORED` (h4/h5/h6). Neither fires for an
`# Introduction` before `# CHAPTER 1`.

**For this specific manuscript:** if `# Introduction`, `# Preface`,
`# Foreword`, `# Acknowledgments`, `# About`, or any other H1 exists outside
the 8 `# CHAPTER N` blocks, it WAS dropped in the 2026-06-09 breakdown that
produced 129 entries. Operator confirmation pending: this manuscript is
believed to contain `# Introduction` between cover/title and Chapter 1 —
that text is currently absent from the project and will not appear in the
assembled book unless front matter is added manually or v1 lands.

**Action when we revisit:**
1. Emit a breakdown-time warning for every H1 that does NOT match
   `^chapter\s+\d+/i` (and isn't a recognized front-matter heading).
2. Recognize standard front-matter headings (introduction / preface /
   foreword / dedication / acknowledgments / about / colophon) and route
   them to front-matter rows once front-matter v1 ships.
3. Until then, surface "dropped section" warnings in the breakdown summary
   so the operator can't be silently stripped of content.

---

## What the operator should expect at handoff

Until front-matter v1 ships, every paid render proves only the BODY pipeline.
The book that comes out of `book-assembly` today has:

- ❌ no cover
- ❌ no title page
- ❌ no copyright
- ❌ no table of contents
- ❌ no introduction (unless folded into Ch.1)
- ✅ 129 chapter-entry body pages
- ❌ no back index
- ❌ no about / acknowledgments / colophon
- ❌ arabic 1..129 only — no roman folios for the (absent) front matter

This list is the punch list for the front-matter / back-matter implementation
session. Owner: operator + Claudio. No work happens here until explicit go.
