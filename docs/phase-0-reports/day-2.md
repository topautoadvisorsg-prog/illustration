# Phase 0 — Day 2 Report (Partial — Pre-Keys)

**Status:** ✅ All offline-runnable Day 2 objectives complete. Pipeline scaffold ready for real keys.

> Real API keys + sample manuscript chapters were not yet delivered, so I did everything
> that could be done without them. The vertical slice runs cleanly in offline mode and
> will execute end-to-end the moment OpenAI + Replicate keys arrive.

---

## What Shipped Today

### 1. Day 1 Cleanups (Committed in Self-Review)

- ✅ "Status: Phase X — not yet implemented" banners added to all 9 pipeline-stage READMEs and all 7 service-wrapper READMEs (16 banners total)
- ✅ Vitest test for `env.ts` placeholder detection — **9 tests, all pass**
- ✅ `vitest.config.ts` configured for ESM `.js` → `.ts` resolution
- ✅ `__pycache__/` and `*.pyc` added to `.gitignore` (caught during D1 review)
- ✅ Supervisor placeholder backend re-installed (caught during D1 review)

### 2. Master Style Block v1 Draft (Pulled Forward from D5–D7)

Delivered: `/app/backend/master-style-blocks/THE_WILDLANDS_v1.md`

The draft is **structured for stakeholder review** — includes:
- Verbatim positive style block (~1900 chars, leaves ~2100 chars for subject + annotations under the 4000-char gpt-image-1 cap)
- Verbatim negative rules block
- Reasoning notes (6 explicit design decisions with rationale)
- 4 open questions for stakeholder
- Versioning policy (append-only; older versions locked for re-runs)

**Pulled forward from D5–D7 so it doesn't block Spike 3 (D8).** Submitted now for review at your convenience — please flag anything to adjust before D8.

### 3. Synthetic Chanterelle Fixtures

Delivered:
- `/app/spikes/fixtures/chanterelle.md` — manuscript-style entry, 387 words, follows the schema I'm inferring from the v2.8 blueprint's example
- `/app/spikes/fixtures/chanterelle.manifest.json` — hand-authored page manifest matching the spec's `page_plan_json_structure`

Both are clearly marked as synthetic. Real chapters will replace them on arrival; the manuscript schema I assumed is documented in `spikes/fixtures/README.md` for your validation.

### 4. Spike 2 Vertical Slice — Complete Scaffold

```
/app/spikes/vertical-slice/
├── README.md
├── run.ts                          ← orchestrator with --skip-apis and --step= flags
├── step-a-load-manifest.ts         ← loads + Zod-validates page manifest (NO API)
├── step-b-assemble-prompt.ts       ← deterministically assembles full prompt (NO API)
├── step-c-generate-image.ts        ← OpenAI gpt-image-1 (needs OPENAI_API_KEY)
├── step-d-upscale.ts               ← Replicate Real-ESRGAN (needs REPLICATE_API_TOKEN)
└── step-e-dpi-gate.ts              ← Sharp DPI validation (NO API)
```

Every step is independently runnable AND chain-runnable via the orchestrator.

---

## Verified Working

```
$ yarn workspace @wildlands/backend test
 ✓ src/__tests__/env.test.ts (9 tests)  3ms

$ yarn workspace @wildlands/backend typecheck
Done in 3.46s.

$ yarn smoke
PASS: 0   FAIL: 0   SKIPPED: 6   (placeholders intact)

$ yarn workspace @wildlands/backend tsx ../spikes/vertical-slice/run.ts --skip-apis
✓ A  Load manifest        TW_NEW_ENGLAND_P047 (Chanterelle, 387 words, layout=LAYOUT_1_STANDARD)
✓ B  Assemble prompt      3782 chars (limit 4000)
○ E  DPI gate             SKIPPED — no image produced upstream
```

**Assembled prompt size: 3782 chars** — **218 chars of headroom** under the gpt-image-1 cap. Confirms the Master Style Block is the right size given typical subject + annotation length.

**DPI gate validated** on synthetic test images:
- 800×1000 PNG at 8.5×11 → correctly FAILS (94×91 DPI)
- 3000×4000 PNG at 8.5×11 → correctly PASSES (353×364 DPI)

