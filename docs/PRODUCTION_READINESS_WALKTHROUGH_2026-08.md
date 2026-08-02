# Production Readiness Walkthrough — First-Time-User Review

**Date:** 2026-08-02
**Method:** Created a brand-new throwaway project ("UX WALKTHROUGH TEST") on the live
deployed site (not local dev) and walked all 8 Operator Console steps live, as a
first-time user with no prior knowledge of the tool would — no shortcuts, no
skipping ahead, reading only what the UI itself shows. Used a small custom test
manuscript (1 orientation entry + 2 species entries) to exercise the real pipeline
cheaply. Test project deleted after the walkthrough; findings below are what
actually happened, not speculation.

**Scope note:** Step 7 (Render & Review) had already been extensively hands-on
tested earlier the same day (multiple real renders, live bug fixes, live
verification) — this pass re-confirmed those fixes hold on a fresh project rather
than re-litigating them. This walkthrough's new ground is mainly Steps 1–6 and 8,
which had only been reviewed by reading code before now.

---

## Cross-cutting theme (read this first — highest leverage fix in this report)

**Raw backend errors are shown to the user verbatim, with no translation layer.**
Hit this twice, independently, in two different parts of the app:

- Leaving "Author / pen name" blank on Create Project: `⚠ body/config/authorName
  String must contain at least 1 character(s)` — a Zod schema path, not the
  visible field label, with awkward auto-generated phrasing.
- Running Breakdown on a chapter with no entries: `⚠ [ { "code": "too_small",
  "minimum": 1, "type": "array", "inclusive": true, "exact": false, "message":
  "Array must contain at least 1 element(s)", "path": [ "chapters", 0, "entries"
  ] } ]` — a raw, unformatted JSON array dumped straight into the page.

