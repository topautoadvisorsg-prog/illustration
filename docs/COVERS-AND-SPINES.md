# Covers and spines

> **Read this before touching any cover code.** Cover geometry currently has
> **no single authority**. Five implementations disagree, three different
> per-page paper thicknesses are in the tree, and **every verified KDP reading in
> this repository is hardcover**. A wrong spine is scrap paper and a reprint.

---

## The current state, with evidence

| # | Source | Value | Consumers | Shipped covers from it |
|---|---|---|---|---|
| 1 | `stage-6-layout/render-html.ts` — `PAGE_THICKNESS_IN` via `computeCoverDimensions` | `white 0.002252`, `cream 0.0025`, clamped `max(0.06, …)` | delivery-check, cover-geometry, readiness, cover-spine-repair, render-chapter, whole-page routes | **Every shipped paperback** |
| 2 | `publishing-standard/kdp-cover-specs.ts` — `VERIFIED_SPECS` | 4 measured readings + a linear model that self-checks to 0.001in and refuses if it misses | cover-preflight, 4 book scripts | Hardcover attempts only |
| 3 | `print-prep/paperback-preview.ts` | `PER_PAGE = 0.002347` (Premium Color), as a **default** | Preview guides | None known |
| 4 | `cover/cover-preflight.ts` | Literal `'0.0025'` / `'0.002252'` in a template string | Report text | Reporting only |
| 5 | Per-book scripts | `0.002252` (National Parks) and `0.0025` (DIRT RICH) | Their own book | National Parks paperback, DIRT RICH |

Sources 1 and 5 agree numerically **today**. They are copies, so they agree by
luck rather than by construction. Source 3 is the dangerous one: it defaults to a
colour-paper thickness regardless of what the book is actually printed on, unless
the caller passes an override.

### The four verified readings, and what they are missing

```
HARDCOVER  CREAM  6x9    126pp -> 0.504 in
HARDCOVER  WHITE  7x10   269pp -> 0.820 in
HARDCOVER  WHITE  7x10   275pp -> 0.834 in
HARDCOVER  WHITE  6x9    116pp -> 0.450 in
```

**There is not one paperback reading.** Every paperback spine that has gone to
print came from the formula in source 1 — a module inside the track the owner has
classified as legacy — and that formula has never been checked against KDP.

---

## Other duplications, confirmed

| Concern | A | B | Status |
|---|---|---|---|
| Spine band repair | `cover/spine-band-repair.ts` — 477 loc, 8 importers | `stage-6-layout/cover-spine-repair.ts` — 248 loc, 5 importers | Both live, textually different |
| Cover blueprint | `src/pipeline/cover/cover-blueprint.ts` — 246 loc | `scripts/lib/cover-blueprint.ts` — 467 loc, 6 importers | Both live. Two `src/__tests__` files import the **scripts** copy. |
| Spine typography | `publishing-standard/spine-type.ts` — 11 importers | `stage-6-layout/cover-spine-typeset.ts` — 3 importers | Both live |
| Cover PDF emission | — | — | **18 scripts** call `PDFDocument.create` for a cover or wrap |

---

## Rules that hold today and must survive Phase 1

**Fail closed on an unverified spine.** `kdp-cover-specs.ts` refuses to
interpolate a configuration it has no reading for. This has already prevented a
guessed hardcover spine from going to print. Extend the readings; never relax the
rule.

**The barcode reserve is a rectangle, not a row band.** KDP keeps
**2.0 × 1.2in in the bottom right of the back cover**, 0.25in in from the trim.
An earlier check tested every row below the top of that box across the full panel
width and condemned a cover whose only offence was a four-word last line sitting
two inches clear of the barcode. Test the rectangle.

**Page count is read, not passed.** Open the final interior PDF and count. A
typed page count cannot be wrong loudly.

**Artwork and typography stay separate.** Fit and enhance the approved artwork;
never regenerate it. Set in code the type a model cannot be trusted with: the
spine, the author name, anything bounded by a fold.

**Every build emits a guide proof.** Not a pass/fail line — an image with trim,
safe area, folds and the barcode rectangle drawn on the actual wrap. Every cover
defect found so far was found by looking at one of these.

---

## Geometry reference

For a perfect-bound paperback:

```
wrap width  = bleed + trim_width + spine + trim_width + bleed
wrap height = bleed + trim_height + bleed
spine       = page_count x per_page_thickness   (clamped to a 0.06in minimum)
back panel  = [bleed, bleed + trim_width]
spine panel = [bleed + trim_width, bleed + trim_width + spine]
front panel = [bleed + trim_width + spine, wrap_width - bleed]
```

Worked example, the shipped 7 National Parks paperback:

```
120 pages, 6x9, white, B&W
spine  = 120 x 0.002252            = 0.270240 in
wrap   = 0.125 + 6 + 0.27024 + 6 + 0.125 = 12.520240 in
height = 0.125 + 9 + 0.125         =  9.250000 in
at 300 DPI                          = 3756 x 2775 px
```

Safe margins: type stays 0.25in inside the trim on every panel. Spine type must
clear each fold by more than KDP's 0.0625in fold variance; the house target is
0.075in.

Hardcover is **not** a paperback wrap with a wider spine. The case board adds
width that a paperback wrap can never be re-cut to cover, which is why
`VERIFIED_SPECS` carries hardcover readings separately and why the 116pp
hardcover wrap is quarantined rather than reused.

---

## Phase 1A — DONE. The geometry core is out of Track A.