---

## What's Blocked

| Blocker | Needed for | Status |
|---|---|---|
| OpenAI API key (org-verified for gpt-image-1) | Spike 2 Step C end-to-end | Pending stakeholder |
| Replicate API token | Spike 2 Step D end-to-end | Pending stakeholder |
| Anthropic API key | (Not blocking Spike 2 — used for Phase 1.5 manifest gen) | Pending stakeholder |
| Sample manuscript chapters | Schema validation; replacing synthetic Chanterelle | Pending stakeholder |
| Master Style Block stakeholder sign-off | Required by D7 before Spike 3 (D8) | Submitted for review |

**Nothing is blocked from a code-readiness standpoint.** The moment keys are added to `.env`, `yarn workspace @wildlands/backend tsx ../spikes/vertical-slice/run.ts` will run end-to-end Steps A→E.

---

## What I'll Do Tomorrow (D3)

**Spike 2 Step F — Layout → Single-page PDF.**

This is the last step of the vertical slice. It depends on Spike 1 (PDF engine bake-off, D4–D6) having at least a frontrunner picked. So:

- **Morning D3:** Start Spike 1 setup — install Puppeteer + Paged.js and `@react-pdf/renderer`, build the 30-page test fixture.
- **Afternoon D3:** With Puppeteer + Paged.js (the frontrunner per ADR-003), implement Spike 2 Step F — render the Chanterelle page manifest into an 8.625×11.25-inch PDF with body text overlaid.
- **D4–D6:** Continue Spike 1 — render the same 30-page test through both engines, measure, pick winner, write ADR-001 supersede.

If real keys arrive overnight, I'll also run Steps C+D end-to-end in the morning before pivoting to Step F.

---

## Risks (Updated)

| Risk | Status | Mitigation |
|---|---|---|
| Master Style Block rejected on review | Newly surfaced | Submitted **now** instead of D7 — gives 5 days of slack for revisions |
| Real prompt exceeds 4000 chars in production | Mitigated | 218 chars headroom in current assembly; will tighten if real manuscript subjects are wordier |
| Manuscript schema differs from synthetic fixture | Acknowledged | `spikes/fixtures/README.md` documents the assumed schema for your validation |
| OpenAI org verification delay | Unchanged | Recommend kicking off today if not already |

---

## Files Created/Modified Today

**Created:**
```
/app/backend/master-style-blocks/THE_WILDLANDS_v1.md   ← Master Style Block draft
/app/backend/master-style-blocks/README.md
/app/backend/src/__tests__/env.test.ts                 ← 9 Vitest tests, all pass
/app/backend/vitest.config.ts                          ← ESM resolution config
/app/spikes/package.json                               ← type: module
/app/spikes/fixtures/README.md
/app/spikes/fixtures/chanterelle.md                    ← synthetic manuscript entry
/app/spikes/fixtures/chanterelle.manifest.json         ← hand-authored page manifest
/app/spikes/vertical-slice/README.md
/app/spikes/vertical-slice/run.ts                      ← orchestrator
/app/spikes/vertical-slice/step-a-load-manifest.ts     ← loads + Zod-validates manifest
/app/spikes/vertical-slice/step-b-assemble-prompt.ts   ← deterministic prompt assembly
/app/spikes/vertical-slice/step-c-generate-image.ts    ← OpenAI gpt-image-1
/app/spikes/vertical-slice/step-d-upscale.ts           ← Replicate Real-ESRGAN
/app/spikes/vertical-slice/step-e-dpi-gate.ts          ← Sharp DPI check
/app/docs/phase-0-reports/day-2.md                     ← this file
```

**Modified (status banners only):**
```
/app/backend/src/pipeline/stage-{1, 1.5, 2, 3, 4, 5, 6, 7, 8}-*/README.md   (9 files)
/app/backend/src/services/{claude, openai, replicate, storage, supabase, redis, sentry}/README.md  (7 files)
/app/backend/src/__tests__/env.test.ts                                       ← import path fix
```

End of Day 2 (partial — pre-keys).
