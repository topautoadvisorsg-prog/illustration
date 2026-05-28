# services/sentry

**Status:** Phase 0 — scaffold only. Smoke-test init proven; production init in Phase 1.

Sentry initialization for backend.

**What it does:** Captures unhandled errors, BullMQ worker failures, and pipeline DLQ entries. Free tier covers ~5K errors/month — enough for v1.

**Initialization:** Called once at app boot in `index.ts` before any other module loads.

**Scrubbing:** PII paths in logs scrubbed via Pino redact (see `lib/logger.ts`). Sentry has its own scrubber config for image URLs, API keys, and DB connection strings.

**What can go wrong:**
- Invalid DSN — Sentry silently no-ops; check init logs
- Quota exceeded — upgrade plan or filter noisy events
- Source maps not uploaded — stack traces unmapped; not blocking for v1
