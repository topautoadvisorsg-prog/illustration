# The Trinkadoos — special opener template

**The one exception to "no text rendered into illustrations" — and it is not really an exception.**
The image model never spells this. The opener **artwork is generated text-free like every other
page**, and the typography is composited over it afterwards by
`backend/scripts/trinkadoos-opener.ts`. That is what buys exact spelling and an identical structure
across ten books; an image model cannot give that at any price.

This changes nothing about normal story prose or the other fifteen scenes.

---

## The structure — this is the template

```
        TITLE LINE 1
    ——  CHAPTER <NUMBER>  ——
        TITLE LINE 2
```

One title line above, the chapter label between, one title line below. **Never** two above and one
below, never one above and two below, never three title lines, never a different hierarchy.

## Book 1

```
THE LANTERN TREE
—— CHAPTER ONE ——
WENT DARK
```

## Locked type

| | |
| --- | --- |
| Face | **EB Garamond**, static TTF vendored at `backend/assets/fonts/ttf/eb-garamond-normal.ttf` |
| Licence | SIL Open Font Licence — safe for commercial print |
| Title lines | all caps, tracking **0.055 em**, line-height 1.06 |
| Title size | largest whole point in **30–44 pt** at which **both** lines clear the measure; both lines always share one size |
| Chapter label | all caps, **13 pt**, tracking **0.34 em** |
| Rules | hairline, **0.85 in** each side of the label, 55% opacity |
| Gap, title to rule line | **0.30 in** above and below |
| Ink | `#F7EFDF` warm ivory, with a soft drop shadow |
| Scrim | feathered radial `rgba(28,20,10,0.34)` → transparent behind the lockup |

**Why the scrim is part of the treatment, not a patch.** One ink colour has to stay legible over a
bright daylight sky in Book 1 and a night forest in Book 4. The scrim is what makes a single locked
colour possible; without it, colour would have to change per book and the series would stop looking
like one series.

## Locked placement

| | |
| --- | --- |
| Page | single page, 8.5 × 8.5 in trim · 8.625 × 8.75 with bleed |
| Measure | **6.5 in** — the widest a title line may run |
| Lockup centre | **33%** of trim height, horizontally centred |
| Art below | the opener illustration occupies the rest of the page, staged as the Page 3 blueprint already describes |

The Page 3 blueprint already reserves its upper band as the text-safe region, so **no scene change
was needed** — that reserved area is exactly where this lockup lands.

## Declared title splits — never auto-wrapped

Automatic wrapping is what turns one line into two on a longer title and silently breaks the
hierarchy. Every split is declared in `TITLE_SPLITS` in `trinkadoos-opener.ts` and each break falls
at a grammatical joint so the line reads as a phrase, not a truncation.

| Book | Line 1 | Line 2 | Fits at |
| --- | --- | --- | --- |
| 1 | THE LANTERN TREE | WENT DARK | 43 pt |
| 2 | THE BABY DRAGON | OF CLOUDSTONE | 44 pt |
| 3 | THE FOREST THAT | LOST ITS COLORS | 44 pt |
| 4 | THE MOON FOX | WHO LOST HIS WAY | 44 pt |
| 5 | THE VALLEY OF | GIANT FLOWERS | 44 pt |
| 6 | THE BRIDGE THAT FORGOT | HOW TO BUILD ITSELF | 32 pt |
| 7 | THE FIREFLY FESTIVAL | THAT LOST ITS SPARK | 39 pt |
| 8 | THE CREATURE WHO | DIDN'T WANT TO BE SEEN | 34 pt |
| 9 | THE DOOR BENEATH | THE GLOWING WATERFALL | 32 pt |
| 10 | THE CITY BENEATH | THE GIANT LEAF | 44 pt |

Measured from the real font metrics against the 6.5 in measure. **All ten fit**; the tightest are
Books 6 and 9 at 32 pt, against a floor of 30 pt — two points of headroom.

**Book 1 is owner-specified. Books 2–10 are proposed and not approved.** Nothing renders them yet.

## What may change between books, and what may not

**May change:** the chapter number, the title wording, the opener illustration.

**May not change:** face, weight, capitalisation, tracking, the chapter-label style, the rules,
alignment, line spacing, the gaps, ink colour, shadow, scrim, measure, or lockup placement.

## One open decision

Title size currently **fits to the measure**, so it varies 32–44 pt across the series. That is what
keeps the two-line structure intact on long titles, and it is what you authorised — *"adjust the
size of both title lines within the approved allowable range so the structure survives."*

The alternative is locking **one** size for all ten — 32 pt, the size Books 6 and 9 force — so every
opener is literally identical in scale. The cost is that short titles like *WENT DARK* sit small on
the page. Fit-to-measure is built; say the word if you want the fixed size instead.
