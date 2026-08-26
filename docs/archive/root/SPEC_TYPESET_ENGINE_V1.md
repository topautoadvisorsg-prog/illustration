# SPEC — Typeset engine capability layer v1

Status: **APPROVED with amendments 2026-08-16** — in implementation
Trigger: DIRT RICH could not be paginated. Four blockers, none of them AI problems.
Author: Claudio / Smart Click

## Amendments (operator, at approval)

1. Architecture and scope stand: fix the four engine capability gaps first, AI
   visual judgment is the next phase.
2. **Regression coverage is every shipped book and standard that shares the
   renderer** — not NO ONE TOLD ME THAT alone. At minimum DIRT RICH, NO ONE TOLD
   ME THAT, and the Wildlands renderer users must be proved before promotion.
3. **PDF byte identity is not the regression criterion.** Use deterministic
   structural and content assertions plus controlled visual/page diffs: no
   missing content, no unexpected pagination or blank-page change, no overflow,
   no unintended visual change. Byte-identical is welcome where the pipeline is
   genuinely deterministic, but a hash difference alone is not a failure.
   (Section 3 below is superseded by this.)
4. The parser **may** extract `number=1` / `title=Backyard Me v1.0` from
   `## Chapter 1: Backyard Me v1.0`, but it **must also preserve the original
   source heading**. Whether the number and title render together, or as kicker
   plus title, is a decision belonging to the DIRT RICH layout standard — not to
   the parser.
5. DIRT RICH 6x9 starts at 11pt/1.35 for the first pagination preview, held
   inside the declared tunable range. **Not frozen** until rendered-page review.
6. The canonical-manuscript completeness invariant is **mandatory**, and its
   validation must originate independently from the canonical source structure —
   never from `parseTypesetSections` or any derivative of the parse being
   validated.

Working constraints: dev-first, **no production mutation, no paid model calls.**

---

## 0. The principle this is built against

> Do not automate judgment away. Automate the boring capabilities and
> verification so AI spends its effort on layout judgment, exceptions and
> refinement.

Five layers, in order:

```
reliable engine  ->  AI operator  ->  automatic QA  ->  AI visual review  ->  human approval
```

The engine provides tools. The AI decides when and how to use them. Deterministic
checks prove nothing was lost. A human approves what the pages look like.

The failure mode we just hit is asking the AI layer to solve something the engine
layer does not have a tool for. A carpenter told to install a window, with no saw
in the toolbox. No amount of intelligence fixes a missing capability.

**Test of a correct engine layer:** if AI disappeared tomorrow, the platform still
produces a technically valid book. Ugly in places, but valid — every section
present, every cell intact, nothing off the trim.

---

## 1. What is actually missing (measured, not assumed)

All four verified against the frozen DIRT RICH manuscript
(`bc27f4d5…b358c`, 218,750 bytes, 37,777 words) on 2026-08-16.

### C1 — Section structure recognition · **CRITICAL, silent**

`parseTypesetSections` (`typeset-book.ts:129`) recognises exactly two shapes:
`# Chapter N` + `## Title`, and `# FRONT MATTER` / `# BACK MATTER`. A manuscript
using neither has every H1 treated as its own title block and discarded, together
with all body text under it until the next H2.

Measured on DIRT RICH by running the real parser:

| | Expected | Parser produced |
|---|---|---|
| Sections | 24 | **16** |
| Chapters (numbered) | 11 | **0** |
| Body words | 37,777 | 34,772 |

Dropped entirely: The Practical Bits, Appendices A/B/C/D/E/F, Glossary.
That is **5 of the 7 production markers** gone. All 11 chapters arrived as
`kind: front, number: null` — no chapter numbers, no chapter openers, and every
section forced recto under the front-matter policy.

**It reports success.** The every-section invariant in `render-typeset.ts`
compares the rendered sections against the *already-truncated* parse — the wrong
list against itself. This is Trap #1 (the 31-of-64-pages truncation) in a new
form, and the existing guard does not see it.

### C2 — No table capability

No `<table>`, `<td>` or `<th>` anywhere in the typesetter. DIRT RICH carries
**47 pipe-table rows** across Tables A.1, B.1 and C.1. C.1 is 7 columns x 22 rows
and is described in the manuscript as the most-consulted page in the book.

### C3 — No preformatted / fenced-block capability

