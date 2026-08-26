# Operator Walkthrough & Visibility Audit (post Control-Center redesign)

Complete, assume-nothing walkthrough of the application as an operator uses it, plus a
full OLD→NEW visibility audit. Nothing here is summarized.

---

## ALWAYS-ON CHROME (visible in every view)

- **Left sidebar:**
  - Brand (WL / Wildlands Publishing Platform).
  - **Workspace nav (the 5 top-level tools):** 🛠 Control Center · Setup · Library ·
    Intelligence · Export. Clicking sets the active view. Control Center is the default.
  - **Publishing Workflow** stage chips (Breakdown → Plan → Text-Fit → … ) — status
    indicators / shortcuts.
  - **Resources** links (Asset Desk, Project Files, Activity Log, Settings).
- **Topbar:** "Project Dashboard" title, **Ask Agent**, **Advanced** toggle, backend
  online/offline status.
- **Active Project picker** (bottom): lists projects; click to switch. Visible in all
  views so you can change project from anywhere.

---

## TOP-LEVEL NAVIGATION

### 1. Control Center (default)
- **Contains:** the per-page workspace — page rail, chapter-approval chip, and the 5
  tabs (Manuscript, Layout, Image Generation, Image Result, Final Page), plus the
  page-level action bar (generate / approve / reject / upscale / regenerate) and the
  project image library (asset desk).
- **Why it exists:** this is where ~90% of page work happens — inspect and produce one
  page end to end without hunting.
- **Operator tasks:** pick a page → review its text/layout/prompt → generate or approve
  its image → preview the final page.

### 2. Setup
- **Contains:** Project Setup/intake, Style DNA + full config (format, page geometry,
  typography, color, image/style policy, layout prompt library), Backend URL (Advanced),
  **Manuscript Breakdown** (Generate Manifests) and **Page Plan Review** (Plan Pages).
- **Why:** one-time / occasional project preparation and the project-level pipeline
  steps that precede per-page work.
- **Tasks:** create/configure a project, edit Style DNA, run breakdown, run page plan.

### 3. Library
- **Contains:** the 16 Layout Templates reference gallery.
- **Why:** reference material — what each layout is, when to use it.
- **Tasks:** browse layout templates. (Note: the project **image library / asset desk**
  lives inside the Control Center, not here — see deviations.)

### 4. Intelligence
- **Contains:** Production Dashboard, Project Intake + Activity Log, Agent Chat, Operator
  Guidance, Standards Ledger + Knowledge System, Manifest Output, Operator Preview.
- **Why:** monitoring, history, agent advice, standards/knowledge, raw manifest output —
  oversight, not per-page production.
- **Tasks:** check status, chat with the agent, review standards/lessons, inspect raw
  manifests.

### 5. Export
- **Contains:** Book Parts + Export Assembly, Render Proof Review, proof artifacts,
  render book/cover.
- **Why:** book-level (not page-level) output and proofing.
- **Tasks:** render proofs, assemble book parts, export the book/cover.

---

## CONTROL CENTER — tab by tab

Data for all tabs comes from one read-only call: **GET
/api/projects/:id/pages/:pageKey/inspector** (deterministic; planPage + analyzeTextFit;
no mutation), plus the page rail (pages list), the render endpoint (Final Page), and the
image bytes endpoint (thumbnails). The chapter-approval chip comes from the chapter
layout approval.

### MANUSCRIPT tab — "what text is going on this page?"
- **Visible:** Subject; Words; **Text allocation & overflow** (Font · pt · line-height;
  Fit status as a color tag FITS/TIGHT/OVERFLOW/UNDERFILLED; Characters used / capacity
  + fill %; Lines used / usable; Words per opening vs continuation page; Estimated
  rendered pages; fit notes).
- **Collapsible (expander):** "Manifest stage instructions" — the MANUSCRIPT_ANALYST
  contract: name, runtime, mission, expert frame, hard rules, required outputs, and the
  truthful realityNote ("deterministic; no LLM call under this name today").
- **Then:** full Source text (the page body markdown).
- **Source:** inspector `manuscript` + `typography.fit` + `manifestStage`.
- **Actions:** none (read). Run breakdown lives in Setup.
- **Diagnoses:** wrong/empty subject, text overflow/underfill, capacity problems before
  any image spend.

### LAYOUT tab — "what layout was chosen and why?"
- **Visible:** Template; Reference label; Content type; Split (image% / text%); Capacity
  (min–max words, target); **Why this layout** (decision trace explanation); **Zone map
  (schematic)** — color-coded positioned rectangles; **Visual blueprint** with the
  **RED/BLUE/ORANGE legend** (RED = text-safe+title, BLUE = primary image, ORANGE =
  supporting) and the generated blueprint image when present; **Zones** list (id +
  x/y/width/height %, color-dotted).
- **Source:** inspector `layout` (artBrief zones, decisionTrace, capacity) + `blueprint`.
- **Actions:** none in-tab (force-layout is a backend op; not yet a Control Center button).
- **Diagnoses:** wrong layout selection, zone geometry wrong, blueprint mismatch before
  spend.
- **How the operator reviews a layout:** read "Why this layout," confirm the zone map
  matches intent (image where it should be, text-safe calm), check the blueprint image,
  confirm capacity vs the Manuscript tab's fit.

