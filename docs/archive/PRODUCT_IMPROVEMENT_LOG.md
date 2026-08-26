# Product Improvement Log

**Standing rule (operator, 2026-08-07):** anything detected during QA that could improve the product gets **fixed and documented here** — not just patched on the page in front of us. The goal is that in six months or a year these classes of defect no longer occur, because the platform prevents them rather than because someone caught them again by hand.

Every entry: what was observed, what it cost, root cause, whether it is fixed, and what remains.

---

## OPEN — worth building

### P-001 · No true in-place image repair
**Observed:** A single baked typo ("thie", "notobly", "tvo") forces a full page re-render. Every render produces *new artwork*, because `generateImageFromBlueprint` calls `openai.images.edit()` against the **blueprint** (the layout guide), not against the previous render.

**Cost of the gap:** ~$0.09 per defect, plus the real risk of losing artwork that was already reviewed and approved. Concrete case: `CH08_P008_c2` (Clove Hitch / Timber Hitch) was operator-approved after three rounds of iteration; a one-word text fix would discard that art and re-roll the dice.

**Proposed fix:** true masked inpainting — pass the *previous render* plus a mask over the defective text region, so surrounding illustration is preserved. The OpenAI image edit API accepts an image + mask; the platform never uses that path.

**Unknowns to settle before building:** whether `gpt-image-2` respects a tight mask or re-renders the full canvas anyway; how to locate the defective word's pixel box (the reviewer returns the wrong word, not coordinates). Test on one page before committing.

**Status:** NOT BUILT. Every fix today is a full regeneration.

---

### P-002 · Reviewer cannot report defect coordinates
**Observed:** The AI reviewer reports `thie (as printed) -> the (from source)` but not *where* on the page. Without a location there is no way to build masked repair (P-001), and no way to auto-crop evidence for a human check.

**Proposed fix:** ask the reviewer to also return an approximate bounding box or the surrounding sentence, so the defect can be located deterministically in the rendered text layer.

**Status:** NOT BUILT.

---

### P-003 · Text defects are only detectable by paid AI review
**Observed:** Baked-in typos are invisible to every free check. `verify-text-fidelity.ts` passes 269/269 because it verifies the text reaches the *prompt* — it cannot see what the model actually painted. Only a paid vision call catches "thie" for "the".

**Cost of the gap:** the entire ~$12 review spend on this book exists because of it.

**Possible fix:** deterministic OCR (Tesseract or similar) as a free first pass, escalating to the paid vision model only where OCR and source disagree. Needs measurement — OCR on illustrated parchment may be too unreliable to trust, and a false sense of coverage is worse than none.

**Status:** NOT BUILT. Worth prototyping before the next volume.

---

### P-010 · Reviewer produces garbage on panel/step-structured pages
**Observed:** `CH08_P008` (the Bowline page) was reported with **54 issues**, claiming the entire body text was missing. The page is in fact flawless — title, finished-knot plate, five numbered step panels, all five step texts, a "Where you'll use it" paragraph, and an application scene. It is one of the operator-approved pages.

**Why it happens:** the reviewer does a word-by-word diff against `pageText.body`. When a page legitimately restructures its text into numbered panels and labeled steps, the reading order and content no longer align linearly with the source string, and the diff degenerates into "every word is missing."

**Cost of the gap:** acting on this signal would have re-rendered an approved page and destroyed artwork the operator signed off on after three rounds. Caught only because the image was inspected before spending.

**Proposed fix:** detect structured layouts (`LAYOUT_15_PROGRESSION_STUDY` and similar) and either skip word-order diffing for them or compare as an unordered bag of words. A defect count above roughly 20 on a single page should be treated as a reviewer failure, not a page failure, and escalated for human inspection rather than auto-fixed.

**Status:** NOT FIXED. **Standing rule until it is: never re-render on a very high issue count without looking at the image first.**

---

### P-011 · Resume flags could silently become full-book sweeps — FIXED 2026-08-07
`--only-errors` was run to retry 4 pages that had returned empty completions. The report still held 120 pages marked `error` from an unrelated outage days earlier, so the flag correctly — and silently — expanded to a near-full-book sweep: ~$5.40 against a ~$4.60 balance. Killed after one page (~$0.05).

