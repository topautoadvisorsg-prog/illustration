# Layered Layout Model (Phase 1)

The publishing system expresses layout intent as four orthogonal axes plus the
subject, instead of one flat list of named templates:

```
Content Type  â†’  Coverage  â†’  Architecture  â†’  Master Style  â†’  Subject
```

- **Content Type** â€” what KIND of educational page this is (its purpose):
  `SPECIES_PROFILE`, `COMPARISON`, `DIAGNOSTIC_DIAGRAM`, `CHAPTER_OPENER`,
  `HABITAT_OVERVIEW`, `PROGRESSION_STUDY`, `CUTAWAY_ILLUSTRATION`, `SIDEBAR_FEATURE`,
  `REFERENCE_PAGE`, `WARNING_PAGE`, `BOTANICAL_PLATE`, `TERRAIN_ANALYSIS`,
  `FIELD_NOTES_PAGE`, `ENCYCLOPEDIA_ENTRY`, â€¦ (`@wildlands/shared` `ContentTypeSchema`).
- **Coverage** â€” how MUCH of the page is imagery: `15 | 25 | 40 | 50 | 60 | 75 | 100` %.
- **Architecture** â€” how the image space is ARRANGED, independent of coverage:
  `FLOAT_LEFT`, `FLOAT_RIGHT`, `TOP_BAND`, `BOTTOM_BAND`, `FULL_PAGE`, `SIDEBAR_RIGHT`,
  `SCATTERED`, `CENTER_WRAP`.
- **Master Style** â€” the brand visual DNA (e.g. THE_WILDLANDS Cinematic Naturalist),
  injected into every image prompt. Orthogonal to the above.
- **Subject** â€” the page's actual organism/scene.

Coverage and Architecture are deliberately separate: *50% coverage* can be a top-half
band, two diagonal blocks, three blocks, or a centred image with text wrapping â€” same
coverage, different architecture.

## How it relates to the 15 named templates (migration layer)

The named `LAYOUT_*` templates remain the **render authority** â€” rendering is unchanged.
The layered model sits above them via two lookups in
`backend/src/pipeline/stage-2-planner/layered-layout.ts`:

- `CONTENT_TYPE_POLICY[contentType]` â†’ `{ defaultCoverage, defaultArchitecture, template }`
  (a content type's defaults + the existing template it renders through today).
- `LAYOUT_TEMPLATE_COMPOSITION[template]` â†’ `{ contentType, coverage, architecture }`
  (decomposes each existing template into the axes; a test asserts each template's
  decomposed `architecture` equals its real render image-priority zone).

`classifyContentType(page)` derives the content type from page identity (or uses the
value Claude already set on the manifest). Stage 1.5 now asks Claude to classify
`contentType`; the planner backfills if absent. The planner surfaces
`contentType`, `coverage`, `architecture` on every page plan and in the `/plan` API
response â€” without changing which template renders.

## Usage guidance â€” the agent's go-to reference

Each content type carries built-in guidance so the classifier/agent knows *when* to
pick it, without re-deriving it every time:

- `purpose` â€” one line: what the page type IS.
- `usedFor` â€” plain-English example uses (e.g. COMPARISON â†’ "look-alike warnings",
  "edible-vs-toxic comparisons"; CHAPTER_OPENER â†’ "chapter/section openers").
- `multiSubject` â€” whether the page typically shows more than one subject (COMPARISON,
  FIELD_NOTES, PROGRESSION, HABITAT = true; SPECIES_PROFILE = false).

`GET /api/content-types` returns the full catalog (every type + purpose + usedFor +
defaults + render template) â€” the reference the agent reads. Each page plan and the
`/plan` response also carry `contentTypePurpose`, `contentTypeUsedFor`, and
`multiSubject` so the operator sees *why* a layout was chosen and what it's for. This
guidance is meant to grow over time as we learn which types suit which pages.

## Adding a future layout WITHOUT a new hardcoded template

`composeProfile(coverage, architecture)` is the forward engine: it returns render
params (`artSlot`, `artAreaFraction`, `textAreaFactor`, `textLight`) directly from the
two axes â€” no named template required. Wrap architectures (float/sidebar/scatter/
center) let text reclaim space alongside the art; band/full architectures consume that
fraction of the page.

When Phase 2 switches the renderer to consume `composeProfile` output, a "new layout"
becomes just a `(contentType â†’ coverage + architecture)` choice â€” no new template enum
entry, no new CSS module beyond the ~8 architectures. This keeps the layout space
*additive* (axes composed at runtime) rather than a multiplying list of templates.

## Status
- Phase 1 (this doc): axes are first-class + persisted on the manifest; classification
  + decomposition + forward engine implemented and tested; rendering unchanged.
- Phase 2 (later): renderer consumes `composeProfile`; content type drives coverage +
  architecture selection directly (template enum becomes optional/legacy).
