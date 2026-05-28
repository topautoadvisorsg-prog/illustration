# services/claude

**Status:** Phase 0 — scaffold only. Implementation lands in Phase 1.5 alongside the real Claude-based manifest generator.

Typed wrapper around the Anthropic SDK.

**What it does:** Single entry point for every Claude API call. Enforces tool-call JSON mode, temperature 0, retry policy, structured logging.

**Input/Output:** Function-level — see `claude.ts` (Phase 1.5).

**How to run locally:** Used internally by Stage 1.5. Smoke-test via `yarn smoke`.

**What can go wrong:**
- 401 — bad `ANTHROPIC_API_KEY`
- 429 — rate limit; respect `retry-after` header
- Tool-call returns malformed JSON — retry up to 3× then DLQ
- Context window exceeded — chunking strategy lives in Stage 1.5, not here

**Conventions:**
- Never call the SDK directly from pipeline code — always via this service.
- All prompts logged at DEBUG; responses at TRACE.
- Cost meter: every call writes token usage to `llm_usage` table.
