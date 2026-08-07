# Prompt-Optimization Experiment — Text-Baking Typo Reduction
### THE WILDLANDS: CANADIAN ROCKIES — whole-page-render pipeline

Status: DRAFT — research and design complete, generation/scoring in progress.
Scope: measurement only. No production files were modified. No DB writes were made.
Test page: `CH01_P007_c4` (project `8c1e161a-69dd-4a3d-a655-8de54995be16`).

---

## 0. Problem recap

On one test page (`CH01_P007_c4`), 5 production renders of the CURRENT prompt template produced:

| Render | Typo count | Words affected |
|---|---|---|
| v1 | 1 | clear → clearl |
| v2 | 5 | routinely→rouniiely, cauliflower→caulifboover, because→becasse, counterintuitive→counterinituitive, flooded→flodded |
| v3 | 1 | cauliflower→caulifwover |
| v4 | 2 | routinely→routniely, fiercely→fiereely |
| v5 | 2 | routinely→routiniely, cauliflower→cauliflwover |

Baseline: **11 typos / 5 renders ≈ 2.2 typos per render.**

Root-cause context already established before this experiment: New England's assembled prompt averaged ~10,100 chars with a 3-bullet HARD CONSTRAINTS section; Canadian Rockies' prompt averages ~13,400–15,100 chars with an 8-paragraph HARD CONSTRAINTS section added post-launch to fix real defects (missing full-bleed art, guide-line leakage, text cut at trim). Hypothesis: the added instruction volume dilutes the model's fidelity budget for exact text transcription.

---

## 1. Research summary — OpenAI guidance + community findings

**Sources are mixed quality: official OpenAI documentation is directly authoritative; third-party "2026 prompt guide" blog posts are marketing content of varying rigor; the "lost in the middle" citation is peer-reviewed NLP research about LLMs generally, not about gpt-image-2 specifically — it's the most plausible mechanism, not a confirmed one for this model.**

### Evidence-based (official OpenAI docs — developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide and .../image-gen-1.5-prompting_guide)

- **No stated hard limit on prompt length**, and no explicit claim that long prompts degrade quality. OpenAI's own framing is procedural, not about dilution: *"Long prompts can work well, but debugging is easier when you start with a clean base prompt and refine with small, single-change follow-ups."* / *"Iterate instead of overloading."* This is workflow advice (single-shot dense prompts are harder to debug), not a documented accuracy claim — worth distinguishing from the dilution hypothesis, which OpenAI does not explicitly confirm or deny.
- **Consistent instruction ordering is recommended**: *"Write prompts in a consistent order: background/scene → subject → key details → constraints."* No claim is made about primacy/recency (i.e., whether instructions near the top or bottom get more weight) — this is not addressed in the official docs at all.
- **Text fidelity — this is the most concrete, actionable guidance found, and it's a gap in the current template**: *"Put literal text in quotes or ALL CAPS."* *"For tricky words (brand names, uncommon spellings), spell them out letter-by-letter to improve character accuracy."* *"State verbatim rendering (no extra characters)."* The current `assemble-page-prompt.ts` template passes body text as plain JSON string values inside a fenced code block — never quoted as literal copy, and never calls out specific risk words. This is a direct, low-risk lever the official docs point to that the pipeline isn't using yet.
- **Quality setting**: official guides recommend `high` quality specifically for dense text / print fidelity — the pipeline already uses `high`, so this lever is already applied.
- No official document quantifies "how many constraints the model can reliably follow" — any number quoted by third-party blogs (e.g., "7-8 distinct constraints") is not sourced to OpenAI and should be treated as unverified marketing copy.

### Speculative / unverified (third-party blogs, community)

- Numerous 2026 "GPT Image 2 prompt guide" sites (imagine.art, notegpt.io, cometapi.com, pixverse.ai, atlabs.ai, glbgpt.com, framia) repeat similar advice (quote literal text, spell tricky words, use `high` quality for dense text) but add unsupported specific numbers (e.g. "95%+ text accuracy," "handles 7-8 constraints") with no methodology disclosed — treated as marketing copy, not evidence.
- No Reddit/X/forum threads were found specifically describing gpt-image-2 (or gpt-image-1) degrading on **long, dense, multi-constraint** prompts. The one concrete community data point found (Adobe Firefly community forum) describes a *different* text-to-image product "ignoring all prompts after the first two [sentences]" — a real, documented instance of instruction-position sensitivity in a *sibling* product family, but not gpt-image-2 itself, so it's suggestive, not conclusive.
- One factual, non-speculative note: gpt-image-1 (the prior model) had a **4,000-token prompt context window**. The Rockies prompt (~15,100 chars ≈ ~3,500–4,000 tokens depending on tokenizer) is plausibly closer to that ceiling than New England's ~10,100-char prompt (~2,300–2,600 tokens) — if gpt-image-2 has a similar or only modestly larger window, the Rockies prompt could be operating much closer to a hard truncation/attention-saturation boundary than New England's ever did. This is a real, checkable mechanism (not just "vibes") and is worth flagging to OpenAI/monitoring token counts directly if this experiment is inconclusive.

