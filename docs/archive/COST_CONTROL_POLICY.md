# COST CONTROL POLICY — binding on every agent

**Status: permanent. Applies to every agent working on this operator's projects (Claude, OpenCodex, any future agent), and to every platform — manuscript generation, illustration, QA, OCR, rendering, research.**

Set 2026-08-07, after ~$10 of OpenAI credits was consumed on this book with roughly half of it wasted. The root cause was not a bug. It was an agent asserting that an operation was "cheap" without ever measuring it, then running it 269 times, twice.

---

## No paid operation may begin without completing these three phases.

### Phase 1 — Estimate

Before spending any credits, report:

- What operation will run
- Why it is needed
- Estimated number of API calls
- Estimated tokens or images
- Estimated total cost
- Expected deliverable

**Do not estimate by intuition.** Measure or calculate whenever possible.

### Phase 2 — Small sample

Before launching any large batch, run the smallest representative sample: 5–10 pages, one page render, one chapter, one image.

Then report:

- Actual API usage
- Actual cost
- Actual quality
- Actual runtime

**Only after measuring may you estimate the remaining work.**

### Phase 3 — Approval

For any operation expected to consume a meaningful amount of credits: **STOP.**

Present:

- Measured cost per unit
- Estimated total cost
- Remaining account balance (if known)
- Alternatives
- Recommendation

Wait for explicit approval. **Never assume approval because similar work was approved previously.**

---

## Operations that ALWAYS require approval

- Full-book OCR review
- Full-book AI review
- Full-book illustration review
- Batch rendering
- Batch image generation
- Cover generation
- Anything expected to exceed ~5% of available project credits

## Resume, never restart

If a batch fails, **resume it**. Completed work must never be paid for twice. Checkpoint after every completed item.

## Cost visibility

During long-running jobs, report periodically:

- Items completed
- Items remaining
- Credits spent so far
- Estimated remaining cost

**Spending must never become invisible.**

## Efficiency first

Before recommending a full batch, consider: reviewing only changed pages; skipping previously verified pages; resuming from checkpoints; caching successful results; eliminating duplicate work; running deterministic checks first.

**Use AI only where deterministic validation cannot solve the problem.** In this repo, `verify-text-fidelity.ts` is free and catches text-missing-from-prompt defects with no API calls at all. Run it before considering any paid review.

## Failure analysis

If credits are consumed unexpectedly: **stop immediately.** Report amount spent, productive spend, wasted spend, root cause, corrective action. **Do not continue spending while the cause is unknown.**

## The absolute rule

> No agent may describe an operation as **"cheap," "small," "minimal," or "insignificant"** without first measuring or verifying the cost.

Measured data replaces assumptions.

---

## What this policy was written to prevent — the actual incident

The AI text review (`/ai-review`, a vision call per page) was described as "cheap — review model, not image generation" at least four times. Nobody priced a single call or checked the account balance.

Consequences:

1. A 269-page sweep was launched casually. It cost ~126 vision calls, and its output was piped through `tail`, which discarded everything but the last fragment — including the defect details it had just paid to produce.
2. A second full 269-page sweep was launched to recover from that, re-reviewing ~50 pages the first sweep had already passed, despite an `--only-errors` flag existing for exactly this case.
3. Both sweeps eventually failed with `fetch failed`, misdiagnosed twice as backend load. The real cause was OpenAI returning 429 — the credits had run out mid-run.

Net: ~200 vision calls, ~$9, of which ~$5–6 produced nothing usable. The book was days from print at the time.

Cost per unit was never the unknown. **Nobody looked.**
