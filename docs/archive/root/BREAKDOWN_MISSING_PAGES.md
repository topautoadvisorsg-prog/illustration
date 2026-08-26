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

---

# Issues Found Live During the 2026-06-09 Run

(These are NOT front-matter / back-matter gaps. They're operational issues
discovered while driving the headless pipeline. Capturing here so we don't
lose them. Not fixing now.)

## I-1. Supervisor stages use INCONSISTENT OVERFLOW tolerances

- **Pagination stage** allows up to 2 OVERFLOW pages and returns PASS for 1.
- **Text-fit stage** strict-requires `totals.overflow === 0` (in
  `text-fit-preview.ts:180`) and returns BLOCKED for 1.
- Net effect: a project with the by-design compacted page CH06_P006_m
  permanently shows pagination = PASS, text-fit = BLOCKED, supervisor
  verdict = BLOCKED. The operator gets "Resolve flagged pages on the Page
  Plan" but the only flagged page is the one we already decided to accept.
- **Fix direction (not now):** unify the two tolerances OR teach text-fit
  about the pagination tolerance OR add an operator "accept overflow"
  signal that both stages read.

## I-2. No persistent operator-acceptance for known-good OVERFLOW pages

- The previous project (old PROJECT_ID) had CH06_P006_m flagged as an
  operator-review page that we accepted as ship-it. That decision was
  per-project and DID NOT carry across to the re-uploaded project.
- A new manuscript run resurfaces the same overflow as a fresh blocker
  every time.
- **Fix direction (not now):** persist `overflow_accepted_by_operator` as
  a column on the page row, so once an operator says "this is by-design,
  ship it" the decision survives re-runs.

## I-3. `/api/projects/:id/pages` doesn't return fit status

- The list-pages endpoint returns `status` (lifecycle: PLANNED / RENDERED
  / APPROVED) but not the pagination `fitStatus` (PENDING / FITS / TIGHT /
  OVERFLOW / UNDERFILL).
- Today the supervisor snapshot is the only way to learn which pages are
  OVERFLOW. To know individual page fit, the UI must call a second
  endpoint or parse the supervisor report.
- **Fix direction (not now):** add `fitStatus` to the listPages response
  so the Page Plan can color-code rows without a second roundtrip.

## I-4. No batch render endpoint

- Rendering N pages means N separate POSTs to
  `/api/experimental/whole-page-render/:pageId`. For the 4-pick
  verification batch this is fine (4 sequential calls).
- For the full 289-page book this is 289 calls, all serial unless the
  operator scripts a parallel runner.
- **Fix direction (not now):** add `POST /api/projects/:id/render-batch`
  with `{ pageIds: string[], concurrency: number }` and a per-page
  progress stream.

## I-5. Verification-batch readiness gate transitively bubbles up

- The supervisor's "verification-batch readiness" stage returns
  `BLOCKED — upstream blocker(s): Text-fit preview`. So the gate itself
  is fine — but the message points the operator at "upstream stage(s)"
  without saying which one(s) in the next-action label. The verbose
  blocker list is in section 3 of the report; the headline is opaque.
- **Fix direction (not now):** put the upstream blocker stage name in
  the next-action label so the operator sees "Resolve text-fit" not
  "Resolve flagged pages".

## I-6. Page-quality stage produced 34 WARNING items, no surface

- The supervisor reports "Page Quality Review: 0 BLOCKER / 34 WARNING".
- 34 warnings is significant. The operator has no per-page surface in
  the UI today that says "this page has a quality warning of kind X."
- **Fix direction (not now):** expose the page-quality findings in the
  Page Plan row (badge per page) and a filterable list in Control Center.

## I-7. Publishing Director shows "93 auto-fixable NOT applied"

- Director stage reports 93 issues are eligible for auto-fix but the
  policy gate (`policy.director.autoApply`) defaults to OFF.
- This is the correct default per prior decision — but the operator has
  no one-click "review the 93 auto-fix proposals and apply" surface.
- **Fix direction (not now):** expose the auto-fix proposals in Control
  Center with a "review & apply" interaction so the operator can
  resolve them without flipping a global policy bit.

## I-9. Model-name drift between requested and returned

- Proof package shows `input.modelRequested: 'gpt-image-1'` but
  `output.modelReturned: 'gpt-image-2'`. Either OpenAI silently renamed
  the model, OR we're asking for an alias that now resolves to a newer
  model.
- Risk: operator inspecting the proof package sees a mismatch and can't
  tell whether the render was the model they asked for.
- **Fix direction (not now):** either (a) update modelRequested to the
  current alias, or (b) record the resolved-model alias in the spec at
  request time so the proof shows what we *asked OpenAI to use*, not
  what the SDK defaulted to.

## I-10. Per-page render response missing top-level renderId/imagePath

