# Frontend

Operator console for The Wildlands Publishing Platform.

## Current Status

The UI is no longer a frozen scaffold. It is an operator review surface for the
backend-first publishing pipeline.

The primary product model is:

```text
AI publishing agents do the work -> operator reviews, corrects, approves, and exports
```

## Main Screens

The console is one project workspace with five top-nav tabs, plus a sidebar
that pins the project, the workflow stages, and resource shortcuts.

Tabs (left-to-right):

1. **🛠 Control Center** — Production Status tile (calls the Supervisor,
   shows verdict / why / next action / run), Dashboard hero, Operator
   guidance, Chat agent, Page Plan, Render Proofs, Image review, Decision
   Ledger, Quality Review.
2. **Setup** — Project create / select, manuscript upload, publishing
   format (trim / typography), format calibration.
3. **Library** — Reference catalog of layout templates with thumbnails.
4. **Intelligence** — Decisions / experiments / standards / SOPs / cost
   events / print findings (gated to power users behind Advanced mode).
5. **Export** — Chapter production grid, book parts, render proof
   preview, download.

Floating elements:

- Notice strip for last action / errors.
- Advanced Mode toggle (top-right) to unlock power features and raw
  internals.
- Chat agent panel that can answer "why" against the live project.

## Normal vs Advanced

Normal operator mode should show:

- chapter/page structure
- selected layout name
- page purpose
- word count
- fit status
- image approval status
- preview/export controls

Advanced mode is intentionally opt-in and may show:

- raw prompts
- prompt hashes
- layout instruction internals
- file paths
- placeholder lists
- model/prompt setup details

## Commands

```bash
yarn workspace frontend dev
yarn workspace frontend build
```

## Test Notes

The frontend build is part of the root verifier:

```bash
yarn verify:pipeline
```

The current UI is intentionally wired to existing backend routes only. EPUB export
is shown as not wired until a backend endpoint exists.
