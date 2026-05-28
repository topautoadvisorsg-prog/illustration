# Stage 4 — Image Preview & Review (Human Gate)

**Status:** Phase 0 — scaffold only. Skipped in Spike 2 (auto-approves the single Chanterelle image). API endpoints implemented in Phase 3.

**What it does:** The first human approval point. Exposes API endpoints for listing generated images, approving them, or triggering a regeneration with a new version.

In V1 this is **API only** — no UI. Operator uses curl / Postman until Phase 3.

**Input (per-image actions):**
- `POST /api/pages/{page_id}/images/{version}/approve`
- `POST /api/pages/{page_id}/images/{version}/regenerate` — optionally with `prompt_override`

**Output:**
- Approve → page status → `APPROVED`; image enqueued in `upscale` queue
- Regenerate → new BullMQ `image-generation` job; previous versions preserved

**How to run it locally:**
```bash
# List pages awaiting review
curl -s http://localhost:8001/api/projects/{id}/images?status=REVIEW \
  -H "Authorization: Bearer $TOKEN" | jq

# Approve an image
curl -X POST http://localhost:8001/api/pages/{page_id}/images/2/approve \
  -H "Authorization: Bearer $TOKEN"

# Regenerate with prompt tweak
curl -X POST http://localhost:8001/api/pages/{page_id}/images/2/regenerate \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"prompt_override_addendum": "warmer lighting, more shadow detail"}'
```

**What can go wrong:**

| Symptom | Cause | Fix |
|---|---|---|
| `APPROVED_IMAGE_MISSING` | Approving a version that doesn't exist on disk | Verify storage path; check workers logs |
| Race condition on approve+regenerate | Two clients hitting same page | DB row lock + optimistic version check |
| Approval but upscale never starts | Worker not running | `yarn run worker:upscale` |

**Design notes:**
- Approval is per-image-version, not per-page. A page can have many versions; only one is "active."
- Activating a different historical version is allowed via `POST /api/pages/{page_id}/images/{version}/set-active`.
- All actions captured in `image_events` audit log.
- Phase 3 UI: Screen 4 "Image Review Dashboard" — grid + full preview + version history. **Do not build until backend works via curl.**
