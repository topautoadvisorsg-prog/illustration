# Frontend

Operator console for The Wildlands Publishing Platform.

## What this is

One guided **Operator Production Console** (`ProductionConsole.js`) — the single
operator path, top-to-bottom, one book at a time. The model is:

```text
AI publishing agents do the work -> operator reviews, corrects, approves, exports
```

`index.js` renders the Production Console by default. The older "Publishing
Platform" workbench (`App.js`) is **retired** and has no visible entry point; it
remains reachable only as a deliberate backdoor at **`?legacy=1`** (advanced/dev
use), pending its post-launch teardown. Don't use it for new books.

## The workflow (sidebar steps)

1. **Project** — create a book (title/subtitle/author/trim) or open/delete one.
2. **Manuscript** — paste/drop the Markdown manuscript.
3. **Book Setup** — confirm title/subtitle/author/trim.
4. **Breakdown** — deterministic split into chapters + entries (no AI, no spend).
5. **Paginate** — flow text onto pages; per-page fit blueprint (FITS / UNDERFILLED / OVERFLOW).
6. **Build Front/Back Matter** — title, copyright, contents, glossary, index, sources, about.
7. **Render & Review** — the **review hub**. Previewing is free; rendering spends.
   - **Cover** — generate the full-wrap (paid); shows the **print front cover (7×10)** and the **Kindle front cover (portrait 1600×2560)** side by side, with trim/safe + spine-fold QA overlays.
   - **Interior pages** — one finished, text-baked image per page: Preview / Render / Approve / Reject.
   - **Kindle eBook — preview & export** — reflowable EPUB from the real text: structure tree (Front matter / Contents / Back matter), the actual reflowable text, per-entry hero-image slots (future), build report, and export.
8. **Build Book** — assemble the print-ready interior + cover PDFs (300 DPI). Carries the paperback note (same interior, paperback wrap).

## Where things belong (rule)

- **Edition previews / reviews → Render & Review** (print pages, cover, Kindle preview — one hub).
- **Final file generation / download → Build & Export** (Build Book).
- Setup → Setup. QA overlays → in the preview. Don't add a new tab per edition feature.

## Editions

Hardcover, paperback, and Kindle are editions of the **same approved content**
(no re-render between them). Kindle is text-first + cover in v1; per-entry hero
illustrations are a future addition (rendered/reviewed in Render & Review, not a
separate grid).

## Commands

```bash
yarn workspace frontend dev     # local dev server (craco)
yarn workspace frontend build   # production build
```

A shared-password gate guards the console; the backend URL defaults to the
deployed Railway backend (override with `REACT_APP_BACKEND_URL`).
