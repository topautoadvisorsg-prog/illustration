# Publishing Standards Setup

Publishing Standards are project identity, not only export settings.

The operator should choose the target format before manuscript breakdown, page planning, text-fit, image planning, proof rendering, or export.

## Where Standards Live

- `project.config.publishingStandard`: operator-facing identity.
- `project.config.trimSize`: physical page geometry used by planning, text-fit, rendering, preflight, and upscale DPI checks.
- `project.config.typography`: typography package values used by text-fit and page rendering.
- `project.config.outputProfile`: export/proof target labels and render engine.

The database stores this in the existing project config JSON, so no new table is required for the first pass.

## Locked By Standard

- publishing format
- trim size
- bleed
- default body size
- default line height
- proof/export target label

## Still Configurable

- title, subtitle, author/imprint
- font families
- color palette
- image style policy
- advanced layout policy

Font family remains separate from publishing format. The same `Wild Lands Default` typography package can use the preferred Wild Lands fonts while the selected standard controls physical page geometry and text capacity.

## Current Presets

- `HARDCOVER_7X10`: default Wild Lands hardcover planning profile.
- `PAPERBACK_6X9`: compact paperback planning profile.
- `LARGE_FORMAT_HARDCOVER_8_5X11`: large educational/reference profile.
- `KINDLE_DIGITAL`: digital-first planning profile using a readable fixed proof reference.

## Pipeline Influence

Publishing standards affect:

- Page planning: layout selection and capacity assumptions use project config.
- Text-fit: geometry and typography determine available text capacity.
- Rendering: PDF dimensions, bleed, typography, and image-priority zones come from project config.
- Upscale/preflight: DPI and trim checks use project trim dimensions.
- Export: output labels and targets come from project output profile.

## Operator Rule

Choose and save the publishing standard before generating breakdown/page planning.

If a standard changes after breakdown or page planning, downstream results may need to be regenerated because page counts, text-fit, and layout decisions were made against the previous geometry.

## First Chapter Calibration

After chapter/page breakdown exists, the operator can run First Chapter Calibration.

This compares the selected chapter across the supported standards without changing the project:

- estimated proof pages
- fit/tight/overflow/underfilled counts
- average text fill
- format score
- recommendation and tradeoffs

This is an early decision aid. It should help answer: "Does this manuscript want to be a 7x10 hardcover, a compact paperback, a large reference hardcover, or a digital-first edition?"

Calibration does not generate images, render PDFs, or mutate saved project settings.
