# SPEC — 7 NATIONAL PARKS WITHOUT THE ROOKIE MISTAKES, into production

Status: **awaiting approval**. Nothing created on the platform, nothing spent.
Rewritten 2026-08-21 against platform commit `0ab37d6`.

> **Supersedes the 2026-08-15 draft of this file**, which was written against
> `bd23a9f4…` under the title NATIONAL PARKS WITHOUT THE OVERWHELM by Nolan
> Withlow. That identity is retired. See §1 for the only file that ships.

---

## 1. The book, and the only file that ships

| | |
|---|---|
| Title | 7 National Parks Without the Rookie Mistakes |
| Subtitle | What's Worth Your Time, What to Skip, and What I Learned the Hard Way |
| Author | Tom Everett (pen name, disclosed composite narrator) |
| File | `Downloads/national parks book/LAYOUT-7-national-parks-without-the-rookie-mistakes.md` |
| SHA-256 | `9d3263d7903211771bd5cf638f5a3c41bf8a27d53e4c75a5b5d310a4cf0912d1` — **verified 2026-08-21** |
| Words | 33,421 measured (33,538 reported; delta is stripped markup) |
| Structure | 23 H1, 107 H2, 135 H3, 0 H4 |
| Content | 0 images. 46 table rows in 5 tables. 16 skip boxes. 16 warning callouts. 8 `NOBODY WARNED ME` |
| Track | `typeset` — Paged.js, deterministic, no render spend |

### Quarantine, verified on disk

Both superseded files are present, renamed to announce themselves, and out of
the production path:

```
6bb6db65…  _archive/superseded/STALE-LAYOUT-6bb6db65-DO-NOT-PUBLISH.md
73153575…  _archive/superseded/SUPERSEDED-LAYOUT-...-73153575-old-metadata.md
```

`MANUSCRIPT-FROZEN-2026-08-15.md` sits at the top level and carries the OLD
title and byline. It is the permanent FACTUAL FREEZE (`023a2257…`), deliberately
kept, never published. Named here so nobody mistakes it for a candidate.

Intake takes the SHA above and nothing else. The hash is re-verified at build.

---

## 2. What I measured before writing this

`parseTypesetSections` and `sanitizeManuscript` — the platform's real parser and
real ingestion sanitizer — run against the real file, read-only, no project
created:

```
sections: 126  { front: 108, back: 18 }
chapters recognised: 0
disclosure survives parse: FALSE
front-matter notes survive parse: FALSE
pipe-table lines reaching the body renderer: 46
non-blank source lines: 1488   retained: 1311   DROPPED: 177

sanitizer: 17 lines changed
warning glyph after sanitize: 0   (16 before)
copyright symbol after sanitize: STRIPPED
```

Six defects. All six fail silently — a build would report success.

### D1 — 0 of 12 chapters recognised

`parseTypesetSections` (`backend/src/pipeline/typeset/typeset-book.ts:129`)
expects `# Chapter N` + `## Title`. This book writes `# 4 — Great Smoky
Mountains` and uses H2 for sections inside the chapter.

Every H2 becomes a top-level section, and each takes a forced page break
(`typeset-book.ts:729`). 126 breaks instead of 23. No chapter opener, no chapter
numbering, no running heads, ~40 pages of half-empty paper.

### D2 — the composite-narrator disclosure is dropped

`# FRONT MATTER` is followed by `### A note on how this book was written`. The
parser opens a section only on H1 or H2, so every line under that H3 is
discarded (`typeset-book.ts:176`). The copyright block above `# CONTENTS` sits
in the title block, which the parser drops by design.

Both author notes and the disclosure vanish. Direct hit on must-survive item 1,
and it fails silently.

### D3 — 46 table rows print as literal pipes

`bodyToHtml` handles lists, blockquotes, scene breaks and headings. No pipe
branch, so rows fall to the paragraph path. Separator rows print too. These
tables are the load-bearing reference content of the appendix.

### D4 — the 16 skip boxes lose their heading

