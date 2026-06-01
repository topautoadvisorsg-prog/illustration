# Repo Scripts

Automation helpers for repeatable local verification. These scripts do not call
paid APIs and do not require live API keys.

## verify-pipeline.mjs

**What it does:** Runs the full no-cost verification stack before operator
review:

- shared package build
- backend typecheck
- backend Vitest suite
- frontend production build
- layout-library audit

**Input:** Current repo checkout.

**Output:** Console progress for each step and a non-zero exit code on the first
failure.

**How to run:**

```bash
yarn verify:pipeline
```

**How to debug:** The script stops at the failing step. Run that printed command
directly, fix the issue, then rerun `yarn verify:pipeline`.

## audit-layout-library.mjs

**What it does:** Static self-audit for the Vintage Naturalist layout library.
It verifies:

- every frontend layout template has a unique ID
- every layout ID exists in the shared schema
- every layout ID has backend planner capacity
- every referenced layout image exists and is not an obviously broken tiny file
- frontend and backend prompt safety rules include text-zone preservation,
  minimal callouts, explicit-label-only image text, and negative-space rules
- stale 9-layout wording and older no-label text policy are gone

**Input:** `frontend/src/App.js`, `shared/src/index.ts`,
`backend/src/pipeline/stage-2-planner/plan-pages.ts`, and
`frontend/public/layout-references/*.png`.

**Output:** Audit pass/fail summary with warnings for noncanonical image names.

**How to run:**

```bash
yarn audit:layouts
```

**How to debug:** Fix each reported failure. Warnings are informational unless
they point to a naming convention you want to enforce.
