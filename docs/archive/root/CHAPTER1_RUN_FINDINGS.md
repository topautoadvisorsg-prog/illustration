# Chapter 1 Production Run — Findings

**Date:** 2026-06-10
**Project:** The Wildlands Field Guide (New England) — `e51e5b4c-05c7-4d6e-8c00-60aa15de8992`
**Goal:** run Chapter 1 end-to-end through the existing pipeline; document every
failure, manual intervention, bottleneck, and production risk. Find the first
point where the system still depends on human intervention. NO new features
unless a real failure is discovered.

**Pipeline stages tested:**
Blueprint → Manuscript → Pagination → Layout Selection → Page Plan →
Prompt Generation → Render Package → Proof Package → PDF Assembly

---

## Stage results

| Stage | Result | Notes |
|---|---|---|
| Manuscript ingest | ✅ PASS | New England manuscript confirmed (glacial/New England content in body text) |
| Breakdown | ✅ PASS | 8 chapters / 129 entries (front matter still absent — known, §BREAKDOWN_MISSING_PAGES) |
| Pagination | ⚠ PASS w/ warning | 245 pages (was 255); OVERFLOW 1 → 2 (see F-2) |
| Layout Selection | ✅ PASS | Accent family live; distribution near target (see table) |
| Page Plan (CH01) | ✅ PASS | 22 pages: 11 openers (2 accent, 9 fifty-fifty) + 11 continuations |
| Prompt Generation | ✅ PASS | Accent zone in spec + blueprint; New England content verified |
| Render Package | (in flight) | 22 sequential renders ~$1.10 |
| Proof Package | pending | |
| PDF Assembly | pending | expect BLOCKED (only CH01 ready) — see F-7 |

## Layout distribution after accent selection (245 pages)

| Family | Count | % | Target |
|---|---|---|---|
| LAYOUT_2_TEXT_HEAVY (continuations) | 125 | 51.0% | ~40% |
| LAYOUT_B (50/50, top+right) | 57 | 23.2% | ~20% ✓ |
| LAYOUT_C (25% accent, 4 corners) | 50 | 20.4% | ~25% ✓ close |
| LAYOUT_D (pure text) | 13 | 5.3% | ~10% (needs P2c ornaments) |
| LAYOUT_F (hero) | 0 | 0% | ~4% (P2d not built) |

Corner rotation working: TOP_LEFT 15 / BOTTOM_LEFT 13 / TOP_RIGHT 12 / BOTTOM_RIGHT 10.

---

## Findings (chronological)

### F-1 — HUMAN INTERVENTION POINT #1: supervisor gate cannot pass
**Severity: HIGH (blocks full-book automation)**
The supervisor verdict is BLOCKED because text-fit strict-requires zero
OVERFLOW (`text-fit-preview.ts:180`) while pagination tolerates ≤ 2. With 2
by-design overflow pages the pipeline can NEVER self-approve. Every
production run requires a human to bypass via per-page render calls.
This is the FIRST human-intervention point in the flow. (Known as I-1/I-2 in
BREAKDOWN_MISSING_PAGES.md; this run confirms it live.)
**Production fix needed before full-book run:** unify tolerances OR add
operator-accepted-overflow persistence.

### F-2 — OVERFLOW grew 1 → 2 after accent selection
CH02_P017 is newly OVERFLOW (CH08_P001_m carried over). The accent capacity
model (full width × 75% height) is slightly optimistic for at least one
entry. Within pagination tolerance (max 2). Neither page is in CH01.
**Watch:** if accent OVERFLOW grows at full-book scale, tune ACCENT_MIN_WORDS
upward (380 → 420).

### F-3 — `/pages` endpoint has no fitStatus (known I-3, confirmed again)
To find WHICH pages overflow, the operator must run the supervisor and read
`operatorReviewPages`. The page list itself can't show fit. Confirmed
bottleneck during this run. Fix scheduled with P2b.

### F-4 — HUMAN INTERVENTION POINT #2: no batch render
22 pages = 22 individual POSTs (scripted via bash here). At 245 pages the
script approach works but: no retry queue, no resume-on-crash, no
concurrency, no progress surface in the UI. An operator without a terminal
cannot render a book. (Known I-4; confirmed live.)

### F-5 — Blueprint semantics rely entirely on image-edits behavior
The prompt text never explains the blueprint colors (BLUE/RED/ORANGE/
parchment). Composition steering works because the blueprint PNG is the
EDIT BASE (image-to-image) — the model paints over it. Empirically reliable
across all renders to date, but a model/endpoint swap would silently lose
composition control. Fragility, not a failure. Document only.

