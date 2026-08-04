# HANDOFF — Every-Page-Illustrated (Series Two / Canadian Rockies)

**Project:** THE WILDLANDS — Series Two, `8c1e161a-69dd-4a3d-a655-8de54995be16`
**Backend:** https://wildlandsbackend-production.up.railway.app · Storage: Cloudflare R2 · DB: Supabase
**`.env` PROJECT_ID is pinned to Series Two.** Operator scripts read `P` from it — verify before running anything.

---

## SESSION UPDATE 2026-08-04 — READ THIS FIRST (supersedes nothing below, adds to it)

**Operator is stepping away for ~2 days.** OpenCodex may be working this repo autonomously during that window (its own subscription, separate from Claude). `7e47f22 "fix: improve mobile operator navigation"` on `main` was NOT made by this Claude session — check what it touched before assuming context. There's also a pile of untracked `backend/scripts/_*.ts` / `docs/NEW_BOOK_PARITY_PLAN.md` / `docs/SPEC_PROJECT_LIST_REGION_LABEL.md` files sitting uncommitted as of this write-up — not this session's, not reviewed, not touched. Don't assume they're safe to delete or ignore; ask the operator what they are before acting on them.

### NEXT ACTION — the literal prompt to hand whoever continues this

Paste this as the opening instruction to the next agent session (Claude or OpenCodex) working this repo:

