# Stage 6 - Layout Engine

**Status:** Phase 1 foundation. Engine choice is locked: **Puppeteer + Paged.js**.

**What it does:** Renders text-fit previews and final chapter PDFs using Puppeteer + Paged.js. Reads page manifests, selected layout templates, optional layout references, upscaled images, and project config.

Chapter-by-chapter rendering is mandatory. It prevents memory blowups on 240-page books.

## Input

- All page manifests in a chapter
- Selected `layout_template` and optional `layout_reference_id`
- Placeholder/reference images for pre-generation text-fit previews
- Upscaled images for final render, each with `PRINT_READY` status
- Project config: typography, colors, trim, bleed, layout templates

## Output

- Text-fit preview artifact for planner/review
- `STORAGE_ROOT/{brand}/output/{book_id}/chapters/{book_id}_CH{NN}.pdf`
- Page-level status updated to `LAID_OUT`

## Rendering Engine

Puppeteer + Paged.js. Decision recorded in `docs/decision-log.md` ADR-003a and `spikes/pdf-engine-bakeoff/RESULTS.md`.

## Two-Pass Layout Workflow

1. **Text-fit preview pass:** render the manuscript text into the selected layout using placeholder/reference art. This validates that the chosen template can hold the text before spending image-generation or upscaling credits.
2. **Final render pass:** after Stage 3 and Stage 5 produce the real subject image, render the same locked layout again with the generated/upscaled image.

Example: if a page is about a frog, Stage 2 chooses the right layout for the text shape first. Stage 6 proves the wording fits. Then Stage 3 generates frog artwork only. Stage 6 places the frog art into the already-proven page layout.

## Page Dimensions

- 8.5 x 11 trim renders at **8.625 x 11.25** inches including bleed.
- 6 x 9 trim renders at **6.125 x 9.25** inches in later phases only.

## How To Run Locally

```bash
yarn workspace @wildlands/backend run worker:layout
```

## What Can Go Wrong

| Symptom | Cause | Fix |
|---|---|---|
| OOM on full book | Rendering all pages in one Puppeteer session | Reset session per chapter |
| Font not rendered | Font not registered with Chromium/load path | Pre-register fonts at server boot |
| Text overflows page | Template is too image-heavy or continuation is missing | Retry text-fit with heavier layout or add continuation page |
| Preview passes but final image crowds text | Generated image crop/subject placement differs from reference | Re-render with crop guardrails; regenerate only if needed |
| Wrong color | Missing sRGB profile | Embed via Stage 7 post-process |
| Small caps look wrong | EB Garamond lacks true small caps | CSS small caps accepted for v1 per ADR-005 |

## Design Notes

- Typography specs load from project config; do not hardcode them in renderer code.
- Each layout template is one component/CSS module. No shared layout monolith.
- Layout references live in `backend/layout-references/` and are used for preview and selection guidance.
- Memory is freed between chapters by closing Puppeteer pages/browser sessions.
- Layout failures retry once with detailed error logs; second failure requires human review.
