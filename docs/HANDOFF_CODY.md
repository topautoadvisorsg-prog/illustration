# Wildlands Handoff

Read this first before changing layout, image prompts, rendering, or proof export.

## Current Truth

The platform is migrating from the old mental model:

```text
Art Slot + Text Area
```

to the correct publishing model:

```text
Full Page Artwork + Text-Safe Zones + Overlay Typography Zones + Image-Priority Zones
```

The image is the page. It is not placed inside a box.

Zones describe where readable text, titles, and visual focal detail belong inside the artwork.

## Latest Checkpoint

Commit `568cad1` completed Phase 1 and Phase 2 of the migration.

Completed:

- Operator-facing vocabulary cleanup.
- Page Plan preview now shows a full-page artwork canvas with outlined zones.
- Frontend fallback presets show zone previews even for older project data.
- Layout Director now emits:
  - `textSafeZones`
  - `typographyZones`
  - `imagePriorityZones`
  - `imagePriorityZone`
- Deprecated compatibility fields remain:
  - `artBox`
  - `imagePlacement`
  - `imageZoneDescription`
  - `imageSlotDescription`
- API schemas and text-fit preview types expose the new zone arrays.
- Tests updated around the new zone terminology.

Browser validation after the checkpoint:

- `129` page-plan cards visible.
- `129` zone-preview cards visible.
- First page preview displays:
  - `Full-page artwork canvas`
  - `Image-priority`
  - `Title / typography`
  - `Text-safe`
  - `The image is the page. Outlines only show where text, title, and focal detail belong.`

## Stop Point

Do not proceed to prompt changes or renderer consumption changes until the operator visually approves the new planning preview.

The next approved-but-paused work is:

1. Update prompts.
2. Update renderer/export consumers to consume zones directly.
3. Remove old `artBox` / `.art-slot` assumptions after proof, chapter, and full-book export parity is verified.

## Verification Already Run

```bash
corepack yarn workspace @wildlands/backend test src/__tests__/render-html.test.ts src/__tests__/render-chapter.test.ts src/__tests__/plan-pages.test.ts src/__tests__/text-fit.test.ts src/__tests__/generate-image.test.ts
corepack yarn workspace @wildlands/backend typecheck
corepack yarn workspace @wildlands/backend build
corepack yarn workspace frontend build
```

Result:

- Focused backend tests: `54 passed`
- Backend typecheck: passed
- Backend build: passed
- Frontend build: passed

## Files To Know

- `docs/RENDER_MODEL.md` is the authoritative rendering model.
- `docs/LAYOUT_ALLOCATION_MAP.md` maps all 16 layouts to zone language.
- `backend/src/pipeline/stage-6-layout/layout-director.ts` emits the new zone model beside legacy aliases.
- `backend/src/pipeline/stage-2-planner/plan-pages.ts` carries zone data into page planning and prompt briefs.
- `frontend/src/App.js` renders the operator planning preview.
- `frontend/src/App.css` styles the zone preview canvas.

## Current Risk

The UI now teaches the correct model, but some backend/export paths still keep compatibility names and geometry fields. That is intentional for Phase 2. Do not remove them until prompt and renderer consumption migration is complete.

## Unrelated Local Files

There may be untracked files under:

```text
backend/src/services/publishing-director/
```

Those are not part of the zone preview checkpoint unless explicitly staged in a future commit.
