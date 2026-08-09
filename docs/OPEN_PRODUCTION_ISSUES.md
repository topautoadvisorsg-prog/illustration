# Open production issues — typeset track

Found during Layer 1 QA of NO ONE TOLD ME THAT, 2026-08-09. All three are
**recorded, not fixed** — deliberately deferred until the layout architecture is
settled. None of them is a reason to distrust the current 155-page proof's text.

---

## 1. Fonts render correctly but are emitted as Type3 glyph procedures

**Status:** open · **Severity:** blocker for print, invisible on screen

The interior PDF contains no embedded font program for either face:

```
font: Type0:HAAAAA+TimesNewRomanPSMT    embedded=true   refs=7
font: Type3:(no BaseFont)               embedded=false  refs=671
```

**Cause (proven by controlled test):** Chromium's PDF backend emits properly
embedded CID subsets for **system-installed** fonts, but converts any
`@font-face` web font into Type3 glyph-drawing procedures — whether the font
arrives from a CDN or from a base64 data URI.

| Font source | PDF result |
| --- | --- |
| data-URI `@font-face` (Archivo, what we ship) | `Type3`, no BaseFont, not embedded |
| system font (Georgia) | `Type0:AAAAAA+Georgia`, embedded |
| system font (Arial) | `Type0:AAAAAA+ArialMT`, embedded |

**Pre-existing.** The Google Fonts CDN path was also `@font-face`. Vendoring the
faces (see `backend/assets/fonts/`) fixed determinism and offline
reproducibility; it never addressed embedding.

**Why it survives review:** the glyph outlines are the correct typeface, so
pages look right and the three font comparison samples differed exactly as
expected. Text also stays searchable and extractable.

**Risk:** print RIPs and PDF/X preflight commonly reject or mishandle Type3. Not
confirmed against KDP specifically.

**Likely fix:** ship the chosen faces as TTFs installed into the render image's
font path (`fc-cache`), and suppress `@font-face` for any family available
system-side. Note Google Fonts does not serve TTF (WOFF even to a legacy UA), so
TTFs must come from the `google/fonts` OFL repository. Only verifiable inside
the container.

**Detected by:** `yarn workspace @wildlands/backend qa:typeset`.

---

## 2. `bodyToHtml` has no case for Markdown blockquotes

**Status:** open · **Severity:** major, systemic

`backend/src/pipeline/typeset/typeset-book.ts` → `bodyToHtml()` handles `###`,
`####`, `-`/`*` lists, scene breaks and paragraphs. There is **no branch for
`>`**, so a blockquote line falls through to `para.push(t)` and renders as an
ordinary paragraph with a literal `>` in the text.

Visible on **page 7** of the current proof, where a callout renders as:

> `> THE LIE YOUR BRAIN IS TELLING YOU > Whatever this is, it's worse for me than it is for anyone else. >`

instead of a styled callout box. These boxes recur in every chapter, so the
defect is book-wide, not page-specific.

Note this does **not** fail Layer 1 text fidelity: the words are all present and
in order; only their structure and styling are wrong.

**Fix shape:** a blockquote branch in `bodyToHtml` plus a callout style in the
typeset CSS. Cheap, template-level. Deferred so it lands in one regenerate cycle
with whatever the layout audit decides about callout treatment.

---

## 3. `chaptersStartRecto=false` silently drops sections

**Status:** open · **Severity:** major, now loud instead of silent

With recto starts **off**, Paged.js reports completion having laid out only
**13 of 28 sections**. Before the completion fix this produced a truncated PDF
reporting zero overflow (observed at 31 and 64 pages on consecutive runs of the
same input). It now raises `TypesetIncompleteError` instead.

`chaptersStartRecto=true` is currently the **only proven complete mode**, and it
is what the current 155-page / 14-blank proof uses.

**Consequence for design decisions:** the recto/parity-blank policy cannot be
evaluated purely on typographic merit until this is fixed — there is currently
no working alternative to compare against.

See `backend/src/pipeline/typeset/render-typeset.ts` (`assertTypesetComplete`)
and `backend/src/__tests__/typeset-completion.test.ts`.
