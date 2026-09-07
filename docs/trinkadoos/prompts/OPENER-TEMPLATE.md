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
      [ banner ribbon:  Chapter <Number> ]

              TITLE LINE 1
              TITLE LINE 2

      ( illustration, full bleed, behind all of it )
```

The chapter label lives in a **decorative banner at the top and nowhere else**. It is never placed
between the title lines. The title sits below the banner, centred, **exactly one line above and one
line below** — never three lines, never a different hierarchy.

## Book 1

```
[ Chapter One ]

The Lantern Tree
Went Dark
```

## Locked type

| | |
| --- | --- |
| Face | **EB Garamond**, static TTF vendored at `backend/assets/fonts/ttf/eb-garamond-normal.ttf` |
| Licence | SIL Open Font Licence — safe for commercial print |
| Title lines | title case, tracking **0.055 em**, line-height 1.14 |
| Title size | largest whole point in **30–44 pt** at which **both** lines clear the measure; both lines always share one size |
| Chapter label | title case, **13 pt**, tracking **0.22 em**, ink `#4A2E14` |
| Banner | swallowtail ribbon, **3.6 × 0.62 in**, parchment `#F3E6CB`, gold-brown edge `#B0854A`, a small diamond either side of the label |
| Title ink | `#F9F2E2` warm ivory, with a soft drop shadow |
| Wash | vertical gradient over the top **42%** only, `rgba(26,18,9,.42)` → transparent |

**Why the wash is part of the treatment, not a patch.** One ink colour has to stay legible over a
bright daylight sky in Book 1 and a night forest in Book 4. The wash is what makes a single locked
colour possible; without it, colour would have to change per book and the series would stop looking
like one series.

## Locked placement

| | |
| --- | --- |
| Page | single page, 8.5 × 8.5 in trim · 8.625 × 8.75 with bleed |
| Measure | **6.5 in** — the widest a title line may run |
| Banner centre | **10.5%** of trim height, horizontally centred |
| Title block centre | **25%** of trim height, horizontally centred |
| Art | full bleed, running behind the entire opener including the banner |

The banner and title occupy roughly the top third, which is exactly the region the Page 3 blueprint
already reserves, so **no scene change was needed**.

## Declared title splits — never auto-wrapped

Automatic wrapping is what turns one line into two on a longer title and silently breaks the
hierarchy. Every split is declared in `TITLE_SPLITS` in `trinkadoos-opener.ts` and each break falls
at a grammatical joint so the line reads as a phrase, not a truncation.

| Book | Line 1 | Line 2 |
| --- | --- | --- |
| 1 | The Lantern Tree | Went Dark |
| 2 | The Baby Dragon | of Cloudstone |
| 3 | The Forest That | Lost Its Colors |
| 4 | The Moon Fox | Who Lost His Way |
| 5 | The Valley of | Giant Flowers |
| 6 | The Bridge That Forgot | How to Build Itself |
| 7 | The Firefly Festival | That Lost Its Spark |
| 8 | The Creature Who | Didn't Want to Be Seen |
| 9 | The Door Beneath | The Glowing Waterfall |
| 10 | The City Beneath | The Giant Leaf |

Measured from the real font metrics against the 6.5 in measure. **All ten fit**; the tightest are
Books 6 and 9 at 32 pt, against a floor of 30 pt — two points of headroom.

**Book 1 is owner-specified. Books 2–10 are proposed and not approved.** Nothing renders them yet.

## What may change between books, and what may not

**May change:** the chapter number, the title wording, the opener illustration.

**May not change:** face, weight, capitalisation, tracking, the chapter-label style, the rules,
alignment, line spacing, the gaps, ink colour, shadow, scrim, measure, or lockup placement.

## Size rule — decided, do not revisit

Title size **fits to the measure**, varying within **30–44 pt** so the declared two-line split always
survives. Both lines of a given opener always share one size. Owner-approved 2026-09-06.

## What the approved reference still has to settle

The structure above is locked by written direction. The **decorative treatment of the banner** —
its exact shape, ornament and colour — is drawn here from the franchise's own visual language: the
parchment field, gold-brown rule and small diamond ornament used on the approved character sheets.
The approved opener reference did not arrive with the brief, so **treat the ribbon artwork as a
first pass to be corrected**, not as locked. Structure, type, placement and the size rule are locked.