### The "lost in the middle" mechanism (independently well-established, general LLM research)

- LLM-family models (which underlies gpt-image-2's prompt understanding) exhibit a **U-shaped positional attention bias**: information at the very start and very end of a long input is used far more reliably than information buried in the middle. Documented degradation from this effect exceeds 30% in some benchmarks when critical instructions sit mid-context.
- This is NOT proven for gpt-image-2's image-generation path specifically, but it is a principled, literature-backed reason to test whether **relocating** the text-fidelity instruction (currently buried mid-prompt, with a large "HARD CONSTRAINTS" block landing at the very end — i.e., right before the model must commit to output) helps. It directly motivated Variants B and C below.

**Bottom line for design:** the dilution hypothesis (more instructions → worse text fidelity) is plausible but NOT confirmed by OpenAI directly. Two mechanisms ARE independently well-supported and testable: (1) OpenAI's own literal-quoting / spell-out-tricky-words technique isn't used in the current template (Variant E tests this directly), and (2) general LLM positional attention bias suggests instruction placement, not just volume, may matter (Variants B/C test this). Variant A tests the volume/redundancy hypothesis directly by removing restated content without changing what's asked for.

Sources:
- [GPT Image Generation Models Prompting Guide (OpenAI Cookbook)](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
- [Gpt-image-1.5 Prompting Guide (OpenAI Cookbook)](https://developers.openai.com/cookbook/examples/multimodal/image-gen-1.5-prompting_guide)
- [GPT Image (Wikipedia — model release dates, gpt-image-1 context window)](https://en.wikipedia.org/wiki/GPT_Image)
- [Adobe Firefly community — "text to image ignores all prompts after the first two"](https://community.adobe.com/t5/adobe-firefly-discussions/text-to-image-ignores-all-prompts-after-the-first-two/td-p/14249787)
- [Lost-in-the-Middle Problem: Why Context Position Matters](https://atlan.com/know/llm/lost-in-the-middle-problem/)
- [Found in the Middle: Calibrating Positional Attention Bias Improves Long Context Utilization (arXiv)](https://arxiv.org/pdf/2406.16008)
- Third-party prompt guides consulted for completeness (treated as low-confidence marketing sources, not cited as evidence): imagine.art, notegpt.io, cometapi.com, pixverse.ai, atlabs.ai, glbgpt.com, framia.converge.ai, gptimage2api.org

---

## 2. Redundancy audit — the 9 "HARD CONSTRAINTS" bullets

Read in full from `backend/src/pipeline/whole-page-render/assemble-page-prompt.ts` (function `hardConstraints`, lines 63–151) and the saved Rockies prompt (`prompt_v2.txt`). The block actually contains **9 bullets** for a text-bearing CONTINUATION page (the function pushes a base array of 6 items, then 3 more inside the `rendersCriticalText` branch — pages that don't render text, e.g. covers/title pages, get fewer).

| # | Bullet | Core purpose | Client hypothesis confirmed? |
|---|---|---|---|
| 1 | PRODUCTION GUIDES ARE NOT ARTWORK | Blueprint/guide marks must never render | Distinct — protects against a real, different defect (leaked production references), not a text/bleed rule. **Keep as-is.** |
| 2 | COMPOSITION CONTRACT | Image/text placement per spec; no moving/mirroring/enlarging | Distinct — layout-fidelity rule, not about bleed or text safety specifically. **Keep as-is.** |
| 3 | LAYER ARCHITECTURE (bleed rule) | Background may bleed; main subject + ALL typography + decorative devices must stay ≥0.5in inside trim | **Overlaps with #5.** States "typography ... must sit entirely inside the trim-safe area" — this is the same core claim TEXT SAFETY (#5) restates below. |
| 4 | NO FRAMES, BORDERS, OR DECORATIVE BANDS | No invented lines/borders/swags around text or page | Distinct from #1 — different failure mode (model inventing decoration vs. leaking a production guide mark). Superficially similar ("no lines") but addresses a different root cause. **Keep as-is**, flagged only as a near-neighbor of #1 worth a shared visual scan during future QA. |
| 5 | TEXT SAFETY (highest priority) | Text stays inside safe area, buffer from trim, centered, sizes down (never the illustration) | **Confirmed restatement of #3's typography-in-trim-safe rule**, with two additive ideas (centering, text-sizes-down-not-art) folded in. |
| 6 | "Do not add page numbers/captions/watermarks…" | Furniture-invention prevention | Distinct — unrelated to bleed/text-safety. **Keep as-is.** |
| 7 | BOTTOM ANCHOR | Paint a real illustration in the bottom band (functional: keeps text off the bottom trim) | **Partially redundant.** The compositional instruction (paint something in the bottom band) is a DISTINCT, real, needed directive (this is what fixed the "missing full-bleed art" defect) — but it re-explains the "text must never enter the bottom band" rule that #3/#5 already state, a 3rd time, in different words. |
| 8 | TOP ANCHOR | Mirror of #7 for the top | **Same pattern as #7** — distinct compositional directive (paint the top), but restates the text-safety rationale a 4th time. |
| 9 | SUBJECT POSE | Subject must look alive, not a stiff specimen | Distinct — an art-quality/liveliness rule, unrelated to bleed or text. **Keep as-is** (arguably belongs in Illustration DNA rather than "hard constraint," but not a text/bleed redundancy — out of scope for this audit). |

**Confirmed: the client's hypothesis is correct.** The single idea *"everything past the trim gets physically cut off — keep typography and the main subject inside it"* is stated in full or in part **4 times** (#3, #5, #7's framing, #8's framing) using different vocabulary each time. #7 and #8 also carry a real, distinct, non-redundant instruction (paint the bottom/top band) that must NOT be removed — only their repeated safety-rationale framing is restatement.

**Consolidation applied in Variant A:** merge #3 + #5's core claim into one "TRIM-SAFE PROTECTED CONTENT" bullet (stated once, keeping every distinct sub-claim: bleed layer, protected-content layer, 0.5in buffer, centering, text-sizes-down-not-art). Keep #7/#8 as their own bullets — they still need to command "paint the bottom/top band" — but trim them down to the compositional directive plus the one non-redundant addition (bleed-disposability of that specific band), stripping the restated "this protects the text" justification. Net: **9 bullets → 8 bullets, hard-constraints block shrinks from ~6,050 to ~4,300 characters (≈29% shorter)**, full prompt drops from 15,106 → 13,362 characters (≈11.5% shorter) with zero loss of any distinct rule, including both original defect-fixes (full-bleed coverage via bottom/top anchors, guide-line leakage via #1, trim-safety via the merged bullet).

---

## 3. Variants under test

All variants share the IDENTICAL spec (subject, geometry, composition, and body text) from the real production row `whole_page_renders` (pageId for `CH01_P007_c4`, version 2) — only prompt STRUCTURE changes. Full prompt text for every variant is saved alongside this document at `backend/experiments/prompt-optimization/<variant>/_prompt.txt`.

- **Control** — current production prompt, unchanged. 15,106 chars.
- **Variant A — consolidated hard constraints.** Redundancy audit applied (Section 2). Same order otherwise. 13,362 chars (−11.5%). Tests the volume/redundancy hypothesis directly.
- **Variant B — text-fidelity moved to the top.** The "Render the provided text EXACTLY" + "SPELL EVERY WORD LETTER-FOR-LETTER" instructions relocated to immediately after the HEADER, before Typography/Illustration DNA — the first thing the model reads. Everything else (including the full 9-bullet HARD CONSTRAINTS block) stays in its original position/order. 15,216 chars. Tests the "primacy" half of the positional-attention hypothesis.
- **Variant C — text-fidelity adjacent to body + all other constraints pulled forward.** All 9 HARD CONSTRAINTS bullets (unchanged text) moved to occur BEFORE the body text section (right after Decorative Elements). Text-fidelity instructions stay in their normal spot immediately before the body JSON, PLUS a new "PROOFREAD CHECK" reminder immediately AFTER the body JSON — so the last thing the model reads before HARD NEGATIVES is a text-accuracy reminder, not a visual/layout rule. 15,318 chars. Tests the "recency" half of the positional-attention hypothesis.
- **Variant D — two clearly-separated topic blocks.** Same overall position as control (after the body, before HARD NEGATIVES) but the 9 bullets are explicitly split into a labeled "HARD CONSTRAINTS — VISUAL & LAYOUT" block (8 items) and a separate labeled "HARD CONSTRAINTS — TEXT FIDELITY & SAFETY" block (verbatim rule + spelling rule + TEXT SAFETY bullet, 3 items) placed immediately after it. Isolates topic-grouping/labeling clarity from both volume and position. 15,053 chars.
- **Variant E — spelling-risk callout (OpenAI's documented technique).** Identical structure/order to control. Adds one new block immediately after the body JSON listing every body word ≥9 letters (OpenAI's stated risk threshold) plus words already observed to fail in the control baseline despite being short/common (`because`, `flooded`, `fiercely`, `clear`), each spelled out letter-by-letter (e.g. `"cauliflower" → C-A-U-L-I-F-L-O-W-E-R`). 16,293 chars (longest variant — deliberately, since this tests content/technique, not brevity). Tests OpenAI's own documented text-fidelity guidance directly.

Note on the control-baseline typo pattern: it is NOT cleanly explained by "hard/rare vocabulary" alone — `because`, `flooded`, `clear`, and `fiercely` are common short words that also failed, alongside the two clear repeat-offenders `cauliflower` (3/5 renders) and `routinely` (3/5 renders). Variant E's risk-word extraction (≥9 letters) is grounded in OpenAI's stated heuristic but was deliberately supplemented with the observed short-word failures so the test isn't blind to the actual baseline data.

---

## 4. Scoring — PENDING

*(To be completed after generation. Per-sample: typo count + words, layout accuracy, illustration quality, decorative-artifact regression check, pass/fail.)*

## 5. Recommendation — PENDING

*(To be completed after scoring.)*
