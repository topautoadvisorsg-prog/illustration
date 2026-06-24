# Chapter-Book Interior Standard — Middle-Grade B&W

**Product:** Black-and-white middle-grade chapter book (ages ~8–12), mostly text with occasional full-page B&W illustrations. Real typeset text (Paged.js → PDF), **not** AI-rendered pages.
**Target:** Amazon KDP paperback, $9.99, regular trim (full royalty).
**Status:** STANDARD / guardrails — locked before manuscript upload. Defines *what the pages must look like*; the text-page template gets wired when the manuscript lands.

---

## 1. Trim, paper, margins

| Spec | Value | Why |
|---|---|---|
| **Trim size** | **5.5 × 8.5 in** (digest) | Standard middle-grade size; regular trim = full royalty; right feel in a kid's hands. |
| Paper | **Cream** (selected at KDP checkout) | Easier on young eyes, premium novel feel. **The cream comes from the PAPER STOCK, never a baked-in background.** The upload PDF has NO page-color fill — black ink on a clean page, printed onto cream stock. (Baking cream into the PDF = cream ink on cream paper = wrong.) Previews may be tinted cream for visualization only. |
| Interior ink / text color | **True black (#000), black & white (grayscale)** | Body text is solid black so it prints as crisp K ink, not a soft gray screen. Cheapest print tier; all art grayscale 300 DPI. |
| **Gutter (inside) margin** | **0.625 in** | Meets KDP's 151–300pp requirement; keeps text out of the spine. Re-confirm against FINAL page count. |
| Outside margin | **0.5 in** | |
| Top margin | **0.625 in** | Room for running head. |
| Bottom margin | **0.625 in** | Room for the folio. |
| Margins | **Mirrored** (inside > outside) | Facing-page book layout. |
| **Bleed** | **0** (none) | Illustrations sit INSIDE the margins with white around them. *Exception:* if ANY illustration runs edge-to-edge, the WHOLE file needs 0.125 in bleed — avoid unless we commit to it book-wide. |

## 2. Typography (the "DNA")

| Element | Spec |
|---|---|
| **Body font** | Clean old-style **serif** — **EB Garamond** (Google Fonts; closest free Garamond) or **Cardo**. Embedded. |
| **Body size** | **12 pt** (the roomy end of 11–12 — easier for younger readers, pads page count / perceived value). |
| **Leading (line height)** | **1.3** (~16 pt on 12 pt) — open, airy, unintimidating. |
| **Measure (line length)** | ~**45–55 characters** per line (5.5-in trim at 12 pt lands here naturally). |
| **Alignment** | **Justified** with hyphenation ON (traditional book look). Ragged-right is acceptable for the youngest end — default justified. |
| **Paragraphs** | First-line **indent ≈ 0.22 in (≈1 em)**. **No** blank line between paragraphs. The **first paragraph** of every chapter and after every scene break is **flush-left (no indent)**. |
| **Chapter-title font** | A contrasting **display / sans-serif** (e.g. Oswald, Archivo, or Montserrat) so headers pop. |
| **Max fonts in book** | **2–3 total** (body serif + chapter display + optional small-caps/caption). No more. |
| Widows / orphans | Disallowed — no single line stranded at top/bottom of a page. |
| Hyphenation | On for body; never hyphenate a chapter title or the last word of a paragraph onto a new page. |

## 3. Chapter openers

- **Start each chapter on a NEW page.** Premium convention: start on a **recto (right-hand / odd page)** — insert a blank verso if the previous chapter ended on a recto.
- **Sink:** chapter heading begins **~⅓ down the page** (white space above it — the classic "drop").
- Heading block: **"Chapter One"** (or number) + the **chapter title** in the display font, centered. Optional thin rule or small motif beneath.
- Body begins below the sink; **first paragraph flush-left, no indent**, optional small **drop-cap or small-caps** lead-in (keep it clean and consistent every chapter).
- **No running head** and **no folio** on a chapter-opening page (a centered "drop folio" at the bottom is the only acceptable number here).

## 4. Running heads & folios (body pages)

- **Running heads:** **verso (left) = book title**, **recto (right) = chapter title** (or author name). Small caps or body font, ~9–10 pt, muted.
- **Folios (page numbers):** **bottom-center drop folio** (clean, common for MG) OR top-outer paired with the running head. Pick ONE and keep it book-wide. Recommend **bottom-center**.
- Folios are **Arabic, starting at 1 on the first text page** (Chapter 1 opener counts in the sequence but shows no number).
- **NO running head or folio on:** front matter, chapter-opening pages, blank pages, and full-page illustration pages.

## 5. Scene breaks

- Within a chapter, a scene/time shift = a **centered ornament** (e.g. `*  *  *` or a small dingbat), with a blank line above and below. Never just an unmarked blank line (it gets lost at a page break). First paragraph after the break is **flush-left**.

## 6. Illustrations (B&W)

- **Style:** TBD (artist reference pending) — this standard governs **placement**, not art style.
- **Spot art / chapter vignette:** small, inside the margins, white around it, no bleed.
- **Full-page illustration:** its own page, **inside the margins** (framed by white), **no folio, no running head** on that page. Place at chapter openers or scene beats. Ideally on a **recto** facing the relevant text, or a verso facing a chapter opener.
- **Specs:** grayscale, **300 DPI** at placed size, embedded. No color, no edge bleed (per §1).

## 7. Front & back matter (order)

**Front:** Half-title (optional) → **Title page** → **Copyright** → Dedication (optional) → Table of Contents (optional for fiction; include if chapters are titled) → text.
**Back:** Acknowledgments (optional) → **About the Author** → also-by / series page (optional).
- Each major front-matter piece starts on a **recto**. No folios/running heads on front matter (or lowercase-roman folios if we want them — default: unnumbered).

## 8. KDP / print rules (don't skip)

- **Total interior page count must be EVEN** — add a blank page at the end if it lands odd.
- **Spine text** allowed at **79+ pages** — a ~170 pp book is fine.
- Export **PDF with all fonts embedded**, images **300 DPI grayscale**.
- Confirm gutter against the FINAL page count (KDP scales the minimum with page count).
- **Order a printed proof before approving.** Non-negotiable — paper/font feel and cover print only show on the physical proof.

## 9. How this maps to the platform (build checklist for upload day)

- `ProjectConfig.typography`: `bodyFont = "EB Garamond"`, `headingFont = "Oswald"` (or chosen display), `captionFont`, `bodyPt = 12`, `lineHeight = 1.3`. Fonts auto-load via Google Fonts in `render-html.ts`.
- New **text-page layout mode** in the HTML/CSS template (current template is the artwork model): margins/gutter from §1, running heads + drop folios (§4), chapter-opener sink (§3), scene-break ornament (§5), full-page-image page type (§6).
- Trim 5.5×8.5 + mirrored margins in the geometry/config; **bleed 0**.
- Render path: `renderChapterPdf` / `renderBookPdf` (Paged.js + Puppeteer). Set `CHROMIUM_PATH` to the local Chrome for local proofs; Railway needs Chromium added before prod export (deferred).
- **Storage:** new project → new `PROJECT_ID` → files land on **R2** (R2 primary · Supabase fallback · DB: Supabase), per current standard.

---

**Bottom line:** 5.5×8.5 cream, 12 pt EB Garamond / 1.3 leading, justified + hyphenated, sans-serif chapter titles with a ⅓ sink starting on a recto, book-title/chapter-title running heads, bottom-center drop folios, B&W art inside the margins (no bleed), even page count, proof before publish.
