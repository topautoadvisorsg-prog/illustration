# REVIEW METHOD BETA — permanent evidence ledger

Measured comparison of QA methods on *The Wildlands: Canadian Rockies* (269 pages).
Nothing here is an approval. This is evidence about the **methods**, kept so the
production QA policy is decided by data rather than by whoever argued last.

Raw data: `ocr-calibration.json`, `ocr-screen-45.json`, `vision-calibration.json`.

---

## Methods under test

| Method | Cost/page (measured) | Notes |
|---|---|---|
| Human visual inspection via Claude | **~$1.50** | Scales badly; image context is re-sent every turn |
| Local OCR text-fidelity gate | **$0.00 external**, 11.6s | `tesseract.js`, `ocr-text-fidelity.ts` |
| OpenAI vision review | **$0.00216** | `gpt-4.1-mini`, temp 0, reviewer v3 |

The long-quoted `~$0.045/call` figure for vision review was **wrong by 21x**. It was
derived from a failed 2026 sweep that ran on `gpt-5.5`, a reasoning model billing
hidden reasoning tokens. Under the current config a full 269-page sweep costs
about **$0.58**.

---

## Three-way calibration, 2026-08-08

Ground truth established by zoomed inspection of the actual render.

### `CH07_P012_m` — LAYOUT_D_PURE_TEXT

Four real defects confirmed in the render:

| Source | Printed | OCR | Vision |
|---|---|---|---|
| `control any bleeding` | `contrcl` | caught | caught |
| `walk out; an unstable` | `out,` | caught | **missed** |
| `further danger; keep` | `danger,` | caught | caught |
| `through it; draining` | `it,` | caught | **missed** |

OCR false positives: 2 (`self-evacuation.` and `"donut"`, both correct on the page).
Vision false positives: 0. Vision false negatives: **2**.

**The semicolon-to-comma corruption is real and systematic, not an OCR artifact.**

### `CH08_P008` — LAYOUT_15_PROGRESSION_STUDY (operator-approved)

| Method | Verdict |
|---|---|
| Operator (2026-08-04, 3 iterations) | APPROVED |
| OCR | 82.3%, case-level differences only |
| Vision, reviewer v1 (`gpt-5.5`) | **54 issues, claimed body text missing** |
| Vision, reviewer v3 (`gpt-4.1-mini`) | **0 issues, pass** |

The structured-instructional-page failure is **fixed** by the v3 reviewer change.
Three-way agreement.

### `CH06_P006_c1` — LAYOUT_2_TEXT_HEAVY (OCR cannot read this layout)

Vision reported `transeeiver -> transceiver`. The render prints **`transceiver`,
correctly**. Vision false positive: 1. No defect confirmed on this page.

---

## What each method is good at

| Defect class | OCR | Vision |
|---|---|---|
| Letter-level misspelling | catches | catches |
| Punctuation substitution | **catches reliably** | **misses ~2/3** |
| Overprinting / collapse | catches (score collapses) | untested |
| `LAYOUT_2_TEXT_HEAVY` | **cannot read** | 1 sample, produced a false positive |
| Structured instructional pages | scores low, case artifacts | v3 passes correctly |
| Composition, trim, bleed, artwork labels | **cannot judge** | **untested** |

**Neither method clears a page for publication.** Both check text fidelity only.

---

## Consequence for existing evidence

194 pages currently carry `reviewed CLEAN` from the vision reviewer. That reviewer
has now demonstrably **missed 2 of 3 real punctuation defects** on a page it saw.
`reviewed CLEAN` therefore does not establish punctuation fidelity on those pages,
and the OCR screen is the stronger evidence for that defect class.

---

## Open

- 11 `LAYOUT_2_TEXT_HEAVY` pages: no working automated method. Marked
  `TEXT FIDELITY — REQUIRES VISUAL REVIEW`.
- 4 pages OCR could not read (3 front matter + `CH07_P006`), cause unexplained.
- 8 pages OCR flagged for semicolon substitution are now **likely real defects**
  given the `CH07_P012_m` finding, and are not yet confirmed individually.
