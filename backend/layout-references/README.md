# Layout References

This folder is the source library for stakeholder-provided page layout reference images.

## What Goes Here

The operator will provide roughly 12 reference images. These are not final book pages and they are not AI prompt outputs. They are visual examples that teach the platform what each layout family should feel like when Stage 2 chooses a page layout and Stage 6 renders the text.

Each image maps to one of the 9 production layout templates:

| Template | Purpose |
|---|---|
| `LAYOUT_1_STANDARD` | Balanced text + illustration page |
| `LAYOUT_2_TEXT_HEAVY` | Long text with smaller supporting art |
| `LAYOUT_3_ILLUSTRATION_DOMINANT` | Shorter text where image carries the page |
| `LAYOUT_4_DANGER_WARNING` | Toxic, poisonous, safety, or warning-heavy entry |
| `LAYOUT_5_CHAPTER_OPENER` | Atmospheric chapter opening spread/page |
| `LAYOUT_6_BACK_MATTER` | Tables, indexes, glossary, look-alike lists |
| `LAYOUT_7_SCATTERED_VIGNETTES` | Multiple small naturalist vignettes |
| `LAYOUT_8_MARGIN_ILLUSTRATION` | Tall subject or small margin illustration |
| `LAYOUT_9_DIAGNOSTIC_DIAGRAM` | Comparison, anatomy, tracks, diagrams |

## Intended Workflow

1. Store the reference images here.
2. Add metadata to `manifest.json` describing which template each image belongs to and when it should be used.
3. Stage 2 reads the page text and manifest fields, then chooses the best layout template/reference.
4. Stage 6 renders a text-fit preview using the selected template and a placeholder/reference image.
5. If the text fit is good, Stage 2/3 proceeds with the real image prompt for the page subject.
6. Stage 6 replaces the placeholder/reference art with the generated/upscaled subject image.

The image-generation model must create the subject illustration only. It must not bake page text into the image. Text placement, typography, page furniture, and final composition are handled by Puppeteer + Paged.js.

## Naming Convention

Use stable names so metadata can point to them:

```text
layout-01-standard-a.png
layout-02-text-heavy-a.png
layout-09-diagnostic-comparison-a.png
```

## Metadata

Create `manifest.json` next to the images:

```json
[
  {
    "id": "layout-02-text-heavy-a",
    "templateId": "LAYOUT_2_TEXT_HEAVY",
    "imagePath": "layout-02-text-heavy-a.png",
    "label": "Long entry with small corner image",
    "useWhen": ["word_count > 400", "single subject", "text must dominate"],
    "minWords": 400,
    "contentTypes": ["field_guide_entry"]
  }
]
```

## What Can Go Wrong

| Symptom | Likely Cause | Fix |
|---|---|---|
| Text does not fit | Wrong template chosen for word count | Stage 2 retries with a more text-heavy template |
| Image subject feels wrong | Page manifest subject is too vague | Tighten `imageSubject` during Stage 1.5 manifest generation |
| AI returns a full poster/page | Prompt leaked layout/text instructions into image generation | Keep layout instructions in Stage 6 only; image prompt describes subject art |
| Similar pages look inconsistent | References are unmapped or too broad | Add metadata and pick one canonical reference per template |
