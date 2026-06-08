# Standard v1.2 — Master Style Block Reconciliation (Audit Trail)

**Purpose:** before the Master Style Block (MSB) is demoted to the Illustration
DNA module, this document records what happened to **every rule** it contained —
so a future developer can see exactly why each rule moved, stayed, or died.

**Source of truth before:** three competing authorities
- `master-style-blocks/THE_WILDLANDS_v1.md` (DRAFT) — deleted by this change
- `services/style/master-style-blocks.ts` (`THE_WILDLANDS_v1.1`) — collapsed to derive from the Standard
- `publishing-standard/standard.ts` (Standard v1.1) — **becomes the single authority (v1.2)**

**Ownership Rule Zero (new, governs all of this):**
> No module may define a value owned by another module. Modules reference owned
> values through tokens (e.g. Illustration DNA uses `Palette.ink`, never `#543C24`).

---

## 1. REMOVED — rules that no longer belong to Illustration DNA

### "ANY text whatsoever rendered in the image… 100% text-free"
- **REMOVED FROM:** Master Style Block
- **RELOCATED TO:** Typography DNA
- **NEW RULE:** *the model renders the page's typography (title hierarchy, body verbatim, drop cap) in-image.* Text presence is a Typography decision, not an artwork-behavior rule. (Legacy clean-art keeps its own no-text rule in `LEAN_LAYOUT_RULES`; the whole-page path renders text — the difference is owned by the active typography/composition layer, never by Illustration DNA.)

### "asymmetric… never grid-locked, never centered, never symmetrical… subject floats"
- **REMOVED FROM:** Master Style Block
- **RELOCATED TO:** Layout System
- **NEW RULE:** *composition is decided per page type* — a chapter opener IS centered and structured (centered title block, symmetrical swags); an interior page follows its own layout. The blanket "never centered" rule was a single-illustration assumption from the clean-art era.

### "Hard borders, frames, rectangles, ovals, badges, banners, or geometric containers" (the badge/banner clause)
- **REMOVED FROM:** Master Style Block
- **RELOCATED TO:** Badge System
- **NEW RULE:** *the model does not draw badges; badges are deterministic stamped overlays (print-prep).* (The artwork's own "no hard rectangular border on the illustration" is **retained** — see §3 — but the prohibition on *badges* is now the Badge System's rule.)

### Paper color `#F5EDD6`  ·  Line `#2C1A0E` / `#6B4C2A`  ·  Accents `#3A5C3A` / `#C8860A` / `#B87333`  ·  Danger `#8B2020`
- **REMOVED FROM:** Master Style Block (hardcoded hex)
- **RELOCATED TO:** Publishing Standard → Palette tokens
- **NEW RULE (Rule Zero):** Illustration DNA references `Palette.parchment` (`#E0C8A0`), `Palette.ink` (`#543C24`), and the v1.1 accent/hazard tokens. **One color set, defined once.** The MSB's divergent `#F5EDD6`/`#2C1A0E`/`#3A5C3A` values are deleted.

### "rare touches of muted red (#8B2020) reserved for danger/warning subjects"
- **REMOVED FROM:** Master Style Block
- **RELOCATED TO:** Badge System (hazard family)
- **NEW RULE:** *danger is signaled by the hazard badge (DEADLY/TOXIC/…), not by tinting the illustration red.* This removes a competing danger-signal channel and a Standard-violating bright red.

---

## 2. RELOCATED — rules that move to another module intact (summary table)

| Original MSB rule | Relocated to | Becomes |
|---|---|---|
| "100% text-free" | Typography DNA | model renders text verbatim (whole-page); legacy keeps its own no-text rule |
| "never centered/symmetrical" | Layout System | per-page-type composition |
| "no badges/banners/containers" | Badge System | model never draws badges; print-prep stamps |
| all hardcoded hex | Palette (Publishing Standard) | token references (Rule Zero) |
| "muted red for danger" | Badge System | hazard badge |
| "page numbers / watermarks" ban | Print Prep | print-prep owns folios; model draws none |
| "pure white background forbidden" | Palette + Illustration DNA | whites = `Palette.parchment`, referenced |

---

## 3. RETAINED — rules that stay in Illustration DNA (artwork behavior only)

These are genuine artwork-behavior rules and remain its sole property (colors via tokens):

- **Medium:** 19th-century naturalist expedition-journal — pen-and-ink linework with a warm watercolor wash.
- **Reference artists:** John James Audubon, Ernest Thompson Seton, Royal Geographical Society expedition artists.
- **Line work character:** confident, expressive, organic; hand-drawn, never mechanical/traced/vector. (Line *color* → `Palette.ink`.)
- **Color discipline:** muted atmospheric wash, applied sparingly, restrained vintage saturation — never neon/digital/over-processed. (Accent *values* → Palette tokens.)
- **Mood:** contemplative, reverent, grounded; collected, hand-bound, leather-satchel feel.
- **Naturalist precision:** anatomically accurate to field-guide standard — habitat, gill structure, bark texture, leaf venation, track patterns, proportional scale.
- **Lighting:** warm, soft, directional, as from a high window in an autumn study.
- **Paper texture treatment:** aged fibrous parchment with gentle patina. (Paper *color* → `Palette.parchment`.)
- **Feathered art edges:** the wash has soft, dissolving edges — no hard rectangular border *on the artwork itself*. (The *region transition* into the reading field is Layout's, not this.)
- **Anti-style guards (behavioral):** no photography/photorealism; no flat vector/anime/cartoon/comic linework; no anthropomorphized animals or whimsical fantasy. (These are medium-fidelity rules — legitimately Illustration DNA.)

---

## 4. DEPRECATED — rules killed entirely (no longer apply to any module)

- **"Annotations: 2–5 word hand-lettered field notes near the subject."** Whole-page renders no model-drawn annotations; text is Typography's domain. Dead.
- **"Total assembled prompt must stay under 4000 characters."** A clean-art lean-prompt constraint; the JSON spec has no such cap. Dead.
- **The "How It Is Used" Stage-2/`{MASTER_STYLE_DNA}+SUBJECT+SCIENTIFIC+COMPOSITION` assembly description.** Describes the dead illustration-only pipeline. Dead.
- **`CINEMATIC_NATURALIST` brand-style label, `BLUEPRINT_v2.8` source spec, D7/D8 spike language, "pending stakeholder review" status.** Stale process artifacts. Dead.
- **"Style reference images re-fed as anchors (Phase 2+)"** drift-mitigation note. Not implemented, not part of v1.2. Deferred → effectively dead until re-specced.
- **The `.md` draft file itself** (`THE_WILDLANDS_v1.md`). Duplicate copy. Deleted; the single implementation is code-owned in the Standard.

---

## Net result

- **One authority:** Publishing Standard v1.2.
- **Illustration DNA:** behavior/medium/texture/mood/naturalist language only; all color via Palette tokens (Rule Zero).
- **No duplicate copies:** `.md` deleted; `master-style-blocks.ts` derives from the Standard.
- **No competing rules:** text → Typography, composition → Layout, badges → Badge System, color → Palette, physical → Print Prep.
- **Audit trail:** this file. Every moved rule is traceable.
