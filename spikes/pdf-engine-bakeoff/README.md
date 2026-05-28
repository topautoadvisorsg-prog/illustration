# Spike 1 — PDF Engine Bake-Off

**Days:** D4–D6
**Goal:** Choose the production PDF engine by running the same 30-page test through two candidates and measuring the results empirically.

---

## Candidates

| Engine | Approach | Why it might win |
|---|---|---|
| **Puppeteer + Paged.js** *(frontrunner — already used in Spike 2 Step F)* | Headless Chromium renders HTML+CSS with the Paged.js CSS Paged Media polyfill | Real CSS engine, native font handling, full color profile support, debuggable in a browser, OpenType features work |
| **`@react-pdf/renderer`** | Pure JS React-component tree → PDF | Single-language stack, no Chromium dependency, smaller deployment, more deterministic |

---

## Test Fixture — 30 Pages

The fixture is a synthetic mini-book covering every important layout scenario:

| Pages | Content | Stresses |
|---|---|---|
| 1 | Chapter opener (Layout 5) — landscape image + title | Full-bleed image handling |
| 2–10 | Standard species entries (Layout 1) | Image + 2-col text + wrapping |
| 11–15 | Text-heavy entries (Layout 2) | Long body text, multi-page overflow |
| 16–18 | Danger pages (Layout 4) | Red warning border, side-by-side images |
| 19–22 | Illustration-dominant (Layout 3) | Large image, single-column text |
| 23–25 | Tree entries (Layout 8) | Tall vertical illustration in margin |
| 26–28 | Diagnostic diagrams (Layout 9) | Multiple small annotated images |
| 29–30 | Scattered vignettes (Layout 7) | 3 small images in asymmetric layout |

Each page uses the same Chanterelle-style placeholder image so we're measuring layout, not image generation.

---

## Metrics

Each engine is scored on:

| Metric | How measured |
|---|---|
| **Render time** | Wall-clock from start → final PDF written |
| **Peak memory** | `process.memoryUsage().heapUsed` polled during render |
| **PDF file size** | Final byte count |
| **Page dimensions** | Validated 8.625 × 11.25 in (bleed-inclusive) |
| **Font fidelity** | Visual check: EB Garamond + Playfair Display render correctly |
| **Text overflow** | Long body text correctly flows to continuation page (or doesn't, in which case dock points) |
| **Multi-column stability** | 2-column layout doesn't break across page boundaries |
| **Image quality** | Embedded placeholder PNG renders sharp, no scaling artifacts |
| **Color fidelity** | Parchment background (#F5EDD6) renders accurately |
| **Bleed accuracy** | `pdfinfo` reports correct 621.12 × 810 pts |
| **ICC profile** | Can the engine embed sRGB IEC61966-2.1? (If not, requires Ghostscript post-process — note in result) |
| **Debuggability** | Subjective — how easy is it to inspect what's broken |

---

## Folder Layout (built during D4)

```
spikes/pdf-engine-bakeoff/
├── README.md                       (this file)
├── fixture/
│   ├── pages.json                  ← 30 synthetic page manifests
│   └── placeholder.png             ← shared image asset
├── puppeteer-pagedjs/
│   ├── render.ts                   ← renders 30 pages via Puppeteer
│   └── template.html               ← HTML/CSS template
├── react-pdf-renderer/
│   ├── render.ts                   ← renders 30 pages via @react-pdf/renderer
│   └── templates/                  ← layout components
├── compare.ts                      ← runs both, writes metrics report
└── output/
    ├── puppeteer.pdf
    ├── react-pdf.pdf
    └── metrics.md                  ← side-by-side comparison
```

---

## Decision Procedure (D6)

1. Run `compare.ts` — produces metrics report
2. Open both PDFs in Acrobat side by side
3. Score each criterion 1–5
4. The engine with the higher total wins
5. **Tiebreaker:** Puppeteer + Paged.js (frontrunner — better CSS support, easier debugging)
6. Write **ADR-001 (supersede)** in `/docs/decision-log.md` with the data and the rationale

---

## What Could Cause a Reversal

If Puppeteer + Paged.js:
- Takes > 60s to render 30 pages → too slow for a 240-page book (would extrapolate to ~8 min)
- Cannot embed sRGB profile cleanly even with Ghostscript post-process
- Memory exceeds 1 GB on 30 pages

Then `@react-pdf/renderer` becomes the choice, and we accept its CSS limitations as a trade-off.

---

## Why This Spike Matters

Per the spec's Risk 1 (highest-risk component): *"This is where most AI book builders fail. Image generation is easy. Print layout automation is hard."* Get this decision wrong and the entire pipeline blocks at Stage 6.
