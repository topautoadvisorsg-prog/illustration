# Covers and spines

Every cover figure the platform uses comes from **one module that records where
it came from and when it was read**: `publishing-standard/kdp-spec.ts`. Nothing
downstream holds a literal factor.

---

## Published KDP specification, verified 2026-08-26

Read from Amazon's live documentation on that date. Each value carries its topic
and retrieval date in the module.

### Paperback spine factors — `OFFICIAL_FORMULA`

| Ink | Paper | Factor | Note |
|---|---|---|---|
| Black & white | White | `0.002252` in/page | |
| Black & white | Cream | `0.0025` in/page | |
| Premium colour | White | `0.002347` in/page | |
| Standard colour | White | `0.002252` in/page | **A separate published line.** Equal to B&W white today; do not collapse them, and do not assume it equals premium. |
| Black & white | **Groundwood** | `0.00235` in/page | **NOT published.** Neither help page states a multiplier; both defer to the Cover Calculator. Read from the calculator instead: 120pp → 0.282in and 240pp → 0.564in, both exactly 0.00235. Authority is `OFFICIAL_CALCULATOR_FIXTURE`, never `OFFICIAL_FORMULA`. |

Source: G201953020 — Create a Paperback Cover.

### Paperback static rules — `OFFICIAL_STATIC_RULE`

| Rule | Value | Source |
|---|---|---|
| Bleed, top/bottom/outside | 0.125in | G201953020 |
| Content inside the outside edge | 0.25in | G201857950 |
| Spine text minimum | **more than 79 pages, so 80** | G201953020 |
| Spine text clearance | 0.0625in each side | G201953020 |
| Fold variance | 0.0625in each side | G201953020 |
| Minimum resolution | 300 DPI | G201857950 |

```
Cover Width  = Bleed + Back Cover Width + Spine Width + Front Cover Width + Bleed
Cover Height = Bleed + Trim Height + Bleed
```

### Hardcover static rules — `OFFICIAL_STATIC_RULE`

| Rule | Value |
|---|---|
| Case wrap past the front cover edge | 0.51in |
| Hinge, spine to safe area | 0.4in |
| Text and images from the book edge | 0.635in |
| Barcode | 2.0 × 1.2in, ≥0.76in from the bottom, ≥0.25in from the spine hinge |
| Minimum resolution | 300 DPI |

Source: GDTKFJPNQCBTMRV6 — Create a Hardcover Cover.

### Hardcover spine — `OFFICIAL_CALCULATOR_FIXTURE`, and no multiplier exists

**Amazon publishes no hardcover spine factor.** The help page directs you to the
Cover Calculator with ink, paper, trim and page count. The stored readings happen
to look linear; that is **not** evidence of a published factor and must not be
turned into one. `HARDCOVER_RULES.spineFactor` is explicitly `null` with the
reason recorded, and hardcover resolves through `kdp-cover-specs.ts`, which fails
closed outside its verified anchors.

### A hardcover cover is NOT the size of its trim

A paperback cover is the same size as its page, so the wrap is trim arithmetic:
bleed, back, spine, front, bleed. **A hardcover is not.** The case board is
larger than the trim on every edge, and the calculator reports the board size
separately from the trim.

For the Seed Packet hardcover — 6×9in, 126pp, cream:

| Figure | Value |
|---|---|
| Trim | 6 × 9in |
| **Board** | **6.197 × 9.236in** |
| Spine | 0.504in (against 0.315in for the same page count in paperback) |
| Wrap | 0.591in each edge |
| Full cover | 14.079 × 10.417in |

Computing that wrap from the trim instead of the board gives 13.523 × 10.02in:
short by 0.556in across and 0.397in down, and rejected at upload. Take every
hardcover figure from `kdp-cover-specs.ts`. Do not derive one from the trim,
and do not reuse a paperback wrap.

Note also that the published `caseWrapIn` (0.51in, "past the front cover edge")
does **not** reconcile with the calculator's 0.591in wrap. They measure
different things. Geometry follows the calculator reading; the published figure
is kept as a labelled constraint, not used for layout.

---

### Page-count ranges and trims