All 16 open with `### SKIP IT / DO THIS INSTEAD` inside a blockquote.
`closeQuote` (`typeset-book.ts:224`) recognises a fully-bold first line as a
label, not a heading. `inlineMarkdown` does not handle `###`, so the hashes
print.

### D5 — all 16 warning callouts lose their marker at ingestion

`sanitizeManuscript` strips every `\p{Extended_Pictographic}` character
(`stage-1-ingestion/sanitize-manuscript.ts:73`). The warning text survives; the
mark that says *this one is different* does not, and the 16 paragraphs flatten
into ordinary prose.

This is the exact failure that removed a flag glyph from the last book before
typesetting ever saw it. These 16 are safety passages — flash-flood checks,
altitude, road status, wildlife. Losing the marker is the worst of the six.

### D6 — the copyright symbol is stripped from the copyright page

Same sanitizer. `*Copyright © 2026 by Tom Everett*` becomes
`*Copyright 2026 by Tom Everett*`. U+00A9 is Extended_Pictographic, so the rule
that removes decorative emoji also removes the one glyph on that page which is
not decorative.

**This affects every book on the platform, not just this one.**

---

## 3. Where this book departs from CHAPTER_BOOK_STANDARD.md

The standard is locked for a 5.5×8.5 middle-grade chapter book. Four of its
clauses do not transfer. Each departure is stated with its reason, per the
handoff's instruction to say so rather than follow silently.

**Trim: 6 × 9, not 5.5 × 8.5.** Trim is a config choice, not a standard change —
`resolveTypesetDesign` reads `config.trimSize ?? standard.trim`. Digest is a
kids' and novel trim. This is adult trade nonfiction, and the reference tables
need measure: 4.875in at 6×9 against 4.375in at digest.

**Paper: white, not cream.** Cream is right for MG fiction. A guide read in
daylight with 46 rows of tabular reference reads better on white, and white is
the convention for nonfiction with tabular matter. KDP checkout choice, free to
reverse. Flagged as a question, not taken unilaterally.

**Ragged right, not justified + hyphenation.** Not a taste call. Hyphenation is
a measured no-op in this render Chromium — a probe rendered the same paragraph
at the same measure with `hyphens: auto` and with `hyphens: none` to an
identical 152px height, because the render environment ships no hyphenation
dictionary. Justifying without it produced 105 lines at 2x normal word spacing
or worse on the last book, the worst at 4.5x. §2's "justified with hyphenation
ON" is not available here.

**Widows and orphans cannot be "disallowed".** This Paged.js ignores the
`orphans` and `widows` properties outright — measured, not assumed: raising them
to 3 on the last book fixed zero of nine cases and orphaned two illustrations.
It honours `break-inside: avoid` and `break-before: page`. Page fit gets
controlled structurally, and the QA report will state the real count rather than
claim compliance.

Everything else in the standard carries: 0.625/0.625/0.5 margins with mirrored
gutter re-confirmed against final page count, 12pt EB Garamond on 1.3, a display
face for chapter titles, one-third sink, chapters opening recto, verso=book
title / recto=chapter title running heads, bottom-centre drop folios, none of
that furniture on openers or front matter, even final page count, fonts
embedded, proof before approval.

---

## 4. Decisions taken

**Production profile: new `trade-nonfiction-guide`.** This book must not resolve
to `bw-educational-nonfiction`. That profile carries `audienceBand: YOUNG_TEEN`,
a 12-illustration budget, and cover art language written for a boy who would
rather not be seen carrying a book about puberty. Its illustration policy here
is `none`.

**Typeset standard: new `trade-guide-typeset@1`,** derived from
`educational-nonfiction-typeset@2` — ragged right and orphans/widows at 2 are
already measured against this engine and carry over rather than being
re-litigated. It adds table styles, the warning-callout treatment, the skip-box
treatment, and registers `NOBODY WARNED ME` as the recurring panel heading.

A new standard rather than an edit to `@2`: NO ONE TOLD ME THAT is proofed
against `@2` and must keep rendering identically. The registry has no "latest"
for exactly this reason.

