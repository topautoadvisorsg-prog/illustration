# New-Book Parity Plan — stop Series-One assumptions from biting Series 3+

## The pattern behind every issue this session
None of the bugs we hit were "Canadian Rockies" bugs. Every one was the same shape:
**the platform was built around Series One's specific manuscript, and a second book
exposed a hardcoded Book-One assumption.**

| Issue | The Book-One assumption baked in |
|---|---|
| Catalog chapters mis-grouped | parser keyed on New England's exact `##` section names |
| "New England" in image prompts | region hardcoded in the prompt path |
| Underfill only fixed last page | recovery written for one book's page count |
| Type B rendered opener duplicate | subject read from manifest, never the new per-page layer |
| Binomial byline dropped | regex assumed New England's single-asterisk `*italic*` |
| Two identical "THE WILDLANDS" rows | list labelled by title only (fine with one book) |

They only surfaced because a human/agent happened to look. Commercial-grade means
they surface **automatically, before spend**, on every new book.

## The fix: three layers, cheapest first

### Layer 1 — Regression tests (DONE, keep the discipline)
Every class we hit now has a test that fails if it regresses: parser numbered-entry
split (non-NE wording), bold-italic/trinomial binomial extract + strip, underfill
Type A/B conversion. **Rule going forward: every bug we fix gets a test in the same
commit.** This is the cheapest guard and it's already paying off.

### Layer 2 — Series-One prompt-parity audit (RECOMMEND BUILD — highest value)
A no-spend script that, for a new book, generates a representative page prompt of each
type and **diffs its STRUCTURE against the proven Series One shipped prompt** (pulled
from the stored render `proof-package`, not a fresh regen). It flags any constraint /
section that Series One had and the new book is missing — e.g. it would have caught the
**missing byline** and the **absent bottom-anchor** the moment we onboarded the book,
instead of at pilot review.
- Input: new project id + the Series One baseline render ids (one per page type).
- Output: per-page-type "present in S1 / missing here" list. Zero image spend.
- ~1 script, reuses the preview-package + proof-package endpoints we already used by hand.

### Layer 3 — New-book pre-render audit (RECOMMEND BUILD — runs on every book)
A no-spend audit over a new book's pilot set that asserts the checks we ran by hand this
session, so onboarding is a green/red report, not a manual hunt:
- Entry counts match the source's numbered `### N.` per chapter (parser held).
- 0 occurrences of **any** prior book's region string in the prompt path (generalized
  region-leak check, not just "New England").
- Byline present on species openers; body doesn't double-print the binomial.
- Bottom-anchor present on every text-bearing page.
- Pilot spans ≥3 distinct layouts (not a monoculture).
- 0 stranded / 0 underfilled.

## The runbook (onboarding Series 3 = Southern Appalachians)
1. Create project (7×10, Hardcover, PREMIUM+KINDLE), set `subtitle` = clean region.
2. Upload manuscript → Breakdown → Pagination.
3. **Run Layer 3 audit.** Fix every red flag in TEXT (free) before any render.
4. **Run Layer 2 parity diff** against Series One. Restore anything the new book dropped.
5. Pilot render (mixed layouts) → operator reviews prompts → render.

## Recommendation
Layer 1 is done and is the standing rule. **Build Layer 2 + Layer 3 as one small
no-spend audit tool** — it's the difference between "the agent caught it" and "the
platform caught it," which is the commercial-grade bar. Suggest building it AFTER the
Canadian Rockies pilot proves out (so the checks are validated against a real render),
unless you want it first. Either way it's cheap and it's the real answer to "we don't
want to come across these again."