> Read `docs/HANDOFF_EVERY_PAGE_ILLUSTRATED.md` in full, starting from "SESSION UPDATE 2026-08-04" at the top — that section and the "Standing rules" list near its end are the operating instructions for everything below. Do these in order:
>
> 1. **Redo `CH02_P025` (Raven).** Same `readingFieldText`, no content change — it already reads correctly, the AI just baked a glyph typo ("thc" for "the") into the image on the last attempt. Single render attempt: `tsx backend/scripts/render-one-page.ts 8c1e161a-69dd-4a3d-a655-8de54995be16 CH02_P025`. Then `tsx backend/scripts/download-page-image.ts 8c1e161a-69dd-4a3d-a655-8de54995be16 CH02_P025 <local-out-path>` and visually inspect the result (crop/zoom the "What it is" paragraph specifically), confirm the typo is gone.
> 2. **Draft Chapter 3 (Plants)'s revision plan**, using the exact same method as the Chapter 2 Phase 1 write-up above: pull the live chapter text with `tsx backend/scripts/extract-manuscript.ts 8c1e161a-69dd-4a3d-a655-8de54995be16 <outDir>`, read it in full, map it against the Ch3 bullets already listed below (break the 21-entry run with bridges, fix the Forager's Code follow-through, bridge into Medicinal/Deadly, pacing contrast), check fit-headroom on every page you plan to touch BEFORE writing prose (`tsx backend/scripts/check-page-fit.ts 8c1e161a-69dd-4a3d-a655-8de54995be16 <pageKey>` — or add `--text-file <draftPath>` to check a draft replacement before it's written anywhere), then write the literal exact before/after text for every page you intend to touch. Follow the "Ch2 plan template" format below exactly.
> 3. **Stop and present that plan to the operator** — exact diffs, not a summary — the same way Chapter 2's plan was presented in chat before anything was written or rendered. Do not write to the DB or spend on a render until the operator (or whoever is standing in for them) has explicitly signed off, except for step 1 above, which is a pre-approved same-content retry.
> 4. Once Ch3 is approved: write the DB edits with a small one-off script (find-string-verify-then-replace, dry-run by default, `--commit` flag to write — see the pattern any script in `backend/scripts/_scratch/` from this session used, e.g. copy `ch2-phase1-edits.ts`'s structure if it's still present locally), then render each touched page ONE AT A TIME with `render-one-page.ts` (never a loop that renders more than what was just approved), download and eyeball every one with `download-page-image.ts`, run `tsx backend/scripts/verify-text-fidelity.ts 8c1e161a-69dd-4a3d-a655-8de54995be16` before rendering anything as a free pre-check. Report results, then repeat for Ch4 (merge Engelmann/White Spruce, elevation-transition passages), then Ch5 (interstitial passages, reorder by season/difficulty), then the book-wide pass. Same phased, one-chapter-at-a-time, review-before-proceeding discipline every time — this has been repeated operator feedback all project, not a one-off preference for Chapter 2.
> 5. **End goal:** every chapter reads as an authored guide, not a reference catalog; every touched page's rendered image has been eyeballed for baked-text defects (typos, cut-off text, wrong subject) the way P025 was caught; only then is the cover regenerated and the book considered publish-ready. If a rendered image comes back visibly wrong, report it and stop — do not auto-retry, do not average it out.

### Operational prerequisites (a fresh `git clone` alone is NOT enough — read this before step 1 above)

1. **Credentials.** `.env` is deliberately never committed (see `.gitignore` — only `.env.example` ships in the repo; this is correct, not an oversight). Whoever runs these scripts needs the real `.env` — DB URL, Supabase keys, OpenAI key, R2 keys, `CONSOLE_PASSWORD` — copied from the operator's existing local working copy at `C:\Users\jovan\Downloads\wildlands agents platform\.env` into wherever this session is actually running. **The simplest fix is to not use a fresh clone at all** — if the agent's tooling can operate directly on that existing folder (it already has a working `.env`, `node_modules`, and DB access), do that instead of cloning fresh. If the agent's environment is sandboxed and can only work from its own clone, the operator needs to supply the `.env` file directly (file copy, not pasted into chat or committed to git — it contains live production secrets).
2. **Scripts.** As of commit `4339158`, `extract-manuscript.ts`, `check-page-fit.ts`, `render-one-page.ts`, and `download-page-image.ts` are tracked at `backend/scripts/` (not `_scratch/`) — a fresh clone has them now. `verify-text-fidelity.ts` and `batch-ai-review.ts` were already tracked there from the 2026-08-02 session. Everything else referenced as `_scratch/...` in this doc (the Ch2/Ch8 one-off edit scripts) is genuinely gitignored, local-only, throwaway migration code — it exists only in the operator's local working copy, not in git history, and was never meant to be reused verbatim (each chapter's edits are different strings). Write a new one-off script per chapter following the same dry-run/`--commit` pattern instead of hunting for the old one.
3. **The exact command sequence used for the 8 Chapter 2 renders:** a one-off script (`backend/scripts/_scratch/ch2-phase1-render.ts`, local-only per point 2) looped over a **hardcoded literal array** of 8 page keys — `['CH02_P008','CH02_P015','CH02_P021','CH02_P025','CH02_P026','CH02_P029','CH02_P034','CH02_P035']` — calling `createAndRunRender(pageId)` once per key, sequentially, logging each result before moving to the next. Page selection was never pattern-matched or auto-detected; it was the literal list of pages the approved text-edit plan touched, typed out by hand. `render-one-page.ts` (now tracked, point 2) is the single-page equivalent of that same call for anything going forward — always pass one explicit page key, never a pattern.
4. **The untracked parallel-session files** (`backend/scripts/_*.ts` beyond the ones now promoted, `docs/NEW_BOOK_PARITY_PLAN.md`, `docs/SPEC_PROJECT_LIST_REGION_LABEL.md`, an empty stray file named `Montane and subalpine conifer forest.`) exist ONLY in the operator's local working copy on their Windows machine — they were never committed or pushed, so they will never appear in any clone, including a "clean" one. There is nothing to find; a clean clone not having them is expected and correct. If their contents matter, that requires the operator's local machine specifically, not git.
5. **Chapter 2 plan template** — mirror this exact format for Chapter 3 (and every later chapter): for each page touched, name the page key, quote the current text being changed, and quote the exact replacement, before any DB write:

   > **1. Fix + rewrite the ending (CH02_P035, Mosquitoes)**
   > Strip the literal "---" / "End of Chapter 2: Animals" text (never should have been page content). Replace the buggy tail with a real bookend that returns to the opening grizzly scene:
   > *(quote the exact new paragraph, in full, verbatim — not paraphrased)*
   >
   > **2. Five one-sentence group transitions**, added as a lead-in line on the next group's opener page (not new pages — checked fit headroom on each, all comfortable):
   > - Before P008 Elk (predators→ungulates): *(quote exact sentence)*
   > - Before P015 Marmot (ungulates→small mammals): *(quote exact sentence)*
   > - *(...one bullet per transition, each with the exact quoted sentence)*
   >
   > **3. Fill the [N] genuinely thin entries** *(name which ones and why they were selected — e.g. "missing a Behaviour & Habitat section that every other entry in the chapter has")*: *(for each, either quote the exact new section text, or describe precisely what's being inserted where)*
   >
   > **Skipped on purpose:** *(name anything the audit/QA tool flagged that you're deliberately NOT touching, and say why — e.g. already fixed, or padding would chase length without earning it)*
   >
   > That's N re-renders total: *(list every page key)*. Want me to proceed?

### Why this whole editorial-quality arc exists

The illustration/text-baking bugs (2026-08-02 section below) were platform bugs. This part is different: the operator ran the manuscript through a separate tool ("Manuscript Studio," a newer OpenCodex-built QA tool, project `5c7b7975-a4ce-4d80-97b2-d03414e8dcc5`, NOT this project) and it independently converged with this session's own manuscript audit (`docs/EDITORIAL_AUDIT_CANADIAN_ROCKIES.md`) on the same conclusion: **Chapters 2–5 read as an uninterrupted reference catalog, not an authored guide.** Operator's own words: *"this fucking book, I was not happy with it... it needs that wild land feel."* Whole-book health scored 71/100 in Manuscript Studio; Ch2=62, Ch3=71, Ch4=74, Ch5=74 (all "Needs revision"); Ch1/6/7/8 all scored 84 ("Approve"). The practical, procedural chapters were fine — the reference-heavy chapters were not. That gap is what Phase 2+ (below) is closing, chapter by chapter, worst-score-first, same phased/operator-reviewed methodology as Phase 1 (Ch8, done 2026-08-02).

### Phase 2, Chapter 2 (Animals) — Sub-phase 1 DONE, rendered, awaiting operator visual sign-off

No new pages, no re-pagination — 8 existing pages had their `readingFieldText` edited and were re-rendered (single attempt each, `createAndRunRender`, no auto-retry):

1. **Real data bug found and fixed, not just an editorial gap:** `CH02_P035` (Mosquitoes, the last page of the chapter) had literal chapter-boundary markdown — `---` and the string `*End of Chapter 2: Animals*` — baked into its `readingFieldText` as if it were page prose. It was **already rendered and visibly printed** on the page image (confirmed by downloading and reading the actual PNG from R2, not just checking the DB). This is almost certainly a manuscript-splitting artifact from whenever the source `.md` was originally cut into per-page DB rows — **worth grepping other chapters' last pages for the same pattern** (`readingFieldText LIKE '%End of Chapter%'`) before assuming Ch2 was the only one affected — that check was NOT done this session, do it before closing this out. Fixed by stripping the bug text and writing a real chapter-closing paragraph that echoes the Ch2 opener's grizzly-on-the-trail scene (the exact "return to the opening frame" fix both audits asked for).
2. **Five one-sentence group transitions** added as lead-ins on the existing group-opener pages (Predators→Ungulates on P008 Elk, Ungulates→Small-mammals on P015 Marmot, Small-mammals→Birds on P021 Golden Eagle, Birds→Fish on P029 Bull Trout, Fish→Hazards on P034 Wood Tick) — not new pages. Fit-capacity was checked via `computePaginationCapacity` (from `stage-1.75-pagination/capacity.ts`) BEFORE drafting, to keep every edit at `FITS` or safely `TIGHT`, never `OVERFLOW`. `CH02_P035`'s new ending was initially too long (`OVERFLOW`, fillRatio 1.02) and had to be trimmed — check fit on any future prose addition, don't eyeball char counts.
3. **Two structurally-thin bird entries filled in:** Raven (`CH02_P025`) and Grouse (`CH02_P026`) were the only two bird entries missing a `**Behaviour & habitat.**` section that every other entry in the chapter has. Added one, matching the established field-guide voice.
4. Explicitly left untouched: caribou (`CH02_P014`) — already complete in the live DB despite both audits calling it "truncated" (audit was probably against an older/different snapshot; don't re-flag this from the audit doc without checking current DB state first). Mule deer / white-tailed deer (`CH02_P010`/`P011`) — short but functionally complete; padding them would be chasing length without earning it, which the operator has repeatedly said not to do. Entry count stays at all 35 species (operator's explicit call — do not consolidate to ~20–24 despite Manuscript Studio's suggestion).

**Render result: 8/8 RENDERED, `verify-text-fidelity.ts` clean (0/249 flagged). Visual review of all 8 found 1 defect: `CH02_P025` (Raven) has an AI text-baking glyph slip — "one of the most intelligent animals in **thc** mountains" (should read "the"). Confirmed by downloading the actual PNG and cropping/zooming the region, not by inspecting the prompt.** This is a same-text retry candidate (no content diff — just re-roll the image), not a content edit, so it doesn't need the usual "state the diff first" gate — but per the render-once rule, it was NOT auto-retried. It is sitting there waiting on operator go-ahead (or on whoever picks this thread up) to redo. The other 7 pages (Elk, Marmot, Golden Eagle, Grouse, Bull Trout, Wood Tick, Mosquitoes) are clean.

**What operator needs to do / what the next agent should ask for:** operator wants to personally review AI-rendered pages before the platform moves on to the next phase — this is a standing preference (see the render-once-then-operator-reviews workflow used throughout this project), not unique to this phase. If continuing autonomously without the operator physically confirming: it is safe to (a) redo `CH02_P025` once with identical text, (b) proceed to Chapter 2's remaining items are already done — there are none left — so move to **Chapter 3 (Plants)** next. Do NOT render Chapter 3+ without first drafting the text plan and getting it in front of the operator the same way this phase's plan was presented (see the chat transcript for the exact format: page-by-page diff, exact before/after prose, fit-capacity check, THEN render). This has been explicit, repeated operator feedback all session — do not skip the review step just because no one is watching.

### Phase 2 queue (from Manuscript Studio, cross-checked against this session's own audit — self-contained here, don't assume access to the external Manuscript Studio report)

**Chapter 3 — Plants** (score 71, "Needs revision," reader-journey 3.8, high drift): break the 21-entry uninterrupted run with 6–8 short ecological/seasonal/safety bridges (same technique as Ch2's one-sentence transitions, likely need more of them here given the longer run); sustain the guided-reader promise after the Forager's Code section instead of dropping into a database; write real transitions into Medicinal Plants and the Deadly/Toxic section specifically; deliberate pacing contrast — edible entries can breathe, deadly entries should read shorter/more urgent/warning-dense.

**Chapter 4 — Trees** (score 74, reader-journey 5.8): add 3–4 narrative passages at elevation transitions so the valley-to-treeline arc is an experienced journey, not just zone labels; **merge Engelmann Spruce and White Spruce entries** — both this session's own audit and Manuscript Studio independently flagged these as over-split with no material field-use difference (check current DB state first, same as the caribou lesson above — don't assume the audit doc is still accurate); deepen at least one scene (a burned lodgepole stand, or the moment trees give out at treeline, were both suggested).

**Chapter 5 — Fungi** (score 74, reader-journey 5.8): break the 15-entry catalog with 2–3 substantial interstitial passages; reorder edible fungi by season or confidence-building difficulty so the section reads as a curriculum, not a list; expand 3–4 scenes into real field stories (burn morels, matsutake harvest context, honey fungus ecology were suggested); repeat the national-park harvesting-prohibition language consistently with how Chapter 8 states it — check Ch8's exact phrasing before drafting Ch5's, they should match.

**Book-wide pass (after all four chapters are done, not before):** explicit chapter-to-chapter transitions tied to the vertical life-zone model established in Chapter 1; reduce the repeated line "The mountains are patient. Pay attention out there." to 2–3 deliberate uses across the whole book (grep for it first to see current count); remove any visible entry-format scaffolding from Ch2–5 if it crept back in; verify the index is complete, not placeholder text; make sure foraging-law language is consistent everywhere it's mentioned (Ch3, Ch5, Ch8).

**Cover stays stale/unregenerated until every phase above is complete** — `config.publishing.coverSync.builtForPageCount` will keep drifting from the live page count as each phase potentially changes it. Do not regenerate the cover mid-phase.

### Standing rules — apply regardless of which agent is driving

- **Render once per attempt, no silent bulk retry.** A FAILED or bad render gets investigated, not auto-retried. This is a hard operator rule, repeated multiple times this project with real incidents behind it (see `wildlands_render_once_rule` — a prior 390-calls-on-275-pages incident from before this rule existed).
- **State the exact content diff before spending on any paid render** — exact before/after prose, not a summary of intent — and wait for explicit go-ahead, unless it's a same-text retry of a confirmed defect (like the P025 typo above).
- **Check fit-capacity before drafting**, not after — `computePaginationCapacity` from `stage-1.75-pagination/capacity.ts`, same layoutTemplate/trimSize/bodyPt/lineHeight the real pipeline uses. Don't estimate from raw char counts alone (capacity varies by `layoutTemplate`).
- **Dry-run every DB-write script before `--commit`.** Every script this session (Ch8 expansion, Ch2 phase-1 edits) followed find-and-verify-match-before-write, logged what would change, and only wrote on an explicit second flag.
- **`backend/scripts/_scratch/` is gitignored** — operator tooling and one-off migration scripts live there and are NOT meant to be committed; they're documented here in prose instead so the pattern survives even though the code doesn't.
- **No second HTTP server, no new port, no changed Redis config** — same standing rule as always (see CLAUDE.md).
- Run `npx tsx backend/scripts/verify-text-fidelity.ts 8c1e161a-69dd-4a3d-a655-8de54995be16` after any batch of content edits, before rendering — catches text silently missing from a prompt at zero cost.

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
