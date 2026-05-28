# Master Style Blocks

The single most important asset for image consistency. Every image-generation prompt
injects the active master style block as its prefix.

## Layout

```
THE_WILDLANDS_v1.md          ← Brand 1 — Cinematic Naturalist (draft, pending review)
THE_WILDLANDS_v1.1.md        ← adjustments after Spike 3 (will exist post-D8)
WILD_BACK_COUNTRY_v1.md      ← Brand 2 — Modern Photorealist (Phase 2)
THE_WILD_REGION_v1.md        ← Brand 3 — Classic Ink (Phase 2)
```

## Rules

1. Files are **append-only**. Never edit a versioned style block in place —
   doing so silently breaks consistency with previously approved images.
2. To revise, copy to a new version (`v1` → `v1.1`).
3. The project config's `image_generation.master_style_block_version` selects
   which version is injected for a given book. Re-running an older book uses
   the locked version it was generated with.
4. Negative rules live inside each style-block file. They are part of the same
   versioned asset and travel with the positive style description.

## How They Are Used

Stage 2 (Scene & Page Planner) reads the active style block and assembles the full
prompt as documented inside each file.

## Review Workflow

A new or revised style block is reviewed visually via Spike 3 — 20 sequential
generations rendered in a single gallery PDF. Stakeholder sign-off is required
before the style block is marked locked.
