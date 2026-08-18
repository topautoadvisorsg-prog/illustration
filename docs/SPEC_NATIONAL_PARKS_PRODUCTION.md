# SPEC — NATIONAL PARKS WITHOUT THE OVERWHELM, into production

Status: **awaiting approval**. Nothing has been created on the platform yet.
Written 2026-08-15 against commit `0ab37d6`.

---

## 1. The book

| | |
|---|---|
| Title | NATIONAL PARKS WITHOUT THE OVERWHELM |
| Subtitle | A First-Timer's Deep Guide to the 7 National Parks Most Americans Actually Visit |
| Author | Nolan Withlow (pen name, disclosed composite narrator) |
| Source | `Downloads/national parks book/LAYOUT-national-parks-without-the-overwhelm.md` |
| sha256 | `bd23a9f4e6f049e82fd7742a0ec00459bc065f4573241b2adad7c829362bdcd8` — **verified** |
| Words | 33,173 measured (33,293 reported; the delta is stripped markup) |
| Structure | 23 H1, 107 H2, 135 H3, 0 H4 |
| Assets | 0 images. 46 table rows in 5 tables. 16 blockquote skip boxes. 7 `NOBODY WARNED ME` sections |
| Track | `typeset` — Paged.js, deterministic, no render spend |

Editorial is closed and the text is frozen. This spec touches layout only.

---

## 2. What I measured before writing this

I ran `parseTypesetSections` — the platform's real section parser — against the
real file, read-only, no project created. Result:

```
sections: 126  { front: 108, back: 18 }
chapters recognised: 0
disclosure survives parse: FALSE
front-matter notes survive parse: FALSE
pipe-table lines reaching the body renderer: 46
non-blank source lines: 1489   retained: 1312   DROPPED: 177
```

The platform cannot take this book correctly today. Four defects, each with
evidence, below. None of them are the manuscript's fault — this book uses a
different heading convention from the two books the typeset track has shipped,
and it is the first one with tables.

### D1 — The chapter convention does not match. 0 of 12 chapters recognised.

`parseTypesetSections` (`backend/src/pipeline/typeset/typeset-book.ts:129`)
expects `# Chapter N` followed by `## Title`. This manuscript writes
`# 4 — Great Smoky Mountains` and uses H2 for sections *inside* the chapter.

Consequence: every H2 becomes its own top-level section, and
`.tsec.front { break-before: ... }` (`typeset-book.ts:729`) gives each one a
forced page break. 126 page breaks instead of 23. No chapter opener, no chapter
numbering, no running heads, and roughly 40 pages of half-empty paper.

### D2 — The composite-authorship disclosure is silently dropped.

`# FRONT MATTER` is followed by `### A note on how this book was written`. The
parser only opens a section on an H1 or an H2, so every line under that H3 is
discarded (`typeset-book.ts:176`). The copyright block above `# CONTENTS` is
inside the title block, which the parser drops by design.

Both author notes and the composite-narrator disclosure vanish. That is a direct
hit on handoff rule 2, and it fails silently — the build would report success.

### D3 — Markdown tables render as literal pipes.

`bodyToHtml` has branches for lists, blockquotes, scene breaks and headings. It
has none for `|`. All 46 rows fall through to `para.push(t)` and print as
paragraphs of pipe characters. The `|---|---|` separator rows print too.

These tables are the load-bearing reference content of the appendix.

### D4 — The skip boxes lose their heading.

All 16 are a blockquote whose first line is `### SKIP IT / DO THIS INSTEAD`.
`closeQuote` (`typeset-book.ts:224`) recognises a first line that is entirely
bold as a callout label; it does not recognise a heading. The line goes through
`inlineMarkdown`, which does not handle `###`, and prints the hashes literally.

---

## 3. Decisions I am taking

These were delegated in the handoff. Stated with reasons so they can be overruled.

**Trim: 6 × 9, no bleed.** Trim is a config choice, not a standard change —
`resolveTypesetDesign` reads `config.trimSize ?? standard.trim`. 6×9 is the
convention for adult trade nonfiction, and it gives the measure 4.875in against
4.375in at digest, which the reference tables need. Estimated 115–135 pages;
the real number comes off the first build, not off this estimate.

**A new production profile: `trade-nonfiction-guide`.** The book must not run
under `bw-educational-nonfiction`. That profile carries `audienceBand:
YOUNG_TEEN`, a 12-illustration budget, and cover art language written for a boy
who would rather not be seen carrying a book about puberty. Resolving this book
to it would put that art direction on the cover generator. This book is adult,
text-only, and its illustration policy is `none`.

**A new typeset standard: `trade-guide-typeset@1`.** Derived from
`educational-nonfiction-typeset@2` — ragged right and orphans/widows at 2 are
both already measured against this render engine, so they carry over rather than
being re-litigated. What it adds: table styles, `NOBODY WARNED ME` registered as
the recurring panel heading, and the skip-box treatment.

