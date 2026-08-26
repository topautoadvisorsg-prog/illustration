# Page Quality Review

Page Quality Review is the publishing director layer between Text-Fit and Layout Approval.

```text
Page Plan
-> Text-Fit
-> Page Quality Review
-> Layout Approval
```

Text-Fit answers: **Can the content fit?**

Page Quality Review answers: **Is this a page we would be proud to publish?**

## Publishing Style

The first implemented style profile is `WILDLANDS_NATURAL_HISTORY`:

- premium natural history encyclopedia
- wilderness field guide
- expedition journal
- educational publishing
- cinematic naturalist presentation

The style profile defines editorial behavior, not artwork prompts:

- whitespace tolerance
- educational density
- visual density
- feature-page target
- mixed-page target
- text-first target
- layout rhythm principles

## Review Output

Every finding should be operator-actionable:

```text
Problem
Why it matters
Recommended fix
Expected result
Alternatives
```

Examples:

- Awkward continuation risk -> switch to a more text-capable layout, reduce art coverage, split into purposeful pages, or redistribute a subsection.
- Underfilled page -> switch to illustration-dominant/feature treatment, add a reference/comparison study, or merge with related material.
- Layout repetition -> promote one subject to a feature page, move dense pages to text-first layouts, or reserve mixed layouts for comparison/identification moments.

## Current Implementation

- Backend service: `backend/src/services/page-quality/page-quality-review.ts`
- API route: `POST /api/projects/:id/page-quality-review`
- Frontend panel: Page Plan Review -> Page Quality Review
- Tests: `backend/src/__tests__/page-quality-review.test.ts`

This first version is advisory. It does not silently rewrite page plans. The operator reviews recommendations before layout approval.
