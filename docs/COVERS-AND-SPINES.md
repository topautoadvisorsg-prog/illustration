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

## Phase 1 — the target

One module, `publishing-standard/cover-geometry-authority.ts`, resolving in this
order:

1. a **verified KDP reading** for this exact configuration;
2. a formula **that has been validated against readings** for that configuration;
3. otherwise **refuse**.

It absorbs `computeCoverDimensions`, `PAGE_THICKNESS_IN`, `COVER_BLEED_IN`,
`CoverDimensions` and `coverAllowsSpineText` out of Track A, with the old names
re-exported so nothing breaks in the same commit.

Paperback and hardcover call it with a format discriminator. One spine repair,
one blueprint, one spine typesetter.

**Before anything is replaced**, the new module must reproduce or explain the
geometry of every shipped book. Existing formulas are regression evidence, not
truth: where a formula and a verified reading disagree, the reading wins and the
formula is marked unvalidated for that configuration.

Independent KDP evidence is required for: paperback B&W white; paperback B&W
cream; premium colour where supported; hardcover case laminate; and the
applicable trim, bleed and hinge rules.
