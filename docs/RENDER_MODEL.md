# Render Model — Full-Page Artwork + Text-Safe Zones

This is the current, authoritative rendering model. If older docs describe an
"art slot" box or a coverage-sized image, they are stale — this is the truth.

Code: `backend/src/pipeline/stage-6-layout/render-html.ts`
(`buildEntryArticle`, `artworkSheetCss`, `fullPageArtworkCss`, `bodyZoneSpacer`).
Rendered with Paged.js + Chromium (`render-pdf.ts`, `Dockerfile.backend`).

## The principle

**The generated image IS the page.** It is painted full-bleed on the Paged.js
**sheet** (`.pagedjs_sheet`), not inserted as a boxed `<img>`. Text is placed
**within** the artwork in a reserved text-safe zone. The page must feel like one
integrated illustrated page — never a photo with a sheet of paper glued on top.

Layout **coverage** does NOT size the image. The image is always full-page.
Coverage / art slot define **where the text-safe zone sits** (the rest is the
image-priority zone, where text is kept out during planning).

## How it renders

1. **Artwork layer** — `artworkSheetCss()` paints the entry's image on
   `.pagedjs_sheet` (`background-size: cover`) under a light unifying veil.
   - Single-entry render (`buildPageHtml`): styles `.pagedjs_sheet` globally.
   - Chapter render (`buildChapterHtml`): scopes each entry to its named-page class
     (`.pagedjs_<name>_page .pagedjs_sheet`) so each entry keeps its own art and
     continuation pages reuse it (rule i).
   - ⚠️ Chromium ignores a `url()` background on `@page` — that's why the artwork
     lives on `.pagedjs_sheet` (a real div), not on `@page`.
2. **Title** — sits on the artwork, bold, with a paper halo (`text-shadow`) so it
   stays readable over the image.
3. **Body** — sits **directly on the artwork** in the text-safe zone. Readability
   comes from a **soft, edgeless scrim** (transparent at the top, feathering to
   ~0.45 paper) + a light glyph halo. **No opaque card, no border, no box-shadow.**
4. **Spacer** — `bodyZoneSpacer()` drops the body into the text-safe zone, clearing
   the image-priority area (bigger drop for image-heavier layouts).

## Readability rule (not a ban)

Text on the image is fine **when it's needed and readable**. Use only subtle
techniques — soft gradient, light scrim, gentle transparency, glyph halo. Never a
large opaque panel. The image prompt already reserves a calm/negative-space text
zone, so the renderer can trust that zone; the scrim is light insurance.

## Placeholder = planning only

Before an image exists, the entry renders a dashed **IMAGE ZONE** marker (the
text-exclusion zone) so the operator reviews layout/text-fit before spending on
art. The placeholder is never the image's frame and never becomes the image box.

## Continuation pages

A long entry flows across pages; every page of the entry reuses the same artwork
(named-page class). Title appears on the first page; body continues on the
following pages over the same art with the same readable treatment.

## Tuning knobs

- Title halo strength: `.entry-title text-shadow` in `fullPageArtworkCss`.
- Body scrim: the `.text-panel` gradient stops (keep it edgeless/feathered).
- Text-safe drop: `bodyZoneSpacer` fractions per priority edge.
- Image aspect per layout: `stage-3-generation/image-shape.ts`.

## Verifying a render change (no rasterizer in CI)

Render via the live backend, then rasterize locally with PyMuPDF to eyeball:
```
curl -s -X POST <backend>/api/projects/<id>/pages/<KEY>/render -H "content-type: application/json" -d "{}" -o out.pdf
python -c "import fitz; [p.get_pixmap(dpi=120).save(f'p{i+1}.png') for i,p in enumerate(fitz.open('out.pdf'))]"
```
Always eyeball the rasterized page — typecheck/tests can't catch a visual regression.
