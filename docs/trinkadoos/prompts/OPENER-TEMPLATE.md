# The Trinkadoos — opener template

**Approved 2026-09-06 on the Book 1 render. This is the locked opener for all ten books.**

The opener is the **only** page in the series that carries text, and the text is **painted into
the illustration by the image model**, not composited afterwards. Every other page — all fourteen
spreads and the closer — is generated text-free, with story text added over the reserved parchment
region at layout.

Produced by `backend/scripts/trinkadoos-opener-render.ts`.

---

## The structure

```
   [ plain carved wooden sign, hung from a branch:  Chapter <Number> ]

              TITLE LINE 1
              TITLE LINE 2

   ( the scene, below and behind )
```

The chapter label lives on the wooden sign at the top and nowhere else. **Never between the title
lines.** The title sits below the sign, exactly two centred lines. Scene action stays below both.

## Book 1 — the approved reference render

```
Chapter One
The Lantern Tree
Went Dark
```

`10-ARTWORK/opener-01_banner-painted.png`

## Locked: the sign

A **small plain carved wooden sign** — honey-toned wood, visible grain, softly rounded and slightly
worn edges, hung from a branch above on two short ropes, chapter words carved into the wood,
catching the same daylight as the canopy and casting a soft shadow.

**The surface is bare.** No scrollwork, no flourishes, no filigree, no decorative carving, no
burned-in ornament, no corner motifs, no border pattern. Nothing on the wood but the chapter words.

> **Why bare.** The second pass came back with carved scrollwork at both ends and it looked good —
> once. Generated ornament is different on every render, so across ten books it would be ten
> different signs wearing the same name. A plain plank is the only version of this that repeats.

**Never** cloth, fabric, ribbon, canvas, hanging parchment or bunting. The first pass came back as
a sagging fabric banner; fabric reads as a party decoration and drifts wherever the model likes.
Each of those negatives is in the prompt because a render actually produced it.

## Locked: the lettering

**Hand-lettered by the illustrator**, not a font dropped on the page — soft rounded serifs, gentle
organic variation in the stroke weights, warmth and slight irregularity in the letterforms.
Elegant, whimsical, child-friendly, highly readable.

- Chapter words: carved into the wood, warm dark brown.
- Title: creamy ivory with a soft darker outline and a gentle glow, so it reads against sky and
  belongs to the painting.

**Never** a plain system font, a typewriter face, flat digital text or clip-art lettering.

## Locked: composition

| | |
| --- | --- |
| Page | single page, square **1:1** · 8.5 × 8.5 in trim |
| Sign | top of frame, hung from a branch |
| Title | directly below the sign, two centred lines, across open sky |
| Characters | below the title — heads stay under the upper 38% of the frame |
| Reference | the everyday or magical group sheet for that scene |

## Declared title splits — never auto-wrapped

Exactly one line above, one line below. A wrap left to the model turns one line into two on a
longer title and the series stops looking like a series.

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

Book 1 is owner-specified; 2–10 are proposed and not yet approved.

## What changes between books, and what does not

**Changes:** chapter number, title wording, the scene.

**Does not change:** the plain wooden sign, its ropes and placement, the bare surface, the
hand-lettering treatment, the two-line title below the sign, the 1:1 page, the 38% head rule.

## Mandatory check before any opener ships

**Read the spelling at a 3× crop, not at page scale.** At page scale a wrong letter is invisible;
at 3× it is obvious. The model letters this text, so its spelling is the model's until a human has
actually read it.

Book 1 checked and correct: *Chapter One* · *The Lantern Tree* · *Went Dark*.

## Fallback, if a longer title comes back misspelled

`trinkadoos-opener-render.ts blank <book>` renders the **same** wooden sign as a bare plank with
the sky left clear, and `trinkadoos-opener.ts` composites the type onto it. That keeps the painted
sign and buys exact spelling. Books 6, 8 and 9 carry the longest titles and are the likeliest to
need it.