- Drove the render via `POST /api/experimental/whole-page-render/:pageId`
  and parsed `response.renderId` — it came back undefined. Had to hit
  the `/versions` endpoint as a fallback to get the renderId.
- The `createAndRunResult` type DOES include renderId at top level, so
  this is either a serialization issue or the response shape isn't
  matching the type.
- **Fix direction (not now):** add a small response-shape test that
  asserts renderId + status + row.imagePath are top-level on the render
  response.

# Design Observations from First Real Render Batch (2026-06-09)

**Source:** Operator review of 4 rendered pages (CH05_P013 image-top,
CH02_P010 image-right, CH08_P001 pure-text, CH01_P001_c1 continuation).
**Overall verdict:** quality EXCELLENT. Vintage naturalist style and
rendering pipeline are working. Items below are **optimization notes for
a coordinated future design pass**, not fixes-now.

**Collection rule:** keep accumulating observations from more real
rendered pages BEFORE acting. One coordinated layout optimization pass is
better than chasing individual page tweaks after only 4 samples.

## DO-1. Mirrored layout flexibility (composition choice)

Every directional layout should support both orientations and let the
system pick the one that creates the best page rhythm:

- **IMAGE_TOP family:** image-top + text-bottom OR text-top + image-bottom
- **IMAGE_LEFT/RIGHT families:** image-left + text-right OR text-left + image-right

Current layout families pick a side; the operator/system has no signal
that lets us alternate by spread or chapter for visual variety.

**Decision input needed before implementation:** what is "best page
rhythm" — alternate every spread, alternate per chapter, content-driven
(image subject orientation), or operator-controlled per page?

## DO-2. Missing 25% illustration / 75% text accent layout family

Today's families:
- Large illustration (~50%): LAYOUT_B (image top / bottom / left / right)
- Small support (~25% corner): LAYOUT_C (corner top-left / top-right /
  bottom-left / bottom-right)  ← partial coverage
- Pure text: LAYOUT_D

The middle option missing in practice is a **25% image accent** layout
positioned as a true accent (not just a corner), ideal for:

- mushrooms, tracks, leaves, feathers, insects
- tools, small wildlife studies, single botanical specimens
- compass roses, knot diagrams, plant cross-sections

Variations to include:
- top-left accent
- top-right accent
- bottom-left accent
- bottom-right accent

**Note for the future pass:** LAYOUT_C is named "25% Support corner" in
the family labels but rendered output may be reading more like a 50%
illustration than a true 25% accent. Confirm against a larger sample.

## DO-3. Pure-text ornamental mode

`LAYOUT_D_PURE_TEXT` today is fully empty of imagery. Allowed:

- small botanical sketches in the page corners or as section dividers
- pine cones, ferns, oak leaves, acorns, simple herb sprigs
- animal tracks (silhouette / outline)
- small tools (compass, knife, billhook)
- mini-map fragments, contour lines, weather sigils

**Constraint:** ornaments must consume MINIMAL space — text capacity
must remain at or near current LAYOUT_D maximum. The point is decoration
without lowering words-per-page.

