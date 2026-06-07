# Page Generation Inspector — Operator Visibility Map

Status: Inspector tabs A–C are implemented. This document maps every pipeline
stage to what the operator sees, so we can confirm nothing important is missing
before further work. Real tab names are used throughout.

**Tabs:** Manuscript · Layout · Typography · Image Plan · Prompt · Image Result · Final Page

**Determinism note (corrected):** the manifest stage runs **deterministically**
today (MANUSCRIPT_ANALYST `realityNote`: "No LLM call runs under this name
today" — deterministic Markdown parsing + deterministic `deriveVisualSubject`).
The only live LLMs are the advisory "Audit with Agent" reviewers
(OPERATOR_ADVISER / STAGE_REVIEWER). Everything else (planner, layout director,
text-fit, sanitizer, subject derivation, blueprint, renderer) is deterministic.

---

## Stage 0 — Ingestion (manuscript → stored source)

1. **Step:** Extract the uploaded manuscript into normalized text.
2. **Responsible:** Stage 1 ingestion (`stage-1-ingestion`), deterministic.
3. **Input:** uploaded `.md`/`.docx` manuscript file.
4. **Output:** stored manuscript text in project storage.
5. **Prompt/instructions:** none (no LLM).
6. **Tab:** Manuscript.
7. **Operator sees:** the source text and per-page body in the Manuscript tab.
8. **Operator action:** re-upload manuscript if wrong; otherwise none.
9. **Catches:** wrong/garbled source, missing sections, bad encoding.

## Stage 1.5 — Manifests (source → book/chapter/page manifests + subject)

1. **Step:** Turn the manuscript into structured page manifests; derive each
   page's `imageSubject`; optionally classify `contentType`.
2. **Responsible:** `stage-1.5-manifests/generate-manifests.ts` — **deterministic**
   today (Markdown structure + `deriveVisualSubject`, a page-context-first
   concrete-subject extractor). Governed by the MANUSCRIPT_ANALYST contract.
3. **Input:** stored manuscript text + project config.
4. **Output:** `PageManifest` rows (`entryTitle`, `scientificName`,
   `bodyMarkdown`, `imageSubject`, `chapterNumber`, optional `contentType`).
5. **Prompt/instructions:** the manifest-generation agent contract (Claude).
   Subject derivation uses a deterministic New-England-wilderness vocabulary, no
   prompt.
6. **Tab:** Manuscript (body + subject); the subject also surfaces in Image Plan.
7. **Operator sees:** `imageSubject`, `wordCount`, full `bodyMarkdown`.
8. **Operator action:** re-run breakdown (`/manifests`) if a subject or split is wrong.
9. **Catches:** abstract/wrong subjects (e.g. a raw heading instead of a concrete
   subject), mis-chaptered pages, bad body splits.
   **GAP to confirm:** the Claude manifest prompt itself is not yet shown.

## Stage 2 — Planner (manifest → layout choice + assembled image prompt)

1. **Step:** Choose the layout template (danger override → manifest contentType →
   signal cascade → word-count fallback), classify content type, and assemble the
   full image-only prompt; strip any legacy box-model language.
2. **Responsible:** `stage-2-planner/plan-pages.ts`, deterministic (carries a
   PAGE_PLANNER persona for display, not an LLM call).
3. **Input:** `PageManifest` + project config (layout assets, thresholds, Style DNA).
4. **Output:** `PagePlanningDecision` — `layoutTemplate`, `decisionTrace`,
   `capacity` (words), `layoutInstructions`, and the exact `prompt` + `sha256`.
5. **Prompt/instructions (the assembled image prompt):**
   `MASTER STYLE DNA` + the layout's `promptTemplate` + `{SUBJECT}` +
   `{SCIENTIFIC_DETAILS}` + `{COMPOSITION_NOTES}` (the PAGE COMPOSITION BRIEF /
   zones) + `IMAGE_PROMPT_SAFETY_RULES`, then `stripLegacyBoxModelLanguage()`.
6. **Tab:** Layout (choice + "why"), Prompt (the assembled prompt).
7. **Operator sees:** template, reference label, content type, image/text split,
   word capacity, the decision trace ("why this layout"), and the exact prompt.
8. **Operator action:** **force a different layout** (`force-layout`), re-plan,
   or edit layout assets in config.
9. **Catches:** wrong layout selection, a low-capacity layout chosen for long
   copy, stale box-model language, unresolved prompt placeholders.

## Stage 6a — Layout Director + Text-Fit (zones + capacity + overflow)

1. **Step:** Compute the page's zone geometry and estimate whether the body fits.
2. **Responsible:** `stage-6-layout/layout-director.ts` (zones) +
   `text-fit.ts` (`analyzeTextFit`), deterministic.
3. **Input:** body markdown, chosen layout, page geometry, body pt/line-height.
4. **Output:** `imagePriorityZones`, `textSafeZones`, `typographyZones`
   (each `xPct/yPct/widthPct/heightPct`), `capacityChars`, `charCount`,
   `fillRatio`, lines, `estimatedRenderedPages`, fit status.
5. **Prompt/instructions:** none.
6. **Tab:** Layout (zone map + zone rects), Typography (capacity, fill %,
   overflow, words/page, estimated pages).
7. **Operator sees:** the schematic **zone map** (color-coded boxes:
   image / support / text-safe / title), the coordinate list, and the fit
   read-out (FITS / TIGHT / OVERFLOW / UNDERFILLED).
8. **Operator action:** force a higher-capacity layout, adjust typography in
   config, or accept TIGHT.
9. **Catches:** text-safe/title/image zones wrong; **overflow** that would create
   broken continuation pages; underfilled (too-empty) pages.

## Stage 3a — Blueprint (zones → composition-map image)

1. **Step:** Render the zones to a color-coded blueprint PNG handed to the image
   agent as a composition map.
2. **Responsible:** `stage-3-generation/blueprint.ts` (sharp), deterministic.
3. **Input:** the layout allocation (zones) + page pixel size.
4. **Output:** blueprint PNG (blue=image, purple=support, green=text-safe,
   yellow=title) + the `BLUEPRINT_COMPOSITION_INSTRUCTION`.
5. **Prompt/instructions:** the composition instruction ("use as a map, do not
   reproduce its colors, keep text-safe calm, render no text").
6. **Tab:** Layout (the generated blueprint image, when present).
7. **Operator sees:** the actual blueprint the illustration was composed against.
8. **Operator action:** regenerate with blueprint mode; force a layout to change
   the map.
9. **Catches:** blueprint zones that don't match intent before any image spend.
   **GAP to confirm:** the blueprint instruction text is shown only inside the
   per-version exact prompt (Image Result), not called out on its own.

## Stage 2b — Image Subject Plan (what is depicted)

1. **Step:** Define the hero subject + any supporting/study subjects + the
   illustration requirements for the page.
2. **Responsible:** subject from Stage 1.5; supporting zones + instructions from
   Stage 2/6 (deterministic).
3. **Input:** `imageSubject` + layout `imagePriorityZones` roles + layout
   instructions.
4. **Output:** hero subject, placement, supporting zones, image/text zone notes.
5. **Prompt/instructions:** the layout instructions block + per-zone instructions.
6. **Tab:** Image Plan.
7. **Operator sees:** hero subject, placement, supporting/study zones, and the
   layout's image/text-zone guidance.
8. **Operator action:** fix subject via re-breakdown; force a layout for different
   supporting zones.
9. **Catches:** wrong/empty subject, missing supporting elements, layout-subject
   mismatch (e.g. a scene forced into a scattered-studies layout).

## Stage 2c — Exact Image Prompt

1. **Step:** The final, locked prompt for the page.
2. **Responsible:** Stage 2 (planned/stored prompt) and Stage 3 (the exact
   per-version prompt actually sent, = stored prompt + image-shape addendum +
   blueprint instruction when used).
3. **Input:** assembled prompt.
4. **Output:** prompt text + `sha256` (planned) and per-version prompt (sent).
5. **Prompt/instructions:** this IS the prompt.
6. **Tab:** Prompt (planned/stored, copyable) + Image Result (exact per-version).
7. **Operator sees:** the full prompt, copy-to-clipboard, sha + ready/blocked.
8. **Operator action:** copy, audit, regenerate with an addendum.
9. **Catches:** anything wrong in the actual instruction sent to the model.
   **NOTE to confirm:** Prompt tab = planned prompt; Image Result per-version
   prompt = exact bytes sent (incl. shape + blueprint instruction).

## Stage 3b–5 — Image Result (generation → review → upscale)

1. **Step:** Generate the illustration (optionally from the blueprint), then the
   operator reviews; approved images can be upscaled.
2. **Responsible:** Stage 3 generation (gpt-image), Stage 4 review (operator),
   Stage 5 upscale.
3. **Input:** exact prompt (+ blueprint PNG if used) and image size.
4. **Output:** immutable image versions (PNG) with status + active flag.
5. **Prompt/instructions:** the exact per-version prompt (stored per version).
6. **Tab:** Image Result.
7. **Operator sees:** model used, per-version thumbnails, status, active flag, dims.
8. **Operator action:** generate, regenerate (with instruction), approve, reject,
   set active, reuse a library image, upscale.
9. **Catches:** off-style/wrong art, text baked into the image, busy text zone,
   wrong size; lets the operator pick the best version.

## Stage 6b — Final Page Preview (render)

1. **Step:** Compose the final page — illustration painted full-bleed, typography
   placed in the reserved zone (renderer never masks/repairs the art).
2. **Responsible:** `stage-6-layout` renderer (Paged.js), deterministic.
3. **Input:** active image + body text + layout.
4. **Output:** the exact single-page PDF (what exports).
5. **Prompt/instructions:** none.
6. **Tab:** Final Page.
7. **Operator sees:** the embedded single-page PDF, large — exact export fidelity.
8. **Operator action:** render / re-render; proceed to chapter/book render.
9. **Catches:** text over busy art, title legibility, real readability and overall
   page quality before export.

---

## Cross-cutting gate — Chapter Layout Approval (spend guard)

- **Step:** Approve a chapter's layout after text-fit, before any image spend.
- **Responsible:** operator via the layout-approval endpoint.
- **Operator sees:** the page summary shows "chapter layout approved / pending"
  and an image-lock notice when unapproved.
- **Operator action:** approve the chapter layout.
- **Catches:** spending on images before the layout/text-fit is signed off.

---

## Gaps — resolution status

1. ✅ **DONE** — Manuscript tab surfaces the **manifest stage instructions**
   (MANUSCRIPT_ANALYST contract: mission, frame, rules, required outputs, runtime
   + truthful realityNote). Labeled as the governing spec, not a fake LLM prompt.
2. ✅ **DONE** — Image Plan tab shows the **Blueprint Composition Instruction**
   directly (endpoint returns `blueprint.instruction`).
3. ✅ **DONE** — **Agent Notes** strip renders the per-page Publishing Director
   advisory (why / recommended fix) when available; advisory, never blocking.
   (Reviewer LLM chat output remains transient; run "Audit with Agent" for a
   fresh pass.)
4. ⏸️ **DEFERRED to Phase 2** — per-continuation-sheet content (which paragraphs
   land on page 2/3). Typography shows count + overflow only; the full per-sheet
   breakdown comes with the capacity-char hard-split work.
5. ✅ **DONE** — **Chapter approval state** promoted into the Inspector header as
   an approved/pending (images-locked) chip.

**Inspector structure: DONE** (gaps 1, 2, 3, 5 folded in; gap 4 is Phase 2).

## Operator actions, by tab (summary)

- **Manuscript:** re-upload / re-breakdown.
- **Layout:** force layout, re-plan, edit layout assets.
- **Typography:** force higher-capacity layout, adjust typography, accept TIGHT.
- **Image Plan:** fix subject (re-breakdown), force layout.
- **Prompt:** copy, audit.
- **Image Result:** generate, regenerate, approve, reject, set active, reuse, upscale.
- **Final Page:** render / re-render, then chapter/book render.
- **Gate:** approve chapter layout before image spend.
