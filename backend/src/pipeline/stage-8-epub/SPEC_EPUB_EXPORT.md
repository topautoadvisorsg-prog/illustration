# Stage 8 — Kindle EPUB Export — SPEC (for approval)

**Status:** Proposed. Awaiting operator approval before any code is written.
**Format:** Kindle/EPUB only. **Does NOT touch the print pipeline** (frozen) — additive second export from the same source content.

---

## 1. Goal & non-goals

**Goal:** a "Export Kindle EPUB" action that produces a reflowable, Kindle-ready EPUB
from the **existing structured book data** (real text), with TOC, metadata, cover, and
accessibility-correct image handling.

**Non-goals (v1):**
- No re-render, no image spend, no change to print/hardcover.
- No PDF→EPUB conversion (produces broken reflow — explicitly avoided per stage README).
- No custom per-image prose descriptions (Tier 3) — out of scope for v1.

## 2. Decisive data findings (probe `_epubprobe.ts`, live project `66c1c69c…`)

| Need | Available? | Source |
|---|---|---|
| Real reflowable body text | **YES** — 273/275 pages, 73,592 words | `pages.readingFieldText` |
| Chapter / section structure | **YES** — chapters 0–8; BODY 258 / FRONT 11 / BACK 6 | `pages.chapterNumber`, `section`, `frontMatterType`, `spineOrder`, `entryKey`, `pageRole` |
| Entry titles | **YES** | `manifests` (kind=PAGE/CHAPTER) `.content.entryTitle` |
| Scientific names | Per-manifest where applicable | `manifests.content` (confirm field at build) |
| Metadata (title/author/ISBN/series/language/publisher/description) | **YES** | `projects` + `config.publishing` |
| Cover image | **YES** | `config.publishing.coverAssetPath` (+ `coverDescription` for alt) |
| **Clean illustration-only images** | **NO — 0 rows** | legacy `images` table is empty; only 275 baked full-page `whole_page_renders` (text-in-pixels) exist |

**Consequence:** v1 is **text-first**. The only embeddable image is the **cover**. Entry
illustrations are deferred (see §6) because we have no clean art and the baked pages
can't be used (they'd duplicate the reflowed text and violate the "no print renders"
rule).

## 3. Source → EPUB mapping

- **Spine/reading order:** reuse `resolveSpine()` (same sort the print build uses) so the
  EPUB order matches the book: FRONT_MATTER → BODY (by chapter, plannedPageNumber) →
  BACK_MATTER.
- **Chapters → XHTML files:** one XHTML per chapter (chapters 1–8). Front matter and back
  matter each grouped into their own XHTML file(s).
- **Entry text:** concatenate the `readingFieldText` of an entry's opener + its
  continuation pages (grouped by `entryKey`) into one continuous flowing section — pages
  are a print concept; Kindle reflows, so page boundaries are dropped.
- **Headings:** chapter title (`h1`), entry title (`h2`), scientific name (`<p class="sci"><em>…</em></p>` directly under the entry title), body as `<p>`.
- **Front matter:** title page, copyright (ISBN/publisher/disclaimers from config),
  contents (auto TOC). Half-title/blanks omitted (meaningless in reflow).

## 4. EPUB package

- Library: `epub-gen-memory` (already a dependency; native Node, no Puppeteer).
- One XHTML per chapter + front/back matter; auto TOC from headings; nav doc.
- Metadata: title, subtitle, author, ISBN (as identifier), language, publisher, series,
  description — all from `config.publishing`.
- Cover: fetch `coverAssetPath` from storage, resize to ≤1600px wide (Sharp), embed.
- Output: stored + an `exports` table row; also written to local disk for KDP upload
  (mirrors the build-local2 pattern; no large upload needed — EPUB is small).

## 5. Kindle formatting rules

- Relative units only (`em`, `%`) — no fixed px heights/widths (avoids broken reflow).
- Warm-sepia/parchment is a PRINT standard; Kindle respects user theme — use minimal CSS,
  let the device control colors/fonts. Headings + scientific-name italic styling only.
- Text is plain (already stripped of markdown/ICON markers at ingestion); re-escape XML.

## 6. Image rule

- **v1:** cover image only. No body images (none exist cleanly).
- **Hook for later:** the exporter will look up a per-entry illustration by `entryKey`
  from a designated clean-art source; when present it embeds `<img>` with alt text (§7).
  Until clean art exists, this is a no-op and the EPUB is text-only (fully accessible).
- Adding real entry illustrations later = a separate decision (generate clean
  illustration-only art = image spend + touches render architecture → post-proof).

## 7. Accessibility / alt-text rules

- **Cover image:** `alt` = book title (+ short `coverDescription` if ≤140 chars).
- **Entry illustrations (when they exist):** Tier-1 `alt` = entry title (+ scientific name
  if applicable), e.g. `alt="Black bear (Ursus americanus)"`, clamped <140 chars.
- **Decorative art / ornaments:** `alt=""` + `role="presentation"` so screen readers skip.
- v1 result: text is natively screen-reader-readable (it's real text), cover has alt →
  this is the genuinely-accessible outcome, not a metadata-only badge.

## 8. Validation

- `EPUBCheck` must pass with zero ERRORs (run in build; fail the export on error).
- Kindle Previewer — manual visual pass (e-ink + color) before publishing.
- Content-parity check: every BODY entry present, word count within tolerance of 73,592.

## 9. Operator flow

- API route `POST /api/projects/:id/export/kindle-epub` → builds, validates, returns the
  EPUB path + `exports` row.
- Frontend: a single **"Export Kindle EPUB"** button (shown after print upload). Out of
  scope to wire the button until backend export is proven via the route.

## 10. Build phases & estimate

| Phase | Work | Est. |
|---|---|---|
| 1 | Source reader: spine order → grouped entries with text + headings + sci names | 0.5 day |
| 2 | EPUB assembler (`epub-gen-memory`): XHTML, TOC, metadata, cover, alt | 0.5–1 day |
| 3 | API route + `exports` row + local write | 0.25 day |
| 4 | EPUBCheck integration + parity check + a vitest on the source reader | 0.5 day |
| 5 | Kindle Previewer manual pass | operator |
| (later) | Frontend button | 0.25 day |

**Total backend v1: ~2 days.** No re-render, no image spend, print untouched.

## 11. Decisions needed from operator

1. **Confirm v1 = text-first (cover image only), entry illustrations deferred** until clean
   art exists. (The alternative — generating clean illustration-only art — is image spend
   and touches frozen render architecture.)
2. ISBN: is there a Kindle-specific ISBN, or reuse print ISBN / KDP-assigned ASIN?
3. Build now, or after the print proof returns? (This is additive and freeze-safe, so it
   *can* run in parallel — operator's call on priority.)