Any batch over 15 pages now prints its scope and measured cost estimate and refuses to start without `--yes`. Selection bugs are caught before they are billed. Verified: `--only-errors` now reports "113 pages, ~$5.08" and exits rather than spending.

---

## FIXED

### P-012 · Reasoning-model token budget starved the output — FIXED 2026-08-07
`max_completion_tokens: 3000` on `gpt-5.5`, a reasoning model whose internal reasoning is billed against that same budget before any output token is emitted. On the densest pages the entire allowance went to reasoning and the call returned an empty completion — surfacing as "AI review returned no content" and costing a full paid call for nothing. It reproduced only on the text-heaviest pages (the look-alikes comparison table, the packed larch page, the knots pages), which is the signature. Measured successful completions average ~1,250 tokens, so the output was never the problem. Raised to 8000; the previously-erroring look-alikes page now reviews and passes.


### P-004 · Reviewer flagged a page's own title as an error — FIXED 2026-08-07
`deriveReviewSourceText` compared the image against body text only, excluding the title and scientific-name byline that are genuinely printed. `CH02_P007` was flagged for correctly printing "CANADA LYNX / Lynx canadensis". A false positive here is not free — it sends a good page for a paid re-render. Commit `06a004c`.

### P-005 · Reviewer flagged correct typography as defects — FIXED 2026-08-07
`CH08_P010` was flagged because the page printed curly apostrophes ("Tsuut'ina", "That's") while the source stores straight ASCII. Curly apostrophes are *correct* book typesetting. The reviewer now treats curly/straight quotes, en/em dashes vs hyphens, ellipses, and ligatures as equivalent, and reports punctuation only when meaning or grammar changes. Verified it still catches a real case: "if you can. like the northern lights" where source has "can; like". Commit `be27e58`.

### P-006 · A failed batch could not be resumed, and results were lost — FIXED 2026-08-07
A 269-page sweep was piped through `tail`, discarding the defect detail it had just paid to produce; a second full sweep then re-reviewed pages the first had already passed. ~$5–6 wasted. Runs now checkpoint to `ai-review-report.json` after every page and support `--only-errors` / `--only-unchecked`. Commit `c7efb6e`.

### P-007 · QA batches ran against production and took it down — FIXED 2026-08-07
The review batch drove the deployed backend, making it download a ~3MB render per call; sustained runs left the container unreachable until Railway restarted it. Review now runs in-process. Commit `09cd9a8`.

### P-008 · Cover dimensions hardcoded per volume — FIXED 2026-08-07
Cover scripts hardcoded `PAGE_COUNT = 275` and volume one's wrap dimensions. Volume two is 269pp with a 0.820in spine, not 0.834in — enough to misregister a wrap. Dimensions now come from verified KDP Cover Calculator readings, parameterized by binding/trim/paper/page count, failing closed outside verified ranges. Commit `1cf1a85`.

### P-009 · Chapter openers printed the chapter number twice — FIXED 2026-08-06
Typography DNA described a "CHAPTER kicker / Roman numeral / name" stack while a hard constraint forbade printing the word CHAPTER. The model satisfied both and produced "CHAPTER / I / CHAPTER 1: KNOW YOUR REGION". That stack had never shipped in the series. Commit `500d6c2`.

---

## DEFECT PATTERNS OBSERVED (feed these into future prevention)

From the 2026-08-07 review of 64 changed pages, 11 real defects:

| Pattern | Count | Example |
|---|---|---|
| Single-letter glyph corruption | 5 | `thie`→the, `hie`→the, `tis`→its, `notobly`→notably, `tvo` |
| Punctuation substitution | 3 | `divide,`→`divide;`, `can.`→`can;` |
| Duplicated line | 1 | Toxicity warning printed twice |
| Wrong number | 1 | Index entry "100" vs "120" |
| Text baked into illustration | 1 | "TRUCKER'S HITCH" label inside the artwork |

**Concentration matters:** defects clustered in Chapters 4 and 5, which had never been text-reviewed. Chapters 1–3 and 8, reviewed in earlier sessions, came back nearly clean. Reviewing only *changed* pages found the real risk for ~$2.79 instead of ~$9.45 for the whole book.

**Numbers deserve special suspicion.** The index error ("100" for "120") is the most damaging defect found — it sends a reader to the wrong page and no proofreader would catch it without checking every entry. Any page whose text is mostly numbers (index, contents, seasonal calendar) should be reviewed even when unchanged.
