# Stage 2 - Scene & Page Planner

**Status:** Phase 1 foundation. Spike 2 proved the downstream path; production logic now needs the stakeholder layout-reference library.

**What it does:** For each page manifest, chooses one of the 9 production layout templates, picks a matching layout reference when available, validates that the text belongs in that layout family, and assembles the image-generation prompt for the actual subject art.

The layout reference images are decision aids and preview anchors. They are not final generated art and they must not contain final page text.

## Input

- One page manifest (`{book_id}_P{NNN}.json`)
- Project config: typography, brand, active Master Style Block reference
- Active brand Master Style Block text
- Layout reference metadata from `backend/layout-references/manifest.json`

## Output

- `layout_template` confirmed and locked on the page manifest
- `layout_reference_id` attached when a matching reference exists
- Text-fit preview request sent to Stage 6 before image API spend
- `image_prompt` added after text fit is accepted
- BullMQ `image-generation` job enqueued
- Returns `{ page_id, layout_template, layout_reference_id, prompt_char_count, queued }`

## Layout Selection

First-pass decision tree:

```text
is_danger_page == true             -> LAYOUT_4_DANGER_WARNING
page_type == 'CHAPTER_OPENER'      -> LAYOUT_5_CHAPTER_OPENER
page_type == 'BACK_MATTER_TABLE'   -> LAYOUT_6_BACK_MATTER
page_type == 'TECHNICAL_DIAGRAM'   -> LAYOUT_9_DIAGNOSTIC_DIAGRAM
page_type == 'COMPARISON'          -> LAYOUT_9_DIAGNOSTIC_DIAGRAM
page_type == 'TRACK_OR_HABITAT'    -> LAYOUT_7_SCATTERED_VIGNETTES
page_type == 'TREE_OR_TALL_PLANT'  -> LAYOUT_8_MARGIN_ILLUSTRATION
word_count < 200                   -> LAYOUT_3_ILLUSTRATION_DOMINANT
word_count > 400                   -> LAYOUT_2_TEXT_HEAVY
else                               -> LAYOUT_1_STANDARD
```

## Required Workflow

1. Read the page text and calculate word count.
2. Classify content intent: standard entry, long text, comparison, diagnostic diagram, warning, chapter opener, back matter, scattered vignettes, tall/margin subject.
3. Select the template using the decision tree and matching layout-reference metadata.
4. Ask Stage 6 for a text-fit preview using the selected layout and placeholder/reference art.
5. If text overflows or feels cramped, retry with a more text-heavy layout before any image API spend.
6. Once layout/text fit is accepted, assemble the real image prompt from:
   - active Master Style Block
   - page subject, such as frog, tree, chanterelle, track, or habitat
   - scientific/diagnostic details
   - image-only composition guidance
7. Enqueue Stage 3 image generation.

## Hard Rule

Do not ask the image model to render the page layout or the page text. It only generates the illustration subject. Stage 6 owns page composition, typography, text placement, headers, page numbers, and final PDF output.

## How To Run Locally

```bash
curl -X POST http://localhost:8001/api/projects/{id}/plan \
  -H "Authorization: Bearer $TOKEN"
```

## What Can Go Wrong

| Symptom | Cause | Fix |
|---|---|---|
| Prompt > 4000 chars | gpt-image-1 prompt cap | Truncate annotations; log warning; never silently drop subject |
| Wrong layout picked | Edge case in decision tree | Add manual override per page via API |
| Text-fit preview fails | Layout too image-heavy for the manuscript text | Retry with `LAYOUT_2_TEXT_HEAVY` or a continuation page |
| Layout reference missing | Stakeholder image library not mapped yet | Fall back to template default and log a warning |
| Missing zone icons | Brand config missing zone definitions | Fail loudly and block the page until config is updated |

## Design Notes

- Claude is not used at this stage in v1; this is deterministic logic over manifest data.
- Future Claude layout judging is allowed only with structured output and human override.
- The full image prompt is logged at INFO level for auditability.
- Layout references influence template choice and preview shape, not generated image content.
