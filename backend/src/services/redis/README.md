# services/redis

**Status:** Phase 0 — scaffold only. Implementation in Phase 1 alongside first BullMQ worker.

Upstash Redis connection — used exclusively by BullMQ.

**Why Upstash:** Hosted, serverless, generous free tier, native Redis protocol (BullMQ does NOT work with the REST-only URL).

**What can go wrong:**
- `ECONNREFUSED` — using REST URL instead of TCP URL; fix in `.env`
- TLS handshake fails — Upstash requires TLS; SDK enables by default for `rediss://`
- High latency from edge → Upstash region — pick a region close to where workers run

**Conventions:**
- One shared IORedis instance per process (workers + API both reuse).
- Connection options: `maxRetriesPerRequest: null` (required by BullMQ workers).