No fence handling. Appendix E (manuscript lines 1941-1972) is a box-drawing site
plan inside a ``` fence. Reflowed as prose it is destroyed — the same corruption
that Manuscript Studio's `layout-export.ts` already inflicted on it.

### C4 — No long-token wrapping

No `overflow-wrap`, `word-break` or `word-wrap` in the typesetter. `Where I
Checked` carries **65 source URLs**, several over 120 characters against a
~72-character measure. Each is one unbreakable token and will overrun the text
block, at any trim.

---

## 2. Scope of this build

### IN — Layer 1: engine capabilities

**C1 · Section structure.** Recognise, additively:
- `## Chapter N: Title` / `## Chapter N — Title` -> chapter, number N, title with
  the prefix stripped (the number belongs in the generated kicker, not the title).
- Bare H1 back matter after chapters have started -> `back`, not discarded.
- Existing `# Chapter N` + `## Title` and `# FRONT MATTER` / `# BACK MATTER`
  shapes keep working byte-identically. New shapes are recognised only where the
  current parser would otherwise **drop** content.

**C2 · Tables.** GFM pipe tables -> real `<table>`. Per-column alignment from the
delimiter row. Header rule, cell padding, table type size, and break policy all
come from a new `tables` block on the layout standard — not hardcoded.

**C3 · Preformatted blocks.** Fenced blocks -> `<pre>`, mono face, whitespace
preserved verbatim, `break-inside: avoid`, with a declared auto-fit so a wide
block scales to the measure instead of overrunning it.

**C4 · Long-token wrapping.** A declared wrapping mode on the standard, applied
to URLs and long tokens. Default `anywhere-after-punctuation` — break after `/`,
`.`, `-`, `?`, `&`, never mid-word in prose.

### IN — Layer 2: the AI control surface (declared, not yet driven)

Each capability lands with **declared allowed ranges** on the layout standard,
so the AI operator later tunes within bounds rather than rewriting the renderer:

| Control | Range |
|---|---|
| Body size | 10.5 - 12 pt |
| Leading | 1.20 - 1.45 |
| Table type size | 8 - 10 pt |
| Table cell padding | 0.15 - 0.5 em |
| Table break policy | keep-together / allow-break / dedicate-spread |
| Preformatted fit | as-set / shrink-to-measure |
| URL wrapping mode | none / after-punctuation / anywhere |
| Chapter opener | style A / B / C |

This build **declares and honours** the ranges. It does not yet have AI choosing
values — that is Layer 3 of the roadmap below.

### IN — Layer 3: deterministic QA checks

Hard yes/no machine checks, run on every typeset build, failing loud:

1. Every section in the canonical manuscript is present in the build.
2. Every table row and every cell survived — counted, not sampled.
3. Every production marker is accounted for (present, or explicitly resolved).
4. No text crosses the trim area.
5. No URL or token overflows its measure.
6. No missing chapters; chapter numbers are contiguous.
7. No unexpected blank pages (parity blanks are expected; others are not).
8. Section count and page count are within sane bounds of the word count.

Check 1 must compare against the **canonical manuscript**, never against the
parse — that is precisely the bug that made C1 silent.

### IN — DIRT RICH

- New layout standard `trade-nonfiction-guide-typeset@1`, 6x9, derived from the
  educational-nonfiction line. Ragged right (hyphenation is a no-op in the render
  Chromium — measured, see `educational-nonfiction-v2`). Registered as a NEW
  entry; `@1` and `@2` of the educational line are not touched.
- Project created, canonical manuscript uploaded, standard pinned explicitly.
- Free typeset preview through to a real page count.

### OUT — explicitly deferred

- AI visual review from rendered pages (critique -> adjust -> rerender). This is
  the right next phase and it is not this build.
- Producing the 6 generatable figures/tables/checklist, and Figure E.1, which
  needs a human illustrator.
- Stripping the 7 production markers. They must be visible in this pass so we can
  see where they land.
- Any prose change. Editorial is closed. If something genuinely cannot be laid
  out without a wording change, it stops and gets reported, not edited.

---

## 3. Non-negotiable regression guarantee

*(Superseded by amendment 3 — byte identity is no longer the criterion.)*

Books have shipped through this renderer. Every change here is additive and
guarded. **No existing layout standard file is modified. No shipped book changes
pin.**

Coverage: **every shipped book and standard that shares the renderer** — at
minimum DIRT RICH, NO ONE TOLD ME THAT, and the Wildlands renderer users.

Promotion criteria, per book:

