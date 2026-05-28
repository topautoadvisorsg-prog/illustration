# Spikes — Phase 0 Throwaway Code

Each spike is a self-contained CLI script that exercises one risk area.
Scripts here are **disposable**. They are deleted at the end of Phase 0 once
the patterns they validate are baked into the production pipeline.

## Spikes (per Phase 0 plan)

| Spike | Folder (created when started) | Day |
|---|---|---|
| 1 — PDF engine bake-off | `pdf-engine-bakeoff/` | D4–D6 |
| 2 — Vertical slice | `vertical-slice/` | D2–D3 |
| 3 — Image consistency drift | `consistency-drift/` | D8 |
| 4 — Replicate upscale validation | `upscale-validation/` | D7 |
| 5 — EPUB quality | `epub-quality/` | D9 |

## Running a Spike

Each spike is a `tsx` script invoked from repo root:

```bash
# Example (Spike 2):
yarn workspace @wildlands/backend tsx ../spikes/vertical-slice/run.ts
```

Output written to `/spikes/output/` (gitignored).

## Rules

1. Spike code **never** imports from `/backend/src/*` production modules.
   Spikes prove patterns; once proven, the pattern is implemented properly
   in production code.
2. Spike code is allowed to be ugly. Spike code is **not** allowed to be wrong.
3. Every spike produces a written report in `/docs/phase-0-reports/spikeN.md`.
