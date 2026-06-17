# Publishing to KDP — How a Wild Lands Volume Is Built

This is the end-to-end process that produces the two **print-ready, KDP-compliant
PDFs** for a Wild Lands volume:

- **Interior PDF** — every page at 300 DPI, sized for KDP.
- **Full-wrap cover PDF** — back + spine + front, spine sized to the page count.

It documents the real, working build used for **Volume I — THE WILDLANDS: NEW
ENGLAND** (275 pages), including the two gotchas that aren't obvious (file size
and assembly memory) and how they're handled.

---

## 1. The pipeline

```
Manuscript → Breakdown → Paginate → Front/Back Matter → Render → Print-Prep → Build Book → KDP
```

| Stage | What it does |
|-------|--------------|
| **Manuscript** | Master text ingested. |
| **Breakdown** | Split into chapters + entries. |
| **Paginate** | Flow the body into pages (`plannedPageNumber`). |
| **Front/Back Matter** | Build title, copyright, contents, intro, glossary, index, about-series. |
| **Render** | The whole-page AI renderer bakes text + art into each page image. |
| **Print-Prep** | Stamp page numbers, compose at 300 DPI, encode JPEG, run preflight, write a single-page print PDF. **This is the DPI step.** |
| **Build Book** | Merge all print PDFs into one interior PDF + render the cover PDF. |

### Approved ≠ print-ready (important)
A page being **approved for book** does **not** mean it has been print-prepped.
Two separate states:

- **Approved** = `active && approvedForBook` (the operator picked this render).
- **Print-ready** = it also has a **print PDF** (`printPdfPath`) and **passed
  preflight**. Only print-ready pages can be assembled.

The console shows both badges (`✓ approved` and `✓ print-ready` / `⚠ needs
print-prep`). **Always re-run print-prep after re-rendering or editing a page** —
re-approval alone leaves the old (or no) print output behind.

---

## 2. Print-Prep specifics (the DPI step)

- **Resolution:** 300 DPI. A 7×10″ page with 0.125″ bleed = **2175 × 3075 px**
  (2175 / 7.25 = 300).
- **Image format in the print PDF:** **JPEG, quality 88, 4:4:4 chroma** (no
  subsampling, so text edges and fine botanical lines stay crisp).
  - *Why not lossless PNG?* PNG made each print PDF ~14 MB → a 275-page interior
    was **~3.9 GB**, which both OOMs the assembler and is far over KDP's **650 MB**
    interior limit. JPEG q88 → ~1.9 MB/page → **~527 MB** interior (under the cap).
  - Set in `backend/src/pipeline/print-prep/print-prep.ts` (`sharp.jpeg({ quality: 88, chromaSubsampling: '4:4:4' })`).

### Folio (page number) policy
Stamped in `print-prep.ts` (`computeFolioLabel`):

| Section | Folio |
|---------|-------|
| Front matter (half-title, title, copyright, contents, introduction) | **none** |
| Body chapters | **Arabic**, = `plannedPageNumber` (matches the TOC and Index) |
| Glossary, Index | **continue** the body sequence (`maxBodyPage + spineOrder`, e.g. 259, 260…) |
| About-the-Series (closing brand page) | **none** |

A title page must never show "2"; the glossary must never restart at "1". Both
are guarded by this policy.

### Badge policy
The hazard/region/source badge taxonomy is a **reserved draft** and is **not
wired** to page metadata. The only values present are the fallbacks `GENERAL` /
`GENERAL_REFERENCE`, which are **suppressed** (`badges-for-page.ts`) so no generic
compass/"G" seals are stamped. Hazard warnings live in the **page text**, where
they are proofed. (When the real taxonomy is wired, real badges will stamp; only
the fallbacks are suppressed.)

---

## 3. Build Book — assemble + cover

### Two gotchas
1. **The assembler loads every print PDF into memory at once.** At ~2 MB/page the
   275-page merge peaks well over 1 GB — **the deployed backend OOMs (returns
   502).** Run the assemble **locally with a large heap**.
2. **Supabase Storage can't take the ~527 MB interior** (the upload fails from a
   local connection). So the build writes the PDFs **straight to local disk** —
   which is fine, because **KDP uploads from your computer anyway.**

### The build command (local, writes to Downloads)
```
cd backend
railway run --service "@wildlands/backend" -- \
  node --max-old-space-size=8192 ../node_modules/tsx/dist/cli.mjs \
  scripts/build-local2.ts <projectId> "C:/Users/<you>/Downloads"
```
This reuses the production spine order (`resolveSpine`) and PDF merge
(`mergeSinglePagePdfs`), then renders the cover (`renderCoverPdf`). Output:
```
THE_WILDLANDS_NEW_ENGLAND_interior.pdf
THE_WILDLANDS_NEW_ENGLAND_cover.pdf
```

> Print-prep itself runs fine on the deployed backend (in-datacenter, fast). Only
> the final **assemble** is run locally. To print-prep all pages quickly, hit the
> deployed `/print-prep` endpoint per render (see `scripts/printprep-http.ts`).

---

## 4. Final spec (Volume I) + validation

| Item | Value |
|------|-------|
| Interior pages | **275** |
| Page size (incl. bleed) | **7.25 × 10.25″** (7×10 trim + 0.125″ bleed) |
| Resolution | **300 DPI** |
| Interior file size | **~527 MB** (KDP cap 650 MB) |
| Cover wrap | **14.8693 × 10.25″** |
| Spine | **0.6193″** = pages × **0.002252″/page (white paper)** |

Validate the actual files before upload:
```
node ../node_modules/tsx/dist/cli.mjs scripts/validate-delivery.ts
```
Checks: page count = 275, every page 7.25×10.25, cover 14.8693×10.25, on-disk
sizes. Confirm DPI separately by reading any print PNG (2175×3075 → 300 DPI).

---

## 5. Uploading to KDP (done by the publisher)

1. New paperback → **Trim 7 × 10″**, **Bleed: Yes**, **Paper: White**.
   - ⚠ **Paper must be White.** The spine (0.6193″) assumes white-paper thickness
     (0.002252″/page). Cream paper is thicker → KDP computes a different spine and
     the wrap won't align.
2. **Interior** = `…_interior.pdf`. **Cover** = `…_cover.pdf` (full wrap).
3. Run **KDP Previewer** (KDP's own browser tool) and eyeball the rendered preview,
   especially cover alignment.

KDP Previewer is account-gated and run on KDP's site — it is **not** something the
build performs. The build runs the equivalent local structural checks (size, trim,
bleed, page count, spine formula).

---

## 6. Operator scripts (backend/scripts)

| Script | Purpose |
|--------|---------|
| `prebuild-audit.ts` | 8-point readiness check (print-prep, preflight, approved, cover sync, section map). |
| `printprep-http.ts` | Batch print-prep via the deployed backend (`force` re-preps all; `only=<id,…>` targets). |
| `build-local2.ts` | Assemble interior + render cover to local disk (the real Build Book). |
| `validate-delivery.ts` | Verify the generated PDFs (page count, dimensions, sizes). |
| `badge-inventory.ts` | Report badge usage across the book. |
| `scan-terms.ts` | Terminology audit (regional/British/archaic term scan). |

> These live in `backend/scripts/` and run via `railway run` so they get the
> production database, storage, and API credentials from the environment.