**The appendix date banner** (source line 2695, an H1 reading "ALL FIGURES IN
THIS APPENDIX ARE CURRENT AS OF: August 2026") is set as a dated banner block at
the head of the appendix, not as its own section on its own page. It is an H1
directly after another H1 and would otherwise take a full leaf to say one line.
Its long-arrow glyph survives sanitization — it is an arrow, not a pictograph —
but is replaced with the drawn mark for consistency with the other callouts.

**Illustrations: none.** Raised rather than assumed, per the handoff. The book
has none, needs none, and adding them means art direction, spend and a second
approval. Recommendation is to ship text-only.

**No AI cover generation** is in this spec. The cover is a separate decision and
cannot be finished before §5 Phase 3 returns the page count.

---

## 5. The build

Nothing in Phases 0–4 spends money. Typesetting is deterministic vector type and
the render is local Chromium.

**Phase 0 — platform code (D1–D6).**
1. Per-standard chapter convention accepting `# <n> — <Title>`, demoting H2 to a
   subhead inside the section. Selected by the standard, never sniffed globally —
   the two shipped books must parse byte-identically, pinned by test.
2. Open front/back matter sections on an H3 so the author notes survive. The
   disclosure routes to `publication.disclaimer`, which already exists and
   escapes correctly.
3. GFM pipe-table branch in `bodyToHtml` emitting a real `<table>` with
   `break-inside: avoid` and per-standard styles.
4. Accept a leading `###` inside a blockquote as the callout label.
5. Preserve a leading warning glyph as a semantic marker through sanitization,
   and render it as a drawn B&W mark — the convention `alertPanel.headings` and
   the reinstated flag glyph already use. The manuscript stays untouched.
6. Exempt U+00A9 and U+00AE from the emoji strip. Platform-wide fix.

Each gets a test against this manuscript's real shape. All six fail silently,
and a silent failure here is what put a literal `>` on page 7 of the last book.

**Phase 1 — intake.** `POST /api/books/intake`, new profile, 6×9. Idempotent on
`briefHash`. Free.

**Phase 2 — readiness gate.** Free. Expect one warning — canonical source not
retained — which is correct here: canonical stays on the manuscript side by
standing rule.

**Phase 3 — first typeset build.** `buildTypesetInterior`, review guides on.
Returns the real page count and the spine basis. Compute only.

**Phase 4 — QA against the manuscript, not against the render.** Text-fidelity
run comparing the PDF's extracted text to the source: the disclosure verbatim,
every safety figure byte-identical, no fee, distance, time, rule or safety line
reflowed into nonsense. Plus trim, margins, page breaks, widow/orphan count,
chapter openings, callouts, tables, running heads, folios, parity pages,
embedded fonts, overflow, final even page count.

**Phase 5 — cover, KDP metadata, upload.** Needs the Phase 3 page count for the
spine and the answers in §6. Not scoped here. No upload without separate
authorization.

---

## 6. Open with the manuscript side

**Blocking Phase 3**

1. **The 5-column appendix table** (source line ~2725: Park / What / When / Cost
   / Where). At 4.875in that is under an inch per column, and one cell reads
   "Timed Entry + Bear Lake Road if your day touches the Bear Lake corridor;
   plain Timed Entry for everywhere else". It cannot be set as five columns at
   any trim this book would print at. Restructure on the manuscript side and
   re-export — split into two tables, or stack per park. Layout cannot fix it
   without rewording, and rewording is out of bounds.

**Blocking Phase 5**

2. **Publication facts** — publisher or imprint, edition string, rights holder.
   The generator omits what it is not given rather than inventing it.
3. **ISBN** — yours or KDP-assigned. Never fabricated; the copyright page ships
   without one unless supplied.
4. **AI-content disclosure at KDP upload.** KDP asks separately about text,
   images and translation. Not a question to answer on the operator's behalf.

**Confirmations wanted, proceeding on the stated answer otherwise**

5. Trim 6×9 and white paper (§3).
6. The warning callouts restored as a drawn inline mark rather than a boxed
   panel (§4).
7. Text-only, no illustrations (§4).

---

## 7. Cost

Phases 0–4: zero. The only future spend is a cover, if generated rather than
designed, under `docs/COST_CONTROL_POLICY.md`.
