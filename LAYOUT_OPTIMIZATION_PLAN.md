# Layout Optimization — Coordinated Implementation Plan

> **2026-06-09 — FINAL POLISH PHASE declared.** No more big architecture.
> Body pipeline proven. Remaining work: P1 badge lock → P2 layout families
> (L-2 / L-4 / L-6) → P3 layout-decision rationale → P4 sample gate → full
> render. See §18 at the bottom for the consolidated execution order.

**Status:** REVIEW ONLY — awaiting operator approval. No code changes.
**Date:** 2026-06-09
**Source observations:** DO-1 through DO-5 from `BREAKDOWN_MISSING_PAGES.md`
plus a new margin observation captured below.
**Goal:** preserve the "Cinematic Naturalist" identity while increasing
information density and lowering page count toward ~250.

---

## 1. Consolidated observation list

| # | Item | Origin |
|---|------|--------|
| **L-1** | Reduce text margins / expand text-safe frame by 20–30% of current unused inside-trim margin space | NEW (this review) |
| **L-2** | Add 25% illustration / 75% text accent layout family (corner / edge variations) | DO-2 |
| **L-3** | Mirrored layout flexibility — image-top OR image-bottom; image-left OR image-right (system-chosen for page rhythm) | DO-1 |
| **L-4** | Pure-text ornamental mode — small natural-history elements that preserve maximum text capacity | DO-3 |
| **L-5** | Page-count reduction target: 289 → ~250 | DO-4 (becomes the success metric for L-1 + L-2) |

**Consolidations:** DO-4 (page count) is no longer a standalone change. It is
the *measurement* of L-1 and L-2's success. DO-5 (observation queue) stays as
a forward-collection mechanism, not part of this plan.

---

## 2. Current geometry baseline (so we know what we're changing)

| Property | Current value |
|---|---|
| Trim size | 7.00 × 10.00 in |
| Bleed | 0.125 in (all sides) |
| Canvas (trim + bleed) | 7.25 × 10.25 in |
| Text-safe frame | 5.50 × 8.50 in |
| Margin per side (trim − text) | 0.75 in × 0.75 in (symmetric) |
| Text area / trim area | 46.75 / 70.00 sq in = **66.8% utilization** |
| Unused inside-trim margin area | 23.25 sq in |

KDP minimum inside margin requirement for a >150-page book = 0.50 in
inside, 0.25 in outside. Our current 0.75 in is well inside that envelope.

---

## 3. Proposed change — text frame expansion (L-1)

**Operator brief:** absorb 20–30% of unused margin into the text frame.

Math:
- 20% absorbed → +4.65 sq in → new text 51.4 sq in → **+10% capacity**
- 30% absorbed → +6.98 sq in → new text 53.7 sq in → **+15% capacity**

Translation to dimensions (recommended target):

| Frame | Width × Height | Margins (top/out/in/bottom) | Utilization | Capacity Δ |
|---|---|---|---|---|
| Current | 5.50 × 8.50 in | 0.75 / 0.75 / 0.75 / 0.75 | 66.8% | baseline |
| **Proposed v1** | **6.00 × 8.75 in** | **0.625 / 0.50 / 0.50 / 0.625** | **75.0%** | **+12%** |
| Aggressive alt | 6.00 × 9.00 in | 0.50 / 0.50 / 0.50 / 0.50 | 77.1% | +15% |

**Recommended: Proposed v1.** Slightly tighter sides than top/bottom keeps a
collector-edition rhythm (vertical breathing room reads "premium"; cramped
sides read "cheap pulp"). Stays well clear of KDP minimums.

**Asymmetric gutter — optional sub-decision:**
Perfect-bound books traditionally need a larger inside margin (the binding
swallows space). For ~250-page books, an asymmetric 0.625 in inside / 0.50 in
outside is conventional. If we keep symmetric margins as proposed, the only
risk is the innermost line of text feeling slightly cramped near the spine
on a fully-opened book. **Open question O-1 — decide before implementation.**

---

## 4. Proposed change — Layout E: 25% accent family (L-2)

**Operator brief:** new family between pure-text (LAYOUT_D, ~0% image) and
50/50 split (LAYOUT_B). Image consumes ~25% of the page; text fills the rest.

Family layout codes:

| Code | Composition | Use case |
|---|---|---|
| LAYOUT_E_ACCENT_TOP_LEFT | Image accent ~25% top-left, text wraps below+right | Mushrooms, leaves, feathers |
| LAYOUT_E_ACCENT_TOP_RIGHT | Image accent ~25% top-right | Animal tracks, small wildlife |
| LAYOUT_E_ACCENT_BOTTOM_LEFT | Image accent ~25% bottom-left | Tools (knife, compass, billhook) |
| LAYOUT_E_ACCENT_BOTTOM_RIGHT | Image accent ~25% bottom-right | Botanical specimens, plant cross-sections |

**Relationship to existing LAYOUT_C ("25% support corner"):** LAYOUT_C exists
in name but operator review suggests it renders more like a 50% image in
practice. Either rename LAYOUT_C → LAYOUT_E (keep one family), or rebuild
LAYOUT_C's geometry so it actually delivers ~25%. **Open question O-2.**

---

## 5. Proposed change — Pure-text ornament catalog (L-4)

**Operator brief:** allow small natural-history elements on pure-text pages
WITHOUT eating into text capacity.

This is a Standard-level change, not a layout-family addition. Mechanism:

```ts
// New ProjectConfig field (additive, defaults to 'none' so legacy unchanged)
pureTextOrnamentation: 'none' | 'minimal' | 'decorative'
```

Ornament catalog (vetted vintage naturalist set):

- Botanical: oak leaves, ferns, pine cones, acorns, herb sprigs
- Wildlife: animal tracks (silhouette/outline), small feathers
- Tools: compass, knife, billhook, small map fragment
- Symbols: contour lines, weather sigils, ornamental flourishes

**Coverage rule:** ornaments occupy ≤ 3% of text-frame area. Placed in
corners or as section dividers between paragraphs. Text capacity stays at
or above current LAYOUT_D maximum.

---

## 6. Proposed change — Mirrored layout flexibility (L-3)

**Operator brief:** every directional layout supports both orientations,
system picks the one that creates the best page rhythm.

Affected families: LAYOUT_B (top/bottom/left/right), new LAYOUT_E
(all 4 corners).

Selection logic — **open question O-3, pick one:**
- (a) Alternate every spread (left page = image-top; right page = image-bottom)
- (b) Alternate per chapter (chapter 1 = image-top family; chapter 2 = image-bottom)
- (c) Content-driven (image subject orientation: tall trees → image-top; ground specimens → image-bottom)
- (d) Operator-controlled per page (no auto-selection)

Recommended default: (a). Spread-level alternation is the standard rhythm
in coffee-table collector editions and reads as deliberate craft.

---

## 7. Change classification (lowest → highest risk)

### Config-only changes (lowest risk, no migration, no spec change)
- **L-1 text frame dimensions** — likely a `ProjectConfig.geometry.margins`
  override or constants in `computePageGeometry()`. Verify in code.
- **L-4 pure-text ornamentation** — new `ProjectConfig` field, additive.

### Prompt/spec changes (low risk, no schema)
- **L-1 prompt update** — new text-frame dims need to flow into the
  blueprint allocation + the prompt's "text-safe area" description.
- **L-4 ornament catalog** — new clause in pure-text prompt branch listing
  ornaments and the coverage cap.
- **L-3 mirrored layout selection** — selection heuristic + prompt
  branches express the chosen orientation.

### Layout geometry / family changes (medium risk)
- **L-2 LAYOUT_E family** — new entries in `LAYOUT_ZONE_PRESETS` (frontend
  + backend), new branches in `layout-director.ts` (`zonePlanFor`), new
  spec-builder branches in `build-page-spec.ts`, new family labels in
  both backend `FAMILY_LABEL` (proof package) and frontend
  `SIMPLIFIED_FAMILY_LABELS`.

### Pagination (downstream — recomputes automatically)
- Pagination v1 reads each page's layout template and computes capacity
  from the text-frame dimensions + body point size + line height. The
  moment L-1 and L-2 land, pagination automatically uses the new
  capacities. **No paginator changes required.**

### Print-prep / assembly (no change required)
- Both consume the resolved geometry; they don't care about text frame
  size, only canvas + trim + bleed.

---

## 8. Expected page-count impact (combined)

| Change | Levers | Est. page count after |
|---|---|---|
| Baseline | — | 289 |
| L-1 alone (text frame +12%) | More words per page on every layout | **~258** |
| L-1 + L-2 (more accent pages) | Accent pages carry more text than 50/50 | **~244** |
| L-1 + L-2 + L-4 (ornament catalog) | No direct capacity change; aesthetic only | ~244 |
| L-1 + L-2 + L-3 + L-4 (rhythm) | L-3 no direct capacity; perceived density up | ~244 |

**Hits the ~250 target on L-1 + L-2.** L-3 and L-4 are quality/rhythm wins,
not capacity wins.

