# Wildlands Interior — Agent Handoff

## 🚫 RENDER SAFETY RULES (operator, NON-NEGOTIABLE — applies to EVERY agent/chat)
Each page render costs money (~$0.09–$0.10) and a full-book re-render is ~$30. A prior session ran **390 render calls on a 275-page book** by re-rendering pages on its own. That must never recur. The rules:
1. **Render each page EXACTLY ONCE per go.** No second pass, no auto-retry. A FAILED page is *reported*, not silently re-run.
2. **The OPERATOR sees the actual rendered image and decides.** After any render, immediately show the real image (`_full.ts <keys>`) and STOP. An agent NEVER decides on its own that an image is "no good" and re-renders it.
3. **Re-render ONLY the specific pages the operator flags, after they've seen the image, on an explicit "go".**
4. **NEVER bulk-render the book.** `_batch.ts` hard-refuses > 5 keys unless the operator sets `RENDER_BULK=1`. Do not bypass it.
5. **Show blueprint + prompt and get approval BEFORE the first render too** (no-spend review via `_inspect.ts` / `_prompt.ts` / `_layoutpreview.ts`).

## ⚠️ SESSION UPDATE 2026-06-19 — READ FIRST (cold restart after machine format)

**Why the machine was formatted:** the operator's OpenAI billing was nearly maxed (~$99.75/$120 in June). Investigated it: the "Usage" dashboard showed **$0 under "Images" but ~$98 under "Responses & Chat Completions" + 3.85M tokens** — which looked alarming, but is **not theft and not Codex**. `gpt-image-2` (our image model, called via `openai.images.generate`/`.edit`) is **token-billed**, so its usage files under the *tokens / chat-completions* bucket, NOT the legacy per-image "Images" counter. The math matches: ~1,040 image renders × ~3,700 input tokens (our ~11K-char prompt + the attached blueprint image) = 3.85M tokens. **So ~$98 = the 275-page book render + this month's renders. Cost ≈ $0.09–$0.10 per page render.** The operator still chose to **rotate all keys and format the machine** out of caution (keys had been pasted in chat). **All old keys are burned — recreate `.env` with the new rotated ones (see "how to run").**

