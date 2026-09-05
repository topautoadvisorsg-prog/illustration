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
prompts/     image prompts for review, and the video prompt rules
references/  approved character reference crops
notes/       production records
```

### `source/`

- **`TRINKADOOS_LAYOUT_AND_ILLUSTRATION_BRIEF.md`** — the authoritative art direction. 160 ART
  blocks, one per page unit. **This is the only durable copy.** It was recovered from a browser
  cache after being opened and never saved; see `notes/ART-BRIEF-RECOVERY.md`. The condensed image
  cues in the manuscript are **not** a substitute — they carried 20.8% of the art direction.
  sha256 `b204e9e1b43e3dbb19cc50d9f842af3cbf43433d044b5d2a58e4c3a40e3f457c`
- `TRINKADOOS_MANUSCRIPT.md` — the signed-off compiled reading edition, byte-exact baseline.
  sha256 `1e3926bd20a63b16fd1033b402fd1901bce2e3993eb484d9189f7737d70ebf8f`
- `TRINKADOOS_BIBLE_SUPPLEMENT.md` — series canon.
- `BASELINE-MANIFEST.md` — hashes and per-title word counts.
- `layout-manuscripts/` — one production text file per title, apparatus stripped, 6,238 approved
  story words total. These are what type is set from.

**None of it is authorised for change.** Raise a problem; do not edit it.

### `prompts/`

- `BOOK-01-IMAGE-PROMPTS.md` — 16 image prompts for Book 1, awaiting owner review. Nothing rendered.
- `VIDEO-PROMPT-RULES.md` — owner-supplied rules from real image-to-video attempts that failed.
  Read before writing any video prompt.

### `references/`

The approved visual bible.

- `characters/` — five full character sheets: `bram-bear`, `tessa-unicorn`, `nico-turtle`,
  `sivi-butterfly`, `zinumi-fairy`. Each carries front/side/back/3-4 views, detail callouts and an
  expression row. These are the identity anchor — characters are never redesigned from them.
**There is no approved style reference yet.** A rendered cave scene briefly sat here as one; it
was a test image, not owner-supplied and not final, and it has been removed. The character sheets
carry the look in the meantime, but a real style anchor is still outstanding and rendering waits
on it.

The earlier crops taken from the old four-up sheet are gone. That sheet mislabelled three of the
four children and called Sivi *Lyra*; these individual sheets are correct and supersede it.

**`prompts/STYLE-MASTER-PROMPT.md` is the standing instruction for every image prompt.**

Packs: all four children carry a backpack on their own sheet — Bram's teddy-bear pack, Tessa's
star pack, Nico's turtle shell, Sivi's butterfly pack. Zinumi is a fairy, not one of the four
Pack-carrying children, so the backpack rule does not reach her; her pouch stays as drawn.

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