### IMAGE GENERATION tab — "what is sent to the image model?"
- **Visible:** Hero subject (primary); **Supporting subjects (ORANGE zones)** list;
  Environment; Mood; **Master Style DNA** (collapsible) — derived from the prompt itself
  (ground truth = exactly what's sent); **Blueprint instructions (RED/BLUE/ORANGE)**;
  **Exact final prompt** (sha + ready/blocked + blockers) with a **Copy prompt** button.
- **Source:** inspector `prompt.text` (Style DNA + SUBJECT PACKAGE parsed client-side),
  `blueprint.instruction`, `prompt.sha256`/blockers.
- **Actions:** Copy prompt.
- **Diagnoses:** wrong subject/supporting subjects, wrong Style DNA, prompt bloat, any
  bad instruction — before spending a credit.
- **How the operator verifies image instructions:** read the subject package (what is
  drawn + supporting studies + environment + mood), confirm the Style DNA is the
  intended one, read the blueprint legend, then read the exact prompt and copy it if
  needed.

### IMAGE RESULT tab — "what did the model return?"
- **Visible:** Model; every image **version** as a thumbnail with version #, status,
  active flag, and pixel dimensions.
- **Source:** inspector `images[]` + `model`; thumbnails via the image bytes endpoint.
- **Actions / approvals:** the **action bar below the tabs** (still inside the Control
  Center card) holds Generate / Regenerate (with instruction) / Upscale, and the version
  list there holds **Approve / Reject / Set-active / Reuse**. (The tab itself is the
  read view; the actions sit directly beneath it in the same Control Center.)
- **Diagnoses:** off-style art, text baked into the image, wrong size; pick the best
  version.

### FINAL PAGE tab — "what does the exported page look like?"
- **Visible:** a **Render final page** button → embeds the exact single-page **PDF**
  (full export fidelity) in a large frame.
- **Source:** the render endpoint (Paged.js → PDF).
- **Actions:** Render / Re-render. **Page approval** itself is done via the image
  approval in the Image Result action bar + the chapter layout-approval gate; the Final
  Page tab is the visual confirmation of the exported result before/after approval.
- **Diagnoses:** real readability, title legibility, overall page quality as it will
  print.

---

## SECONDARY NAVIGATION — detail

| Tool | What moved here | Why it belongs | Still visible from Control Center? | Requires leaving Control Center? |
|---|---|---|---|---|
| **Setup** | Project intake, Style DNA/config, Backend URL (Adv), Manuscript Breakdown, Page Plan | One-time prep + project-level pipeline | Style DNA is **shown** (read) in Image Generation tab; manuscript text + layout decision shown in Manuscript/Layout tabs | Running breakdown / plan / editing config → yes |
| **Library** | 16 Layout Templates | Reference material | The page's chosen layout + zones shown in Layout tab | Browsing all templates → yes |
| **Intelligence** | Dashboard, Activity Log, Chat, Guidance, Standards Ledger, Manifest Output, Operator Preview | Oversight/history/knowledge | Per-page agent notes shown as the advisory strip in Control Center | Ledger/chat/dashboard → yes |
| **Export** | Book Parts, Render Proof, proof artifacts, render book/cover | Book-level output | Per-page final render shown in Final Page tab | Book/proof render & export → yes |

---

## VISIBILITY AUDIT — OLD → NEW (every major section)

| Section (before) | New home | Reachable |
|---|---|---|
| Manuscript Breakdown | **Setup** (+ text shown in Control Center → Manuscript) | ✅ |
| Page Plan Review | **Setup** (+ decision shown in Control Center → Layout) | ✅ |
| Image Review (inspector) | **Control Center** (the primary surface) | ✅ |
| Image version list / approve-reject | **Control Center** (Image Result tab + action bar) | ✅ |
| Render Proof Review | **Export** (+ per-page in Control Center → Final Page) | ✅ |
| Operator Preview | **Intelligence** | ✅ |
| Layout Library (16 templates) | **Library** | ✅ |
| Manifest Output | **Intelligence** | ✅ |
| Production Dashboard | **Intelligence** | ✅ |
| Agent Chat | **Intelligence** | ✅ |
| Standards Ledger + Knowledge | **Intelligence** | ✅ |
| Project Intake + Activity Log | **Intelligence** | ✅ |
| Operator Guidance | shows above the Control Center (workspace header) | ✅ |
| Project Setup / Style DNA / config | **Setup** | ✅ |
| Backend URL | **Setup** (Advanced) | ✅ |
| Image Library / Asset Desk | **Control Center** (asset desk) | ✅ |
| Active Project picker | **Always visible** | ✅ |
| Book Parts + Export | **Export** | ✅ |

---

## FINAL QUESTION — is anything now hidden, removed, or harder to access?

**No information, prompt, decision, reasoning, agent output, layout data, image data,
approval data, or debugging data was removed or made inaccessible.** Every section above
has a home and is reachable. Per-page data (manuscript, layout, exact prompt, Style DNA,
blueprint, image versions, final render) is now *easier* to reach — one click in the
Control Center instead of scrolling a 16-section page.

**Honest caveats (accessibility unchanged, but worth stating):**
1. **One extra click** for non-page-level tools: to run breakdown/plan, browse all
   templates, read the ledger/chat/dashboard, or export, you switch nav tabs. The data
   is not hidden — it's grouped, and it's a single click.
2. **Advanced-only content** (Backend URL, and previously the ledger/templates) — the
   ledger and templates now also render whenever their tab is active, so they're no
   longer behind the Advanced toggle. Backend URL stays under Setup → Advanced.
3. **Legacy sidebar shortcut links** (Asset Desk / Project Files / Activity Log /
   Settings under "Resources," and the Publishing Workflow stage chips) scroll to
   sections that may live in a non-active tab; those scroll-jumps may not land until you
   switch to the matching tab. The destinations are fully reachable via the 5-tool nav —
   only the legacy shortcut behavior is affected. (Flagged for a polish pass.)
4. **Image library placement deviates from the plan:** the asset desk stayed in the
   Control Center rather than moving to Library. It's fully visible — just not under the
   Library tab.

Net: organization improved; visibility preserved (and per-page visibility improved).
