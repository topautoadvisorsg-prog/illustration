# SPEC — Series Two (Canadian Rockies) breakdown fix

**Project:** THE WILDLANDS CANADIAN ROCKIES — `8c1e161a-69dd-4a3d-a655-8de54995be16`
**Author:** review only. No image spend in this SPEC. Text/parser + one re-breakdown.
**Date:** 2026-07-04

## Problem

Breakdown ran clean (8 chapters, 87 pages, 0 content dropped — 53,638 body words
captured; the difference vs the 63k source is front/back matter). But the catalog
chapters were **mis-grouped**: multiple species collapsed onto single mega-pages,
each with ONE `imageSubject`. Examples:

- `CH02_P001 LARGE MAMMALS: THE PREDATORS` = 3,819 words = grizzly + black bear +
  cougar + wolf + coyote + wolverine + lynx → **one shared illustration**.
- `CH05_P001 THE ROCKIES FORAGER'S FUNGI` = 3,879 words, all fungi on one page.
- Same for HOOFED MAMMALS, SMALL MAMMALS, FISH, INVERTEBRATES, BERRIES & EDIBLES,
  MEDICINAL & USEFUL PLANTS, THE DEADLY ONES.

Meanwhile BIRDS and the deadly PLANTS split correctly, one species per page.

This diverges from the **Series One shipped standard**: one species = one entry =
one page = one illustration (New England: Animals 24, Fungi 16 entries). A field
guide needs a plate per species; lumping breaks both the shot-list and the layout.

## Root cause

`isCategoryHeading()` in `backend/src/pipeline/stage-1-ingestion/parse-manuscript-outline.ts`
gates entry-splitting on a **hardcoded allow-list of Series One category names**
(`MAMMALS`, `BIRDS`, `EDIBLE`, `DEADLY`, `MEDICINAL PLANTS`,
`MOST LIKELY EMERGENCIES IN NEW ENGLAND`, …). A `##` section only splits its
`### N.` children into per-species entries if its title matches. Canadian Rockies
titles are worded differently (`LARGE MAMMALS: THE PREDATORS`,
`THE ROCKIES FORAGER'S FUNGI`, `FISH`, `INVERTEBRATES`) and miss the list, so they
lump. The splitter is coupled to one book's wording — wrong for a series platform
where "any manuscript enters and reuses the locked standard."

## Fix (parser, wording-independent)

Change the entry-selection rule in `parseManuscriptOutline` so a `##` section that
contains **numbered `### N.` children** always emits each numbered child as its own
entry (catalog plate), regardless of the `##` title. Specifics:

1. Treat a `###` heading whose text starts with `N.` (number-dot) as a **catalog
   entry** → its own page.
2. A `##` that owns numbered children becomes a **section grouping**; it is emitted
   as its own entry ONLY when it has ≥30 words of direct intro body (preserve the
   existing `hasDirectBody` behavior, so section intros like THE ROCKIES FORAGER'S
   CODE are not lost).
3. Unnumbered `###` stay as **subsections** of their parent (unchanged `sections`
   behavior — e.g. "Hazard 1: Bears", "Major Landmarks and Sub-Ranges", intro parts).
4. Keep the existing hardcoded category list as a fallback for the no-number case;
   the numbered-children rule is a **superset** — every current allow-list section
   (e.g. `## MAMMALS` with `### 1./### 2.`) still splits identically.

Numbered `### N.` is verified clean on this manuscript: 83 numbered = catalog
species/plants/trees/fungi; every unnumbered `###` is prose. No false positives.

## Definition of done (mechanical — no eyeballing)

1. `node ../node_modules/typescript/bin/tsc --noEmit` clean.
2. `corepack yarn vitest run` — 0 NEW failures vs the known ~32 pre-existing
   (stash-compare). The existing `## MAMMALS` case must stay green.
3. **Regression test added** to `backend/src/__tests__/parse-manuscript-outline.test.ts`:
   a chapter with **non-New-England, oddly-worded `##` headings** (e.g.
   `## LARGE MAMMALS: THE PREDATORS`, `## THE ROCKIES FORAGER'S FUNGI`) whose
   `### N.` numbered children MUST split into one entry each. This is the guard that
   stops Series 3 (Southern Appalachians), with yet another set of heading names,
   from rediscovering this bug. Also assert an unnumbered `###` (e.g. `### Hazard 1: Bears`)
   stays a subsection, not an entry.
4. Re-run breakdown with `{ "force": true }` on the Series Two project (text only,
   no image spend).
5. **Exact per-chapter numbered-entry match (THE acceptance check).** After the
   re-run, the count of PAGE manifests whose `entryTitle` is a numbered catalog entry
   (`^\s*\d+\.`), grouped by chapter, MUST equal the source's numbered `### N.` counts
   exactly:

   | Chapter | Source numbered entries | Required after fix |
   |---|---|---|
   | 2 Animals | 35 | **35** |
   | 3 Plants | 21 | **21** |
   | 4 Trees | 12 | **12** |
   | 5 Fungi & Mushrooms | 15 | **15** |
   | **Total catalog** | **83** | **83** |

   Chapters 1/6/7/8 contribute topic/prose pages (0 numbered entries) plus any
   section-intro pages. If any catalog count is off by even one, the fix is NOT done —
   investigate, do not proceed to pagination or image spend.

## Out of scope (flagged, not done here)

- **Title/subtitle convention drift** — Series Two came in as
  `title="THE WILDLANDS CANADIAN ROCKIES"` + long descriptor subtitle; Series One is
  `title="THE WILDLANDS"` + `subtitle="NEW ENGLAND"`. Recommend aligning to
  `title="THE WILDLANDS"`, `subtitle="CANADIAN ROCKIES"` before the cover/front-matter
  phase. One config PUT; no rebuild. Awaiting operator decision.
- Series One (`66c1c69c…`) is frozen and MANIFESTED; this parser change touches only
  future breakdowns. I will NOT re-break-down Series One.
- No pagination, no planning, no renders, no image spend in this SPEC.