This isn't two isolated bugs, it's one systemic gap: there is no generic
error-message formatting layer between "whatever the API returns" and "what the
operator sees." **Recommend one shared utility** that (a) recognizes Zod-shaped
validation errors and turns them into a plain sentence per field ("Please enter
an author name," "Chapter 'Know Your Region' needs at least one entry — see the
Manuscript format guide"), and (b) falls back to a generic "Something went wrong,
try again or check the details below" for anything it doesn't recognize, rather
than ever showing raw JSON. Fixing this once fixes both instances above and
protects against the next one nobody's found yet.

---

## Findings by step

### Step 0 — Login
- **Minor / polish:** "Operator Production Console — enter the access password"
  gives zero context about what the product does or what happens after login.
  Fine for a trusted internal tool, but it's the very first thing anyone sees.

### Cross-cutting — Session/navigation state
- **Significant:** Reloading the browser resets the entire app back to the
  Project-selection screen. No persistence of which project was open or which
  step you were on. Given the user's own description of this workflow ("most of
  my time is spent on the render page," implying long sessions), an accidental
  refresh, crash, or laptop sleep/wake means losing your place and re-navigating
  from scratch every time. Data itself is safe (confirmed — the project and its
  pages are unaffected), it's purely the client-side "where was I" state that's
  lost.

### Step 1 — Project
- **Significant:** Two real projects in the list are both named exactly **"THE
  WILDLANDS · MANIFESTED"** — completely indistinguishable from each other with
  no subtitle, date, or any other disambiguating info shown. A user with more
  than one book in a series (the actual real-world case here) can't tell them
  apart without clicking in and cross-referencing form fields. Fix: show the
  subtitle alongside the title in this list.
- **Polish / wording:** Raw backend status enums (`MANIFESTED`,
  `MANUSCRIPT_UPLOADED`) shown verbatim, no plain-language translation or
  tooltip for what stage means.
- **Minor:** Delete control is a bare "✕" glyph with no visible text label
  (properly labeled for screen readers, just not visually obvious at a glance).
  Mitigated by the confirm dialog, but a clearer visual treatment (trash icon,
  red-on-hover, or a text label) would signal "destructive" faster.
- **Significant:** See cross-cutting error theme above — blank Author field
  produces a raw Zod path error.
- **Positive:** Failed submission doesn't lose the other field values you'd
  already typed — no re-entry needed after fixing the one bad field.

### Step 2 — Manuscript
- **Significant, likely the single biggest gap in the whole flow:** Zero
  guidance anywhere on the expected Markdown structure — no example, no
  explanation of how to mark chapters vs. entries, no mention that every chapter
  needs at least one `###`-marked entry (a hard requirement discovered the hard
  way — see Step 4 finding below), no mention that Glossary/Index/Sources need
  to be top-level sections. This is the single most consequential input in the
  entire pipeline and the least explained. A first-time user writing a natural
  intro/overview chapter (exactly what was tried here, modeled directly on the
  real book's own opening chapter) hits a dead end with no actionable
  information about why. Recommend: a visible example structure or a link to a
  format guide directly on this screen, not buried in a separate ops manual.
- **Significant:** After a successful upload, navigating back to this step shows
  a **completely empty textarea** — the previously uploaded manuscript is not
  reloaded or redisplayed. The exact moment a user needs to go back and fix
  their manuscript (e.g., because Breakdown failed) is the moment they discover
  their entire pasted text is gone. For a real full-length manuscript
  (hundreds of KB) this risks real lost work, not just annoyance. Recommend:
  populate the textarea from the stored manuscript when the step is revisited.
- **Positive:** Live character counter as you paste/type — nice, low-anxiety
  touch.
- **Positive:** Title/Subtitle/Author entered in Step 1 carry over automatically
  into Step 3 — no re-entry needed.

### Step 3 — Book Setup
- **Positive:** The Back Cover section's inline hints are genuinely good —
  "The lead sales paragraph — what this volume is about," "Leave blank to use a
  placeholder" — clear, specific, and lowers anxiety about what's actually
  required. Worth using as the template for hint text elsewhere (esp. Step 2).
- **Positive:** Optional fields are truly optional — saving with several blank
  produced no errors and no surprises.
- No negative findings on this screen.

### Step 4 — Breakdown
- **Critical:** Running Breakdown on a manuscript with a chapter that has no
  `###`-marked entries fails with a **completely raw, unformatted JSON error
  array** shown directly on the page — see cross-cutting theme above. This is
  the most jarring single moment in the whole walkthrough: from a first-time
  user's seat, the app appears to have crashed or exposed an internal bug,
  when actually it's a normal, fixable input problem.
- **Positive (once it works):** The success state is clear and well-formatted —
  "Breakdown: 2 chapter(s), 3 entries," with a clean per-chapter entry count
  list.
- **Minor / wording:** "Deterministically split the manuscript..." — "no AI, no
  spend" is a great reassurance; "deterministically" is unnecessary jargon for
  the same point.

### Step 5 — Paginate
- **Moderate / consistency & safety:** "Re-paginate (discard renders)" is a
  destructive action (confirmed via a native confirm dialog with a full
  consequence explanation), but it's styled as a plain outlined button —
  identical visual weight to the completely harmless "View page layouts" button
  right next to it. Step 6's equivalent destructive action gets a dedicated
  red-bordered warning box with the danger stated up front; Step 5 doesn't
  follow that same visual pattern, relying entirely on the user reading the
  button's own label text.
- **Minor / wording:** "the body flow engine" and "the two-column reference
  model" are internal implementation terms exposed directly in user copy.
- **Positive, strong pattern:** The post-pagination explanation is genuinely
  good UX — explains what the tinted blocks mean, what a "fit chip" is, and
  explicitly reassures "before any render spend." The FITS/TIGHT status chips
  are clear and scannable. This is close to the best-written copy in the app;
  worth copying the tone into Steps 2 and 4.

### Step 6 — Build Front/Back Matter
- **Positive:** Strong pattern overall — safe informational content is clearly
  separated from the destructive rebuild action, which gets its own red-bordered
  box with an explicit, specific consequence statement before the confirm
  dialog even appears. This is the model Step 5 should follow (see above).
- **Moderate-to-significant:** When front/back-matter pages are omitted (e.g.
  because optional fields were left blank), the API returns a clear, specific,
  genuinely reassuring reason for each one — e.g. *"no verbatim bio and no
  author facts supplied — page omitted (never invent)"* — but the UI discards
  those reasons and shows only the bare enum name: "Omitted: INTRODUCTION,
  ABOUT_AUTHOR, ABOUT_SERIES, RESOURCES, BACK_COVER_COPY." A first-time user
  seeing "ABOUT_AUTHOR" omitted with zero explanation could easily worry
  something broke, when the real reason is reassuring (the system correctly
  refused to invent a bio rather than fabricate one — good behavior, badly
  communicated). Fix is small: surface `omitted[].reason` next to each item
  instead of just `omitted[].page`.

### Step 7 — Render & Review
*(Already extensively live-tested and fixed earlier the same session — see git
history for: sticky feedback banner, dismissible/advisory review results,
gpt-5.5 upgrade + false-positive fix on the prompt reviewer, `renderAll`
consecutive-failure detection. This pass re-confirmed those hold on a genuinely
fresh project.)*
- **Moderate / confusing, newly found:** In a brand-new, completely untouched
  project, one page (`FM_003_COPYRIGHT_PAGE`) already shows **APPROVED and
  print-ready** before any operator action — and the top summary line reads
  "1 book-ready" before the user has done anything. This is very likely correct
  behavior (the copyright page is deterministically typeset, not AI-rendered,
  so there's nothing to actually approve), but nothing in the UI explains this
  special case. A first-time user would reasonably wonder whether something
  happened without their consent, or whether the counter is broken. Recommend a
  small explanatory tag on deterministic pages ("auto-approved — typeset, not
  AI-rendered") instead of silence.
- **Positive:** "Review prompt" and the sticky result banner both worked
  correctly, unprompted, on this fresh project's very first untouched page —
  confirms this morning's fixes are solid, not coincidental to the specific
  pages tested earlier.

### Step 8 — Build Book
- **Positive, best-designed screen in the app:** The blocked state is a genuine
  model to replicate elsewhere — clear "NOT READY" status, plain-language
  instruction ("Go back to step 7 and render + approve these, then assemble
  again:"), and the *exact* list of which pages still need work. A first-time
  user would know precisely what to do next with zero ambiguity.
- **Minor:** The page identifiers in that list (`FM_001_HALF_TITLE`,
  `CH02_P001_m`) are raw internal keys rather than human-friendly names — a
  small polish opportunity, not a real blocker given how clear the surrounding
  copy is.

---

## Priority recommendations, ranked by impact-to-effort

1. **Build the generic error-formatting layer** (cross-cutting theme above).
   One piece of work, fixes at least two confirmed jarring moments, protects
   against future ones.
2. **Add manuscript format guidance to Step 2**, and **fix the empty-textarea
   bug when revisiting Step 2 after a successful upload.** These two together
   are almost certainly where a real first-time user gets stuck hardest — right
   at the very start, with the least experience navigating around the problem.
3. **Show `omitted[].reason` in Step 6**, not just the bare page name — small
   change, real reassurance value.
4. **Give Step 5's "Re-paginate (discard renders)" the same red-box treatment
   Step 6 already uses** for its destructive action — consistency + safety.
5. **Persist active project + step across a browser reload** (e.g. to
   `localStorage`, restored on load) — bigger lift, but matches how long these
   sessions actually run.
6. Everything tagged "minor" above — worth doing, low individual urgency.

## What this pass did *not* cover

- Did not spend on a real AI image render in the test project — Step 7's
  render mechanics were already validated live with real spend earlier the same
  day, and re-spending to confirm the same mechanism on a throwaway project
  wasn't worth the cost.
- Did not test the two `window.confirm()`-gated destructive actions
  (Build/Rebuild front matter, Re-paginate) via actual browser dialog
  interaction — the automated browser tooling used for this walkthrough
  auto-dismisses native confirm dialogs. Worked around by calling the
  equivalent API directly to keep progressing; the dialogs' own wording was
  verified by reading the source instead. If dialog-level interaction ever
  needs live verification, it'll need a different testing approach (e.g. a
  real manual click-through) than what was used here.
