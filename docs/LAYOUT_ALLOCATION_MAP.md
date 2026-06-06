# Layout Allocation Map

For every layout: how much of the page is **image** (coverage), **where** the image
sits (architecture), how much **text** it holds (word capacity), and whether a
**mockup reference image** exists. This is the layout agent's reference for placing
text and reserving the art zone â€” *even when no real illustration exists yet*.

**All 16 layouts already have a mockup image** in `frontend/public/layout-references/`
and a defined allocation below â€” so none are "unallocated." The text-fit preview can
render any of them as a blank page with the art zone reserved (the agent "imagines"
the image is there using coverage + architecture), then drops in the real art once
generated. New coverageÃ—architecture combinations the layered model invents (beyond
these 16) render the same way â€” reserved zone + text â€” and become saved references
once their first image is generated.

## The 16 layouts

| # | Name | Image coverage | Text zone | Where the image sits (architecture) | Word capacity (min/target/max) | Mockup |
|---|---|---|---|---|---|---|
| 1 | Standard | ~32% | ~68% | Upper-left, text wraps around (FLOAT_LEFT) | 220 / 320 / 420 | âœ… |
| 2 | Text Heavy | ~14% | ~86% | Small upper-left corner, text dominates (FLOAT_LEFT) | 420 / 560 / 720 | âœ… |
| 3 | Image Dominant | ~50% | ~50% | Large upper-right hero, text left/below (FLOAT_RIGHT) | 90 / 160 / 240 | âœ… |
| 4 | Comparison Recognition | ~34% | ~66% | Two subjects compared up top, text below (FLOAT_LEFT) | 240 / 340 / 460 | âœ… |
| 5 | Chapter Opener | ~55% | ~45% (decorative) | Atmospheric band across the top (TOP_BAND) | 40 / 90 / 150 | âœ… |
| 6 | Reference Grid | ~10% | ~90% | Small right-side art, tables/lists dominate (FLOAT_RIGHT) | 260 / 420 / 620 | âœ… |
| 7 | Reference Studies | ~36% | ~64% | Several small studies scattered, text flows (SCATTERED) | 160 / 240 / 340 | âœ… |
| 8 | Margin Art | ~26% | ~74% | Tall narrow image on the right, big left text column (FLOAT_RIGHT) | 300 / 430 / 580 | âœ… |
| 9 | Scattered Studies | ~38% | ~62% | Multiple studies around the page, text between (SCATTERED) | 180 / 280 / 400 | âœ… |
| 10 | Full Page Plate | ~95% | minimal | Full-page showcase plate (FULL_PAGE) | 0 / 40 / 90 | âœ… |
| 11 | Continuous Landscape Spread | ~60% | ~40% (decorative) | Wide landscape band across the top (TOP_BAND) | 0 / 60 / 140 | âœ… |
| 12 | Diagnostic Diagram | ~42% | ~58% | Central subject diagram band up top, text below (TOP_BAND) | 180 / 280 / 400 | âœ… |
| 13 | Feature Banner | ~40% | ~60% | Wide horizontal banner up top, text below (TOP_BAND) | 260 / 420 / 620 | âœ… |
| 14 | Sidebar Feature | ~30% | ~70% | Tall image in the right column, text left (SIDEBAR_RIGHT) | 300 / 460 / 640 | âœ… |
| 15 | Progression Study | ~42% | ~58% | Sequence of stages banded up top, text below (TOP_BAND) | 220 / 340 / 500 | âœ… |
| 16 | Cutaway Feature | ~44% | ~56% | Cross-section/cutaway banded up top, text below (TOP_BAND) | 180 / 300 / 440 | âœ… |

(Image coverage = the art's share of the page; text zone is the rest. Source of truth:
`backend/src/pipeline/stage-6-layout/layout-profiles.ts`.)

## Grouped by how much writing they hold

- **Heavy writing (~84â€“90% text, tiny corner image):** Text Heavy (2), Reference Grid (6)
- **Text-led (~66â€“74% text):** Standard (1), Comparison (4), Margin Art (8), Sidebar Feature (14)
- **Balanced (~56â€“64% text):** Reference Studies (7), Scattered Studies (9), Diagnostic Diagram (12), Feature Banner (13), Progression Study (15), Cutaway Feature (16)
- **Image-led (â‰¤50% text):** Image Dominant (3), Chapter Opener (5), Landscape Spread (11)
- **Image-only:** Full Page Plate (10)

## Grouped by where the image sits

- **Upper-left, text wraps (FLOAT_LEFT):** Standard (1), Text Heavy (2), Comparison (4)
- **Right side, text wraps (FLOAT_RIGHT):** Image Dominant (3), Reference Grid (6), Margin Art (8)
- **Band across the top, text below (TOP_BAND):** Chapter Opener (5), Landscape (11), Diagnostic (12), Feature Banner (13), Progression (15), Cutaway (16)
- **Scattered studies, text flows around (SCATTERED):** Reference Studies (7), Scattered Studies (9)
- **Tall right sidebar (SIDEBAR_RIGHT):** Sidebar Feature (14)
- **Full page (FULL_PAGE):** Full Page Plate (10)

## How "imagine the image is there" works (no mockup needed)

The text-fit preview (`buildPageHtml` / `buildChapterHtml`, Stage 6) reserves the art
zone in the right position and flows the manuscript text into the remaining space,
showing a dashed **"PREVIEW Â· image-priority zone"** placeholder where the illustration will go.
So a page renders correctly before any art exists. When the real illustration is
generated and approved, it drops into that same slot â€” and that image becomes the
saved reference for future pages of the same type, growing the library.

### Known refinement (future)
The placeholder slot is sized per *architecture* (e.g. a top band, a left float), not
yet scaled to the exact coverage % â€” close enough for text-fit, but a future pass can
size the reserved zone to the precise `artAreaFraction` for pixel-accurate previews.
