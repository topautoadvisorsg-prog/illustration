# Layered Layout Model (Phase 1)

The publishing system expresses layout intent as four orthogonal axes plus the
subject, instead of one flat list of named templates:

```
Content Type  →  Coverage  →  Architecture  →  Master Style  →  Subject
```

- **Content Type** — what KIND of educational page this is (its purpose):
  `SPECIES_PROFILE`, `COMPARISON`, `DIAGNOSTIC_DIAGRAM`, `CHAPTER_OPENER`,
  `HABITAT_OVERVIEW`, `PROGRESSION_STUDY`, `CUTAWAY_ILLUSTRATION`, `SIDEBAR_FEATURE`,
  `REFERENCE_PAGE`, `WARNING_PAGE`, `BOTANICAL_PLATE`, `TERRAIN_ANALYSIS`,
  `FIELD_NOTES_PAGE`, `ENCYCLOPEDIA_ENTRY`, … (`@wildlands/shared` `ContentTypeSchema`).
- **Coverage** — how MUCH of the page is imagery: `15 | 25 | 40 | 50 | 60 | 75 | 100` %.
- **Architecture** — how the image space is ARRANGED, independent of coverage:
  `FLOAT_LEFT`, `FLOAT_RIGHT`, `TOP_BAND`, `BOTTOM_BAND`, `FULL_PAGE`, `SIDEBAR_RIGHT`,
  `SCATTERED`, `CENTER_WRAP`.
- **Master Style** — the brand visual DNA (e.g. THE_WILDLANDS Cinematic Naturalist),
  injected into every image prompt. Orthogonal to the above.
- **Subject** — the page's actual organism/scene.

Coverage and Architecture are deliberately separate: *50% coverage* can be a top-half
band, two diagonal blocks, three blocks, or a centred image with text wrapping — same
coverage, different architecture.

## How it relates to the 15 named templates (migration layer)

The named `LAYOUT_*` templates remain the **render authority** — rendering is unchanged.
The layered model sits above them via two lookups in
`backend/src/pipeline/stage-2-planner/layered-layout.ts`:

- `CONTENT_TYPE_POLICY[contentType]` → `{ defaultCoverage, defaultArchitecture, template }`
  (a content type's defaults + the existing template it renders through today).
- `LAYOUT_TEMPLATE_COMPOSITION[template]` → `{ contentType, coverage, architecture }`
  (decomposes each existing template into the axes; a test asserts each template's
  decomposed `architecture` equals its real render art slot).

`classifyContentType(page)` derives the content type from page identity (or uses the
value Claude already set on the manifest). Stage 1.5 now asks Claude to classify
`contentType`; the planner backfills if absent. The planner surfaces
`contentType`, `coverage`, `architecture` on every page plan and in the `/plan` API
response — without changing which template renders.

## Adding a future layout WITHOUT a new hardcoded template

`composeProfile(coverage, architecture)` is the forward engine: it returns render
params (`artSlot`, `artAreaFraction`, `textAreaFactor`, `textLight`) directly from the
two axes — no named template required. Wrap architectures (float/sidebar/scatter/
center) let text reclaim space alongside the art; band/full architectures consume that
fraction of the page.

When Phase 2 switches the renderer to consume `composeProfile` output, a "new layout"
becomes just a `(contentType → coverage + architecture)` choice — no new template enum
entry, no new CSS module beyond the ~8 architectures. This keeps the layout space
*additive* (axes composed at runtime) rather than a multiplying list of templates.

## Status
- Phase 1 (this doc): axes are first-class + persisted on the manifest; classification
  + decomposition + forward engine implemented and tested; rendering unchanged.
- Phase 2 (later): renderer consumes `composeProfile`; content type drives coverage +
  architecture selection directly (template enum becomes optional/legacy).
