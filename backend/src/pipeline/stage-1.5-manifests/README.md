# Stage 1.5 - Manifest Generation

## Status

Implemented foundation.

## What It Does

Reads the stored manuscript, sends it to Claude with the deterministic Stage 1
outline, validates Claude's returned structure against that outline, and writes
locked book/chapter/page manifests.

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

## Claude Behavior

- Tool-calling only
- Strict Zod validation
- Temperature controlled in Claude service
- Claude may enrich fields, but may not change chapter/entry structure

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
| Claude context failure | Manuscript too large | Next improvement: one Claude call per chapter |

## Known Gaps

- Large manuscripts are still sent in one Claude call.
- Manifest version groups are not implemented.
- Warnings/category fields need stronger preservation for safety-critical pages.
