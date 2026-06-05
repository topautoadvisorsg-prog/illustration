# Backend Scripts

CLI utilities run via `tsx`. Not part of the runtime â€” these are operator tools.

---

## smoke-test.ts

**What it does:** Validates connectivity + auth for every external API the pipeline depends on (Anthropic, OpenAI, Replicate, Supabase, Upstash Redis, Sentry).

**Input:** `.env` at repo root.

**Output:** Console report with PASS / FAIL / SKIPPED per service, exit code 0 if no failures.

**How to run locally:**
```bash
yarn smoke
```

**What can go wrong:**

| Symptom | Cause | Fix |
|---|---|---|
| All SKIPPED | `.env` still has placeholder values | Replace `your_*_here` strings with real keys |
| Anthropic FAIL with 401 | Bad/expired key | Regenerate at console.anthropic.com/settings/keys |
| OpenAI FAIL `gpt-image-2 NOT in account` | Org not verified for image gen | Complete OpenAI org verification (Settings â†’ Organization) |
| Replicate FAIL with 401 | Bad token | Regenerate at replicate.com/account/api-tokens |
| Supabase FAIL with 401 | Used anon key instead of service_role | `SUPABASE_SERVICE_ROLE_KEY` must be the service-role key |
| Redis FAIL with ECONNREFUSED | Using Upstash REST URL instead of TCP | Use the TCP/native Redis URL from Upstash dashboard |
| Sentry FAIL | Invalid DSN format | Copy DSN from Sentry project â†’ Settings â†’ Client Keys |
| `Env validation failed` (exit 2) | Missing env vars entirely | `cp .env.example .env` then fill |

**Adding a new service:** Add a `checkX()` function and append to the `checks` array in `smoke-test.ts`.
