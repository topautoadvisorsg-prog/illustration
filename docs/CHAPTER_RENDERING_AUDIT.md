# Chapter Rendering & Layout — Audit + Architecture

## 1. Who decides what TODAY

| Decision | Where it's made | How | Static or dynamic? |
|---|---|---|---|
| **Pages per entry / page count** | Manifest stage (1.5, Claude) | **1 entry (`##` heading) = exactly 1 page.** Page count = number of entries. | **Static rule.** Content length is ignored — a 500-word entry and a 40-word entry both get one page. |
| **Layout selection** | `plan-pages.ts → chooseLayout()` | **Deterministic keyword + word-count rules** (danger→warning layout, "comparison"→compare layout, `<200 words`→illustration-dominant, etc.) picks 1 of 16 templates. | **Dynamic-ish but rule-based.** Not an LLM, not content-aware beyond keywords + a word count. |
| **Typography sizes / line-height / spacing** | `config.typography` + optional per-layout `asset.recommendedBodyPt/LineHeight`, applied in `render-html.ts` | Role-based config values (now Cormorant/EB Garamond). | **Static config defaults.** Not computed per page for readability. |
| **Content density / "does it fit"** | `text-fit.ts` / `text-fit-preview.ts` + static `DEFAULT_LAYOUT_CAPACITY` word bands | Compares entry word count to a fixed min/target/max **word band** per layout → flags FITS / TIGHT / OVERFLOW / UNDERFILLED. | **Static word bands.** It only **flags**; it never reflows, repaginates, or resizes. |
| **Margins / geometry** | `page-geometry.ts` from `config.trimSize` | Derived from trim. | Dynamic from trim (good). |

## 2. Is there a dedicated publishing/layout agent? **No.**
`agent-contracts.ts` defines agent *personas* (e.g. `PAGE_PLANNER`) and `/api/agents` lists them — but they're **labels**. The actual decisions live in **deterministic code scattered across four places**: manifest (entries→pages), `plan-pages` (layout + word bands), `render-html` (typography), `text-fit` (capacity flagging). **No single component acts as the book designer.**

## 3. What's preventing real chapter review
1. **The page model is broken for long content.** Because 1 entry = 1 page, your essay-length entries **overflow and clip** — so the rendered pages are literally broken. Review is meaningless until content flows across pages.
2. **The review UI is just a raw PDF embed.** Render Chapter drops the whole chapter PDF into one pane. There are **no page thumbnails, no click-a-page-to-enlarge, no per-page inspect, no per-page approve/request-changes.** You can't review it like a real digital book.
3. **No page-level images** to show as a gallery — only the monolithic PDF.

## 4. Recommended architecture (the cleanest version)

**A. Content-driven pagination (the core fix).**
Stop forcing 1 entry = 1 page. Treat each entry as a **section that flows across 1..N pages**: the illustration + heading anchor the *opening* page, and the body text **flows naturally onto continuation pages** (Paged.js already paginates — we just stop constraining it). **Content determines page count. Overflow disappears.**

**B. A single "Layout Director" module (the book-designer agent).**
One deterministic module owns ALL presentation decisions, fed by the **book format** (trim, margins, typography roles):
- computes **readable capacity from real geometry** (text-area points ÷ type size × leading) instead of static word bands,
- picks layout + illustration placement per entry,
- decides spacing/density for **readability, not word-maximizing**,
- flows content to as many pages as needed.

Recommendation: keep this **deterministic (a real grid + type system)**, not an LLM-per-page — professional book design *is* systematic, and per-page LLM calls would be inconsistent, slow, and costly. The "agent" is this module applying professional rules automatically; the operator reviews output. (An LLM can optionally assist with high-level *layout choice* per entry, but the typographic math stays deterministic.)

**C. Chapter Review viewer (operator experience).**
After Render Chapter: a **page gallery** (thumbnail per rendered page) → click a page to **open it large and readable** → page-by-page nav → inspect layout/typography/image placement → **Approve / Request Changes** per chapter. Render the chapter to **per-page images** (Chromium can capture each page) so it feels like flipping a real digital book.

## 5. Phased plan
- **Phase A — Long-form pagination** *(start here; unblocks seeing your real chapters)*: entry → multi-page flow; illustration on opening page; remove the 1-entry-1-page constraint; page count from content.
- **Phase B — Layout Director**: centralize layout/typography/density into one format-driven module; capacity from real geometry; delete the scattered static word-band logic.
- **Phase C — Chapter Review viewer**: page thumbnails + click-to-enlarge + per-page inspect + approve/request-changes, one chapter at a time.

The operator's job becomes: **upload → pick a chapter → render → flip through pages → approve / request changes.** No manual type or density decisions.
