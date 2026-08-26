# Style DNA Review — v2 Direction

**Status:** design proposal only. The current `THE_WILDLANDS_v1.md` Master Style
Block remains in effect until v2 is approved.

The audit identified that the visual direction needs to move closer to premium
natural-history publishing — vintage naturalist atlases, expedition journals,
museum-quality field guides — with richer color and stronger illustration
quality than what the current Style DNA tends to produce.

This document reviews the current Style DNA against that direction and proposes
a v2 rewrite. **Goal: understand composition, hierarchy, color, integration.
Goal: NOT imitate any one artist.**

---

## What the current DNA (v1) does well

- Locks in pen-and-ink + warm watercolor wash + parchment paper.
- References Audubon + Seton as concrete anchors `gpt-image-2` recognizes.
- Hard "no text in the image" rule (still essential).
- Asymmetric organic placement, no grid-lock.
- Palette discipline with hex codes.

## What the current DNA leaves on the table

1. **Reference range too narrow.** Two 19th-century North American naturalists.
   The image model produces consistent output but lacks the range a real
   premium natural-history publication shows.
2. **No composition guidance for landscape vs subject.** Audubon was a portrait
   composer; landscape pages need Bierstadt-scale atmosphere, not parchment
   close-ups.
3. **Anatomy/scientific accuracy stated generically.** Fuertes and Knight built
   their reputations on *structural* accuracy under painterly handling — that
   language doesn't appear.
4. **Symmetry isn't always wrong.** Haeckel's symmetric plates are masterpieces
   for botanical / progression / cutaway pages. The blanket ban on symmetry
   over-constrains those layouts.
5. **Color is described, not directed.** "Muted watercolor wash" is style, not
   composition. Premium naturalist publishing actually uses **richer** color in
   carefully bounded zones (the eagle's eye, the chanterelle's gills, a sunset
   over the ridge) — not uniformly desaturated.
6. **Atmosphere is implicit.** "Soft, directional light from a high window" is
   a studio-portrait description, fine for a specimen plate, wrong for a
   landscape feature banner.

---

## v2 design — what to add

### 1. Expanded reference roster, scoped by use

The Master Style Block should name reference points *and what each is for*. The
model uses them better when the scope is clear.

