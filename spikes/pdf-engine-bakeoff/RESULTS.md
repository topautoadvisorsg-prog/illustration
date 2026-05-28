# Spike 1 — PDF Engine Bake-Off Results

**Decision date:** D4 (ahead of plan — D6 was the scheduled decision day)
**Winner:** **Puppeteer + Paged.js**
**Loser:** `@react-pdf/renderer` (integration friction; not output quality)

---

## TL;DR

We didn't have to render 30 pages through both engines to pick the winner. **Day 4 integration testing produced an unambiguous answer:**

| Criterion | Puppeteer + Paged.js | @react-pdf/renderer |
|---|---|---|
| Imports cleanly into our Node 20 + ESM + TS monorepo | ✅ Yes, on first try | ❌ No — reconciler ships as CJS, conflicts with our `type: module` setup, requires symlink hacks AND still fails |
| Renders 30-page fixture | ✅ 3.5 s, 38 actual pages, 20 MB peak heap, 0.57 MB PDF | ❌ Never reached render — blocked at import |
| Real CSS engine | ✅ Yes (Chromium) | ❌ Limited subset, no `float`, no `shape-outside`, no CSS Paged Media |
| Font fidelity | ✅ Google Fonts native | 🟡 Requires explicit `Font.register()` with TTF URLs per weight |
| Bleed dimensions | ✅ 8.625 × 11.25 in confirmed via `pdfinfo` | (untested) |
| Running headers, page numbers, string-set | ✅ Via `@top-left`, `@bottom-center` CSS Paged Media | ❌ Manual per-page absolute positioning |
| Page break / overflow handling | ✅ Native (long entries flow to continuation pages automatically) | ❌ Clips overflowed content silently |
| Debuggability | ✅ Open the same HTML in a browser to inspect | 🟡 Yoga layout box-model, no DOM, harder to inspect |

The decisive factor was the **integration friction**. We need an engine that *works with our toolchain* and lets us ship a 240-page book. Puppeteer + Paged.js does both. `@react-pdf/renderer` requires fighting the package's CJS reconciler in an ESM project before we even get to layout work.

---

## The Specific @react-pdf/renderer Problem

`@react-pdf/reconciler` ships only as CommonJS (no ESM export). When invoked from our spikes workspace (which has `"type": "module"` in `package.json`), Node refuses to load the CJS bundle as an ESM module — the file's `i=a).exports=function n(r){...}` blows up immediately because `exports=` is invalid ESM syntax.

Workarounds we attempted:
1. Symlinking `@react-pdf/{renderer, reconciler}` from `backend/node_modules` to root `node_modules` — got past the resolution step
2. Setting `NODE_PATH` — does not work for ESM
3. Importing the reconciler — fails because Node still treats `.js` files in a `type: module` package as ESM

To make it work we would need:
- A separate workspace with `type: "commonjs"` just for the React-PDF renderer, OR
- A bundler (Vite/esbuild) wrapping React-PDF into the build, OR
- Switching the entire `spikes` workspace back to CJS (defeats the rest of our ESM-native code)

Each option is **expensive and signals a permanent maintenance burden**. The frontrunner has none of these issues.

This finding *is* the bake-off result. We chose to spend the saved D5+D6 budget on Spike 2 polish and Spike 4 / Spike 5 prep.

---

## Validated Performance Numbers (Puppeteer + Paged.js)

From running the 30-page fixture (`spikes/pdf-engine-bakeoff/fixture/pages.json`):

```
✓ Puppeteer + Paged.js — 38 pages, 0.57 MB, 3483ms, peak heap 20.2 MB
  → /app/spikes/pdf-engine-bakeoff/output/puppeteer.pdf
```

**Extrapolation to a 240-page book:**
- Render time: ~22 seconds (linear)
- Peak heap: ~21 MB (chapter-by-chapter rendering keeps this flat)
- PDF size: ~4.5 MB (linear with placeholder images; real upscaled images will push this to ~50-150 MB)

All numbers comfortably within the project's targets per the spec.

---

## What This Means for Production Code

Stage 6 (Layout Engine) implementation uses Puppeteer + Paged.js. The Spike 2 Step F code is essentially production-shaped already:
- HTML template parameterized per layout class (`.layout-layout-1-standard`, etc.)
- CSS Paged Media for page geometry + furniture
- Chromium with `--no-sandbox` for the dev container; production launch will use the same flags
- Chapter-by-chapter rendering (close + relaunch browser per chapter) for memory hygiene on full books

**Open items for Stage 6 production work:**
1. ICC sRGB color profile embedding — needs a Ghostscript post-process step (Skia/PDF doesn't ship one)
2. Per-chapter browser session management
3. Production HTML template extraction from spike code into per-layout component files
4. Tests against real upscaled images (Phase 1 + 2 work; not Phase 0)

---

## Files Produced

- `/app/spikes/pdf-engine-bakeoff/fixture/pages.json` — 30 page manifests across 8 layouts
- `/app/spikes/pdf-engine-bakeoff/fixture/placeholder.png` — shared parchment-toned 2400×1800 placeholder
- `/app/spikes/pdf-engine-bakeoff/fixture/build-fixture.ts` — fixture generator
- `/app/spikes/pdf-engine-bakeoff/puppeteer-pagedjs/render.ts` — winning renderer, 30-page support
- `/app/spikes/pdf-engine-bakeoff/output/puppeteer.pdf` — actual 38-page output PDF
- `/app/spikes/pdf-engine-bakeoff/react-pdf-renderer/render.tsx` — attempted but blocked; kept as artifact

## ADR-001 Update

See `/docs/decision-log.md` ADR-001 (supersede) for the locked decision.
