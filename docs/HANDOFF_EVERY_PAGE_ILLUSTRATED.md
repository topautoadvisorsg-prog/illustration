# HANDOFF — Every-Page-Illustrated (Series Two / Canadian Rockies)

**Project:** THE WILDLANDS — Series Two, `8c1e161a-69dd-4a3d-a655-8de54995be16`
**Backend:** https://wildlandsbackend-production.up.railway.app · Storage: Cloudflare R2 · DB: Supabase
**`.env` PROJECT_ID is pinned to Series Two.** Operator scripts read `P` from it — verify before running anything.

---

## SESSION UPDATE 2026-08-02 — READ FIRST

### Bug fixes (all committed + pushed to `main`, deployed, done)

1. **Fixed a systemic "text gets silently stripped" bug** affecting the cover, title page, glossary, and index. `assemble-page-prompt.ts` had a leftover false assumption that a separate "publishing engine" would stamp text onto these page types after AI generation — nothing does. Real content was already sitting correctly in each page's spec and just getting discarded before it reached the model. Fixed for `COVER_WRAP`, `TITLE_PAGE` (gated on non-empty `titleHierarchy` so the half-title's intentional blank stays blank), and `GLOSSARY_ORNAMENT`/`INDEX_ORNAMENT` (removed from the exclusion list entirely — they already had real `bodyBlocks`). Commits `ee37e7b`, `d10297e`, `e609cc9`, `076dbcc`, `d4ffc89`.
2. **Series-line bug:** `buildSeriesLine()` was reading `config.volume` (always 1) instead of `config.publishing.series.volumeNumber` — any book after the first in a series would print "SERIES I" regardless of its real position. Now uses `series.volumeNumber`, falling back to `config.volume` only when unset. This book now correctly prints "SERIES II".
3. **`/ai-review` gap:** the endpoint only ever checked `spec.pageText.body`, silently no-opping ("nothing to check") on cover/title pages whose text lives in `coverCopy`/`typographyDNA.titleHierarchy` instead — exactly the two page types most likely to have had the bug above. Fixed via `backend/src/pipeline/whole-page-render/review-source-text.ts` (commit `30535c1`).
4. **New standing tool — `backend/scripts/verify-text-fidelity.ts`:** run `tsx scripts/verify-text-fidelity.ts <projectId>` before any batch of paid renders. Builds the real spec+prompt for every page (no spend, no DB writes) and flags any page whose spec has text the prompt doesn't contain. Currently clean on both books.
5. **New standing tool — `backend/scripts/batch-ai-review.ts`:** runs the existing `/ai-review` endpoint (cheap vision chat-completion, NOT `gpt-image-2`) against every page's latest render in a project, sequentially, so you don't have to click "AI review text" one page at a time in the console. `tsx scripts/batch-ai-review.ts <projectId> [pageKeyContains]`.
6. **New England was NOT re-rendered** — only Canadian Rockies picked up the fix. New England's pre-existing correct cover/title/glossary/index pages are exactly why this bug went unnoticed for a full book cycle: it was written before the regression and never touched again.

### Editorial audit — new effort, separate from the bug fixes above

The operator asked for a full page-by-page editorial/storytelling audit of the manuscript (not bugs — readability, thin chapter intros, content density, missing instructional illustration). Full findings + a prioritized regeneration plan + proposed future Manuscript-QA rules: **`docs/EDITORIAL_AUDIT_CANADIAN_ROCKIES.md`**. Read it before touching manuscript content.

**Phase 1 is DONE and operator-approved:** Chapter 8 (Bushcraft) Shelter/Water/Knots, previously three single dense pages, are now genuinely instructional. Chapter 8 went 10 → 16 pages; book total 243 → 249. Notes for whoever continues:

