# Layout Zone Allocation Map

This document replaces the old "image slot + text area" model.

The image is the page. Every generated illustration is full-page artwork. Layout
allocation now describes zones inside that artwork:

- **Text-safe zone:** where body text, captions, side notes, and educational copy may sit directly on the artwork.
- **Overlay typography zone:** where titles and headings may sit directly on the artwork.
- **Image-priority zone:** where focal visual detail should live.

Coverage still matters, but it no longer means "the image is this size." Coverage
means "this much of the page is visually prioritized, while the remaining artwork
must stay calm enough for text."

## The 16 Layouts

| # | Name | Image-priority coverage | Text-safe coverage | Primary zone pattern | Word capacity |
|---|---|---|---|---|---|
| 1 | Standard | ~32% | ~68% | Left-side focal detail, right/lower text-safe artwork | 220 / 320 / 420 |
| 2 | Text Heavy | ~14% | ~86% | Small edge/corner visual priority, broad text-safe artwork | 420 / 560 / 720 |
| 3 | Image Dominant | ~50% | ~50% | Right-side hero detail, left/lower text-safe artwork | 90 / 160 / 240 |
| 4 | Comparison Recognition | ~34% | ~66% | Comparison detail zone, lower text-safe artwork | 240 / 340 / 460 |
| 5 | Chapter Opener | ~55% | ~45% | Atmospheric image-priority upper field, title overlay, intro-safe lower field | 40 / 90 / 150 |
| 6 | Reference Grid | ~10% | ~90% | Small support studies, dense text-safe field | 260 / 420 / 620 |
| 7 | Reference Studies | ~36% | ~64% | Scattered study zones with a calm reading path | 160 / 240 / 340 |
| 8 | Margin Art | ~26% | ~74% | Right-edge focal detail, left text-safe artwork | 300 / 430 / 580 |
| 9 | Scattered Studies | ~38% | ~62% | Multiple image-priority studies around a text-safe path | 180 / 280 / 400 |
| 10 | Full Page Plate | ~95% | minimal | Full-page focal artwork with only small caption/title-safe overlays | 0 / 40 / 90 |
| 11 | Continuous Landscape Spread | ~60% | ~40% | Broad landscape priority with restrained lower overlay zones | 0 / 60 / 140 |
| 12 | Diagnostic Diagram | ~42% | ~58% | Upper diagnostic priority zone, lower text-safe artwork | 180 / 280 / 400 |
| 13 | Feature Banner | ~40% | ~60% | Upper terrain/subject priority zone, lower text-safe artwork | 260 / 420 / 620 |
| 14 | Sidebar Feature | ~30% | ~70% | Right-side vertical priority zone, left text-safe artwork | 300 / 460 / 640 |
| 15 | Progression Study | ~42% | ~58% | Upper sequence priority zone, lower text-safe artwork | 220 / 340 / 500 |
| 16 | Cutaway Feature | ~44% | ~56% | Upper cutaway priority zone, lower text-safe artwork | 180 / 300 / 440 |

## Planning Preview

The planning preview must never show a filled "image goes here" rectangle.

Before an image exists, the preview shows the page as a planning canvas with
outlined zones only:

- image-priority zone
- title / overlay typography zone
- text-safe zone

When real artwork exists, it paints the full page. The same zones guide text
placement and prompt composition.

## Back-Compatibility

Some code still exposes deprecated names such as `artBox` and `imagePlacement`.
Those fields are compatibility aliases for existing tests and API consumers.
The current primary model is:

- `textSafeZones`
- `typographyZones`
- `imagePriorityZones`
- `imagePriorityZone`

Remove legacy names only after all UI, API, prompt, and renderer consumers have
migrated.