| Binding | Ink / paper | Pages |
|---|---|---|
| Paperback | B&W white | 24–828 |
| Paperback | B&W cream | 24–**776** (lower than white) |
| Paperback | B&W groundwood | 24–812 |
| Paperback | Standard colour | 72–600 |
| Paperback | Premium colour | 24–828 |
| Hardcover | B&W white / cream, premium colour | **76**–550 (see below) |

Hardcover trims: 5.5×8.5, 6×9, 6.14×9.21, 7×10, 8.25×11. Paperback offers sixteen.

---

## What reconciliation corrected

| Finding | Before | After |
|---|---|---|
| **Spine text floor** | 79, tested `>=` | **80** — KDP prints on "more than 79 pages". The old test admitted a 79-page book KDP would refuse. No shipped book affected; the thinnest is 116pp. |
| **Standard vs premium colour** | assumed one "colour" factor | **two separate factors**; collapsing them costs 0.057in on a 600-page book |
| **Premium Color default** | `paperback-preview.ts` defaulted to 0.002347 for every book | **removed**; refuses without an explicit spine or thickness |
| **Paperback barcode size** | applied as though published | labelled `HOUSE_POLICY`; KDP publishes it for hardcover only |
| **Hardcover wrap** | `scripts/qa/cover-spec.ts` computed it from the trim, as though it were a paperback | **reads the calculator fixture**; the board is larger than the trim, and the old maths was short by 0.556in on the Seed Packet hardcover |
| **Hardcover spine text** | reported ELIGIBLE unconditionally | **NOT PUBLISHED** — KDP states a page minimum for paperback only; asserting one invented a rule |
| **Hardcover spine-safe** | inset by the 0.4in hinge, which clamps a 0.504in spine to zero width | the calculator's stated spine-safe box |
| **Groundwood** | believed ≈0.00235 but unverified, so Phase 1B first made it fail closed | **0.00235 in/page**, from two Cover Calculator readings that agree exactly. Authority is `OFFICIAL_CALCULATOR_FIXTURE`: the old number was right, but it was a guess until it was read. |
| **Cream page limit** | 828 | **776**. Published as "Black Ink & Cream Paper: 24 - 776". An 800-page cream book would have been accepted. |
| **Hardcover page floor** | 75 | **76**. Two official sources disagree: GVBQ3CMEQW3W2VL6 publishes 75, the Cover Calculator refuses 75 and states 76. Verified by hand. We take the stricter number. |
| **Spine-safe on the blueprint** | 0.709in typed by hand | 0.695in from the calculator. The old figure let spine type sit 0.007in per side closer to the fold than KDP allows. |
| **Independent implementations** | 17 scripts with their own factors | **0**. A comment-stripped scan finds geometry constants only in the authority and its tests. |

Every paperback spine **multiplier** the platform had been using was confirmed
correct against the published page. What was wrong sat around them: the cream
page limit, the hardcover page floor, the spine-text minimum, and a 0.06in
spine floor that overrode the formula outright.

No shipped spine or wrap moved. The reference configurations are byte-identical
apart from the two boundaries corrected on purpose: the 79pp spine-text case,
and the 24pp case where the retired floor used to override the formula.

---

## The operator CLI

```bash
tsx scripts/qa/cover-spec.ts --interior final-interior.pdf \
    --binding paperback --ink bw --paper white --trim 6x9
```

`--json` for machines, `--proof out.png` for a geometry proof. **There is no
`--pages` flag** — the page count is read from the PDF. A typed page count cannot
be wrong loudly.

Every dimension prints with its arithmetic:

```
  spine                 0.27024in
                        120 pages x 0.002252 in/page = 0.270240in
  authority             OFFICIAL_FORMULA
  source                G201953020 — Create a Paperback Cover (read 2026-08-26)
  wrap                  width  = 0.125 + 6 + 0.27024 + 6 + 0.125 = 12.52024in
```

Unsupported configurations exit 3 with `UNVERIFIED KDP CONFIGURATION` and what
would resolve them. Verified: a hardcover page count with no calculator reading,
and a trim Amazon does not list, both refuse. Groundwood no longer refuses; it
resolves from the calculator readings above.

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