- **How pages were added without a full re-paginate.** `/api/projects/:id/paginate` re-plans the ENTIRE project and orphans every already-rendered BODY page's DB row (front/back matter rows survive; body rows do not — see the INCIDENT note further down, same failure class). To grow ONE chapter without touching the other 240+ pages, we hand-inserted/deleted `pages` rows directly: delete the old single-page entry, insert N new rows sharing one `entryKey` with incrementing `partN`/`pageRole` (opener, then continuation, continuation...), sequential `plannedPageNumber`, and shift `plannedPageNumber` on everything after it in the chapter plus `pageLabel` (the printed folio — print-prep-stamped, no re-render needed for that alone) on every back-matter page after it. This is **not a general tool**, it was a one-off script per expansion — see `backend/scripts/_scratch/expand-ch8.ts` and `expand-knots-v2.ts` for the pattern if you need to do it again. **Dry-run before committing** — the first attempt today miscounted the shift arithmetic and would have collided two pages' numbers; the dry-run output caught it before anything was written.
- **Gotcha that cost real time:** a page's illustration subject does NOT come from `pages.imageSubject` for OPENER pages — that column only feeds CONTINUATION pages (`perPageStudy` in `render-whole-page.ts`'s `prepareRender`). Openers resolve their subject from the `manifests` table (Stage 1.5 Breakdown output), keyed by `entryKey`. A hand-inserted opener reusing an `entryKey` that already has an old manifest row will **silently use the stale manifest's imageSubject and ignore the new page's content entirely.** Fix: also `UPDATE manifests SET content.imageSubject = ...` for that `externalId` whenever you replace an opener page this way. `verify-text-fidelity.ts` does not catch this — it's an illustration-quality issue, not a text-fidelity one. Good candidate for a future QA rule.
- **AI image generation cannot reliably hold a coherent multi-panel step-by-step tying sequence together**, confirmed by the operator against real references (Animated Knots, scouting/pioneering sources). The Knots pages were rebuilt twice: v1 tried 3–5 numbered step panels per knot on a shared page (looked plausible, wasn't actually teachable — too small, and the model doesn't reliably keep rope topology consistent across panels). v2 kept a step sequence only for the Bowline (given its own full page — worked well) and the Lashings page (worked well); for Clove Hitch/Timber Hitch and Trucker's Hitch/Taut-Line Hitch, dropped the step sequence entirely in favor of two images per knot: a clean finished-knot reference + a real-world-application vignette. **Lesson: don't ask the image model for a multi-step technical sequence unless you've confirmed it can actually hold one together — a single accurate "finished result" image is a far more reliable ask than a tutorial.**
- The manuscript source (`.../manuscripts/the-wildlands-canadian-rockies-FULL-MANUSCRIPT.md`) was kept in sync with the new page content — not strictly required, but a future full re-paginate would otherwise regenerate the old short version.

**Cover is now stale — expected, not a bug.** `config.publishing.coverSync.builtForPageCount` is still `243`; the book is now `249`. The final-export page-count guard (see README) will correctly block until the cover is regenerated. **Don't regenerate it yet** — more chapters are still getting edited in later phases, each of which will change the page count again. Regenerate the cover once, after all editorial phases are done.

**Not yet done — remaining items from the audit's priority list** (operator wants this phased: one chapter reviewed and approved before the next starts):
- Priority 2 — First Aid gaps flagged as genuinely under-taught for their stakes: spinal injury (currently 2 sentences), tourniquet use (currently 1 clause), false hellebore's actual dangerous ID window (young-shoot stage, currently undescribed).
- Priority 3 — every chapter intro in the book (front matter + all 8 chapters) was flagged as opening too abruptly; none has been touched yet.
- Priority 4 — comparison-plate illustrations flagged in Ch. 2 (tracks, antlers/horns, fish ID) and Ch. 3/5 (deadly plant/mushroom look-alikes); none built yet.
- The audit doc's "Future QA rules" section is still just a proposal — none of it has been turned into actual Manuscript QA platform code yet.

---

## THE DESIGN RULE (operator's, non-negotiable)

**Every content page is one complete visual composition. There are NO text-only pages.**
A "full-text" page means the *text occupies the primary reading area* — the artwork is still present: full-bleed environmental scene, atmospheric border, faded landscape / botanical texture behind a text-safe reading panel. The illustration supports the typography instead of competing with it, but it is always there. The reader never hits a run of plain pages. This is how the platform was built.

