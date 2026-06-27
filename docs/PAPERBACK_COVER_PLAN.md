# Paperback Cover — Design Audit & Implementation Plan

**Status: AUDIT ONLY (no build).** Track 1 (Kindle EPUB) is complete and deployed;
this is the Track 2 (paperback) plan so the build is plug-and-play once two values
are known. Every edition stays in the SAME Step 7 · Render & Review surface — no
parallel workflow.

---

## Audit of the 6 questions

### 1. How the paperback cover is generated from existing assets
There is already **one deterministic cover engine** (used for the print wrap):
- `computeCoverDimensions(config, pageCount)` → `stage-6-layout/render-html.ts`: returns
  the full-wrap geometry — `spineIn = max(0.06, pageCount × 0.002252)`,
  `fullWidthIn = trim.w×2 + spine + bleed×2`, `fullHeightIn = trim.h + bleed×2`.
- `composeCoverPrint(coverArtPng, config, dims)` → `print-prep/cover-print.ts`: Lanczos-
  upscales the wrap art to the exact 300-DPI canvas (back | spine | front), reserves the
  barcode box, and embeds a print-ready PDF at the exact physical size.
- `coverAllowsSpineText(pageCount)` gates spine text to KDP's ≥79-page rule.

**So paperback = the SAME engine, fed paperback inputs.** Hardcover and paperback differ
only in (a) page-count→spine, (b) paper-thickness multiplier, and (c) the wrap ART must
match the wrap proportions. Nothing new architecturally — it's a parameterization.

### 2. Data required
| Input | Source | Status |
|---|---|---|
| Trim size (7 × 10″) | `config.trimSize` | ✅ have |
| Bleed (0.125″) | `config.trimSize.bleedIn` | ✅ have |
| **Final paperback page count** | interior assembly | ❌ **operator/assembly** — drives spine |
| **Paper thickness / type** | constant | ⚠️ code hardcodes `0.002252` (KDP **B&W white**). Full-color = **KDP Premium Color ≈ 0.002347″/page** → need to add + confirm |
| Spine width | derived from the two above | ✅ auto |
| Barcode reserve (2 × 1.2″, back top-right) | `cover-print.ts` constants | ✅ have |

### 3. Where the KDP guideline overlay lives
**Step 7 · Render & Review**, in the existing cover card that already shows the print
front cover and the Kindle front cover. The paperback gets a panel there with a
**"show guides" toggle** — same place the operator already reviews everything. No new tab.

### 4. Previewing bleed / trim / safe / spine / barcode
All five are pure geometry from `computeCoverDimensions` + config, drawable as an SVG
overlay on the cover preview:
- **Bleed** = outer edge of the canvas (fullW × fullH).
- **Trim** = inset 0.125″ from every edge (the cut line).
- **Safe area** = inset ~0.25″ inside trim (KDP min is 0.125″; 0.25″ recommended) — keep text inside.
- **Spine** = two vertical lines at `x = trim.w + bleed` and `+ spineIn` (the engine already knows these).
- **Barcode zone** = the 2 × 1.2″ box on the back panel top-right (already computed in `cover-print.ts`).

### 5. Seeing when text/art crosses an unsafe area
- **Visual:** the overlay makes trim/safe/spine violations obvious to the operator.
- **Automatable check:** title/author/spine-text positions are known in `buildCoverHtml`, so
  we can auto-flag: spine text enabled under 79 pages, any title/author text past the safe
  margin, or content intruding on the barcode box. (Full-bleed *art* crossing trim is
  intended — only *critical text* must stay inside safe.)

### 6. Same review philosophy as hardcover + Kindle
Yes. It reuses the Step 7 cover card, the same preview/export pattern, and the same print
engine. The only addition is an **edition selector** (Hardcover / Paperback / Kindle) on
that one card so all three read identically. One pipeline, three editions.

---

## Implementation report

### ✅ Already complete
- Full-wrap geometry + spine math (`computeCoverDimensions`).
- Deterministic cover composition → print-ready PDF at exact physical size (`composeCoverPrint`).
- Barcode reserve box (KDP-provided barcode; we never draw one — matches the cover standard).
- Spine-text gating (≥79 pages).
- Preflight validation of trim + bleed (`print-prep/preflight.ts`).
- Step 7 cover-preview surface (already renders print + Kindle covers).
- Source cover art exists (the approved hardcover wrap illustration).

### ❌ Missing
1. **Final paperback page count** (operator/assembly) — required to compute the spine.
2. **Paper-type thickness** — code is hardcoded to B&W white `0.002252`; add a **Premium Color** value (~`0.002347`) and select by paper type.
3. **Guideline overlay** (bleed/trim/safe/spine/barcode) — not rendered in the preview yet.
4. **Paperback-fitted wrap ART** — the existing art is framed for the *hardcover* wrap (different width + case turn-in); paperback needs the wrap art re-fit/regenerated to its geometry (this is the "can't reuse the front cover" point).
5. **Edition selector** in the Step 7 cover card (Hardcover / Paperback / Kindle).
6. *(Optional)* unsafe-area auto-check (text past safe / barcode intrusion).

### 🤖 Can be automated (no operator needed)
- All geometry: dims, spine, overlay rectangles — pure from `config` + page count.
- Cover composition + print PDF — engine already exists.
- Guideline overlay rendering + the text-safe / barcode checks.
- Preflight validation + wiring the paperback panel into Step 7.

### 🙋 Operator input still required
1. **Final paperback page count.**
2. **Paper type** — confirm **Premium Color** (full-color art).
3. **Cover art decision** — regenerate a paperback full-wrap from the existing front illustration, or supply art sized to the paperback wrap.
4. Confirm **no printed barcode** (KDP supplies it) — already our standard.

---

## Plug-and-play build path (once page count + paper are known)
1. Add the paper-type thickness constant; select multiplier by paper type.
2. `computeCoverDimensions(config, pageCount)` → exact paperback wrap dims.
3. (Re)fit/generate the wrap ART to those dims.
4. `composeCoverPrint(art, config, dims)` → paperback cover PDF.
5. Render the guideline overlay + run the text-safe/barcode checks in Step 7.
6. Preflight validate → operator approves in the same review card → export.

**Net: ~step 1–2 + the overlay are a small, automatable code change; the only true
blockers are the page count and paper type.** No new architecture.
