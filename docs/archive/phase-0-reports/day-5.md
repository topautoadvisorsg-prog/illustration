# Phase 0 — Day 5 Report

**Status:** ✅ **Spike 5 (EPUB) closed early on D5.** EPUBCheck-clean EPUB rendered from the same manifests as the PDF — content parity proven.

---

## Headline

**`bakeoff.epub` passes EPUBCheck with zero messages.**

```
$ tsx /app/spikes/epub-quality/render.ts
✓ EPUB — 30 entries in 1 chapter(s), 0.11 MB, 144ms
  image embedded at 8.7 KB (≤1600px wide)

$ tsx /app/spikes/epub-quality/validate.ts
EPUBCheck — version ?
───────────────────────────────────────────────────
  No messages reported.
```

The EPUB is **rendered from the identical page-manifest source** as the PDF. Same data in, two different formats out. Content parity is structurally enforced — they cannot drift.

---

## What Shipped Today

### 1. `spikes/epub-quality/render.ts` (~150 lines)
- Consumes `pdf-engine-bakeoff/fixture/pages.json` (the 30-page bake-off fixture)
- Resizes the shared placeholder PNG to ≤1600 px wide (Kindle practical cap) via Sharp
- Groups manifests by chapter (all 30 are Chapter 5 in the fixture → one chapter; production has ~7)
- Emits XHTML chapter docs with: entry title, scientific name italic subtitle, embedded image with figcaption, italic intro paragraph, small-caps section headers, danger warning rule for toxic entries
- Embeds a stylesheet matching the PDF's typography (Georgia fallback since EPUB readers don't reliably ship Google Fonts)
- Post-process step patches `OEBPS/toc.ncx` to fix `epub-gen-memory`'s known playOrder=0 bug (RSC-005)

### 2. `spikes/epub-quality/validate.ts`
- Programmatic EPUBCheck runner using the `epubchecker` npm wrapper (bundles a Java validator)
- Categorizes by severity (FATAL/ERROR/WARNING/USAGE/INFO)
- Returns exit code 1 if any FATAL or ERROR; prints details inline

### 3. Installed dependencies
- `epub-gen-memory` (runtime) — EPUB generation
- `epubchecker` (dev) — validation wrapper
- `default-jre-headless` (system) — Java runtime for EPUBCheck

### 4. NCX playOrder fix discovered + patched
`epub-gen-memory` emits the legacy NCX file (EPUB2 backward compat) with `playOrder="0"` for the first nav point, which EPUBCheck flags as RSC-005. We patch it post-render via a JSZip pass. Modern readers ignore NCX entirely (they use the EPUB3 nav doc), but strict validation cleanliness matters for KDP submission.

---

## Verified Working

```
$ yarn workspace @wildlands/backend typecheck        →  clean
$ yarn workspace @wildlands/backend test             →  9/9 tests pass
$ yarn smoke                                         →  6/6 SKIPPED (placeholders)
$ tsx /app/spikes/vertical-slice/run.ts --skip-apis  →  Spike 2 still passes (A+B+E+F)
$ tsx /app/spikes/epub-quality/render.ts             →  144 ms, 0.11 MB EPUB
$ tsx /app/spikes/epub-quality/validate.ts           →  No messages reported.
```

### EPUB Structure Verified

```
Archive:  bakeoff.epub
  Length     Name
       20    mimetype                                ← "application/epub+zip"
      995    OEBPS/style.css
    86824    OEBPS/0_Bake-off-Chapter.xhtml          ← all 30 entries
      239    META-INF/container.xml
     2980    OEBPS/content.opf                       ← EPUB 3.0 package
      989    OEBPS/toc.ncx                           ← NCX (patched playOrder)
      801    OEBPS/toc.xhtml                         ← EPUB3 nav doc
     8942    OEBPS/images/<uuid>.png                 ← inline image
     8942    OEBPS/cover.png                         ← cover image
```

**EPUB 3.0 compliant.** Includes both EPUB2 NCX and EPUB3 nav for maximum reader compatibility.

---

## What's NOT Yet Verified (Honest Caveats)

1. **No real Kindle Previewer testing.** Per the Stage 8 README, formal Kindle device + app testing is part of Phase 0 Spike 5's success criteria *if* I had a Kindle Previewer instance. I do not in this environment. EPUBCheck-clean is the strongest automated guarantee available without a graphical Kindle Previewer instance.
   - **Recommendation:** Run `Kindle Previewer 3` (free Amazon tool) on the produced `bakeoff.epub` locally before Phase 1 begins. The structural correctness is high confidence; rendering on real devices needs human eyes.

2. **No real upscaled illustration yet.** The EPUB embeds the same parchment-toned placeholder used in the PDF bake-off. When real images arrive (Steps C+D), the EPUB exporter consumes them identically — no code change needed.

3. **One chapter in fixture, seven in production.** The bake-off fixture is all "Chapter 5" for simplicity. The grouping logic (`byChapter` map) already handles multiple chapters; just untested at production scale. Will exercise when the real manuscript arrives.

---

## Schedule Status — 3 Days Ahead of Plan

| Day | Planned | Actual |
|---|---|---|
| D1 | Scaffold | ✅ |
| D2 | Spike 2 A–E + MSB | ✅ + MSB **4 days early** |
| D3 | Spike 2 Step F | ✅ |
| D4 | Spike 1 start (D6 decision) | ✅ + **decision locked D4** |
| **D5** | Spike 1 measure (freed) | ✅ **Spike 5 (EPUB) done — was D9** |
| **D6** | Spike 1 decide (freed) | Available for Spike 4 or polish |
| D7 | Spike 4 | ⏳ Pending keys |
| D8 | Spike 3 | ⏳ Pending keys + MSB sign-off |
| D9 | Spike 5 — **already done** | ⚡ |
| D10 | Phase 0 wrap | ⏳ |

**3 days of slack** in the schedule now. With keys + MSB sign-off, Spikes 3 + 4 could close Phase 0 by D7–D8.

---

## What I'll Do Tomorrow (D6)

Two paths depending on stakeholder timing:

**Path A — Keys + manuscript chapters arrived:**
- Run Spike 2 end-to-end with real OpenAI + Replicate (validates Steps C + D)
- Start Spike 4 (Replicate upscale validation across 5 test images)
- If MSB signed off, run Spike 3 (20-image consistency drift gallery)

**Path B — Still waiting on stakeholder inputs:**
- Phase 0 polish work: refactor Spike 2 vertical-slice into reusable patterns for Stage 6 production code
- Prune unused deps (`@react-pdf/renderer`, `react`, `react-dom`) per ADR-003a cleanup note
- Generate a comparative gallery PDF showing the same manifest rendered as a PDF page AND an EPUB chapter excerpt (visual content-parity proof)
- Or — start Phase 1 prep: stub the Drizzle schema for the 9 tables I committed to in section 1.4

I'll pick based on what's in your inbox tomorrow morning.

---

## Files Created/Modified Today

**Created:**
```
/app/spikes/epub-quality/render.ts                    ← EPUB exporter, 150 lines, NCX patched
/app/spikes/epub-quality/validate.ts                  ← EPUBCheck wrapper
/app/spikes/epub-quality/output/bakeoff.epub          ← 0.11 MB, EPUBCheck clean
/app/spikes/epub-quality/output/placeholder-1600.png  ← Kindle-sized image asset
/app/docs/phase-0-reports/day-5.md                    ← this file
```

**Modified:**
```
/app/backend/package.json                             +epub-gen-memory, +epubchecker (dev)
```

End of Day 5.