---

## 9. Risks & guardrails

| Risk | Mitigation |
|---|---|
| KDP inside-margin compliance | Proposed v1 stays at 0.50 in inside — well above 0.50 in minimum for >150-page perfect-bound. ✓ |
| Line length too long → reading fatigue | At 6.00 in text width / 10 pt body / Caslon-class serif, est. 70–80 chars/line. Industry comfort range 50–75. **Borderline.** Mitigation: bump body to 10.5 pt OR add slight tracking. **Open question O-4.** |
| Bleed integrity | No change to bleed. ✓ |
| Visual identity drift | All changes preserve parchment / ink / serif / ornaments. Larger text frame still surrounded by generous (0.50 in) margin — still reads as collector-edition. ✓ |
| Compaction edge cases | Pagination v1 patches A–D may produce different OVERFLOW distribution at new capacities. **Re-run supervisor after L-1 lands. Expected: 0–2 OVERFLOW.** |
| Operator-accepted overflow lost on re-run | I-2 from the punch list still applies. **Accept as documented.** |
| LAYOUT_C ambiguity (named 25% but rendering 50%) | O-2: decide LAYOUT_C deprecation or refit before adding LAYOUT_E. |

---

## 10. Implementation order (recommended)

1. **L-1 text frame expansion** — config + geometry changes.
   *Why first:* biggest single page-count lever, lowest implementation
   complexity, fully reversible.
2. **L-4 pure-text ornament catalog** — new `ProjectConfig` field + prompt
   clause. *Why second:* additive, default `'none'` preserves current
   behaviour, can ship dormant.
3. **L-2 LAYOUT_E accent family** — new layout codes + zone presets +
   spec branches. *Why third:* largest surface area, biggest visual
   impact; ship only after L-1 baseline is locked.
4. **L-3 mirrored layout selection** — selection heuristic + prompt.
   *Why last:* depends on L-2 to have the full directional family set
   to flip between.

Each step is its own ship-and-test cycle. **No multi-step PRs.**

---

## 11. Open questions for operator before implementation

- **O-1.** Symmetric vs asymmetric gutter (inside/outside margin)?
  Recommendation: **symmetric 0.50 in** for visual simplicity. Override
  if the binding shop reports gutter loss issues on the proof copy.
- **O-2.** LAYOUT_C: deprecate or rebuild as true 25%?
  Recommendation: **deprecate**, replace with LAYOUT_E. Less family
  drift.
- **O-3.** Mirrored layout selection — alternate-spread (a), per-chapter
  (b), content-driven (c), or operator-controlled (d)?
  Recommendation: **(a) alternate-spread.**
- **O-4.** Body point size with new wider text frame?
  Recommendation: bump body from 10 pt → **10.5 pt** to keep line length
  in the 60–70 char comfort range while still gaining capacity.

---

## 12. Incremental testing strategy

After each step ships:

1. **Re-render the 4 verification picks** (same pageKeys as today).
   No new picks until baseline picks are validated under the change.
   Cost per cycle: ~$0.20.
2. **Side-by-side compare** with the 2026-06-09 baseline renders saved
   in `e51e5b4c-…/experimental/whole-page/`. Visual diff, no
   re-pagination yet.
3. **Run print-prep** on the new renders. Verify `preflightPassed: true`
   on all 4.
4. **Run supervisor** to confirm pagination + text-fit are still in
   tolerance under the new geometry.
5. **Render +4 sample pages from chapters not in the picks** (8 total).
   Verify family coverage and rhythm. Cost per cycle: ~$0.20.
6. **Visual review by operator.** Margins, readability, ornament
   restraint, image-accent balance. APPROVAL GATE.

Only after steps 1–6 pass for ALL FOUR (L-1, L-4, L-2, L-3) do we
re-render the full 289-page book under the optimized system. Estimated
spend at that point: $14.45 (same as today, since per-page cost is
unchanged — only page count drops, but we still render every body page
once).

---

## 13. What this plan does NOT touch

- Front matter / back matter (covered in `BREAKDOWN_MISSING_PAGES.md` §1–§7)
- Silent-drop parser issue (§7)
- Supervisor policy conflicts (I-1, I-2, I-5)
- Cover upload path on new pipeline
- Any I-3 through I-14 operational issues
- Any print-prep or assembly internals

This is purely the **layout/typography optimization pass** — every other
documented issue stays in its own queue until its own work begins.

---

## 14. L-6 — Full-page illustration break pages (NEW, 2026-06-09)

**Operator brief (added post L-1 print-prep approval):**

