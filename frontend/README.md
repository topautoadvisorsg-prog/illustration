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

- Backend connection check.
- AI Publishing Agent Console.
- Workflow/stage status board.
- Manuscript upload/paste area.
- Manuscript breakdown review.
- Page plan review.
- Text-fit preview summary.
- Image proofing controls.
- Large PDF preview/export panel.
- Publishing Intelligence Center.
- Advanced configuration for raw layout prompt assets and internal metadata.

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
