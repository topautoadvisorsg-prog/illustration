# Typography & Format System — The Wild Lands

Status: **v1 implemented** (role-based typography + config-driven fonts + 7×10 default).
Owner decision (locked): **Cormorant Garamond (display) + EB Garamond (body)**, default trim **7×10**.

---

## 1. Font system

| | Face | Why |
|---|---|---|
| **Display** (titles, chapter/section/entry headings, labels) | **Cormorant Garamond** | Premium natural-history / explorer-journal feel; high-contrast elegance. |
| **Body & captions** | **EB Garamond** | Built for body readability at 10–11pt in print; harmonizes with Cormorant (both Garamonds). |

Rationale: Cormorant Garamond is a *display* face — beautiful for headings but thin-stroked and tiring for long body text at small print sizes. Pairing it with EB Garamond keeps the brand look while keeping the book readable.

## 2. Typography roles (hierarchy + sizes)

Tuned for a **7×10** trim. Sizes scale per trim (see §4).

| Role | Font | Size (pt) | Weight | Style |
|---|---|---|---|---|
| Book Title | Cormorant Garamond | 52 | 600 | tracked (cover / title page) |
| Chapter Title | Cormorant Garamond | 32 | 600 | chapter openers |
| Entry/Page Title | Cormorant Garamond | 26 | 600 | uppercase, tracked |
| Section Heading | Cormorant Garamond | 13 | 600 | small-caps |
| Subsection Heading | Cormorant Garamond | 12.5 | 600 | small-caps, tracked |
| Body Text | EB Garamond | 11 | 400 | line-height 1.4 |
| Caption | EB Garamond | 9 | 400 | italic |
| Label (running head / page no. / tags) | Cormorant Garamond | 8.5 | 600 | small-caps, tracked |

All are fields on `TypographyConfigSchema` (`@wildlands/shared`) so they are per-project configurable.

## 3. KDP format recommendations

| Use case | Best trim(s) | Notes |
|---|---|---|
| Most common (text) | 6×9, 5.5×8.5 | standard, cheapest |
| Illustrated / coffee-table / art | **7×10**, 8×10, 8.25×11, 8.5×11 | >6.12″ wide or >9″ tall = KDP "large" = higher print cost |
| Square picture books | 8.5×8.5 | full-bleed illustration |
| Educational / workbook | 8.5×11 | — |
| **Natural history / field guide (this project)** | **7×10** (premium) · 6×9 (portable) · 8.5×11 (deluxe) | 7×10 chosen as default |

**Default:** 7×10. **Not locked** — `trimSize` is per-project. Planned: a preset picker (the KDP standard sizes) + a `format` field (paperback / hardcover / digital). KDP hardcover supports fewer trims; digital/EPUB is reflowable, so type maps to *relative* (em) sizes rather than fixed points.

## 4. Sizing that scales across formats

Role sizes derive from a modular scale (~1.33 ratio) anchored to `bodyPt`. Smaller trims drop body ~0.5–1pt; larger trims raise it. (v1 ships explicit per-role defaults tuned for 7×10; the scale helper is the next step.)

## 5. What was implemented (v1)

- **Config-driven font loading** — `render-html.ts` now builds the Google Fonts URL from the project's fonts (`googleFontsHref`), so the chosen typeface actually loads. (Previously hardcoded to EB Garamond + Inter — the original Cormorant bug.)
- **Single source of truth** — `typographyStyleBlock()` emits CSS variables (`--font-display`, `--font-body`, `--font-caption`) + role rules, shared by the single-page and full-chapter renderers. No more scattered hardcoded `24pt` / `13pt`.
- **Role-based schema** — `TypographyConfigSchema` gained `bookTitlePt`, `chapterTitlePt`, `entryTitlePt`, `sectionHeadingPt`, `subsectionHeadingPt`, `captionPt`, `labelPt` (plus existing `bodyPt`, `lineHeight`, `smallCaps`).
- **New defaults** — Cormorant Garamond display + EB Garamond body; trim 7×10; line-height 1.4.

## 6. Next steps (not in v1)

1. Trim-size **preset picker** + **format** field (paperback / hardcover / digital) in the UI and schema.
2. **Type-scale helper** (auto-derive role sizes from body × ratio, nudged by trim).
3. **Front matter** rendering (title page + introduction) using Book Title / Chapter Title roles.
4. **Digital/EPUB** path using relative (em) sizing.
5. Long-form **multi-page text flow** per entry (separate epic — required for this manuscript's essay-length entries).