> The current system is still too text-efficient in one direction. We reduced
> page count with larger text frames and future accent layouts, but we also
> need intentional visual breathing spaces.

Introduce a small percentage of dedicated **full-page illustration spreads**
distributed across the book:

- Target ~**3–5 %** of total pages.
- These pages carry **no body text**.
- They function as cinematic chapter moments, environmental scenes, wildlife
  portraits, landscapes, ecosystems, seasonal scenes, or major-subject
  showcases.
- **Not** an overflow fix or a place to dump text. Deliberate design choice
  that makes the book read as a premium collector edition.

### Selection intelligence (the harder problem)

The layout system needs to decide, per entry / per chapter, when to spend a
full page on art:

| Trigger | What that means in pagination terms |
|---|---|
| Subject is iconic (apex predator, signature landscape, ecosystem totem) | Score the subject high enough to "earn" a full-page break |
| Chapter rhythm needs a breath | After N text-heavy pages, the next eligible opener becomes a full-page candidate |
| Entry word count is very low AND visually rich | Promote rather than compact |
| Entry is the **chapter centerpiece** (one per chapter) | Reserve a slot |
| Section/ecosystem transition (regions, seasons) | Optional spread, ideal for "Part I → Part II" handoffs |

This is per-entry metadata (`illustrationPriority: 'breakout' | 'normal'`)
PLUS a per-chapter cap (max 1–2 break pages per chapter so we don't blow
the budget).

### Layout codes to add

- **LAYOUT_F_FULL_ILLUSTRATION** — full-bleed art, no body text, no folio
  if title page rules apply. Single illustration spread.
