# Stage 6 - Layout Engine

**Status:** Phase 1 foundation. Engine choice is locked: **Puppeteer + Paged.js**.

**What it does:** Renders text-fit previews and final chapter PDFs using Puppeteer + Paged.js. Reads page manifests, selected layout templates, optional layout references, upscaled images, and project config.

Current rendering model: **full-page artwork + text-safe zones + overlay typography zones + image-priority zones**. The generated image is the page. It is not inserted into an image box. Zone data controls where text and title overlays may sit, and where focal visual detail should be concentrated.

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

1. **Planning/text-fit preview pass:** render the manuscript text against the selected layout zones using placeholder/reference planning overlays. This validates that the text-safe zone can hold the manuscript before spending image-generation or upscaling credits.
2. **Final render pass:** after Stage 3 and Stage 5 produce the real subject image, render the same locked layout again with the generated/upscaled full-page artwork.

Example: if a page is about a frog, Stage 2 chooses the right text-safe/title/image-priority zone pattern first. Stage 6 proves the wording fits. Then Stage 3 generates full-page frog artwork that naturally reserves those zones. Stage 6 paints that artwork across the whole page and overlays readable text in the approved zones.

## Zone Model Migration Checkpoint

Phase 1 and Phase 2 are complete:

- Operator vocabulary and previews now teach the correct model.
- Page Plan shows a full-page artwork canvas with outlined text-safe, title/typography, and image-priority zones.
- Layout Director returns `textSafeZones`, `typographyZones`, `imagePriorityZones`, and `imagePriorityZone`.
- Deprecated `artBox` remains as a compatibility alias until every consumer has migrated.

Do not start prompt changes or renderer consumption changes until the operator visually approves the planning preview.

Next phases after approval:

1. Update Stage 2/3 prompts so the image generator receives explicit full-page artwork and zone-reservation instructions.
2. Update render/export consumers to read zones directly instead of compatibility fields.
3. Remove legacy `<figure class="art-slot"><img /></figure>` assumptions only after proof, chapter, and book export parity are verified.

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
| Preview passes but final image crowds text | Generated image did not respect text-safe zone | Regenerate with stronger zone-reservation prompt; re-render only after readability is verified |
| Wrong color | Missing sRGB profile | Embed via Stage 7 post-process |
| Small caps look wrong | EB Garamond lacks true small caps | CSS small caps accepted for v1 per ADR-005 |

## Design Notes

- Typography specs load from project config; do not hardcode them in renderer code.
- Layout templates define zones inside a full-page artwork canvas, not image containers.
- Layout references live in `backend/layout-references/` and are used for preview and selection guidance.
- Memory is freed between chapters by closing Puppeteer pages/browser sessions.
- Layout failures retry once with detailed error logs; second failure requires human review.
