# Typeset spacing standard — reviewer's reference

For `educational-nonfiction-typeset@1` (NO ONE TOLD ME THAT, 5.5×8.5 B&W digest).

**What this is for.** Every number below is a decision someone made. Reviewing
without them means asking "does this look OK?", which is how a value that is
correct by the spec but wrong for the book survives — the ⅓ chapter sink passed
five rounds of defect-hunting because nothing was ever measured against an
intended value. Check pages against this list, not against a general feeling.

**Two different questions.** Keep them apart while reviewing:

1. **Is it what the standard says?** — measurable, objective, belongs in Layer 1.
2. **Is what the standard says right for this book?** — judgement, needs a human,
   and is the question that gets skipped. Ask it deliberately on every value at
   least once.

---

## 1. Page geometry

| Item | Value | How to check |
|---|---|---|
| Trim | 5.5 × 8.5 in (396 × 612 pt) | Layer 1 asserts every page |
| Bleed | 0 | Text interior — nothing runs to the edge |
| Top margin | 0.625 in | |
| Bottom margin | 0.625 in | |
| Outside (fore-edge) | 0.5 in | Smaller than the gutter |
| Gutter (binding) | 0.625 in | Mirrored: recto left, verso right |
| **Text block** | **4.375 × 7.25 in** | Everything below is measured against this |

Margins are **mirrored**. On a recto the wide margin is on the left; on a verso
it is on the right. A page where both margins look equal is a defect.

Gutter follows KDP page-count bands (≤150 → 0.5, ≤300 → 0.625, ≤500 → 0.75,
≤700 → 0.875). At 153 pages this book sits in the 0.625 band.

---

## 2. Vertical rhythm — the base unit

Body is **12 pt on 1.3 line-height = 15.6 pt per line**. That is the unit
everything else should feel like a multiple of. When a gap looks wrong, measure
it in lines, not inches.

| Gap | Value | ≈ lines |
|---|---|---|
| Between paragraphs | **0** (indent only) | 0 |
| Above an H3 | 1.15 em ≈ 13.8 pt | ~0.9 |
| Below an H3 | 0.35 em ≈ 4.2 pt | ~0.27 |
| Above an H4 | 1 em = 12 pt | ~0.77 |
| Below an H4 | 0.3 em ≈ 3.6 pt | ~0.23 |
| Around a scene break | 0.9 em ≈ 10.8 pt each side | ~0.69 |
| Around a callout | 0.9 em ≈ 10.8 pt each side | ~0.69 |
| List, above / below | 0.5 em / 0.6 em | ~0.4 |
| Between list items | 0.18 em ≈ 2.2 pt | ~0.14 |
| Opener block → body | 2 em = 24 pt | ~1.5 |

**Note the first row.** Paragraphs have NO space between them — separation is
carried entirely by the 1.2 em first-line indent. This is standard trade-book
setting and is deliberate, but it is the single biggest driver of how dense the
page feels. See §7.

---

## 3. Paragraphs

- First-line indent **1.2 em** on every paragraph…
- …**except** the first paragraph of a section and the first after any heading,
  scene break or callout, which sets **flush left with no indent**. An indent
  marks continuation, so it is wrong where nothing precedes.
- **Justified**, with the last line **ragged right**. A last line stretched to
  the full measure is a defect (this was the original defect in this book).
- Hyphenation on.
- Orphans 2 / widows 2 — never one line of a paragraph alone at the top or foot
  of a page.

**Reviewer check:** run your eye down the left edge. Every paragraph should
start indented except immediately after a heading or break.

---

## 4. Headings

| Role | Size | Face | Alignment |
|---|---|---|---|
| Chapter kicker | 10 pt (labelPt 8.5 + 1.5) | Archivo, uppercase, 0.22 em tracking | centred |
| Chapter title | 19 pt (12 × 1.6) | Archivo 500 | centred |
| H3 section | 13 pt | Archivo 500, 0.04 em tracking | **left** |
| H4 subsection | 12.5 pt | EB Garamond italic 600 | **left** |

Headings never justify. All four declare both `text-align` and
`text-align-last`, so nothing inherits body justification.

Every heading has keep-with-next: a heading alone at the foot of a page is a
defect.

---

## 5. Chapter openers

| Item | Value |
|---|---|
| Sink (top of text block → kicker) | **27% of 7.25 in = 1.958 in** |
| First line of BODY text | ≈ 44% down the page |
| Kicker → title | 0.5 em |
| Title block → body | 2 em |
| Starts on | recto, always |
| Running head | suppressed |
| Folio | present (drop folio) |

**Judge the sink by where the BODY starts, not the kicker.** The title block
plus its 2 em margin push reading text roughly 17% further down than the sink
number suggests. That gap is what made 33% feel wrong while looking defensible
on paper.

---

## 6. Page furniture

| Item | Rule |
|---|---|
| Verso running head | Book title, small caps, 8.5 pt, 0.06 em tracking, **left** |
| Recto running head | Section/chapter title, same treatment, **right** |
| Folio | 10 pt, **centred on the content box** (not the page — the box is mirrored) |
| Chapter opener | No running head, folio kept |
| Parity blank | **Nothing at all** — no head, no folio |

Folio centres: recto **202.5 pt**, verso **193.5 pt**. They differ because the
content box is mirrored; identical values on both would be the bug.

---

## 7. Open judgement calls

Values that are internally consistent but worth a deliberate human look. This
section exists because "correct per spec" is not the same as "right".

- **Paragraph separation (open).** Currently indent-only, zero space between
  paragraphs. Correct for a trade book; possibly too dense for a 9–14 reader
  working through a practical guide. A 0.25–0.35 em space between paragraphs
  would open the page noticeably. Costs pages. **Not yet reviewed side by side.**
- **Callout density.** 0.95 scale (11.4 pt) with a 1.5 pt rule and 0.9 em
  padding. Reads as a quiet aside rather than a box.
- **List spacing.** 0.18 em between items is tight; fine for short items, may be
  cramped for the multi-line lists in later chapters.
- **Sink (settled 2026-08-09).** 27%, after comparing 33 / 27 / 25.

---

## 8. Reviewer checklist

Per page:

- [ ] Margins mirrored the right way round for recto/verso
- [ ] Running head present, correct source, correct side — **absent on openers and blanks**
- [ ] Folio present and centred on the content box — **absent on blanks**
- [ ] Paragraphs indented except after a heading/break
- [ ] Last line of every paragraph ragged, not stretched
- [ ] No heading alone at the foot of a page
- [ ] No single line stranded at the top or foot
- [ ] Headings left, openers centred
- [ ] Lists: bullets aligned, hanging indent, items not cramped
- [ ] Callouts: label on its own line, rule present, block unbroken across pages
- [ ] Scene breaks: single, centred, never trailing at a section end
- [ ] No literal Markdown characters (`>`, `**`, `###`) in the printed text
- [ ] Page not more than ~⅓ empty unless it is a chapter end or a blank

Per chapter:

- [ ] Opens recto, sink 1.958 in, body ≈44% down
- [ ] Kicker spells the number ("Chapter Twenty-One", not "Chapter 21")
- [ ] Chapter end does not leave a heading plus a line alone on a page

Whole book (Layer 1 automates all of these — `yarn workspace @wildlands/backend qa:typeset`):

- [ ] Page count stable across repeated renders
- [ ] 0 real overflow
- [ ] All sections present, in order, none duplicated
- [ ] Text fidelity: every manuscript word on the page, in order
- [ ] Every page 5.5 × 8.5
- [ ] Fonts embedded — **currently FAILING, see OPEN_PRODUCTION_ISSUES.md #1**
