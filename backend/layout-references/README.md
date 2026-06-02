# Layout References

This folder documents the stakeholder-provided layout reference library. The
current canonical set is **16 Vintage Naturalist templates**.

## What Goes Here

Each production layout has:

- a mockup/reference image
- written layout description
- use cases and avoid rules
- protected text-zone description
- image-zone description
- word-capacity estimate
- prompt template
- placeholder list
- operator notes

The image is the source during setup. After analysis, the written metadata is
what the planner agent should use repeatedly.

## Canonical Templates

| Template | Purpose |
|---|---|
| `LAYOUT_1_STANDARD` | Balanced single-subject page with strong text space |
| `LAYOUT_2_TEXT_HEAVY` | Long educational entries with small supporting art |
| `LAYOUT_3_ILLUSTRATION_DOMINANT` | Dramatic primary art while preserving open content area |
| `LAYOUT_4_DANGER_WARNING` | Comparison / quick recognition / safety-heavy pages |
| `LAYOUT_5_CHAPTER_OPENER` | Atmospheric chapter opener with reserved lower text area |
| `LAYOUT_6_BACK_MATTER` | Reference grid / three studies over protected text area |
| `LAYOUT_7_SCATTERED_VIGNETTES` | Three staggered reference studies with flowing text space |
| `LAYOUT_8_MARGIN_ILLUSTRATION` | Tall right-side illustration with left text area |
| `LAYOUT_9_DIAGNOSTIC_DIAGRAM` | Scattered studies composition, despite the legacy internal ID |
| `LAYOUT_10_FULL_PAGE_PLATE` | Full-page museum plate with minimal text |
| `LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD` | Two-page continuous landscape spread |
| `LAYOUT_12_DIAGNOSTIC_DIAGRAM` | Large central diagnostic subject with restrained callouts |
| `LAYOUT_13_FEATURE_BANNER` | Wide feature banner over text area |
| `LAYOUT_14_SIDEBAR_FEATURE` | Left vertical illustration with large right text area |
| `LAYOUT_15_PROGRESSION_STUDY` | Sequence, life cycle, or development stages |
| `LAYOUT_16_CUTAWAY_FEATURE` | Cutaway, cross-section, layered/internal structure |

## Intended Workflow

1. Upload the mockup/reference image for each layout.
2. Fill in written metadata and prompt template in the operator UI.
3. Stage 2 chooses a layout based on page purpose, word count, and metadata.
4. Stage 6 proves text fit before image spend.
5. Stage 3 generates clean subject art only.
6. Stage 6 places typography, labels, callouts, and final composition.

## Prompt Safety

Image generation should not create article text, fake labels, headers, page
numbers, or paragraphs. Text areas are protected. If any explicit label is ever
allowed, it must be supplied exactly by the prompt, large and legible, with no
extra words.

## Naming Convention

Use stable names:

```text
layout-01-standard.png
layout-02-text-heavy.png
layout-03-illustration-dominant.png
layout-04-comparison-recognition.png
layout-05-chapter-opener.png
layout-06-reference-grid.png
layout-07-reference-studies.png
layout-08-margin-illustration.png
layout-09-scattered-studies.png
layout-10-full-page-plate.png
layout-11-continuous-landscape-spread.png
layout-12-diagnostic-diagram.png
layout-13-feature-banner.png
layout-14-sidebar-feature.png
layout-15-progression-study.png
layout-16-cutaway-feature.png
```

The current frontend stores uploaded mockups in project config as data URLs for
testing. Production storage should move large assets to object storage.

## Capacity Testing

Each layout has:

- `minWords`
- `targetWords`
- `maxWords`
- `recommendedBodyPt`
- `recommendedLineHeight`
- `capacityTestStatus`

Statuses:

- `UNTESTED` - starting estimate only
- `TESTING` - real manuscript text is being fitted
- `APPROVED` - operator accepted the range

## Debugging

Run:

```bash
yarn audit:layouts
```

The audit confirms:

- 16 templates are present
- each template appears in shared contracts
- planner capacities exist
- mockup images exist
- frontend/backend prompt safety rules stay aligned
