# Agent Layer â€” what actually runs

This documents the real agent/LLM layer, because the roster historically implied
more than runs. Source of truth: `backend/src/agents/agent-contracts.ts` (each
contract carries `runtime`, `usesTools`, `usesVision`, `realityNote`).

## The pixel rule (non-negotiable)

**No agent reads image pixels. No vision calls.** Review and reuse reason over
**metadata only**: layout type, coverage %, placement, subject, prompt + hash,
dimensions/DPI, status. This keeps token cost predictable â€” the only image spend
is one-way generation to `gpt-image-2` (text prompt â†’ image). The Claude wrapper
(`services/claude/claude.ts`) is text-only; every base64/image reference in the
codebase is the renderer embedding PNGs into HTML for Chromium â†’ PDF.

`usesVision` must stay `false` for every contract; a test enforces this.

## What actually runs

| Role | Runtime | Reality |
|---|---|---|
| Operator Adviser | **advisory-llm** | LIVE Claude chat (`callChat`), temp 0.3, ~700 tokens, read-only. Answers "what's wrong / what's next". |
| Stage Reviewer | **advisory-llm** | LIVE Claude chat (`callChat`), temp 0, ~600 tokens, read-only. PASS / NEEDS WORK verdict per stage. |
| Manuscript Analyst | deterministic | Markdown parsing (`parse-manuscript-outline.ts`). No LLM. |
| Page Planner | deterministic | `plan-pages.ts`. No LLM. |
| Layout Selector | deterministic | Folded into planning + layout profiles. No LLM. |
| Art Brief Director | deterministic | Layout geometry + image-shape hints + prompt assembly. No LLM. |
| Prompt Assembler | deterministic | Prompt templating + SHA-256 hashing. No LLM. |
| Cover Art Director | deterministic | Typographic overlay + full-bleed image-priority zone. No LLM. |
| Text-Fit QA | deterministic | `text-fit.ts`. No LLM. |
| Image QA | **planned** | Not implemented. Approve/reject is a manual operator action. If built, it MUST stay metadata-only. |

So: **two live LLM calls, both text-only read-only advisers.** Everything else is
deterministic code. `callStructured` (the forced-tool primitive) exists for future
real structured agents but is currently unused.

## Why this matters

- **Cost:** tiny LLM spend (two capped text calls). The roster previously implied a
  studio of 8 working agents; only the adviser + reviewer run.
- **Safety:** no agent can take actions (`usesTools: false`) or read pixels
  (`usesVision: false`).
- **Honesty:** the operator's "Pipeline Agents" panel now shows a runtime badge
  (live chat / code / planned) and a "metadata only Â· no vision Â· read-only" line.

## If you implement Image QA later

Read **metadata only**: confirm the image was generated from the approved prompt
hash for that page; check dimensions, DPI, and that the generated shape matches the
layout shape. Never send the image to a model. Final artwork approval stays a human
decision.
