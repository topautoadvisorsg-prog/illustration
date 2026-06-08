# SPEC — QC-1: Text Fidelity Verification (production-grade)

**Status:** audit + design. No code. Awaiting direction.
**Why this is the #1 risk:** the whole-page model bakes text into PIXELS. There
is no structured text layer to diff. Without verification we ship books with
misspelled chapter titles, dropped clauses, wrong elevations, or — worst for a
hazard guide — a corrupted "DEADLY" warning. At hundreds of books × thousands of
pages, human word-by-word review is impossible. QC must be automated.

**The deeper finding (see §11):** text fidelity is not a render-only concern. It
is an **end-to-end invariant** — every word of the manuscript should be traceable
to a rendered page. That invariant is guarded at **0 of 3** checkpoints today
(breakdown, pagination, render). QC-1 closes the render checkpoint and defines the
pattern for the other two.

---

## 1. How we verify rendered text matches source

We always hold the ground truth: the render's `spec_json.pageText` (title +
**verbatim** body) is exactly what the model was instructed to produce. QC
compares OCR-of-the-render against that stored spec — not the raw manifest — so
the comparison anchors to "what we asked for."

```
source = spec_json.pageText (title hierarchy + body)   ← ground truth
         → normalize (strip markdown, collapse whitespace, unicode-fold)
rendered PNG → OCR → raw text → normalize
         → SEQUENCE-ALIGN source vs OCR (order matters, not set compare)
         → CLASSIFY discrepancies (§4)
         → SCORE fidelity (title + body, weighted)
         → GATE (§3) → PASS / REVIEW / FAIL
```

Normalization is critical: the source body is **markdown** (`**bold**`,
`*italic*`, `*Binomial*`, headings); the page shows formatted text. Strip
markdown to the visible text before comparing. Drop-cap (oversized first letter)
and ornaments must be tolerated by the OCR config.

---

## 2. OCR options & accuracy

| Engine | Accuracy on stylized serif/parchment | Cost | Notes |
|---|---|---|---|
| **Tesseract** (self-host) | ~90–96%; struggles with drop caps, low-contrast, decorative type | free | false-fail risk on good pages; needs tuning (PSM, serif data) |
| **Google Cloud Vision** | ~98–99%, robust to fonts/layout | ~$1.50 / 1000 pages | external dep + latency; best accuracy |
| **AWS Textract** | ~98%+, document-tuned | similar | layout-aware |
| **Azure Read** | ~98% | similar | comparable |

**The central tension:** OCR has its OWN error rate. An OCR misread of
correctly-rendered text = **false FAIL** (wasted regeneration). OCR failing to
read good text = false FAIL. So **OCR accuracy directly determines whether the
gate is trustworthy.** A cheap-but-noisy OCR poisons the gate.

**Recommendation:** cloud OCR (Google Vision) for production. Rationale: a page
costs ~$0.0015 to OCR vs. ~$0.04+ to regenerate and vs. shipping a defective
book. Accuracy of the gate matters more than its cost. **Architect OCR behind a
provider interface** (Tesseract / Vision / Textract pluggable) so we can swap or
A/B providers. OCR the **highest-resolution** image available (the 2625×3375
print PNG, or even a 600-DPI re-raster) — resolution raises accuracy.

**Dual-OCR disambiguation (key technique):** run two engines (or one engine
twice). If both agree a word is wrong → real render error. If they disagree →
likely OCR noise → route to REVIEW, not auto-FAIL. This separates model defects
from OCR defects, which is the hardest part of the whole problem.

---

## 3. Page-level PASS / FAIL gates — three states, not two

| State | Meaning | Action |
|---|---|---|
| **PASS** | title exact + body fidelity ≥ pass threshold + no critical error | eligible for approval / select-for-book |
| **REVIEW** | borderline (OCR noise suspected) or minor cosmetic diffs | human eyes; not auto-regenerated |
| **FAIL** | below threshold OR any critical error class | blocks select-for-book; regenerate (or operator override w/ logged reason) |