A new standard rather than an edit to @2: NO ONE TOLD ME THAT is proofed against
@2 and must keep rendering identically. The registry has no "latest" for exactly
this reason.

**No AI cover generation, no interior illustrations.** 0 images in the
manuscript and no reason to invent any. The cover is a designed object; that is
a separate decision, below.

---

## 4. The build

Phase 0 and 1 are platform code. Nothing spends money at any point in this spec.

**Phase 0 — parser and renderer (D1–D4).**
1. Chapter recognition: accept `# <number> — <Title>` alongside `# Chapter N`,
   and demote H2 to a subhead inside the section when the H1 carried the chapter
   title. Selected by a per-standard heading convention, not sniffed globally —
   the two shipped books must parse exactly as they do today, pinned by test.
2. Front matter: open a section on an H3 under `# FRONT MATTER` / `# BACK MATTER`
   so the author notes survive. The copyright-page disclosure goes through
   `publication.disclaimer`, which already exists and already escapes properly.
3. Tables: a GFM pipe-table branch in `bodyToHtml`, emitting a real `<table>`
   with `break-inside: avoid` and per-standard styles.
4. Skip boxes: recognise a leading `###` inside a blockquote as the callout
   label, alongside the existing bold rule.
5. Register the profile and the standard.

Every one of the four gets a test against the real manuscript's shape, because
all four fail silently and a silent failure in this pipeline is what put a
literal `>` on page 7 of the last book.

**Phase 1 — intake.** `POST /api/books/intake` with the layout manuscript, the
new profile, 6×9. Idempotent on `briefHash`. Free.

**Phase 2 — readiness gate.** `GET /api/projects/:id/readiness`. Free. Expect
one warning: canonical source not retained, same as the other books — that is
correct here, the canonical stays on the manuscript side by standing rule.

**Phase 3 — first typeset build.** `buildTypesetInterior` with review guides on.
Gives the real page count, and the tables and skip boxes in place. Compute only.

**Phase 4 — proof read of the PDF.** Specifically: the disclosure is present and
verbatim; no fee, distance, time, rule or safety line has reflowed into
nonsense; the 5-column appendix table is readable; folios and running heads
correct; even page count.

**Phase 5 — cover, metadata, KDP.** Not scoped here. It needs the page count
from Phase 3 for the spine, and the answers in §5.

---

## 5. What I need from the manuscript side

Blocking Phase 3:

1. **The 5-column appendix table** (source line 2727: Park / What / When / Cost /
   Where). At 4.875in that is under an inch per column, and one cell reads
   "Timed Entry + Bear Lake Road if your day touches the Bear Lake corridor;
   plain Timed Entry for everywhere else". It cannot be set as a 5-column table
   at any trim this book would print at. It needs to be restructured on the
   manuscript side and re-exported — either split into two tables, or set
   per-park as a stacked block. Layout cannot fix this without rewording, and
   rewording it is out of bounds.

2. **The appendix date banner** (source line 2697):
   `# ⟶ ALL FIGURES IN THIS APPENDIX ARE CURRENT AS OF: **August 2026**`.
   It is an H1 directly after another H1, so it becomes its own section on its
   own page. Is it meant to be a banner inside the appendix, or a page? And is
   the `⟶` load-bearing — stage-1 ingestion strips symbols like it by design,
   which is how a 🚩 disappeared from the last book before typesetting saw it.

Blocking Phase 5:

3. **Publication facts for the copyright page.** Publisher or imprint name,
   edition string, and the rights holder. The generator omits anything it is not
   given rather than inventing it. The manuscript's copyright line names the pen
   name; confirm the pen name is what should appear, or give me the real entity.

4. **ISBN.** Do you have one, or is this KDP-assigned? The generator will never
   fabricate one, so the copyright page ships without it unless you supply it.

5. **The disclosure string.** I will carry the manuscript's paragraph verbatim
   into `publication.disclaimer`, beginning "Nolan Withlow is a pen name and a
   composite narrator" and ending "independently researched and checked."
   Confirm that exact paragraph is the one that must survive, and that the
   copyright page is the right place for it — it currently sits on the copyright
   page in the manuscript, and it will read the same way there in print.

Not blocking, but I want it on the record:

6. **AI-content disclosure at KDP upload.** KDP asks separately about AI-generated
   text, images and translation. This book has a disclosed composite narrator and
   an AI-assisted production history. I will answer that question truthfully at
   upload; I need to know how you want it characterised before I do, because it
   is not a question I should answer on your behalf.

---

## 6. Cost

Phases 0–4 spend nothing. Typesetting is deterministic vector type and the render
is local Chromium. The only spend in this book's future is a cover, if we
generate rather than design one, and that is a separate approval under
`docs/COST_CONTROL_POLICY.md`.
