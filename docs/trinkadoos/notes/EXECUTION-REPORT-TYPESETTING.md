# Execution report — Trinkadoos typesetting

**Date:** 2026-09-04 · **Role:** production / pagination
**Ten standalone 32-page picture books · 8.5 × 8.5 in · all ten typeset and proofed**

---

## 1. Commit — validated layout-export fixes

```
dcb8703  fix(layout-export): keep reading-edition apparatus out of the layout file
branch   fix/layout-export-apparatus   (repo: manuscript agents app)
```

1 file changed, +128 / −6. Repo clean after commit. Branched rather than committing
straight to `master`.

## 2. The typesetting system I found, and where it lives

Not built — **found and reused**. The trail: `before-you-need-it/RUNBOOK.md` states plainly
*"All production scripts live in the OTHER repository"* and names it.

```
C:\Users\jovan\Downloads\wildlands agents platform\backend
```

It is a full book-production pipeline: ingestion → manifests → pagination → planner →
generation → review → upscale → **stage-6-layout** → **stage-7-pdf-compile** → epub, with
`page-qa/` and `print-prep/` beside them. The renderer is **Chromium + Paged.js**:
`stage-6-layout/render-pdf.ts` exposes `renderHtmlToPdf(html, geometry)` — standalone, no
database, no network, no paid call. `stage-6-layout/page-geometry.ts` turns any trim + bleed
into exact page and text-frame dimensions.

**How the system handles multiple titles:** one config per book, in `backend/scripts/`.
`before-you-need-it-config.ts` is the reference implementation, and its header says why —
its proof script and page-shooter each built their own config, drifted, and the proofs became
*"pictures of a DIFFERENT BOOK from the one being verified."* I followed that pattern exactly.

**What I did not use, and why:**
- The **manuscript-studio** platform has no layout stage at all. Its terminal stage is layout
  export, which ran last session.
- `train-the-dog-youve-got/10-PRODUCTION/lib/` is a ReportLab engine that *flows* nonfiction
  chapters and decides page breaks. A picture book's pagination is **given**, not computed —
  flowing this text would destroy the spread structure the whole book depends on.
- `whole-page-render/` is an explicit experiment, flag-gated off, *"Not replacing the
  production renderer."*

## 3. What I added — two files, the house pattern

| File | |
| --- | --- |
| `backend/scripts/trinkadoos-config.ts` | The one production configuration: trim, margins, the ten titles, palette, load-bearing art, hash locks |
| `backend/scripts/trinkadoos-proof.ts` | Parses the brief, builds the 32-page HTML, renders, normalizes print boxes, gates |

No pagination engine was written. Pagination comes from the brief; the script asserts the
render agrees with it.

## 4. Page geometry actually used

| | |
| --- | --- |
| Trim | **8.5 × 8.5 in square** — from the brief's own FORMAT SPEC, not chosen here |
| Bleed | 0.125 in |
| Page (MediaBox) | **8.625 × 8.75 in** = 621 × 630 pt |
| TrimBox | 612 × 612 pt, offset 0 pt on recto, 9 pt on verso |
| Text-safe frame | 7.375 × 7.500 in |
| Margins | 0.5 in head/foot/fore-edge · **0.625 in gutter** |
| KDP safe zone | 0.25 in |
| Extent | 32 pp — pp. 1–2 front matter · p. 3 opener · pp. 4–31 fourteen spreads · p. 32 closer |
| Body type | 15 pt / 1.42 over a 90%-opacity text-safe panel |

The page is trim **+ one** bleed in width and **+ two** in height: the gutter edge does not
bleed. That is why TrimBox is offset on the verso and flush on the recto.

## 5. Stage executed, and how far it got

`trinkadoos-proof.ts` — render + gate. Book 1 first as the production validation the house
pattern calls for, then **all ten automatically**.

**10 of 10 books progressed. 320 pages rendered. 160 art slots placed. 80 checks, 0 failures.**

## 6. Artifacts now on disk — `07-INTERIORS/`

| | |
| --- | --- |
| Ten interior proof PDFs | `TRINKADOOS-01…10-<slug>_interior-proof.pdf`, ~790–800 KB each, 9.0 MB total |
| Machine-readable report | `PROOF-REPORT.json` — geometry, per-title checks, art-slot counts |
| Rasterized proof pages | `_proof-png/` — spot-checked visually, not just counted |

