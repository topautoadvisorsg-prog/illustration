# SPEC — Book Assembly (KDP Interior PDF)

**Status:** draft — awaiting operator sign-off. No code until approved.
**Owner module:** Book Assembly. Owns spine ordering, page merge, the interior
PDF, validation, and the assembly report. READS (defines none of):
book-ready renders (`whole_page_renders`), their print PDFs (STD-3), and page
order (the `pages` table / front-matter spine order when built).
**Flag:** reuses `WHOLE_PAGE_EXPERIMENT_ENABLED`.
**Deps:** `pdf-lib` (merge) — already present. No new dependencies.

---

## 0. What this is — and what it is NOT

**Is:** stitch the approved, print-prepped, preflight-passed pages into **one
KDP interior PDF**, in spine order, with a validation gate and a report.

**Is NOT:**
- **Not the cover.** KDP paperback cover is a SEPARATE wrap file (back + spine +
  front) whose spine width depends on the final page count. Assembly *produces*
  that page count and hands it off; the cover wrap is a later, separate artifact.
- Not image generation, not print-prep (it consumes STD-3's output).
- Not EPUB (deferred).
- Not a frontend.

---

## 1. Input → Output

**Input:** a project id. Assembly gathers the project's pages in spine order and,
for each, the single book-ready render.

**The book-ready render query (exact):**
```
whole_page_renders WHERE
    project_id = :id
AND active = true
AND approved_for_book = true
AND preflight_passed = true
```
(`select-for-book` already guarantees ≤1 active+approved_for_book render per page;
this query adds the `preflight_passed` gate.)

**Output:**
- `exports/<projectId>/interior-<runId>.pdf` — the merged KDP interior PDF.
- An **assembly report** (JSON) — pages included, order, every validation, the
  final page count, blocked/ok.

---

## 2. Spine ordering

The book spine (target): `Cover · Title · Copyright · Contents · Chapters · Back matter`.
The cover is excluded (separate file); the rest are interior pages.

**Ordering source (graceful, forward-compatible):**
- **When front matter is built** (the `pages.section` + `pages.spine_order`
  columns from the Front Matter SPEC exist): order by `spine_order`
  (FRONT_MATTER < BODY < BACK_MATTER).
- **v1 (front matter not built yet):** order body pages by
  `(chapterNumber, plannedPageNumber)`. Assembly emits an interior of body pages
  only and the report flags `frontMatter: 'absent'`.

A single `pageSpineOrder(page)` resolver encapsulates this so the merge code
never changes when front matter lands.

---

## 3. Merge

`pdf-lib`: create a fresh `PDFDocument`; for each page in spine order, load its
render's `print_pdf_path` (a single-page 8.75×11.25 PDF from STD-3), `copyPages`
its one page, `addPage`. Save → the interior PDF buffer. (Same primitive the
legacy `stitch-book.ts` uses, but Assembly is a NEW module reading the
whole-page print PDFs — legacy untouched.)

---

## 4. Validation gate (runs BEFORE the merge; blocks on failure)

Per the operator's required checks. **If ANY required check fails, no interior
PDF is produced** — the report lists exactly what's wrong.

| Check | Rule | On fail |
|---|---|---|
| **every page has a book-ready render** | each `pages` row in scope has one render matching the query | list the missing pageKeys → BLOCK |
| **every page has print-prep output** | render `print_pdf_path` not null | list pages → BLOCK |
| **every page passed preflight** | render `preflight_passed = true` | list pages → BLOCK |
| **page dimensions** | each print PDF page MediaBox = 8.75×11.25 in (630×810 pt) | list offenders → BLOCK |
| **trim/bleed consistency** | all pages share the same MediaBox | list outliers → BLOCK |
| **page count** | assembled count == expected count (pages-in-scope) | report mismatch → BLOCK |
| **no spine gaps** | the ordered set has no missing position | list gaps → BLOCK |

"Expected count" = the project's pages rows in scope (body-only in v1; +front
matter when built).

---

## 5. Assembly report shape

```jsonc
{
  "projectId": "...",
  "runId": "...",
  "blocked": false,
  "frontMatter": "absent",          // 'absent' | 'included'
  "expectedPages": 129,
  "assembledPages": 129,
  "spine": [                         // ordered
    { "position": 1, "pageKey": "CH01_P001", "renderId": "...", "printPdfPath": "..." }
  ],
  "validations": [
    { "name": "every_page_book_ready", "ok": true, "detail": "129/129" },
    { "name": "page_dimensions", "ok": true, "detail": "all 8.75×11.25in" }
    // …
  ],
  "missing": [],                     // pageKeys with no book-ready render
  "preflightFailures": [],           // pageKeys whose render failed preflight
  "interiorPdfPath": "exports/…/interior-<runId>.pdf",  // null when blocked
  "finalPageCount": 129,             // handed to the cover stage for spine width
  "finalTrim": { "trimIn": {"w":8.5,"h":11}, "bleedIn": 0.125 }
}
```

---

## 6. Surface + persistence

- Route (flag-gated): `POST /api/experimental/whole-page-render/project/:projectId/assemble`
  → returns the assembly report (+ writes the interior PDF when not blocked).
- A `GET …/assemble/report` may follow, but v1 returns the report inline.
- **Persistence:** record the run in the existing `exports` table
  (`exportKind = 'PREMIUM_PDF'`, `exportStatus = READY | FAILED`, artifact path).
  No new table; the exports table exists for this. (Confirm in Q.)

---

## 7. v1 scope vs deferred

**In v1:** the book-ready query, spine ordering (body-only + front-matter-ready
resolver), pdf-lib merge, the full validation gate, the report, the interior PDF
artifact, the route, `exports` persistence.

**Deferred:**
- **Cover wrap + spine-width math** (separate file; needs the page count this
  stage produces) — the next artifact after Assembly.
- **Front-matter pages** (built by the Front Matter move; Assembly already
  resolves their order when they exist).
- **KDP even-page / min-page-count padding** (paperback rules) — flagged in Q.
- **EPUB / other formats.**

---

## 8. Tests

- **Pure:** spine-order resolver (body-only by plannedPageNumber; front-matter
  spine_order when present); validation logic (missing page, failed preflight,
  dimension mismatch, count mismatch → blocked with the right report).
- **Integration (no DB, no spend):** given 2–3 fixture single-page PDFs at the
  correct size, merge → one PDF with the right page count + consistent MediaBox;
  a fixture at the wrong size → BLOCKED with `page_dimensions` failure.
- tsc clean; full suite green.

---

## 9. Open questions for operator

1. **Spine order in v1:** body pages by `(chapterNumber, plannedPageNumber)` —
   confirm. (Front matter integrates automatically when its columns exist.)
2. **`exports` table:** record each assembly run there (`PREMIUM_PDF`), or keep
   the artifact path on disk + in the report only for now? I recommend **use the
   exports table** — it's purpose-built and gives an audit trail.
3. **KDP page-count padding:** KDP paperback wants specific page-count rules
   (often an even count, a minimum). Should Assembly **pad with blank pages** to
   satisfy that, or only **report** the requirement and leave padding to a later
   pass? I recommend **report-only in v1**, pad later (padding interacts with
   front-matter numbering).
4. **Partial assembly:** hard-block on any missing/failed page (my pick, matches
   your "block export if any required page fails"), or allow a `draft: true`
   interior that skips missing pages for preview? I recommend **hard-block**, with
   a clear report of what's missing so the operator can fix those pages.