## THE ONE DEFECT (do not mis-report this as "the book only has N illustrations")

The render ENGINE already enforces this rule for nearly every page — `assemble-page-prompt.ts` has a hard "LAYER ARCHITECTURE" constraint: *Layer 1 = environmental illustration bleeding off all four edges; Layer 2 = typography on top.* Plus top/bottom illustration anchors and an `illustrationDNA.subject.environment` field.

**Exactly one layout template breaks the rule:** `LAYOUT_D_PURE_TEXT` is hard-set to `artAreaFraction: 0` — the only layout that renders zero artwork.
- Defined: `backend/src/pipeline/stage-6-layout/layout-profiles.ts:115`
- It is assigned to: the ~18 survival/forager openers (Ch7 emergency, Ch8 bushcraft, forager's-code intro) via the Stage-2 "Reference → LAYOUT_D_PURE_TEXT" route, and to continuation pages with no override (`page-role-policy.ts:152`), and author/series/contents front matter (`page-role-policy.ts:116, 235, 259, 309`).
- Contradiction already in the code: the page-role policy *supplies an illustration subject* for those pages, but the layout says 0% art. The engine gets both signals.

**Anything I earlier called "148 illustrations / 88 text-only pages" was this defect surfacing — NOT the intended state.** Under the rule, every one of those pages carries artwork.

## THE FIX (scoped by codebase audit — ~12 lines, no schema change, backward-compatible)

Make the text-dominant layout carry an environmental field exactly like `LAYOUT_REFERENCE` (glossary/index) already does (`artAreaFraction: 0.9`, `artSlot: REFERENCE_COLUMNS`, 95% text-safe area).
1. Enum: add `LAYOUT_D_ENVIRONMENTAL_TEXT` (or redefine `LAYOUT_D`) — `shared/src/index.ts` (~line 120).
2. Profile: `layout-profiles.ts:115` → `artAreaFraction: 0` becomes `0.9`.
3. Repoint assignments: `page-role-policy.ts` lines 116, 152, 235, 259, 309.
4. Placement rule: `layout-director.ts` (~line 200) — add environmental case ("subtle full-page illustrated field behind a centered reading panel; environment bleeds to edges, no borders/swags").
5. Remove `LAYOUT_D_PURE_TEXT` from the `LEAVE_ALONE` set in `underfill-illustration.ts:31-38`.

Recommended: name the strategy taxonomy properly so each layout maps to a named illustration type instead of a crude "pure text" bucket. Premium-publisher research (DK / National Geographic / Taschen / museum field guides) is complete — see next section.

## RESEARCH — premium-publisher illustration architecture (complete, sourced)

**Ten page-illustration types a template engine should implement** (each = image role + text role + selection trigger): (1) HERO PLATE, (2) FULL-BLEED ATMOSPHERE, (3) CUT-OUT ON FIELD [DK], (4) COMPARATIVE GRID [Sibley], (5) DIAGNOSTIC DIAGRAM w/ arrows [Peterson], (6) CUTAWAY/EXPLODED [DK], (7) DETAIL/MACRO CROP [Taschen], (8) DATA/MAP PANEL [NatGeo], (9) ⭐ **TEXT-SAFE READING PANEL over ENVIRONMENTAL WASH**, (10) ⭐ **BORDERED TEXT + SPOT MARGINALIA**.

**The two that solve "text page still has art" (this is the LAYOUT_D fix, done right):**
- **Type 9 — full-bleed environmental wash + text-safe panel:** atmospheric image bled to all four edges, a scrim gradient (~40%→0%) over a defined zone so overlaid body text has guaranteed contrast, text set inside a reading panel. This is NatGeo's dark-photo-behind-reading move made programmatic. **The pipeline must contrast-gate the text-safe zone (WCAG-style) and deepen the scrim / shift the panel if it fails — never ship text over a busy mid-tone.** This should be the DEFAULT for the ~18 survival/forager pages + continuations.
- **Type 10 — bordered text + marginalia:** where no environmental image suits (dense reference/front-back matter), the page still carries a repeating decorative border (Folio Society cohesion layer) + margin spot vignettes + a boxed sidebar (DK panel). Text is framed and punctuated, never a bare column.

**Consistency rules to enforce in the pipeline:** lock format + grid + Style DNA + type hierarchy as invariants; route content → page type by PURPOSE (form follows function), not aesthetics; **no page resolves to a null image role**; contrast-gate all overlaid text; pace by scale/tone across spreads (flag N identical consecutive layouts); decorative cohesion layer (borders/palette) is global, not per-page; one uniform color/repro profile.

**Production practices worth copying:** per-page production record (prompt/asset, page-type, treatment, contrast result, approval state) — mostly already present; **whole-book flat-plan** thumbnail pass to check consistency/pacing across every spread as a system before ship (DK); Style-DNA locking (Sibley one-hand rule) with auto-flag on drift; explicit approval gates (style-conformance → contrast → type-matches-content → human sign-off). Full sourced report with citations lives in the research agent transcript; the taxonomy + rules above are the actionable distillation.

## PER-PAGE PRODUCTION RECORD — already comprehensive (no schema change needed)

`pages` + `whole_page_renders` (`backend/src/db/schema/index.ts`) already track per page: layout template, spec JSON, assembled prompt + sha, render status (QUEUED/RENDERING/RENDERED/APPROVED/REJECTED), version (multi-render), active/approvedForBook, attempts, rejection reason, image path. Nice-to-have but not blocking: illustration-type tag, render cost, blueprint-match score.

## CURRENT STATE (as of original handoff — see SESSION UPDATE 2026-08-02 above for what's changed since)

- **243 pages** total (223 body, 14 front matter, 6 back matter) *as of this section's writing*. As of 2026-08-02 the book is **249 pages** (Chapter 8 grew from 10 to 16 body pages during the editorial-audit Phase 1 work; see the session update above). Body pagination clean: 0 overflow, 0 underfill.
- **Book was re-paginated** to apply a title-fit layout rule book-wide (long/compound titles moved off side-column to full-width top-image). 31 openers swapped, 5 pages reflowed text into continuations, no page-count change.
- **INCIDENT + RECOVERY:** the re-paginate cascade-deleted 8 body render rows (`whole_page_renders.page_id` has `onDelete: cascade`). They were `RENDERED` but not yet APPROVED (active=false). All 8 image/spec/prompt files survived in R2 and were fully restored (`scripts/_restorerenders.ts`). Text-consistency re-verified: all 8 baked-text == current page text (`scripts/_rendertextcheck.ts`). The 8: CH01_P001, CH02_P001, CH02_P024(+c1), CH02_P028, CH03_P009(+c1), CH03_P013. Plus 3 stamped front-matter renders (copyright + 2 disclaimers, APPROVED).
- **About-the-Author / About-the-Series** were fixed to render illustrated (aiRendered) instead of stamped — matches New England.
- **GUARDRAILS (operator rules):** render ONCE per page, no silent retries; confirm before ANY image spend; **run `_renderinv.ts` and check for RENDERED body renders BEFORE any re-paginate** (that's what caused the incident).

## DIAGNOSTIC SCRIPTS ADDED (backend/scripts, read-only unless noted)

`_drypaginate.ts` (does re-paginate reflow? no-persist diff) · `_renderinv.ts` (render inventory: active/paid/body) · `_findrenders.ts` / `_recoverscan.ts` (locate render files in R2) · `_restorerenders.ts` (recover deleted render rows from R2; `--commit`) · `_rendertextcheck.ts` (baked-text vs page-text consistency) · `_planstate.ts` (render campaign: done/left by section) · `_notillus.ts` / `_openerbreak.ts` (illustration coverage breakdown).

## NEXT STEPS

1. Get operator approval on the layout fix above (write SPEC.md first per project convention).
2. Apply the ~12-line change; `npx tsc --noEmit`; run tests (baseline = 31 pre-existing failures, keep 0 new).
3. Re-plan front matter + re-derive layouts so the ~18 text pages + continuations pick up the environmental profile. **Before re-paginating, restore/preserve the 8 renders per the guardrail.**
4. Render per page in small operator-reviewed batches — never without explicit go.
