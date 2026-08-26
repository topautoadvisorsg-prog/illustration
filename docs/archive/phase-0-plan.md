# Phase 0 â€” Risk Spikes

**Duration:** 9 working days + 1 buffer day (â‰ˆ 2 calendar weeks)
**Output:** Validated tech choices + working 1-page vertical slice + drift gallery + DPI report + test EPUB.
**Success criterion:** `yarn spike:full-pipeline` produces a print-ready Chanterelle PDF from a clean checkout.

---

## Day-by-Day

| Day | Spike | Deliverable | Gate |
|---|---|---|---|
| D1 âœ… | Repo scaffold + smoke tests + README hierarchy | Monorepo, .env structure, 6/6 smoke tests run cleanly with placeholders | Scaffold compiles + smoke tests skip gracefully |
| D2â€“D3 | Spike 2 â€” Vertical slice (Chanterelle) | `node spikes/vertical-slice.ts` â†’ `chanterelle-page.pdf` (300 DPI, 8.625Ã—11.25) | PDF opens in Acrobat at 300 DPI |
| D4â€“D6 | Spike 1 â€” PDF engine bake-off | Decision doc + 2 sample 30-page PDFs + ADR-001 supersede | One engine clearly wins on memory/time/fidelity |
| D7 | Spike 4 â€” Replicate upscale validation | DPI report on 5 test images + draft Master Style Block submitted | 5/5 images pass Sharp DPI gate |
| D8 | Spike 3 â€” Image consistency drift | 20-image consistency gallery (PDF) | Stakeholder visual sign-off |
| D9 | Spike 5 â€” EPUB quality | Test EPUB validated on Kindle Previewer + iPad Books | Clean reflow + correct image scaling |
| D10 | Buffer / Phase 0 wrap | Phase 0 report + Phase 1 kickoff doc | Phase 0 retrospective signed off |

---

## Dependencies (Operator-side)

| Item | Needed by | Source |
|---|---|---|
| Anthropic API key | D2 | console.anthropic.com |
| OpenAI API key (org-verified for gpt-image-2) | D2 | platform.openai.com |
| Replicate API token | D2 | replicate.com/account/api-tokens |
| Supabase project URL + service_role key | D7 (Phase 1) | supabase.com â†’ Settings â†’ API |
| Upstash Redis URL + token (TCP) | D7 (Phase 1) | console.upstash.com |
| Sentry DSN (backend + frontend projects) | D7 (Phase 1) | sentry.io â†’ Settings â†’ Client Keys |
| Sample manuscript chapters (2) | D2 | Stakeholder delivery |
| Master Style Block text | D8 | Agent drafts by D7; stakeholder approves |

---

## What Phase 0 Does NOT Produce

- âŒ A dashboard UI
- âŒ A multi-page book PDF
- âŒ Production-grade error handling
- âŒ Multi-project / multi-user support
- âŒ Final layout templates (only one minimum-viable layout for the vertical slice)

Anything in this list waits for Phase 1+.

---

## Daily Status Reports

End-of-day status reports land in `/docs/phase-0-reports/dayN.md`. Each report answers:
- What I did today
- What's blocked
- What I'll do tomorrow
- Risks surfaced
