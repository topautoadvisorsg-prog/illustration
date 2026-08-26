# Render Model â€” Full-Page Artwork + Text-Safe Zones

This is the current, authoritative rendering model. If older docs describe an
"art slot" box, an "image slot", or a coverage-sized image inserted into a box, they are stale â€” this is the truth.

Code: `backend/src/pipeline/stage-6-layout/render-html.ts`
(`buildEntryArticle`, `artworkSheetCss`, `fullPageArtworkCss`, `bodyZoneSpacer`).
Rendered with Paged.js + Chromium (`render-pdf.ts`, `Dockerfile.backend`).

## The principle

**The generated image IS the page.** It is painted full-bleed on the Paged.js
**sheet** (`.pagedjs_sheet`), not inserted as a boxed `<img>`. Text is placed
**within** the artwork in a reserved text-safe zone. The page must feel like one
integrated illustrated page â€” never a photo with a sheet of paper glued on top.

Layout **coverage** does NOT size the image. The image is always full-page.
Coverage / image-priority zone define **where the text-safe zone sits** (the rest is the
image-priority zone, where text is kept out during planning).

## How it renders

1. **Artwork layer** â€” `artworkSheetCss()` paints the entry's image on
   `.pagedjs_sheet` (`background-size: cover`) under a light unifying veil.
   - Single-entry render (`buildPageHtml`): styles `.pagedjs_sheet` globally.
   - Chapter render (`buildChapterHtml`): scopes each entry to its named-page class
     (`.pagedjs_<name>_page .pagedjs_sheet`) so each entry keeps its own art and
     continuation pages reuse it (rule i).
   - âš ï¸ Chromium ignores a `url()` background on `@page` â€” that's why the artwork
     lives on `.pagedjs_sheet` (a real div), not on `@page`.
2. **Title** â€” sits on the artwork, bold, with a paper halo (`text-shadow`) so it
   stays readable over the image.
3. **Body** â€” sits **directly on the artwork** in the text-safe zone. Readability
   comes from a **soft, edgeless scrim** (transparent at the top, feathering to
   ~0.45 paper) + a light glyph halo. **No opaque card, no border, no box-shadow.**
4. **Spacer** â€” `bodyZoneSpacer()` drops the body into the text-safe zone, clearing
   the image-priority area (bigger drop for image-heavier layouts).

## Readability rule (not a ban)

Text on the image is fine **when it's needed and readable**. Use only subtle
techniques â€” soft gradient, light scrim, gentle transparency, glyph halo. Never a
large opaque panel. The image prompt already reserves a calm/negative-space text
zone, so the renderer can trust that zone; the scrim is light insurance.

## Planning preview (no image yet)

Before an image exists, the entry renders a **three-zone planning overlay**:
**Image-Priority Zone** (where focal visual content will live), **Typography Zone**
(where the title sits directly on the artwork), **Text-Safe Zone** (where the
generator keeps the artwork calm so body text overlays readably). Outlines only —
never a filled box — with the caption "The page IS artwork. These zones only mark
where content is allowed." The overlay teaches the model; it is never the image's
frame and never implies the image lives inside a rectangle.

## Continuation pages

A long entry flows across pages; every page of the entry reuses the same artwork
(named-page class). Title appears on the first page; body continues on the
following pages over the same art with the same readable treatment.

## Tuning knobs

- Title halo strength: `.entry-title text-shadow` in `fullPageArtworkCss`.
- Body scrim: the `.text-panel` gradient stops (keep it edgeless/feathered).
- Text-safe drop: `bodyZoneSpacer` fractions per priority edge.
- Image aspect per layout: `stage-3-generation/image-shape.ts`.
- The composition brief sent to the image model: `artBriefText` in
  `stage-2-planner/plan-pages.ts` (the PAGE COMPOSITION BRIEF block in every
  generated image's prompt — three zones, no boxes).

## Vocabulary

- **Image-priority edge** — where the strongest visual content lives in the
  artwork. Identified by `LayoutProfile.artSlot` (name kept for back-compat;
  semantically it's `ImagePriorityEdge`).
- **Image-priority zone** — the region of the page that edge corresponds to.
  Returned by Layout Director as `LayoutAllocation.imagePriorityZone`
  (`artBox` is the back-compat alias).
- **Text-safe zone** — the calm region of the artwork reserved for body text.
- **Typography zone** — where the title sits directly on the artwork.

If a file or doc still says "art slot" / "image slot" / `art-placeholder`, it is
either legacy code marked as removed, or a comment explicitly naming the old
term for Cody's recognition. The runtime never produces a `.art-slot` figure
or a `.art-placeholder` rectangle anymore.

## Verifying a render change (no rasterizer in CI)

Render via the live backend, then rasterize locally with PyMuPDF to eyeball:
```
curl -s -X POST <backend>/api/projects/<id>/pages/<KEY>/render -H "content-type: application/json" -d "{}" -o out.pdf
python -c "import fitz; [p.get_pixmap(dpi=120).save(f'p{i+1}.png') for i,p in enumerate(fitz.open('out.pdf'))]"
```
Always eyeball the rasterized page â€” typecheck/tests can't catch a visual regression.