- (Future v1.1 — pair-spread): **LAYOUT_F_SPREAD_LEFT** /
  **LAYOUT_F_SPREAD_RIGHT** — when art carries across two facing pages.
  Deferred until pagination is spread-aware (today it's page-aware).

### Where this slots in the implementation order

L-6 ships **after L-2** (accent family) for two reasons:
1. L-2 frees up enough "text-density credit" that we can afford the
   no-text pages without sliding page count back to 270+.
2. The selection intelligence shares infrastructure with L-2's accent vs
   50/50 picker — building both at the same time keeps the layout-decision
   engine coherent.

### Page-count interaction with L-6

| Step | Page count | Note |
|---|---|---|
| L-1 alone (deployed) | **255** | text-frame +12 % |
| L-1 + L-2 (accent family) | ~244 | denser packing on small-art entries |
| L-1 + L-2 + L-6 @ 4 % | ~254 (~10 art pages added back) | rhythm gain, ~250 target preserved |
| L-1 + L-2 + L-6 @ 5 % | ~257 | overshoots target by ~7 |
| L-1 + L-2 + L-3 + L-4 + L-6 | ~254 | settled premium target |

**The point:** ~250 is not the absolute floor — it's the target with the
visual breathing room added. L-6 is the lever that keeps the book from
sliding into "dense reference manual" territory.

---

## 15. Target layout distribution (250-page book, post-everything)

This is the model state after L-1 + L-2 + L-3 + L-4 + L-6 all land. It is
not a quota system — pagination should pick the right layout for each entry —
but the operator should expect roughly this mix once tuning is complete.

| Layout family | Code | % of book | Pages out of ~250 | Role |
|---|---|---|---|---|
| Text-heavy continuation (with ornaments — L-4) | LAYOUT_2_TEXT_HEAVY | **~40 %** | ~100 | The bulk of long-entry continuations. Currently 53 %; L-2 takes some share. |
| 75 % text + 25 % accent (NEW — L-2) | LAYOUT_E_ACCENT_* (4 corners) | **~25 %** | ~62 | Mushrooms, leaves, feathers, tools, small wildlife. Currently 0 %; net new family. |
| 50 / 50 illustration + text | LAYOUT_B_IMAGE_TOP/BOTTOM/LEFT/RIGHT (mirrored via L-3) | **~20 %** | ~50 | Major concepts. Currently 42 %; drops as accents absorb light-art entries. |
| Pure text + ornament (L-4 ornamentation: 'minimal'/'decorative') | LAYOUT_D_PURE_TEXT | **~10 %** | ~25 | Long technical content, glossary-style. Currently 5 %; rises with ornament mode making pure-text feel premium. |
| **Full-page illustration (L-6)** | **LAYOUT_F_FULL_ILLUSTRATION** | **~4 %** | **~10** | **Cinematic chapter centerpieces.** Currently 0 %; net new. Roughly 1–2 per chapter. |
| Chapter openers (subset of 50/50) | LAYOUT_B_* configured as opener | included above | ~8 | 1 per chapter. Not its own family. |

### Comparison: current L-1 state vs target

| Layout family | L-1 today | Target | Δ |
|---|---|---|---|
| Text-heavy continuation | 53 % | 40 % | −13 pts |
| 25 % accent | 0 % | 25 % | **+25 pts** ← biggest shift |
| 50/50 illustration | 42 % | 20 % | −22 pts (entries migrate to accent) |
| Pure text + ornament | 5 % | 10 % | +5 pts (premium feel on text-only) |
| Full-page illustration | 0 % | 4 % | **+4 pts** ← net new |
| **Total** | **100 %** | **100 %** | — |

### What this means in plain English

Currently the book is **53 % text-with-tiny-margin and 42 % half-image-half-text** — two flavours, no middle ground. After all four optimization passes:

- **40 %** of pages stay text-heavy (the spine of the reading experience)
- **25 %** of pages get a tasteful 25 % illustration accent (the "field guide" feel)
- **20 %** of pages remain bold 50/50 spreads (major concepts, openers)
- **10 %** of pages are pure text with restrained ornaments (technical depth)
- **4 %** of pages are full-bleed illustration breaks (the cinematic moments)

That's the target product. L-1 is step 1 of 6; we are 1/6 of the way there.

---

## 16. L-7 — Badge / Icon Safe Zones (NEW, 2026-06-09)

**Operator brief (added during L-1 print review):**

> Page badges/icons (region "G", hazards, source seal, folio) are being
> overlaid on top of text and illustrations, creating collisions and
> reducing the premium print quality of the page.

### Diagnosis — what's happening today

The badge system has TWO halves and they don't talk to each other.

**Half 1 — print-prep stamper (works as designed):**
Implementation lives in `print-prep/badge-geometry.ts`. Print-prep reserves
fixed 0.9 in corner squares (`BADGE_PLACEMENT.safeZoneIn: 0.9` in the
Standard) and stamps:

| Badge | Reserved area | Size |
|---|---|---|
| Region (e.g. "G" / "GENERAL") | bottom-left 0.9 in square | square, centred |
| Hazards (up to 2) | top of bottom-right 0.9 in square, side-by-side | 0.9 in row |
| Source seal | beneath hazards in bottom-right square | ~0.3 in square |
| Folio (page number) | bottom-centre, 0.5 in up from trim edge | 1.5 in × 0.3 in box |

That math is deterministic and correct. The badges always land where they
should. The placement code does its job.

**Half 2 — AI prompt (the hole):**
The `WholePageSpec` and the assembled prompt do NOT tell the image model
about the badge safe zones. The Standard's safe-zone constants live in
print-prep's pixel math only — never reaches `assemble-experiment-prompt.ts`,
never reaches the blueprint PNG, never reaches the prompt text. The AI
happily fills the bottom 0.9 in band with:

- ornamental swag (the pinecone garland in the screenshot)
- body text continuation (the "open temperature" overlap)
- bleed-area artwork

…then print-prep stamps the region square, hazards square, source seal,
and folio number on top, producing the collisions in the screenshot.

### Audit — per-layout proposed badge-safe zones

The safe zone has to flex per layout because different families have
different "free real estate." Proposal:

| Layout family | Bottom-left badge | Bottom-right badge | Folio | Why |
|---|---|---|---|---|
| **LAYOUT_F_FULL_ILLUSTRATION** (L-6, new) | reserved 1.0 in square, art must NOT place focal subject there | reserved 1.0 in square, same | bottom-centre **inside** trim, 0.4 in up | Full-bleed art — only safe place for badges is corner negative space. Slightly larger reserve (1.0 vs 0.9) because art tends toward edges. |
| **LAYOUT_B_IMAGE_TOP/BOTTOM/LEFT/RIGHT** | reserved 0.9 in square inside the text portion | reserved 0.9 in square inside text portion | bottom-centre 0.4 in up | Text portion has natural margins; badges fit cleanly. Art portion stays untouched. |
| **LAYOUT_E_ACCENT_* (L-2, new)** | reserved 0.9 in square in the text portion margin | reserved 0.9 in square diagonally opposite the accent | bottom-centre 0.4 in up | 25 % accent leaves 75 % text area — plenty of room. Place badges away from the accent corner. |
| **LAYOUT_D_PURE_TEXT** (with L-4 ornaments) | reserved 0.9 in square below text frame | reserved 0.9 in square below text frame | bottom-centre 0.4 in up | Below body, above bleed. Ornaments must yield to badge zones. |
| **LAYOUT_2_TEXT_HEAVY** (legacy continuation) | reserved 0.9 in square in bottom margin | reserved 0.9 in square in bottom margin | bottom-centre 0.4 in up | Same as LAYOUT_D — clear margin band. |

**Common rule:** in every layout the bottom 1.0 in band of the trim area
(NOT including bleed) becomes a no-AI zone for everything except small
decorative flourishes that *intentionally* harmonize with the stamped
badges (e.g. a thin hairline rule above the badge row).

### Adaptive sizing (operator requirement)

Operator asked the reserved zone to grow with badge count. Proposal:

- 1 region only: bottom-left 0.9 in square reserved
- 1 region + 1 hazard: bottom-left + bottom-right 0.9 in squares
- 1 region + 2 hazards + source: same — caps at 2 hazards (already enforced)
- Folio is always reserved (1.5 in × 0.4 in centre strip, 0.4 in up)

The prompt builder reads the page's `badgeContext` (already in spec) and
emits zone polygons accordingly. No badges → no reserved zones (smaller
content area lost).

### Implementation phases

**Phase A — Standard centralization (no UI / no AI change yet)**
1. Lift `BADGE_PLACEMENT.safeZoneIn` and the family-corner mapping from
   `print-prep/badge-geometry.ts` and `standard.ts` into a single exported
   helper `computeBadgeSafeZones(badgeContext, layoutFamily, canvas)` that
   returns rect polygons.
2. Refactor `badge-geometry.ts` to consume the helper (same output, same
   tests). This makes the data available outside print-prep without
   breaking anything.

**Phase B — Spec + prompt plumb-through**
3. Add `badgeSafeZones: PlanningZone[]` to `WholePageSpec`. Field is
   `inches` based, not pixels — matches how every other zone is expressed
   in the spec.
4. Spec-builder computes it via the helper from Phase A and the page's
   layout family.
5. Prompt assembler adds a NEW clause near the existing "text-safe zones"
   block: *"Reserved badge zones — leave VISUALLY CLEAN, no text, no
   focal art, no ornamental detail."* with the exact rect coordinates.
6. Blueprint PNG paints these zones with a distinct fill colour /
   crosshatch so the image model receives a visual "don't render here"
   signal alongside the prose instruction.

**Phase C — Operator visibility**
7. Add `badgeSafeZones` to the proof package's `authority.zones` object
   so the operator can audit which rects shipped in the prompt for any
   given render.
8. Add a small frontend overlay in Render Proofs that draws the safe-zone
   rects over the rendered image so the operator can verify by eye whether
   the AI actually kept the zones clean.

**Phase D — Adaptive sizing for >1 hazard**
9. Already-correct math; just ensure the zone polygons sent to the
   prompt match what print-prep ACTUALLY uses for the active
   `badgeContext`. Single source of truth — both halves derive from the
   helper.

### Page-count interaction

L-7 reduces effective text-frame area by reserving ~1.0 in bottom strip
(~7 sq in lost in the bottom band, partially overlapping the existing
0.5 in bottom margin). Net usable area drops by roughly 4 sq in (44 → 40 lines
per page on text-heavy layouts). Projected page-count effect:

| Stage | Pages |
|---|---|
| L-1 (deployed) | 255 |
| L-1 + L-7 (this) | ~268–272 (text-heavy pages absorb ~5 % loss) |
| L-1 + L-2 + L-7 | ~252 (accent family recovers most of it) |
| L-1 + L-2 + L-6 + L-7 | ~262 (full-page art adds back ~10) |
| Full target with all 7 levers | ~258–262 |

**Slight upward pressure on page count.** Accept this — premium quality
beats page-count parity. The user's stated goal is "optimal premium book
with visual rhythm," not the floor.

### Risks

| Risk | Mitigation |
|---|---|
| Adding new prompt language increases prompt size and may degrade AI focus | Phase B keeps the new clause tight (one sentence + rect list). Phase B-6 blueprint markup gives the model a visual cue, less prose needed. |
| AI ignores the prompt and still renders into safe zones | Phase C-8 overlay surfaces violations immediately. If failure rate >5 % over a sample, add a retry-with-stronger-language path before considering an automated detector. |
| Safe zone overlaps bleed and creates a "dead" L-shape that looks unfinished | Reserved zones sit INSIDE trim, above bleed. The 0.5 in bottom margin still belongs to the AI — only the corner squares + folio strip are reserved. |
| L-7 increases page count and undoes L-1 gains | L-2 (accent family) will more than compensate. Stage L-7 AFTER L-2 to absorb the impact in a single re-pagination cycle, not two. |

### Implementation order with L-7 added

Updated sequence:

1. **L-1** — text frame expansion (SHIPPED, awaiting physical gutter proof)
2. **L-4** — pure-text ornament catalog (config + prompt, additive)
3. **L-2** — LAYOUT_E 25 % accent family
4. **L-7** — badge safe zones (rides on top of L-2's accent geometry; both share the helper from Phase A)
5. **L-6** — LAYOUT_F full-page illustration breaks
6. **L-3** — mirrored layout selection (alternate-spread)

### Locked decisions (2026-06-09)

| Question | Decision |
|---|---|
| **O-5** — visible badge framing? | **INVISIBLE** — stamped over clean negative space, no border / no hairline rule |
| **O-6** — release safe zones on zero-badge pages? | **YES** — pages with no metadata recover ~4 sq in of usable area |
| **O-7** — folio on LAYOUT_F (full-page illustration)? | **DROP** folio on LAYOUT_F unless final book assembly explicitly requires it (open carve-out for back-matter rules) |

### Locked rule — SINGLE SOURCE OF TRUTH

The badge-safe-zone math must be exported from **one** module and consumed
by every downstream consumer. No duplication.

```text
publishing-standard/badge-zones.ts (NEW)
    └── computeBadgeSafeZones(badgeContext, layoutFamily, canvas) → PlanningZone[]
         │
         ├── print-prep/badge-geometry.ts       (existing stamper, refactored to read here)
         ├── experimental/whole-page-render/build-page-spec.ts (writes into WholePageSpec)
         ├── experimental/whole-page-render/assemble-experiment-prompt.ts (emits the prompt clause)
         ├── stage-3-generation/blueprint.ts    (paints the visual markers on the blueprint PNG)
         └── services/render-proof/build-package.ts (surfaces zones in proof.authority.zones)
```

If the dimensions diverge between print-prep stamper and AI prompt, the
collisions return. The helper is the only place the numbers live.

### Acceptance criteria for L-7

L-7 is **DONE** when all seven of these hold:

1. **Proof package surfaces `badgeSafeZones`.** Returned in
   `authority.zones.badgeSafeZones` as a `PlanningZone[]`, populated for
   every render (pre- and post-spend).
2. **Blueprint visibly marks badge-safe zones.** The blueprint PNG sent
   to the model paints the reserved rects with a distinct fill /
   crosshatch so the model has a visual instruction alongside the prose.
3. **Prompt instructs AI to leave those zones empty.** A dedicated clause
   in the assembled prompt naming the rect coordinates and the rule:
   "Reserved badge zones — leave VISUALLY CLEAN, no text, no focal art,
   no ornamental detail."
4. **Print-prep stamps badges inside those same zones.** Same coordinates
   the AI was told to avoid, sourced from the shared helper. No drift.
5. **No collision.** On the verification batch (re-rendered 4 picks),
   visual inspection shows zero overlap between body text / titles /
   illustrations / ornamental borders and stamped badges.
6. **Zero-badge pages release the reserved area.** Pages whose
   `badgeContext` resolves to no stamps (no hazard, no region, no source)
   return empty `badgeSafeZones` and the AI gets the full text frame.
7. **Verification batch re-rendered and compared.** Same 4 pageKeys (or
   their L-1+L-2 successors) rendered under L-7, artifacts saved to
   `baseline/v3-l7/`, side-by-side diff against the most recent baseline
   (probably `baseline/v2-l1/` or `baseline/v3-l2/`).

### Escalation rule

> If badge collisions appear on more print proofs while we are working on
> L-4 or L-2, **L-7 jumps to the front of the queue**. Quality issues that
> ship with every paid render outrank quality issues that only ship after
> additional renders.

Operator triggers the move-up; Claudio does not silently re-order.

---

## 17. Decision required

Please mark each item:

- [ ] L-1 text frame expansion — APPROVE / REJECT / DEFER
- [ ] L-2 LAYOUT_E accent family — APPROVE / REJECT / DEFER
- [ ] L-3 mirrored layout selection — APPROVE / REJECT / DEFER
- [ ] L-4 pure-text ornament catalog — APPROVE / REJECT / DEFER

And answer:

- O-1: symmetric / asymmetric gutter? __________
- O-2: LAYOUT_C deprecate / rebuild? __________
- O-3: mirroring selection mode (a/b/c/d)? __________
- O-4: bump body to 10.5 pt? Yes / No / Operator-decide-later

Once approved I will begin **L-1 only** and report back with the
4-pick re-render comparison before moving to L-4.

---

## 18. FINAL POLISH PHASE — consolidated execution order (2026-06-09)

**Declared by operator:** no more big architecture. Body pipeline proven.
Goal: premium collector-quality book, intentionally designed.

### Already done when this phase was declared

- L-1 text frame (255 pages, locked pending physical gutter proof)
- L-7.2.1 cartouche geometry (operator: "that's the area — locked")
- L-7.2.2 stamps 15 % darker — commit `332bbd2` DEPLOYED to Railway but
  the re-stamp + before/after proof was interrupted. P1 finishes this.

### Execution order

| # | Item | Code surface (est.) | Token spend | Gate |
|---|------|--------------------|-------------|------|
| **P1** | L-7 final lock: verify darker stamps, compact stack ~10 %, raise cartouche core opacity, re-stamp 4 renders, before/after proof | `print-prep/badge-geometry.ts` + `print-prep.ts`, ~20 lines | **$0** | operator visual → **LOCK** |
| **P2a** | L-2 accent layouts: backend corner geometry (`zonePlanFor` CORNER_* branches in `layout-director.ts`), capacity entries, selection thresholds in `chooseSimplifiedLayout` | `layout-director.ts` (~80), `layout-families.ts` (~40), capacity tests (~60) | **$0** (blueprint previews are free) | blueprint preview shows true 25 % accents |
| **P2b** | P3 rationale: pure function `layoutRationale(page)` derived at read time (NO migration), exposed on `/pages` + proof package + supervisor snapshot | new `layout-rationale.ts` (~80), routes (~20), frontend chip (~30) | **$0** | operator reads WHY per page |
| **P2c** | L-4 ornament system: `pureTextOrnamentation` config field (default `'none'`), ornament catalog in Standard, prompt branch | shared schema (~10), `standard.ts` catalog (~40), prompt (~20) | **$0** (ships dormant; preview-package shows the clause) | prompt preview |
| **P2d** | L-6 hero pages: `LAYOUT_F_FULL_ILLUSTRATION` enum + profile + spec branch, selection w/ per-chapter cap (1–2), **exempt LAYOUT_F from the `empty_body_text` Tier-0 guard** | shared enum (~5), profiles (~30), `layout-families.ts` selection (~60), `render-whole-page.ts` guard (~10), folio drop already done | **$0** until sample | re-paginate (free) + blueprint preview |
| **P3** | Re-paginate under new families, run supervisor, verify distribution vs target | none (operations) | **$0** | distribution within ±5 pts of target |
| **P4** | Representative sample render: 12–14 pages (2 per family incl. hero + chapter opener + transitions), print-prep, review | scripts only | **~$0.70** | **operator visual gate → full 255-page render** |

### Key decisions / risk notes

1. **O-2 revision recommended.** Original decision was "deprecate LAYOUT_C
   → create LAYOUT_E." Audit shows LAYOUT_C_CORNER_* codes already exist in
   the shared enum, the selection map, the frontend presets, and both label
   maps. Creating LAYOUT_E duplicates all of that for zero visual gain.
   **Recommend: keep LAYOUT_C codes, fix their geometry to true 25 %,
   rebrand labels "Layout C — 25 % Accent (corner)".** Operator to confirm.
2. **L-6 empty-body guard is a hard dependency.** `createAndRunRender`
   throws `empty_body_text` before spending — correct for content pages,
   fatal for hero pages which have no body by design. Must exempt
   LAYOUT_F before any hero render.
3. **Pagination shift risk (L-2/L-6).** New capacities redistribute
   TIGHT/OVERFLOW; hero insertions change page count (~255 → ~250–260).
   Supervisor re-run is the safety net; CH06_P006_m-style accepted
   overflows resurface (known issue I-2, accept).
4. **L-3 mirroring stays deferred** — last in the original order, not part
   of this phase. One variable at a time.
5. **Rationale is derived, not persisted** — no migration, no schema risk;
   recomputable from page row + word count + content type.

### Target distribution after P2 (250-page book)

| Family | Today | Target |
|---|---|---|
| Text-heavy continuation (w/ ornaments) | 53 % | ~40 % |
| 25 % accent (LAYOUT_C rebranded) | 0 % | ~25 % |
| 50/50 (LAYOUT_B) | 42 % | ~20 % |
| Pure text + ornament (LAYOUT_D) | 5 % | ~10 % |
| Full-page hero (LAYOUT_F) | 0 % | ~4 % (≈10 pages, 1–2/chapter) |
