# Stage 1.5 - Manifest Generation

## Status

Implemented foundation.

## What It Does

Reads the stored manuscript, parses the deterministic Stage 1 outline, infers
page metadata locally, validates the generated structure against that outline,
and writes locked book/chapter/page manifests. This stage does not spend LLM or
image budget.

Implemented file:

- `generate-manifests.ts`

## Inputs

- Project ID
- Stored manuscript path from Stage 1
- Project config
- Deterministic manuscript outline

## Outputs

- Locked `BOOK` manifest
- Locked `CHAPTER` manifests
- Locked `PAGE` manifests
- `pages` rows linked to PAGE manifests through `pages.manifest_id`
- Project status: `MANIFESTED`

## API

```bash
curl -X POST http://localhost:8001/api/projects/{id}/manifests
```

Important: this endpoint reads the stored manuscript file. It does not accept
inline Markdown anymore, because inline text could drift from the uploaded
manuscript SHA.

## Deterministic Behavior

- Strict Zod validation
- Exact chapter/entry preservation from the manuscript parser
- Local inference for scientific name, category, content type, layout template,
  and image subject
- No full-manuscript model call, so large master files should not hang

Validation currently checks:

- chapter count
- chapter number
- chapter title
- entry count
- entry title

## Manifest Persistence Rules

- Existing manifests/pages are not deleted.
- Reruns are blocked until explicit manifest versioning exists.
- Manifests are written with `locked: true`.
- Every page row must reference a PAGE manifest.

## Debugging

| Symptom | Cause | Fix |
|---|---|---|
| `MANIFEST_OUTLINE_MISMATCH` | Claude changed structure | Inspect manuscript headings and Claude output |
| `Stored manuscript file is missing` | Railway/local storage lost file | Re-upload manuscript |
| `already has manifests/pages` | Rerun blocked | Create new project or implement versioned rerun |
| Breakdown hangs on a large master file | Old deployment still using full-manuscript Claude call | Deploy the deterministic manifest generator |

## Known Gaps

- Manifest version groups are not implemented.
- Warnings/category fields need stronger preservation for safety-critical pages.
