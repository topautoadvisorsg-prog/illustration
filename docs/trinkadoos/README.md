# The Trinkadoos — First Wave

Ten **standalone** 32-page picture books, ages 4–7, 8.5 × 8.5 in. Each chapter of the compiled
reading edition is a separate published title — they are never paginated as one volume.

Production scripts live with every other book's, in `backend/scripts/`:

| | |
| --- | --- |
| `trinkadoos-config.ts` | the one production configuration — trim, margins, the ten titles, palette, hash locks |
| `trinkadoos-proof.ts` | builds the 32-page interior and gates it |
| `trinkadoos-visuals.ts` | per-book driver for the video layer |
| `book-to-video.ts` | reusable, book-agnostic prompt layer |

## What is here

```
source/      the approved text and the authoritative art direction
prompts/     image prompts for review, the master style prompt, video prompt rules
notes/       production records
```

### `references/characters/`

The approved visual bible, reissued 2026-09-05.

```
everyday/   bram · tessa · nico · sivi, plus a four-friends group sheet
magical/    bram-bear · tessa-unicorn · nico-turtle · sivi-butterfly, plus a group sheet
```

Every child now has both wardrobe states as its own sheet, and each state also has a group sheet
for scenes where all four are in frame. `prompts/STYLE-MASTER-PROMPT.md` says which to attach per
scene — Book 1 changes wardrobe once, at Spread 8, and back on page 32.

**Zinumi has no sheet in this set.** She appears in six of Book 1's sixteen scenes, so those six
cannot be rendered until she is supplied.

## Not kept here, on purpose

Interior proof PDFs, page rasters and the layout export are **regenerable** — `trinkadoos-proof.ts`
rebuilds all ten interiors from `source/`, and the repo's convention is that regenerable render
artifacts stay out. Editorial QA evidence belongs to the manuscript-QA project, not this repo.

## Canon that binds every illustration

- Four individual Packs, one per child. No pairs, no shared Packs.
- Outfits are physically pulled out, put on, removed and stored. They **never** fade or materialise.
- Zinumi never speaks: no speech bubbles, no lettering, ever.
- Bram HOLD amber-gold · Tessa REVEAL lavender-white/gold · Nico STEADY moss green/gold ·
  Sivi LIFT violet-blue.
- The park, the realms and the Pack Chamber are deliberately unnamed on the page.
- Unresolved mythology stays unresolved — the mark in Book 3, the wall of symbols in Book 9, the
  carved line past the four hollows in Book 10. The art must not explain them.
