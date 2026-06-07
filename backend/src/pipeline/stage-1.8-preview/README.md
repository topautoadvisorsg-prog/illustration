# Stage 1.8 — Text-In-Reading-Field Preview

**Status:** v1 implemented behind `PAGINATION_V1_ENABLED=false`. No API
endpoint exposes this yet — modules are unit-testable and `renderPreviewPdf`
returns a PDF buffer ready for inline display.

See `SPEC_PAGINATION_V1.md` §6 for the operator UX this preview powers.

## What it does

Renders a single printed page (from `PaginatedPage`) as a one-page PDF that
shows the operator:

- the entry title in the title band (with `(continued)` / `+ N more` flag
  where applicable),
- the actual manuscript text rendered inside the actual Reading Field
  rectangle, at the actual typography, on the actual page geometry,
- the image-priority zone marked with a hatched placeholder labeled
  *"Image: \<imageSubject\>"* so the operator knows what art will fill it
  later.

No image API spend. No illustration. The Reading Field is framed with a
dashed orange border in the preview so the operator can SEE where text is
placed; the final print render has no border.

If the rendered PDF has more than one page, the Reading Field overflowed and
the operator must re-paginate or accept the overflow with a logged reason.

## Module map

| File | Responsibility |
|---|---|
| `preview-page.html.ts` | Pure HTML builder. Takes a `PaginatedPage` + `ProjectConfig`, returns a single-page HTML string. No I/O, no Chromium. Easy to test. |
| `render-preview.ts` | Drives `buildPreviewPageHtml` → Stage 6's `renderHtmlToPdf` → PDF buffer. Requires Chromium. |
| `preview-cache.ts` | sha256-keyed on-disk cache under `<STORAGE_ROOT>/previews/`. Reopening the Page Production tab is instant. |

## Cache key

Hashed over `(pageKey, plannedPageNumber, entryTitle, pageRole,
layoutTemplate, readingFieldText, compactedEntryKeys, imageSubject,
textSafeZones, imagePriorityZones, typographyZones, typography, trimSize,
paper)`. Anything that would change the rendered glyph positions
invalidates the cache.

## Feature flag

```env
PAGINATION_V1_ENABLED=false   # default; safe to ship dormant
```

Wire `renderPreviewPdf` to an API route only after Stage 1.75 + Stage 1.8 +
the frontend Page Production tab are all green for an end-to-end operator
test on a real project.

## Tests

```
__tests__/preview-page.test.ts        HTML content + structure
__tests__/preview-cache.test.ts       cache hit / miss / clear
__tests__/render-preview.test.ts      end-to-end PDF (skipped when Chromium absent)
```

Run with `corepack yarn vitest run` from `backend/`.

## Samples

```
__samples__/preview.demo.ts
```

Renders an actual PDF for a synthetic page and writes it to `tmp/`. Useful
for eyeballing the layout before wiring the frontend.