| Criterion | Type |
|---|---|
| Every canonical section present | structural, hard fail |
| Section count, order and role unchanged | structural, hard fail |
| Body word count unchanged | content, hard fail |
| Page count and blank-page set unchanged | pagination, hard fail unless justified |
| Zero overflow | layout, hard fail |
| No unintended visual change | controlled page diff, reviewed |

A PDF hash difference alone is **not** a failure — timestamps and non-determinism
in the pipeline can move bytes without moving a pixel. Byte identity is recorded
where it happens, and treated as welcome evidence rather than the gate.

---

## 3a. C1 — DONE, dev-only, 2026-08-16

Files: `typeset/typeset-book.ts` (parser), `typeset/canonical-inventory.ts` (new,
the independent invariant), `__tests__/typeset-section-structure.test.ts`,
`scripts/c1-regression.ts`.

**Regression, all four shipped manuscripts** (`yarn tsx scripts/c1-regression.ts`,
runs the pre-C1 parser inlined verbatim against the new one):

| Book | Track | Sections | Chapters | Words | Result |
|---|---|---|---|---|---|
| NO ONE TOLD ME THAT | typeset | 28 -> 28 | 23 -> 23 | 32,004 -> 32,004 | IDENTICAL |
| NATIONAL PARKS | whole-page | 126 -> 126 | 0 -> 0 | 32,138 -> 32,138 | IDENTICAL |
| WILDLANDS New England | whole-page | 67 -> 67 | 7 -> 7 | 70,277 -> 70,277 | IDENTICAL |
| WILDLANDS Canadian Rockies | whole-page | 72 -> 72 | 7 -> 7 | 54,080 -> 54,080 | IDENTICAL |
| **DIRT RICH** | typeset | **16 -> 24** | **0 -> 11** | **34,772 -> 37,587** | fixed |

Canonical invariant: NO ONE TOLD ME THAT PASS -> PASS; DIRT RICH **FAIL -> PASS**.

Suite 933 passed / 9 skipped / 0 failed (baseline 911 + 22 new). `tsc` clean.

**The regression guarantee is structural, not empirical.** `detectHeadingConvention`
decides once, up front, which convention a manuscript uses. Any manuscript
carrying a `# Chapter N` / `# FRONT MATTER` / `# BACK MATTER` marker takes the
original code path unchanged, so it cannot move.

This was found the hard way: a first cut inferred roles per-heading and regressed
both Wildlands books — the manuscripts carry marker H1s *and* some stray
`## Chapter N: ...` H2s, so seven entry headings were promoted to chapters and a
run of sections was relabelled. Caught by the regression harness before anything
left dev. There is a test for that exact shape.

**Known limitation, deliberately not fixed:** the completeness invariant assumes
H1/H2 name sections, which holds on the typeset track. On the whole-page track an
H2 is an entry inside a chapter, so the scan over-counts and those books report
informational failures. They do not use this parser. Calibrating the invariant for
the whole-page track is separate work and is not needed for DIRT RICH.

## 3b. C4, C2, C3 — DONE, dev-only, 2026-08-16

All three land as OPTIONAL policies on the layout standard. Absent means the
old behaviour, so no approved design acquires a capability it was not approved
with. `educational-nonfiction-typeset@1` and `@2` are untouched, and a test
asserts they declare none of the three.

| | Capability | Shape |
|---|---|---|
| C4 | `longTokens` | `<wbr>` break opportunities after structural punctuation, placed in markup because CSS cannot express WHERE a URL should break. A real 118-char DIRT RICH URL gets >10 break points, longest fragment <40 chars. |
| C2 | `tables` | GFM pipe tables to real `<table>`, per-column alignment, keep-together. |
| C3 | `preformatted` | Fences to `<pre>`, verbatim: no inline markdown, no long-token marking, no whitespace collapsing. |

Suite **984 passed** / 9 skipped / 0 failed (baseline 911 + 73 new). `tsc` clean.
Shipped-book regressions: **0** after each of the three.

Measured against the real manuscript: 3 tables at 3x13, 2x7 and **7x21 body rows**
(the handoff's "7 columns, 22 rows" counts C.1's header — recorded so the two
descriptions cannot drift), all 47 pipe rows preserved, Appendix E's fence
preserved line for line including the 26 ft setback callout.

### BLOCKER — no available face can draw Appendix E

Measured, not assumed. The 22 distinct non-ASCII characters in Appendix E's site
plan against every candidate face:

