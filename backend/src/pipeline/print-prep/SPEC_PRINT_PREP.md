# SPEC — Print-Prep Standardization (STD-3)

**Status:** draft — awaiting operator sign-off. No code until approved.
**Owner module:** Print-Prep (Standard v1.2). Owns the PHYSICAL output — DPI,
bleed, upscale, the badge/folio **stamp act**, KDP preflight, output format.
Does NOT own badge design (Badge System, STD-2), colour (PALETTE), or geometry
authority (Layout — Print-Prep *reads* the trim/safe-zone, doesn't define it).
**Flag:** reuses `WHOLE_PAGE_EXPERIMENT_ENABLED` (no new flag).
**Deps:** `sharp` (upscale + SVG raster + composite) and `pdf-lib` (PDF) — both
already in the project; no new dependencies.

---

## 1. Purpose

Turn ONE generated whole-page render (1024×1536 PNG, ~120 DPI) into a
**KDP-ready single-page print file** — 300 DPI, full-bleed, with the STD-2
badges and the page folio stamped on deterministically. This is the stage that
makes a generated page *printable*. (Stitching pages + front matter into a whole
book is the next move — Assembly. STD-3 produces the per-page print file.)

---

## 2. Input → Output

**Input:** a `whole_page_renders` row (any `RENDERED`; book assembly later uses
only `active && approved_for_book`) →
- its generated PNG (from storage),
- the page's `badgeSet` (manifest),
- the page's folio label (`page_label`; for now body pages get an arabic number,
  front-matter labels arrive with the Front Matter build).

**Output (stored under `print-ready/<pageKey>-<renderId>.*`):**
- `*.print.png` — 2625×3375, 300 DPI, full-bleed
- `*.print.pdf` — single page, 8.75×11.25 in, the PNG embedded at exact size
- a **preflight report** (JSON) — pass/fail + every check

---

## 3. Pipeline (deterministic, no AI, no spend)

```
load render PNG
  → UPSCALE: sharp lanczos3 → height-fit to 3375px
  → LETTERBOX: pad sides to 2625px with PALETTE.parchment (Standard colour)
  → STAMP BADGES: badgesForPage(badgeSet) → raster each SVG at 2× (≈600 DPI) →
                  composite at the Layout-derived corner rect (per `order`)
  → STAMP FOLIO: render page_label (serif, PALETTE.ink) at the folio position
  → EXPORT: write 300-DPI PNG; embed in a single-page PDF (pdf-lib)
  → PREFLIGHT: assert KDP rules; attach report
```

- **Upscaler = Lanczos** (sharp `kernel: 'lanczos3'`). Deterministic, faithful;
  NOT an AI upscaler (would hallucinate the baked-in text). Matches the proven POC.
- **Letterbox colour = `PALETTE.parchment` (#E0C8A0)** — the Standard's paper.
  (The model is instructed to paint this exact paper, so the seam should vanish;
  any visible seam is a model-conformance defect that QC-1 will catch — not a
  print-prep problem.)

---

## 4. Badge stamp geometry (reads Layout's reserved zones)

- `BADGE_PLACEMENT.safeZoneIn = 0.9` → a 0.9in (270px @ 300 DPI) square inset
  into each bottom corner, inside the KDP trim-safe area.
- **bottom-left:** the region badge, centred in the left safe square.
- **bottom-right:** the hazard stack (order 0 outermost/top) then the source
  seal beneath, fitted within the right safe square.
- Each badge SVG is rasterized at ~2× its target pixel size, then downscaled in
  the composite → crisp small line-art (the reason STD-2 chose 600 DPI badges).
- Badge target sizes from STD-2 constants (region ≈0.55in, hazard ≈0.5in,
  source ≈0.32in), all ≤ the safe square.

## 5. Folio (page number) rules

- **Position:** bottom-centre, ~0.5in up from the trim edge, inside the safe area.
- **Style:** the Standard serif, `PALETTE.ink`, small.
- **Scope (v1):** body pages get an arabic folio. Front-matter roman folios +
  "no folio on cover/title/copyright" arrive with the Front Matter build (the
  label is supplied per page; Print-Prep just stamps whatever `page_label` says,
  or nothing when it's null).

## 6. KDP preflight gate (blocks export on failure)

| Check | Rule |
|---|---|
| Dimensions | exactly 2625×3375 px |
| DPI metadata | 300 |
| Trim + bleed | 8.75×11.25 in canvas (= 8.5×11 trim + 0.125 bleed) |
| Colour mode | RGB (KDP interior accepts RGB) |
| File format | PNG (lossless) + PDF |
| File size | within KDP limits |
| Content-in-safe-area | badges/folio inside the KDP safe zone |

Any failure → `preflight.passed = false` with the specific failures; the row is
not marked print-ready. (Cover-as-separate-wrap + spine-width math are an
Assembly/cover concern, deferred — noted, not built here.)

---

## 7. Surface

- New module `pipeline/print-prep/` — `print-prep.ts` (the pipeline),
  `badge-geometry.ts` (pure corner-rect math), `preflight.ts` (pure checks).
- Route (flag-gated): `POST /api/experimental/whole-page-render/:renderId/print-prep`
  → returns `{ printPngPath, printPdfPath, preflight }`.
- Persists the print paths on the render row (new nullable columns
  `print_png_path`, `print_pdf_path`, `preflight_passed`) — additive migration.

## 8. v1 scope vs deferred

**In v1:** upscale + letterbox + badge stamp + folio stamp + PNG/PDF export +
preflight + the route + persistence.
**Deferred:** cover wrap + spine math (Assembly/cover), 600-DPI page option,
IngramSpark/other-printer profiles, CMYK conversion. Book-level PDF stitch =
the Assembly move (next).

## 9. Tests

- **Pure, no I/O:** badge-geometry corner rects (region left, hazard stack +
  source right, all inside the 0.9in safe square); preflight pass/fail logic.
- **Integration (no spend — pure image processing on a tiny fixture PNG):**
  print-prep produces a 2625×3375 / 300-DPI PNG and a single-page 8.75×11.25
  PDF; a badged page composites without error; a NONE-hazard page leaves the
  right corner with only region+source.
- tsc clean; full suite green.

## 10. Open questions for operator

1. **Letterbox colour:** `PALETTE.parchment` (standardized, my pick) vs
   edge-sampled-from-the-render (seamless even if the model drifts)? I recommend
   **PALETTE.parchment** — standardization over papering-over model drift; QC-1
   catches drift.
2. **Folio position:** bottom-centre 0.5in up — confirm, or prefer outer-corner
   folios?
3. **Print-prep trigger:** allow on any `RENDERED` render (deterministic, no
   spend, good for preview), or restrict to `approved_for_book`? I recommend
   **any RENDERED** (it's free + reversible; assembly still only pulls book-ready).
4. **Aspect handling:** keep height-fit + letterbox (proven, preserves the full
   composition + ornaments), or crop-to-fill the trim (loses edge content)? I
   recommend **letterbox**.