Three states matter: a binary PASS/FAIL would auto-regenerate pages that OCR
merely misread, burning image credits on false failures. REVIEW absorbs OCR
uncertainty.

**Hazard-weighted gate:** a page carrying a `DEADLY`/`TOXIC`/`VENOMOUS` badge
gets the strict gate — its warning text must be exact. (Ties QC to the badge
system: hazard pages can't ship with corrupted warnings.)

---

## 4. Error classification (from word-level sequence alignment)

| Class | Definition | Default severity |
|---|---|---|
| **Missing words** | in source, absent in OCR (deletion) | HIGH (model dropped text — or OCR failed) |
| **Substituted words** | a different word in place of the source word | HIGH; **CRITICAL** in hazard/numeric context |
| **Inserted words** | in OCR, not in source (hallucination) | CRITICAL (model invented text) |
| **Punctuation changes** | comma/period/quote/dash differences | LOW (often OCR noise) |
| **Paragraph structure** | merged/split paragraphs, lost line breaks | MEDIUM (model restructured) |
| **Numeric/measurement mismatch** | "6,288 feet" → "6,388 feet" | **CRITICAL** (factual defect) |

Each error carries: class, source token, observed token, position, and an
OCR-confidence flag (was the observed token low-confidence → likely OCR, not
model). Numbers and measurements are tokenized specially and require exact match
(a wrong elevation or wind speed is a factual error, not a typo).

---

## 5. Acceptance thresholds (calibrated, not guessed)

- **Title hierarchy:** exact match (normalized) required. Any title error → FAIL.
  (A misspelled chapter title is the most visible possible defect.)
- **Body word-level fidelity:** PASS ≥ **97%**, REVIEW **92–97%**, FAIL < **92%**.
- **Zero tolerance →** auto-FAIL regardless of %: any *inserted* word
  (hallucination), any *substituted/missing* word inside a hazard sentence, any
  numeric/measurement mismatch.
- **Calibration is mandatory:** before locking thresholds, OCR a set of
  known-good rendered pages to measure the **OCR noise floor** (its own error
  rate on our exact style). The render-error threshold must sit ABOVE that floor,
  or every page false-fails. Thresholds are config, tuned per OCR provider.

---

## 6. How failed pages are surfaced to the operator

A `qc_result` per render stores: status, fidelity (title/body/overall), the OCR
text, the classified error list (with positions + OCR-confidence), and the OCR
provider/version.

Operator surface (frontend later) shows, per page:
- the rendered page, the **source text**, the **OCR text**,
- a **visual diff** — missing (red), inserted (orange), substituted (yellow),
- the fidelity score + the recommendation (approve / regenerate / review).

Batch view: every page with its QC status, sortable by fidelity, with a count —
**"N pages require regeneration"** (the operator's work queue). FAIL blocks
`select-for-book` unless the operator overrides with a logged reason (mirrors the
existing approval gate).

---

## 7. Integration with the pipeline (where QC runs + what it gates)

```
render (RENDERED)
   → QC-1 runs automatically (OCR the generated image) → qc_status on the render
   → FAIL blocks select-for-book (override = logged)
approve → select-for-book   (requires QC PASS or override)
   → print-prep              (no point print-prepping a QC-failed page)
   → [optional] QC re-check on the 300-DPI print PNG (higher res = more accurate)
assembly  → NEW gate: every page must be QC-PASS (or overridden) AND preflight-passed
```

- **Render:** QC is an automatic post-render step; result attaches to the
  `whole_page_renders` row. It becomes a gate before approval.
- **Print-prep:** runs only on QC-passed (or overridden) pages. Optionally
  re-verifies on the higher-res print image.
- **Assembly:** adds a `every_page_qc_passed` validation to the existing gate —
  a QC-failed, non-overridden page **blocks the interior PDF**.

Gates now chain: render → **QC** → approval → print-prep → assembly(preflight +
QC). QC slots in as the missing correctness gate.

---

## 8. Metrics (operator + platform)

**Per page:** fidelity % (title / body / overall), error counts by class,
qc_status, regeneration attempts.

**Per book/project:**
- **First-pass yield** — % of pages PASS on the first render (the key
  model+prompt health metric).
- **Pass rate**, **error rate** (errors/page), **avg fidelity**.
- **Pages requiring regeneration** (the operator work queue).
- **Regenerations-to-pass** (how many tries per page; cost driver).

**Platform-wide:** first-pass yield trend, dominant error classes (tells us what
to fix in the prompt/Standard), OCR confidence trends, regeneration cost.

These metrics make the platform *measurable*: "is the render quality good
enough?" becomes a number (first-pass yield), and "which pages need work?"
becomes a queue.

---

## 9. Data model (proposed)

A `qc_results` table (1 per render, latest wins) OR columns on
`whole_page_renders`. Proposed table:
```
qc_results(
  id, render_id → whole_page_renders, project_id,
  status ('PASS'|'REVIEW'|'FAIL'),
  fidelity_overall, fidelity_title, fidelity_body,   -- numeric %
  ocr_provider, ocr_text,
  errors_json,                                        -- classified errors
  overridden_by, overridden_reason, override_at,      -- operator override trail
  checked_at, created_at
)
```
Additive migration. Assembly's gate reads the latest qc_result per page.

## 10. Surface

- Runs automatically after render; also `POST …/:renderId/qc` to re-run.
- `GET …/project/:id/qc` → batch QC dashboard data.
- Provider config via env (OCR_PROVIDER, keys). Provider interface:
  `ocr(imageBuffer) → { text, wordConfidences }`.

---

## 11. The bigger finding — text fidelity is an END-TO-END invariant

Text can be lost or corrupted at **three** points; only one is in scope here, and
**none are guarded today**:

1. **Breakdown** (manuscript → manifest, via Claude). Did the manifests capture
   ALL manuscript text? We verified the current book MANUALLY (69,390 words, 0
   dropped). There is no automated check. A different manuscript could silently
   drop a section. → needs a "manuscript coverage" check (every manuscript
   paragraph maps to a manifest).
2. **Pagination** (entry → reading-field splits). Does concatenating every
   paginated page's reading-field text reconstruct the original entry text
   exactly (no dropped/duplicated text at split boundaries)? Unverified. → needs
   a "pagination is lossless" invariant.
3. **Render** (spec → pixels). ← **QC-1, this SPEC.**

**Recommendation:** treat QC-1 as the first instance of a general
**text-fidelity invariant** and add the breakdown + pagination checks (both are
cheap deterministic string comparisons — no OCR, no AI) so the platform can
assert: *every word of the manuscript is traceable, unbroken, to a rendered
page.* That is the real production guarantee a publisher will demand.

---

## 12. Open questions for operator

1. **OCR provider:** Google Vision (accuracy, ~$1.50/1k pages, external) vs.
   self-hosted Tesseract (free, noisier) vs. pluggable-both? (Rec: pluggable,
   default Vision for production accuracy.)
2. **Dual-OCR:** run two engines to separate model errors from OCR noise (more
   cost/latency, far fewer false fails) — yes or single-engine v1?
3. **Thresholds:** accept the proposed 97/92 body + exact-title + zero-tolerance
   classes, or calibrate first against a known-good sample before locking?
4. **Override policy:** can an operator override a QC FAIL to ship a page
   (logged), or is FAIL a hard block requiring regeneration?
5. **Scope now:** build QC-1 (render) only, or also the breakdown + pagination
   fidelity checks (§11) as part of the same effort? (Rec: do all three — the
   other two are cheap deterministic checks and close the real invariant.)