## 7. Layout QA results

Per title, all ten green:

| Check | Result |
| --- | --- |
| Units parsed from the authoritative brief | 16 / 16 |
| ART blocks present | 16 / 16 |
| Page plan is 32 | 32 |
| **Rendered page count is 32** | 32 — *this is the overflow gate* |
| Brief text === layout manuscript, unit by unit | identical |
| Story words match `BASELINE-MANIFEST.md` | exact, all ten |
| Load-bearing art carried | present (Book 7 S2, Book 8 S3) |
| Spreads occupy two pages | 28 / 28 |

**Why page count is the overflow gate.** The extent is fixed at 32. If a text block does not
fit its text-safe zone, Paged.js pushes the overflow onto a new page and the count returns 33
or more — so overflow fails the build by arithmetic instead of passing silently as a clipped
line. `overflow: hidden` would have hidden exactly the defect the render exists to find.

**Independent audit, not the builder's own counters.** Every PDF was re-opened with pdf-lib:
all ten report 32 pages, a single uniform MediaBox of 621.00 × 630.00 pt, and correct per-side
TrimBoxes. 320 pages verified.

## 8. Real defects found and fixed during this stage

1. **MediaBox landed on 621.12 pt where 621.00 was meant.** Chromium converts the CSS inch to
   device pixels and back. 0.0017 in is inside this platform's own 0.01 in preflight tolerance,
   so not a defect — but a printer reads the boxes, not the intent. Added a print-prep pass that
   sets MediaBox exactly and declares TrimBox/BleedBox per side. Verified independently.
2. **Art direction rendered its markdown literally** — `clearly *aware* of them` printed with
   the asterisks, which makes a brief look like a broken file. Now rendered as emphasis.
3. **`PAGE 32` matched as a prefix of `PAGE 3`** in the brief parser, so each title's closer
   silently overwrote its opener. Caught before the first render because the unit count came
   back 15 instead of 16. Ordering the alternation fixed it, and the count check now guards it.

## 9. Illustration asset status — nothing is faked

**Zero illustration assets exist for this wave.** No PNG, JPEG, TIFF or WEBP anywhere in the
project. No art was generated, and none is implied on any page.

Every one of the **160 art slots** is a sized, full-bleed zone printed with:
- its unit label and which half of the spread it is,
- **its own ART block, verbatim from the authoritative brief**,
- the load-bearing requirement in red where one applies,
- the target spec: full bleed · 300 dpi · 8.625 × 8.75 in with bleed.

Book 8 Spread 3 now carries *"Ordinary fog beyond the bridge, ZERO WORDS"* printed on the page
itself — the instruction that was silently lost once already is now impossible for an
illustrator to miss.

This respects the pipeline's own separation of layout planning from generation. Art generation
is a **paid** stage and was not run.

## 10. What remains before print-ready interiors

1. **Illustration generation** — 160 spreads. Paid; needs authorization and an art-direction
   pass on style DNA. The frames are proven and waiting.
2. **Art placement** — drop renders into the slots and re-run; the gate is unchanged.
3. **Covers** — ten. `print-prep/cover-print.ts` and the cover-spine tooling already exist.
4. **Front matter** — pp. 1–2 currently carry a title page and a placeholder imprint line.
   Imprint, ISBN and printing line are real decisions, not layout ones.
5. **Font licensing** — the proof uses Georgia and Segoe UI. Commercial print wants an
   unambiguous licence; the picture-book display face is a design decision.
6. **Colour profile** — sRGB ICC embedding is a Ghostscript post-process, noted as a host step
   in `stage-7-pdf-compile`.

## 11. Blockers

**None.** No paid call was made; spend this session **$0.00**. No approved prose was changed, no
baseline touched, no art brief touched.

**Two things to know, neither blocking:**

- **The wildlands repo's typecheck was already red before I arrived** — 4 pre-existing errors in
  `src/pipeline/stage-8-epub/kindle-layout.ts`, and its working tree already carried unrelated
  modifications to `CLAUDE.md`, `README.md`, `package.json` and others. **My two files
  contribute zero errors.** I did not fix `kindle-layout.ts`: it is unrelated to this work, and
  that repo's own operating rules are emphatic about not widening scope.
- **My two new scripts are uncommitted**, deliberately. That tree's pre-existing modifications
  would be swept into any commit I made there. Say the word and I will commit just those two.
