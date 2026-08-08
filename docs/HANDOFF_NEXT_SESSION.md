# HANDOFF — THE WILDLANDS: CANADIAN ROCKIES (read this first)

**Project ID:** `8c1e161a-69dd-4a3d-a655-8de54995be16`
**Repo:** `C:\Users\jovan\Downloads\wildlands agents platform`
**Work directly in that folder.** It already has a real `.env`, `node_modules`, and DB access. Do NOT clone fresh — `.env` is never committed and you will have no credentials.

---

## ⛔ READ BEFORE SPENDING ANYTHING

- [`docs/COST_CONTROL_POLICY.md`](COST_CONTROL_POLICY.md) — **binding.** Estimate → measure a small sample → get explicit approval, before ANY paid call. Never call an operation "cheap" without measuring it.
- [`docs/PRODUCT_IMPROVEMENT_LOG.md`](PRODUCT_IMPROVEMENT_LOG.md) — known defects and open gaps.

The operator has a small OpenAI balance and lost ~$10 earlier to an unmeasured batch. **Do not run any batch without stating page count + measured cost first.**

---

## WHERE THE BOOK STANDS

269 pages. Manuscript complete and publication quality. All 269 rendered. **Cover not yet built. KDP files not assembled.**

Reconciliation (run `tsx backend/scripts/reconcile-canonical-renders.ts <projectId>` — read-only, free):

| Category | Count |
|---|---|
| Auto-approvable | 253 |
| Awaiting free verification | 3 |
| Known defective / needs repair | 13 |
| Manual decision | 0 |
| **Total** | **269** |

**Only ~6 pages are marked canonical in the DB.** Assembly reads `approved_for_book` + `active`, so the book would currently build almost empty. The promotion write is prepared but **NOT executed** — the operator gated it on zero unverified non-repair pages.

---

## DO THESE IN ORDER

### 1. Finish free verification (3 pages, no cost)
`CH02_P027`, `CH04_P006_c1`, `CH04_P010_c1`.

Download and LOOK at each:
```
tsx backend/scripts/download-page-image.ts <projectId> <pageKey> <outPath>
```
Then record the verdict — this is mandatory, a verdict in chat is not evidence:
```
tsx backend/scripts/record-visual-verdict.ts <projectId> <pageKey> <clean|defective|manual> "<reason>" --by "your name" --commit
```

### 2. Re-reconcile
Non-repair unverified must reach 0. Totals must equal exactly 269.

### 3. Execute the canonical promotion
Transactional. Exactly one active render per resolved page. Never displace a manual approval (`decidedBy` set). Leave repair pages unresolved. Verify counts immediately after commit.

### 4. Report the repair pool for approval — DO NOT SPEND YET
Page ID, exact defect, best candidate render, repair method, measured cost (~$0.09/render).

### 5. Then, with approval: repairs → cover → KDP assembly → final QA report

**Cover spec is already verified from KDP's own calculator** and stored in `backend/src/pipeline/publishing-standard/kdp-cover-specs.ts`:
Hardcover / 7×10 / white / premium colour / 269pp → **16.395 × 11.417 in, spine 0.820 in.**
Do NOT use the old hardcoded 275-page values in `hardcover-*.ts`.

---

## HARD RULES (learned the expensive way)

1. **Never re-render on a high AI-review issue count without looking at the image.** The reviewer reported 54 issues on `CH08_P008` claiming the body text was missing. The page is flawless and operator-approved. Acting on it would have destroyed approved artwork.
2. **`CH05_P004_c1` — do NOT full-page regenerate.** Two attempts both corrupted the word "its" differently. Needs localized inpainting (`images.edit` supports a mask; the platform never uses it). Report options instead of spinning again.
3. **Render once, then look.** No auto-retry loops.
4. **`--only-errors` is dangerous** — historical errors accumulate and it can silently become a full-book sweep. Prefer explicit page keys. A cost guard now refuses >15 pages without `--yes`.
5. **Reviewer model must stay non-reasoning.** It is `gpt-4.1-mini` at temperature 0. A reasoning model (gpt-5.x) bills invisible reasoning tokens, returns empty on dense pages, and gives non-deterministic verdicts.
6. **Free checks first.** `tsx backend/scripts/verify-text-fidelity.ts <projectId>` costs nothing and passes 269/269.

---

## STILL OPEN (not started)

**Product QA / visual polish pass on the operator UI.** The operator wants to open the platform and immediately understand: what is complete, clean, defective, unresolved, which render goes in the book, and what blocks assembly — without terminal, DB, or chat history. Green must mean positive evidence exists, not absence of errors, and every status must explain *why*. Full requirements are in the conversation; treat the 269-page project as the acceptance test. This is a substantial piece of work and was deliberately deferred rather than rushed.