| Faces | Missing |
|---|---|
| All 11 currently vendored | **18 of 22** |
| JetBrains Mono, Noto Sans Mono, IBM Plex Mono, Source Code Pro (Google) | **18 of 22** |
| Roboto Mono (Google) | 20 of 22 |

Google's webfont builds ship latin/greek/cyrillic/vietnamese subsets only. Box
drawing (U+2500-257F) and block elements (U+2591, U+2593) are absent even from
fonts whose desktop TTFs carry them, so "vendor a Google mono" does not solve it.
The existing `vendor-fonts.ts` also filters to latin subsets, which would drop
them a second time.

The fenced content is preserved STRUCTURALLY — verbatim in the PDF text layer,
every line present, proven by test. What is missing is a face that can DRAW it.
Open decision; see the report. Not resolved unilaterally, because putting a new
typeface into the print stack affects every book, and the manuscript itself says
Figure E.1 must be replaced by drawn art regardless.

## 3c. GATE GREEN — dev-only, 2026-08-16

`scripts/dirt-rich-gate.ts`, measured against a REAL Paged.js render at
`trade-nonfiction-guide-typeset@1`, 6x9, 11pt/1.35.

**DIRT RICH: 124 pages, 5 blanks, 0 overflow.**

| # | Criterion | Result |
|---|---|---|
| 1 | canonical completeness | PASS — 24/24 sections, 37,587 body words |
| 1b | every parsed section reached the RENDER | PASS — 24 laid out |
| 2 | 47 table rows/cells preserved | PASS — 3 tables, 44/44 rows, **212/212 cells** |
| 3 | Appendix E preformatted preserved | PASS — 30 fenced lines, alignment intact, DejaVu Sans Mono |
| 4 | 65 long URLs within measure | PASS — measured in the laid-out DOM, 0 overrunning |
| 5 | 7 production markers accounted for | PASS — all 7 visible (must be stripped before print) |
| 6 | no regression in existing renderer users | PASS — see below |

Criterion 6, three independent ways:
- `c1-regression.ts` — 4/4 shipped manuscripts parse IDENTICALLY.
- `shipped-render-regression.ts` — NO ONE TOLD ME THAT re-renders to the same
  pages, blanks, overflow and sections, and carries no `<wbr>`, no table markup,
  no `<pre>`, no `overflow-wrap`, and no embedded mono face.
- Suite 991 passed / 9 skipped / 0 failed. `tsc` clean.

### Two false alarms worth recording

**The 155-page baseline was wrong, and the pristine tree proved it.** The
re-render reported 163 pages / 10 blanks against v1's recorded "155 pages, 14
parity blanks". Rather than explain it away, the engine changes were stashed and
the PRISTINE tree rendered: also 163/10. The difference is the harness passing a
minimal config, so the generated front matter differs from the approved build —
not the engine. The script now baselines on the measured pristine value and says
so, and states that it proves before == after rather than re-approving the book.

**`overflow-wrap` appeared to leak into a book that never asked for it.** The
rendered HTML inlines the Paged.js polyfill, whose own source contains the string
three times. The check was scanning the whole document; it now scans only the
stylesheet we generate.

### New deterministic check added

`TypesetReport.horizontalOverflow` — content elements whose text is wider than
their own measure, measured per element (never on the Paged.js page container,
whose horizontal scrollWidth is a known artifact). This is the "no URL overflows"
item from the QA list, and it is what makes criterion 4 a measurement rather than
an inference. Reports 0 on the shipped book.

## 4. Order of work

1. C1 section structure + its QA check. Re-run the DIRT RICH parse: must be 24
   sections, 11 numbered chapters, 37,777 words.
2. Regression proof on NO ONE TOLD ME THAT.
3. C4 URL wrapping (smallest, unblocks `Where I Checked`).
4. C2 tables + `tables` block on the standard.
5. C3 preformatted + auto-fit.
6. New 6x9 standard registered.
7. DIRT RICH: create, upload canonical, pin, breakdown, typeset preview.
8. Full deterministic QA run; report page count and every check.

Cost: $0. Breakdown is deterministic (`generate-manifests.ts:236` — no LLM) and
the typeset preview is free. Nothing on this path spends.

---

## 5. What this changes going forward

The four gaps were found only because a book with ordinary nonfiction furniture —
tables, an appendix, a source list — was put through the pipeline. The first four
books were text-and-illustration shaped and never exercised it.

The lesson is the principle at the top: when a book fails, first ask whether the
engine had the tool. Reach for the AI layer only once it does.