### F-6 — PRODUCTION RULE: pagination must freeze before render spend
Re-pagination deletes/recreates page rows with new IDs. All renders are
keyed to page IDs → re-paginating orphans every prior render (the $0.80 of
L-series verification renders are now orphaned by this run's re-paginate).
Not a bug — but a hard operational rule that nothing currently enforces.
**Production risk:** an accidental re-paginate after a $12 full-book render
run would orphan 245 paid images. No guard exists.

### F-7 — HUMAN INTERVENTION POINT #3: render responses lie; one duplicate spend
**Severity: HIGH for full-book automation**
22 sequential renders: ALL 22 succeeded server-side, but the client received
malformed / non-JSON responses for 5 of them (CH01_P006, P006_c1, P007,
P008, P008_c1 — one "failed" in 6 s, classic edge/proxy error while the
backend kept rendering). Verified afterward via the versions endpoint: every
page RENDERED, no errorMessage.

Worse: **CH01_P006 has TWO paid RENDERED rows** — a duplicate render
(~$0.05 wasted). At minimum one POST was retried/duplicated at some layer
despite curl not retrying POSTs by default.

Production implications:
1. A naive "retry on error response" loop would DOUBLE-SPEND — error
   responses do not mean the render failed.
2. Render success can only be trusted by re-querying the versions endpoint,
   never from the POST response alone.
3. A batch-render endpoint (F-4) must be idempotent per page (e.g. "skip if
   a RENDERED row exists for this pageId") before any full-book run.

### Render stage summary (Chapter 1)
- 22/22 pages RENDERED (23 paid rows — 1 duplicate, see F-7)
- Render times: 59–200 s, median ~74 s. Wall-clock ≈ 32 min sequential.
- Full-book projection at this rate: 245 pages ≈ 5.5–6 h sequential.
  Concurrency or a queue is REQUIRED for practical full-book runs (F-4).
- First live renders of the new 25 % accent family: CH01_P001 (top-right),
  CH01_P003 (top-left) — visual verdict pending operator review.

### F-8 — REAL FAILURE: corner-accent layouts not honored by the image model
**Severity: HIGH (quality / design intent)**
First two live accent renders, both non-compliant:
- CH01_P001 ordered CORNER_TOP_RIGHT (25 % accent) → model rendered
  text-top + full-width BOTTOM band (~40 % image)
- CH01_P003 ordered CORNER_TOP_LEFT (25 % accent) → model rendered a
  full-width TOP band (~38 % image)
Both pages are beautiful — but they are 50/50 band pages, not accents. The
distribution we selected (20 % accents) is therefore not what prints.
B-family compliance is also loose: CH01_P005 ordered IMAGE_RIGHT and
rendered IMAGE_LEFT (mirrored).

Root cause (probable): the ONLY corner signal is the blueprint PNG. The
prompt prose never says "small corner accent" — the layout director's
imagePlacement/textPlacement strings and zone instructions are computed
but NEVER enter the prompt; the spec's READING-FIELD GEOMETRY names just
one zone. The image-edits model treats a small corner box loosely and
falls back to its prior (full-width bands).

**Proposed fix (small, prompt-level — no new features):** plumb the
existing `imagePlacement` / `textPlacement` strings into the spec + a
COMPOSITION line in the prompt ("small top-right corner accent study,
~25 % of the composition; body text owns the rest"). Re-render the two
accent pages to verify (~$0.10). Operator decision.

### F-9 — REAL FAILURE: literal "---" prints on pages
CH01_P005 renders a stray "---" at the end of its body text (operator's
earlier CH02_P010 screenshot showed the same at the top of a page).
Markdown horizontal rules leak through markdownToBlocks → bodyBlocks as
literal text and the model prints them verbatim.
**Proposed fix:** strip hr tokens ("---", "***", "___" lines) in
markdown-blocks parsing. One-line filter + test. Operator decision.

### F-10 — Sparse pages render sparse
CH01_P005 (~50 words) renders with a large illustration and thin text
column — visually fine but content-light. 8 UNDERFILL pages exist
book-wide. Compaction handles most; the survivors read as intentional
breathing room. No action recommended; noted for the distribution audit.

---

## FINAL STAGE TABLE

| Stage | Result |
|---|---|
| Blueprint / Manuscript | ✅ PASS |
| Pagination | ⚠ PASS (245 pages; overflow 2, in tolerance, neither in CH01) |
| Layout Selection | ✅ PASS (accent 20.4 %, B 23.2 %, near targets) |
| Page Plan | ✅ PASS (22 CH01 pages, correct roles) |
| Prompt Generation | ⚠ PASS w/ gap (accent prose missing from prompt → F-8) |
| Render Package | ⚠ 22/22 RENDERED; 5 bad responses + 1 duplicate spend (F-7) |
| Print-prep / Preflight | ✅ 22/22 passed |
| Approve / Select-for-book | ✅ 22/22 (scripted — no UI batch action: intervention point) |
| Proof Package | ✅ complete for all 22 |
| PDF Assembly | ✅ gate CORRECTLY blocked (22/245 book-ready; geometry uniform) |

## ANSWER: first point of human intervention

1. **Supervisor gate (F-1)** — permanently red with by-design overflow;
   human must bypass. FIRST and hardest blocker for unattended runs.
2. **Batch rendering (F-4/F-7)** — no queue, no idempotent retry, untrusted
   responses, duplicate spend risk. Human babysits every render batch.
3. **Approve/select (this run)** — 22 manual API calls; no "approve chapter"
   action exists.
4. **Assembly** — requires ALL 245 pages book-ready; no partial/chapter
   proof PDF (I-13) so a chapter-level visual check needs manual stitching.

## Spend
Chapter 1 run: 23 renders ≈ $1.15. Cumulative project spend ≈ $2.15.
