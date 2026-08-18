# DIRT RICH — production provenance

Record of what production contains for this book and how the approved artifact was
reproduced there. **Evidence, not a runbook.** Nothing here is executable, and there
is deliberately no book-specific production mutation script in the repo: the one
used to perform this migration was deleted after its results were recorded below.

Closed out 2026-08-18.

---

## Identity

| | |
|---|---|
| Production project | `a4e2bbda-645f-4583-9123-7d24ab515c9c` |
| Dev project (origin of the approved artifact) | `55d7bce0-2f71-4f02-8131-e6c750c8506e` |
| Title | DIRT RICH |
| Subtitle | Build a Backyard Homestead on a Quarter Acre: Grow Vegetables, Raise Chickens for Eggs and Meat, and Preserve the Harvest |
| Author | Abby Fenwick |
| Trim / bleed / paper | 6 × 9 in / 0.125 in / cream |
| Production profile | `bw-educational-nonfiction` (body render track: `typeset`) |
| Typeset layout standard | `trade-nonfiction-guide-typeset@1` |

The subtitle is listed because it is part of the book, not decoration around it: an
earlier working subtitle reached production and printed on page 1 while the cover
carried the approved one. Everything else about that render was byte-identical, so
nothing else caught it. Metadata carried no hash and no gate — see *What this book
proved* below.

---

## Manuscript chain

The approved interior was **not** produced by intake. Intake sanitizes the canonical
source; the working manuscript was then replaced by a figure pipeline, one stage of
which originally existed only as a manual edit.

| Stage | SHA-256 | Notes |
|---|---|---|
| Canonical source | `bc27f4d50bb22be1eb4d0f4d83fa4041d97983cbbabc91077e496ee2205b358c` | frozen revision 3, 218,750 bytes; retained in production R2 |
| Intake output (sanitized) | `ee59a65b2198e73cbcc81e1039db50ad7ccf387bf0a1e6d248d20c3b06221f4e` | what intake alone produces — **not** the book |
| 1. Inline figures 5.1 / 10.1 | `a00d81078d38ca5d31ddd3d9539ba56cad379de6a5481e599ecc713717ebd7f7` | 2 figures |
| 2. Six interior plates | `7be864f99e80dd71b400fd130f9e39265d41b67178ce901bcd6fb495e9132c72` | 8 figures |
| 3. Appendix E site plan | `0376567eecc0576fb9932511dcb79648530948e8c1d35d79dc3684ed4657405d` | 9 figures — **the working manuscript the approved book was typeset from** |

Stage 3 replaces a five-line `[FIGURE E.1 — REDRAW REQUIRED]` blockquote at line 1937
with `![](figure-E-1-site-plan.svg){74%}`. It was originally performed by hand and had
to be reconstructed by diffing artifacts; it is now implemented and asserted in
`backend/scripts/dirt-rich-figure-pipeline.ts`, which fails if any stage hash moves.

The production run fed that pipeline from the canonical object **downloaded from
production R2**, not from a local copy — so production is proven able to rebuild the
book from bytes it actually stores.

---

## Illustration assets

Nine objects under `a4e2bbda-645f-4583-9123-7d24ab515c9c/illustrations/`, each verified
by independent read-back from production storage.

| File | SHA-256 |
|---|---|
| `p13-soil-profile.png` | `225782897bd75cc0ddb08584fb067fb1b559c9eca8eb63fefcc04167b3511a7f` |
| `p21-raised-bed.png` | `305053c0e8e2a8344a84da2ea4f62609e44896f1ddf1ba316221225ad0c87eed` |
| `figure-5-1-cost-per-dozen.png` | `f218f8cc43adf33695f39d87a6c7c2611c2bbc3c0c0232d827ddd41d70cc6087` |
| `p47-coop-dusk.png` | `af9ba6e93a83ca48b1b1a61a2b4a6cd24af58594bbaa2ce88fb96d2132d7d963` |
| `p57-zucchini.png` | `d64f218ec4ef6e1ad661adeae4bce6a3937ff3b3f2713effd5bf9c071ea5c2f0` |
| `p83-january-garden.png` | `287ea5c543439877666ffda1b03924bb589621b38716f956dea94d20130b6754` |
| `figure-10-1-hours-per-week.png` | `1f952e825686196606b726742badb57ff8498695a7094745bbeea79f1c1df5fe` |
| `p99-quarter-acre.png` | `f863e8091093fdf79687e5833885741d96c3e5ff02369a4915e06cd9f4f86729` |
| `figure-E-1-site-plan.svg` | `40e4bab171ea446cf4a13956d72dda4a1e1e48738b8fabbdb21df65f953d591f` |

No config, index, or mapping registers them: `build-typeset-interior.ts` scans
`![](name)` out of the manuscript and resolves `<project>/illustrations/<name>` from
storage. `config.illustrations` is the separate stamping path and is `{}` for this
book, in production and in dev.

---

## Render result

| | |
|---|---|
| Final page count | **126** |
| Blank pages | `[126]` |
| Overflow | none — `typeset_no_overflow: "126 pages, none overflowing"` |
| Artifact quality | `PRINT_READY` |
| Page size | 6.000 × 9.000 in, all pages |
| Production export | `a4e2bbda-645f-4583-9123-7d24ab515c9c/exports/interior-1b617af9-05c2-4340-87ea-5c0ea903f2b3.pdf` |

## Artifact hashes

| Artifact | SHA-256 |
|---|---|
| Production interior | `b7c78c58fbaef8c4120934135c8b2323d2aa81238484adf310a61b5f767b0160` |
| Approved interior (shipped to KDP) | `f9f5f2b54265b49cf3311f2a15b81cb23fbc0899026d2d9cc983f46f917cc699` |
| Approved cover | `222a423b4da1c0f099eb401ef692a55507a0bff32cbf7fda86596ddcaadfad74` |

**The PDF byte hashes differ, and that is expected.** PDF serialization and the point
at which running heads and folios are emitted into the content stream vary between
runs; the bytes are not a stable identity for a rendered book. Equivalence was
established on content and layout instead:

- page 1 **identical** to the approved artifact, carrying the approved subtitle
- body text pages 2–126 **identical** — 174,884 characters, character for character
- figure geometry **identical** on every page — 9 figures, same placements
- blank pages, page count and page sizes all match

The cover is unaffected: the count held at 126, so the 0.315 in spine it was built
against remains correct. Cover assets were not regenerated or modified at any point.

---

## What this book proved

The manuscript had hashes and a gate at every hop. The brief did not — title,
subtitle, trim, paper, profile were typed into a script once and copied forward. The
only thing that diverged in production was the one thing nothing hashed.

A promotion workflow carrying `canonical → working → assets → transformations →
layout standard → render` would still have shipped that defect. **The promoted
package has to include the brief**, and a book should not be callable
production-ready when its own metadata does not match the approved artifact's.