**Implementation hint for later pass:** this likely belongs in the
Standard's ornament catalog + a `pureTextOrnamentation: 'none' |
'minimal' | 'decorative'` config field, NOT as a new layout family.

## DO-4. Page-count optimization (289 → ~250 target)

Current paginated total: 289 body pages.
Long-term target: ~250 pages.
Gap: 39 pages (~13% reduction).

Levers to evaluate in the future pass:

| Lever | Mechanism | Estimated impact |
|---|---|---|
| Increased text-heavy pages (LAYOUT_D + ornament) | Higher words-per-page on entries that don't need full illustration | High |
| 25% accent layouts (DO-2) replacing some 50% layouts | Higher text-per-page where image is supportive, not primary | Medium-High |
| Smarter compaction across short entries | Fewer one-entry-per-page singletons | Medium |
| Mirrored layout selection (DO-1) | None directly, but improves rhythm so text density can rise without feeling cramped | Low (indirect) |

**Do NOT optimize before more samples.** Decision-quality improves
significantly with more rendered pages in the sample. Continue
collecting observations across multiple chapters and entry types
(animals, plants, terrain, survival) before the coordinated pass.

## DO-5. (placeholder) Observations queue

Add new design observations from future render batches here. Tag each
with the date and rendered page key so we can trace back to specific
examples. Do NOT consolidate into the items above until the coordinated
design pass runs.

---

## I-15. Local tsc misses errors that production tsc catches

- **Discovered:** 2026-06-09 during L-7.1 deploy.
- The L-7.1 build failed on Railway because `tsc -p tsconfig.json`
  (production build command) caught three type errors in a unit-test
  fixture that local `tsc --noEmit` had silently passed.
- The errors were in
  `backend/src/pipeline/stage-6-layout/__tests__/badge-clip.test.ts`:
    - `priorityEdge: 'top'` — `ArtSlot` requires literal like `'TOP_BAND'`
    - `ImagePriorityZone` was constructed with `xPct/yPct/widthPct/heightPct`
      when it actually requires `xIn/yIn/widthIn/heightIn` plus six other
      pixel/aspect fields
- **Root cause:** local `tsc --noEmit` and the production `tsc -p` resolve
  the test directories differently (suspected: an editor/CI difference in
  module resolution or `include` evaluation). The same code passed locally
  and failed in CI.
- **Impact:** the L-7.1 commit (`b637f95`) sat undeployed for ~30 min while
  I polled the wrong build. Wasted operator time. Fixed by `d79a661`.
- **Recommendation (do not implement now, just log):**
  - Pre-deploy verification should run the **same** command Railway runs:
    `yarn workspace @wildlands/backend build` (which invokes
    `tsc -p tsconfig.json`), not `tsc --noEmit`.
  - Add this as a pre-push git hook OR as a CI gate.
  - If pre-commit, gate at `--type-check` only (still fast enough).
  - For Claudio's own workflow: every L-series change should be verified
    with the production build before push, especially after adding new
    test fixtures.

## I-13. No partial-assembly preview mode

- `POST /api/experimental/whole-page-render/project/:projectId/assemble`
  hard-blocks if any spine page is missing a book-ready render. Correct
  for production. Wrong for verification batches.
- For our 4-page test we got the structured validation report and
  confirmed geometry on the 4 ready pages — but NO assembled PDF to
  open and visually inspect what assembly stitches together.
- **Fix direction (not now):** add `?mode=preview` (or a separate
  `/assemble-preview` route) that emits a partial PDF labelled with a
  watermark "PROOF — N of M pages, NOT SHIPPABLE" so operators can
  inspect partial assembly output during verification batches.

## I-14. Assembly validation verdict field shape

- The structured validation report from `assembleBook` returns each
  check with a `label` and `detail` string but my parser couldn't find
  the PASS/FAIL verdict on the field name I expected.
- Engine made correct decisions; only the report shape made it hard to
  print a clean PASS/FAIL summary.
- **Fix direction (not now):** either standardize the verdict field
  name (e.g. always `verdict: 'PASS'|'WARN'|'FAIL'`) or add a top-level
  `summary.checks.passed/total` so a CLI can render it as a table
  without guessing field names.

## I-12. Geometry / DPI verification (not yet performed)

Status: **PARTIAL PASS — engine-side verified by assembly's own check.**

Step 5 assembly read each of the 4 print PDFs via `readFirstPageDimsPt`
and reported:

- `page_dimensions: all 7.25 × 10.25 in` → matches canvas spec
- `trim_bleed_consistency: uniform` → all 4 PDFs report identical
  trim+bleed values; no drift between pages
- `every_page_preflight_passed: all pages print-prepped` → preflight
  clean across the 4

That's an independent confirmation of MediaBox + TrimBox + BleedBox at
the pipeline layer. The deterministic upscaler in print-prep + the
single-source-of-truth `resolveGeometry()` mean if 1 page passes, all
289 will.

**Still owed (human-side audit, not engine-side):**

- Open one print PDF in Acrobat Pro / pdfinfo and visually confirm the
  bleed area shows artwork (not white) at the edges
- Confirm no transparent margins or off-by-one upscale artifacts
- Confirm effective rendered resolution = 300 DPI uniformly (no
  resampling banding)
- Confirm folio + badge stamps are inside the trim box, not in the
  bleed area

This audit can happen any time before mass-rendering 289 pages — it
does not block another verification batch.

## I-11. Print-prep direct response missing preflight + size fields

- `POST /api/experimental/whole-page-render/:renderId/print-prep` returns
  the print-png and print-pdf paths but NOT `preflightPassed`,
  `widthPx`, `heightPx`, or `dpi`.
- To confirm preflight verdict I had to refetch the proof package, which
  IS authoritative.
- Risk: an integrator might assume the direct response carries the
  verdict and miss the preflight signal entirely.
- **Fix direction (not now):** mirror the proof package's `print`
  envelope in the direct print-prep response so the same shape carries
  all relevant fields without a second roundtrip.

## I-8. Parser's "DEEP_HEADING_IGNORED" only fires for h4+

- §7 above documents that H1s outside `# CHAPTER N` are silently
  dropped. The mirror issue: the parser warns about h4/h5/h6 but says
  nothing about H2/H3 sitting OUTSIDE a chapter scope.
- An H2 sub-section before `# CHAPTER 1` (e.g. `## How to read this
  field guide`) would silently disappear with no warning.
- **Fix direction (not now):** emit a warning for ANY heading offset that
  falls outside every chapter's `[chapterHeading.offset, chapterEnd]`
  range.