The figures above no longer live in the legacy renderer. They are now in
`publishing-standard/cover-dimensions.ts`, beside `kdp-cover-specs.ts` and
`spine-type.ts` — named *dimensions* rather than *geometry* because
`cover/cover-geometry.ts` already builds panels and zones on top of them, and two
files with one name in different directories is the confusion this removes.

`stage-6-layout/render-html.ts` re-exports the old names, so Track A keeps
working as a CONSUMER rather than the authority. Eleven geometry imports across
source, tests and book scripts were migrated to the canonical module.

**Zero behaviour change, proven.** `scripts/qa/cover-geometry-equivalence.ts`
captured every figure — spine, wrap, panel and safe boundaries, print canvas,
spine-text eligibility — for twelve configurations covering every shipped
reference book plus the spine-text and thin-block boundaries, before and after.
Byte-identical both ways. 7 NATIONAL PARKS reproduces the wrap that went to
print: 0.270240in spine, 12.520240 x 9.250000in. Frozen as
`src/__tests__/cover-dimensions-golden.test.ts`.

### Each value now has exactly one definition

| Value | Home |
|---|---|
| Paper thickness per stock | `cover-dimensions.ts` `PAGE_THICKNESS_IN` |
| Minimum spine | `cover-dimensions.ts` `MIN_SPINE_IN` |
| Cover bleed | `cover-dimensions.ts` `COVER_BLEED_IN` |
| Spine-text page floor | `cover-dimensions.ts` `KDP_MIN_SPINE_TEXT_PAGES` |
| Verified KDP readings | `kdp-cover-specs.ts` `VERIFIED_SPECS`, still fail-closed |

The 0.002347 Premium Color default in `print-prep/paperback-preview.ts` is
deliberately NOT merged in. It is unverified, and folding it into the authority
would make it look settled. It is a Phase 1B input.

## Phase 1B — NOT STARTED. Specification reconciliation.

The thicknesses remain **recorded behaviour, not established truth**. Phase 1B
establishes paperback authority independently from the current official KDP
specification, calculator and templates, for: paperback B&W white; paperback B&W
cream; premium colour where supported; hardcover case laminate; and the
applicable trim, bleed and hinge rules.

Existing formulas are **regression evidence, not truth**. Where a formula and a
verified reading disagree, the reading wins and the formula is marked unvalidated
for that configuration. The golden test is updated deliberately in that commit,
with the evidence quoted — which is how a later reader can tell an architecture
change from a specification correction.

## The one-command cover workflow — API, defined now, built in Phase 1B/1C

The target: nobody ever again writes a script to answer *"what is the spine for
this final PDF?"* Eighteen scripts currently emit a cover PDF; this replaces all
of them.

```ts
buildCover({
  interiorPdf: string;                    // PATH — the page count is READ from it
  binding: 'paperback' | 'hardcover';
  trim: { widthIn: number; heightIn: number };
  paper: 'white' | 'cream' | 'premium-colour';
  bleedIn?: number;                       // defaults to the KDP cover bleed
  artwork: string;                        // approved wrap art, identified by hash
  title: string;
  author: string;
  outDir: string;
}): Promise<CoverBuildResult>
```

**There is no `pageCount` parameter, deliberately.** A cover that cannot find its
interior does not build. A typed page count cannot be wrong loudly, and a wrong
spine is scrap paper and a reprint.

```ts
interface CoverBuildResult {
  pageCount: number;                      // read from the interior PDF
  spine: { widthIn: number; provenance: 'verified-kdp-reading' | 'validated-formula' };
  wrap: { widthIn: number; heightIn: number; widthPx: number; heightPx: number; dpi: number };
  panels: { back: Rect; spine: Rect; front: Rect };
  safe: { back: Rect; spine: Rect; front: Rect };
  folds: { leftIn: number; rightIn: number; varianceIn: number };
  hinges?: { leftIn: number; rightIn: number };   // hardcover only
  barcodeSafe: Rect;                      // a RECTANGLE, never a row band
  spineText: { eligible: boolean; placement?: Rect; clearancePerSideIn?: number };
  artifacts: {
    wrapPdf: string;                      // the production file
    guideProof: string;                   // trim, safe, folds, barcode drawn on the real wrap
    validationReport: string;
  };
  sha256: string;                         // of the production PDF, hashed from the written file
  validation: { pass: boolean; findings: Finding[] };
}
```

### Rules the implementation must keep

- **Spine provenance is reported, never assumed.** `verified-kdp-reading` where a
  measured reading exists for that exact configuration; `validated-formula`
  where the formula has been checked against readings; **otherwise the build
  refuses.** `kdp-cover-specs.ts` already fails closed this way and has already
  prevented a guessed hardcover spine.
- **Paperback and hardcover call the same geometry authority** with a format
  discriminator. They currently share nothing, which is why there are eleven
  hardcover scripts.
- **Artwork is fitted and enhanced, never regenerated.** Type a model cannot be
  trusted with — the spine, the author name, anything bounded by a fold — is set
  in code over it.
- **Every build emits a guide proof.** Not a pass/fail line: an image with trim,
  safe area, folds and the barcode rectangle drawn on the actual wrap. Every
  cover defect found so far was found by looking at one of these.
- **The hash comes from the written file**, never from a build log.

### Phasing

| Phase | Work |
|---|---|
| **1A** | ✅ Extract the geometry core out of Track A. Zero behaviour change, proven byte-identical on 12 shipped configurations. |
| **1B** | Reconcile the thicknesses against the current official KDP specification, calculator and templates. Paperback B&W white, paperback B&W cream, premium colour, hardcover case laminate, and the trim/bleed/hinge rules. Existing formulas are regression evidence, not truth. |
| **1C** | The one-command workflow above, replacing the 18 cover scripts. |