**What this session built (all committed to branch `session/qa-rebalance-2026-06-19`, NOT merged to main):**
1. **Blueprint safe-rail made bold + dark** (`blueprint.ts` `COLORS.support` → `#B5500A`, thicker dashed stroke) — the orange trim-safe line was invisible on parchment; now clearly visible. Blueprint legend (real, from `blueprint.ts`): **STRONG BLUE = primary illustration subject · LIGHT BLUE = background illustration field (never blank) · RED = reading/text zone (+title) · YELLOW = badge/page-number reserved · ORANGE DASHED = the safe boundary (only text+subject must stay inside; illustration may bleed past).**
2. **Fixed `_inspect.ts` blueprint viewer** — it was rendering a 2×2-px image (treated `size` as an object; it's a `"WxH"` string). Now full-size.
3. **The 10–12% template (`LAYOUT_2_TEXT_HEAVY` = TEXT_DOMINANT) regeometried** — illustration now sits at the TOP (may graze the trim), title + body brought DOWN fully inside the safe rail (was riding the top edge → would get cut). Prompt + blueprint both updated to agree.
4. **NEW balanced 25% template `LAYOUT_E_BAND_BALANCED`** — a contained natural-history illustration band across the top + one clean centered reading field below. The middle ground between 12% and 50%. Added across the stack (shared enum, `LAYOUT_PROFILES`, `ArtSlot 'BALANCED_BAND'`, `layout-director` placement+zonePlan, `image-shape`, `layered-layout`, `plan-pages`, `text-fit`). Backend tsc clean, shared rebuilt.

**The rebalance directive (operator, supersedes "shrink the illustration"):** the goal is **REBALANCE proportions, not minimize.** Keep real natural-history illustrations (wildlife/plant/habitat studies) — never replace with icons/ornaments, never delete art. Per page: if a 50% band crowds the text → reduce toward 25% or 10–12%; if reduction leaves dead parchment → increase. Success = text comfortably inside the rail + meaningful illustration + no dead parchment + balanced. Two named templates: **15% (small subject top, TEXT_DOMINANT)** and **25% (`LAYOUT_E_BAND_BALANCED`)**.

**Per-page state of the 3 pages worked this session:**
- **CH01_P003** — rendered on the 12% TEXT_DOMINANT fix, **GOOD / banked** (active render). Leave it.
- **CH01_P002** — was rendering ~50% (its subject literally says "wilderness LANDSCAPE", so it sprawled). Now set to `LAYOUT_E_BAND_BALANCED` (25%); blueprint approved. **NOT yet re-rendered** (blocked on OpenAI billing). Active render is still the old 50% one.
- **FM_005_INTRODUCTION** — was too small (dead parchment); its subject was rewritten in `page-role-policy.ts` (INTRO_OPENER) from "a small sprig" to a "meaningful New England woodland habitat study", set to `LAYOUT_E_BAND_BALANCED` (25%); blueprint approved. **NOT yet re-rendered** (billing). Active is still the old fern-band one.
- **Next action after restart:** recreate `.env` (rotated keys) + ensure OpenAI has headroom → `cd backend && CONC=2 node "../node_modules/tsx/dist/cli.mjs" scripts/_batch.ts balanced25 CH01_P002 FM_005_INTRODUCTION` → review with `_full.ts` → operator approves.

**Front/back-matter scope the operator wants done (issue = ornaments getting cut, + rebalance):** modify `FM_004_CONTENTS`, `FM_005_INTRODUCTION`, `FM_006`–`FM_011_INTRODUCTION_CONT`; back matter `BM_001_GLOSSARY`, `BM_002_GLOSSARY`, `BM_003_INDEX`, `BM_004_INDEX`, `BM_005_INDEX`. **LEAVE** `FM_001_HALF_TITLE`, `FM_002_TITLE_PAGE`, `FM_003_COPYRIGHT_PAGE`, `BM_005_ABOUT_SERIES`.

**Review helper scripts added this session:** `_prompt.ts <key>` (dumps the FULL assembled prompt to a Downloads `.txt` + surfaces the illustration subject), `_textcheck.ts <keys>` (chars/words/paragraphs → 15% vs 25% suggestion), `_fmkeys.ts` (front/back-matter page keys + layouts), `_setlayout.ts <LAYOUT_ID> <keys>` (force a page's `layoutTemplate`).

---

## What this project is
AI-rendered book for Amazon KDP: **"THE WILDLANDS: NEW ENGLAND"** by Wade Brannock, **hardcover, 7×10 trim, 275 interior pages**. Each page is rendered as ONE whole-page image (typography + illustration baked together by gpt-image from a layout blueprint + a text prompt). The **full-wrap cover is DONE and approved — do NOT touch it.** All current work is **interior pages only**.

## Where the code is / how to run it
- Repo: `C:\Users\jovan\Downloads\wildlands agents platform` (`backend/` + `frontend/`).
- **`PROJECT_ID` (one-line setup per book):** every operator script reads the active project from `PROJECT_ID` in `.env` via `scripts/_project.ts` (NOT hardcoded anymore). It **fails loudly if unset** and prints `[project] active PROJECT_ID = …` on every run. For THIS book set `PROJECT_ID=66c1c69c-2c81-409e-a4b5-bff3f3bb04ba`; for a new book, just change that one line. Never reintroduce a hardcoded id in a script.
- **DO NOT use `railway run` — the Railway CLI is blocked by Windows Smart App Control (`railway.exe` fails silently with exit 1).** Backend scripts read the Railway env from a **repo-root `.env`** (gitignored; `backend/src/env.ts` auto-loads `<repo-root>/.env`). Run scripts with plain node (which Smart App Control allows):
  ```
  cd backend && node "../node_modules/tsx/dist/cli.mjs" scripts/<SCRIPT>.ts <args>
  ```
- **POST-FORMAT / NEW MACHINE — there is NO `.env` (it was DELETED; its keys were compromised).** Recreate `<repo-root>/.env` from the Railway dashboard → `@wildlands/backend` service → Variables → **Raw Editor**, copying the **freshly ROTATED keys** (the old OpenAI / Anthropic / Supabase service-role / Replicate keys are burned — do not reuse). Minimum needed: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, plus the flags (`WHOLE_PAGE_EXPERIMENT_ENABLED=true`, `PAGINATION_V1_ENABLED=true`, `LAYOUT_SIMPLIFIED_V1=true`). DB host is the Supabase pooler (`...pooler.supabase.com:6543`); `client.ts` uses `prepare:false` (pgbouncer-safe).
- **After editing `shared/src/index.ts`, rebuild the shared package** (backend imports its built `dist`): `cd shared && node ../node_modules/typescript/bin/tsc -p tsconfig.json`.
- Typecheck: `node "../node_modules/typescript/bin/tsc" --noEmit` from `backend/`.
- Frontend build: `node ../node_modules/@craco/craco/dist/bin/craco.js build` from `frontend/`. Deploy = `git push origin main` (Railway auto-deploys). **Standing rule: do NOT deploy until the operator says so — ship the whole package together.**

## Render pipeline (key files)
- `backend/src/pipeline/stage-6-layout/layout-director.ts` — `directLayout()` builds the zone allocation (where image vs text go) per layout; `zonePlanFor()`/`placementFor()` are the per-layout zone geometry + prompt text.
- `backend/src/pipeline/stage-6-layout/layout-profiles.ts` — `LAYOUT_PROFILES` (artAreaFraction, artSlot, textAreaFactor) + the `ArtSlot` union.
- `backend/src/pipeline/stage-3-generation/blueprint.ts` — paints the blueprint PNG (the AI's composition map). Orange dashed = trim-safe rail.
- `backend/src/pipeline/whole-page-render/assemble-page-prompt.ts` — the text prompt (hardConstraints).
- `backend/src/pipeline/whole-page-render/page-role-policy.ts` — forces layouts/subjects by page role (continuations→pure text, intro→opener, glossary→reference, etc.). **This overrides the stored `pages.layoutTemplate` for special roles** (why a layout override sometimes "doesn't take").
- `backend/src/pipeline/whole-page-render/render-whole-page.ts` — `prepareRender(pageId)` returns `{spec, assembledPrompt, allocation, size}`; `createAndRunRender(pageId)` renders + persists (costs money).

## Layouts in play (focal illustration size)
- `LAYOUT_B_IMAGE_*` = ~50%. `LAYOUT_C_CORNER_*` = ~25% (L-shaped text — avoid). `LAYOUT_2_TEXT_HEAVY` = **repurposed to TEXT_DOMINANT**: a small ~10% vignette + ONE large centered reading field. `LAYOUT_D_PURE_TEXT` = 0% focal (but the calm background field still paints a strong scene — e.g. the moose intro page). Continuations are force-routed to pure text by role.

## THE CURRENT TASK (operator QA)
Some pages have the **illustration too LARGE**, pushing text toward/over the trim-safe boundary. **THE FIX = SHRINK THE ILLUSTRATION.** Rules, verbatim from the operator:
- **Shrink the illustration, keep it.** Do NOT remove the art. A full-text page still keeps a strong background illustration (the moose page is the gold standard).
- **Do NOT make the text bigger.** Text stays 11pt. It fits because the illustration got smaller and freed the space — not because text was enlarged.
- Ladder: 50–60% → ~25%; 25% → ~10–12%; small supporting illustration when that's enough.
- **HARD WORKFLOW RULE: show the blueprint + prompt + a readable layout diagram and WAIT for explicit operator approval BEFORE rendering. Never render without a "go."** (The previous agent kept rendering before approval — do not.)

## Tools already built (backend/scripts/, all read-only unless noted)
- `_layoutpreview.ts <out> <keys>` — **readable** page layout diagram (illustration % + text zones + trim/safe lines). Use this to show the operator BEFORE rendering.
- `_inspect.ts <key>` — prints a page's prompt placement + blueprint zones, saves the blueprint PNG.
- `_layoutfix.ts [--apply] [--force] <CHxx|keys>` — capacity-driven layout chooser/swapper (writes `pages.layoutTemplate` via planPage+updatePagePlanning; no re-pagination). `--force` reduces even if it "fits".
- `_batch.ts <out> <keys>` — **RENDERS** (spends) + activates + contact sheet. Only after approval.
- `_full.ts` / `_grid.ts` — view actual renders. `_railcheck.ts` — bottom-third crop w/ rail line. `_verify.ts` — render freshness per page. `_audit_all.ts` — whole-book render status. `_prog.ts`/`_watch.ts` — status-aware progress/watchdog. `_keys.ts <CHxx>` — chapter page keys. `_err.ts <keys>` — render versions/status. `_bpmany.ts` — blueprint montage + ornament check.

## Constraints / context
- Content = **CH01–CH08 (258 pp); there is no CH09.** Front/back matter = 17 pp. All 275 are rendered.
- **No re-pagination / no page-count / folio / spine / cover changes** — those cascade to the approved cover. Over-capacity pages (e.g. CH08_P003 3,132 chars, the glossary pages) genuinely exceed one page at 11pt and are deferred re-pagination candidates for the NEXT book.
- Front/back-matter ornament policy: KEEP half-title/title/copyright; STRIP edge ornaments from contents/intro/glossary/index (already done in `page-role-policy.ts` + `layout-director.ts` placement strings).
- Every render is versioned; prior versions are inactive in `wholePageRenders` and can be reactivated (revert).

## Operator's QA findings still open (illustration too large → shrink)
Content openers flagged: FM005; CH01 P002/P003/P007/P008/P009/P010; CH02 P002–P024 (many); CH03 P002/P010/P011/P017/P021/P022/P023/P025; CH04 P002/P007; CH05 P005/P010/P012; CH07 P006_c3/c5; CH08 P002_c2/P003/P004/P009. Do NOT modify CH08_P010 (approved). Work them ONE AT A TIME with operator approval per page.