| Reference | What it teaches | When to invoke |
|---|---|---|
| **John James Audubon** | Subject-focused portraits, asymmetric arrangement on cream paper, dramatic poses, scientific precision under painterly handling | Animal / bird / mammal portraits; species profile pages |
| **Louis Agassiz Fuertes** | Anatomical accuracy under painterly handling; the "alive in habitat" feel that pure scientific plates lack | Bird and small-mammal entries; identification guides |
| **Charles R. Knight** | Subjects in their landscape and atmosphere; muscular anatomy; large mammals in motion; depth of field | Megafauna; subjects in habitat; chapter openers featuring an animal in landscape |
| **Ernst Haeckel** | Symmetric and ornamental plate composition; structural pattern as design; rich line | Botanical plates, progression studies, cutaways, multi-vignette pages |
| **Albert Bierstadt** | Atmospheric landscape, dramatic scale, light raking across terrain, distance haze, monumental scale | Feature banners showing terrain; chapter openers with landscape; the wilderness atlas pages |
| **19th-c naturalist atlases (Royal Society, USDA Yearbook, Curtis's Botanical Magazine)** | Plate-and-text integration, label-free clean illustration with calm zones | The book's overall "feel" — read aloud as the unifying reference |

The current v1 has Audubon + Seton + Royal Geographical Society expedition
artist. v2 should add Fuertes / Knight / Haeckel / Bierstadt and tie each to a
context — not to every page.

### 2. Composition guidance per layout family

The Master Style Block stays brand-wide, but it should describe **three
composition modes** the image-prompt assembler can switch between:

- **Portrait Mode** — subject-focused (species profile / animal profile pages).
  Audubon + Fuertes references. Subject anchored asymmetrically; environment is
  suggested, not painted; parchment shows through. (Current v1 = this mode by
  default.)
- **Habitat Mode** — subject in its environment (chapter openers, terrain pages,
  feature banners). Knight + Bierstadt references. Atmospheric depth, multiple
  planes (foreground, mid, distance), light as a compositional element. Richer
  color in the image-priority zone, calmer parchment-toned distance / sky in
  the text-safe zone.
- **Plate Mode** — formal scientific plate (botanical, cutaway, progression,
  diagnostic). Haeckel + Curtis's Botanical Magazine references. Symmetric or
  organized composition is allowed and good here. Structural pattern is the
  composition.

Stage 2's prompt assembler picks the mode from the page's layout (already
deterministic). The Master Style Block declares the modes; Stage 2 says which
applies.

### 3. Richer color, bounded

Replace "muted watercolor wash applied sparingly" with **bounded color
saturation**:

- Subject focal point: **full saturation** of the natural palette (a real
  chanterelle's gold-amber should look like that gold-amber).
- Subject surround / immediate setting: 60–80% saturation.
- Text-safe zone: 30–50% saturation — calm enough to overlay text, never
  desaturated to gray.
- Distance / sky / paper edges: warm parchment with subtle wash.

This gives the page the *premium color* feel the audit asks for, without
forcing fluorescent or digital saturation anywhere. The image generator
responds better to "natural palette at full saturation in the focal area" than
to "muted" (which it interprets as "desaturate everything").

### 4. Light and atmosphere as composition

Add to the Master Style Block: light is a compositional tool, not a uniform
treatment. The Block should describe three lighting moods Stage 2 can specify:

- **Studio light** — high diffuse window light. For specimen plates. (Current v1.)
- **Field light** — directional sun raking across the subject, warm to cool
  contrast. For animal portraits in habitat, chapter openers.
- **Atmospheric light** — distance haze, light fall-off, golden hour or pre-dawn.
  For terrain features and landscape spreads.

### 5. Selective symmetry permission

The blanket ban on symmetry should become **layout-aware**:

- **Portrait Mode:** asymmetric only (current rule).
- **Plate Mode:** symmetry is allowed and often best.
- **Habitat Mode:** asymmetric (composition follows landscape, not a grid).

---

## Proposed v2 structure (outline only)

```
MASTER STYLE BLOCK — v2

§1  Brand identity (CINEMATIC_NATURALIST · premium expedition journal)
§2  Reference roster, scoped by use
      • Portrait: Audubon, Fuertes
      • Habitat: Knight, Bierstadt
      • Plate:   Haeckel, Curtis's Botanical Magazine
      Each with one-line "what it teaches us"
§3  Three composition modes (Portrait | Habitat | Plate)
      Stage 2 selects per page; Block describes each.
§4  Line work — confident pen-and-ink, organic variation,
      Knight-level muscular precision when the subject is anatomical.
§5  Color discipline — bounded saturation by zone, not blanket muting.
      Hex codes retained.
§6  Light — three moods (studio | field | atmospheric), Stage 2 specifies.
§7  Paper — warm cream parchment #F5EDD6 with fiber texture (unchanged).
§8  Symmetry — layout-aware (current ban relaxed for Plate Mode).
§9  Negative rules — keep the existing no-text-in-image hardline,
      keep the no-photo-realism rule, drop the blanket symmetry ban.
```

---

## How this connects to the existing system

- **Master Style Block** stays a single file in `backend/master-style-blocks/`,
  versioned (`THE_WILDLANDS_v2.md` alongside v1).
- **Stage 2 prompt assembler** picks the composition mode + light mood from the
  page's layout family (deterministic map; one new function).
- **Operator UI** gains a read-only "Style mode" line on each page-plan card,
  alongside the existing decision-trace panel — so the operator can see *which*
  mode the page is composing in and why.
- **Switching v1 → v2** is just a config change (`masterStyleBlockVersion: 'v2'`)
  — the existing project config already carries the version field.

---

## Risk and rollback

- v2 changes the prompt the image model reads; existing approved images are not
  re-generated unless the operator explicitly regenerates a page. So the worst
  case is "new images look different from old ones in the same book until you
  regenerate" — the same risk any prompt change carries, with no data loss.
- v1 and v2 can coexist (the project config picks which version is active).
- Per-layout `LayoutPromptAsset` overrides still win where set.

---

## What this is NOT

- **Not artist imitation.** Knight, Fuertes, Audubon, Haeckel, Bierstadt are
  composition / accuracy / atmosphere teachers — the references shape what the
  model knows to reach for, not a style to copy.
- **Not a redesign of the book.** Same brand, same trim, same typography, same
  color palette. The DNA tunes how the image model composes inside those.
- **Not a rebrand.** `CINEMATIC_NATURALIST` stays the named visual identity.

---

## Decision needed

1. **Approve the v2 direction?** If yes, the next step is writing the v2 file
   itself (text only, no code) and queueing the prompt-assembler change.
2. **Confirm the reference roster.** Any names to add or remove?
3. **Approve the layout-aware symmetry change?** Specifically: Plate Mode (LAYOUT
   _9_, LAYOUT_10_FULL_PAGE_PLATE, LAYOUT_12_DIAGNOSTIC_DIAGRAM, LAYOUT_15_
   PROGRESSION_STUDY, LAYOUT_16_CUTAWAY_FEATURE) allowed symmetric composition.
4. **Approve the bounded-color rule?** Subject focal full saturation, text-safe
   zone 30–50% — vs the current "muted wash sparingly" blanket.

Once approved, v2 is one file commit and one prompt-assembler function — no
schema changes, no migration.
