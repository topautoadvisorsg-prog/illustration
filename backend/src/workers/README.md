# Workers

BullMQ workers — one process per pipeline stage that runs async.

**Workers (Phase 1+):**
- `image-generation` — Stage 3
- `upscale` — Stage 5
- `layout` — Stage 6
- `pdf-compile` — Stage 7
- `epub-export` — Stage 8

**Conventions:**
- Each worker is a standalone Node process (`yarn workspace @wildlands/backend run worker:NAME`).
- Concurrency tuned per stage in env vars (e.g. `IMAGE_GEN_CONCURRENCY=2`).
- Every job has `idempotency_key` so retries don't duplicate work.
- Dead-letter queue + Sentry alert on every DLQ entry.
- Workers DO NOT share state — all coordination via Redis + Postgres.

**Running locally:**
```bash
# Each worker in its own terminal
yarn workspace @wildlands/backend run worker:image-generation
yarn workspace @wildlands/backend run worker:upscale
yarn workspace @wildlands/backend run worker:layout
```

**What can go wrong:**
- Worker dies silently → BullMQ re-queues after job timeout
- DLQ piling up → check Sentry for the original error
- Worker concurrency too high → external API rate limits → cascade failures
