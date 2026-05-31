# Stage 1 - Manuscript Ingestion

## Status

Implemented foundation.

## What It Does

Accepts a Markdown manuscript, verifies it has usable book structure, stores the
canonical copy, and returns deterministic outline statistics before Claude is
allowed to enrich anything.

Implemented files:

- `ingest-manuscript.ts`
- `parse-manuscript-outline.ts`

## Inputs

- `projectId`
- `.md` filename
- Markdown text

Expected manuscript structure:

```markdown
# CHAPTER 1 - Forest Floor

## Chanterelle

### Identification
...
```

## Outputs

- Stored manuscript file
- SHA-256 hash
- Chapter count
- Entry count
- Total word count
- Structural warnings
- Deterministic outline:
  - chapters
  - entries
  - sections
  - slugs
  - source lines
  - source offsets
  - entry body word counts

## How To Run

Via API:

```bash
curl -X POST http://localhost:8001/api/projects/{id}/manuscript \
  -H "Content-Type: application/json" \
  -d '{"filename":"book.md","markdown":"# CHAPTER 1 - Forest Floor\n\n## Chanterelle\n\nText"}'
```

Via tests:

```bash
yarn workspace @wildlands/backend test -- ingest-manuscript
yarn workspace @wildlands/backend test -- parse-manuscript-outline
```

## Debugging

| Symptom | Cause | Fix |
|---|---|---|
| `NO_CHAPTERS_DETECTED` | Missing `#` chapter heading | Add level-1 chapter headings |
| `NO_ENTRIES_DETECTED` | Missing `##` entry headings | Add level-2 entry headings |
| `Manuscript must be a .md file` | Wrong filename extension | Upload `.md` |
| Headings inside examples counted | Fenced code bug | Parser now ignores fenced code blocks |

## Notes

- Stage 1 never rewrites manuscript prose.
- Stage 1 is deterministic and should remain deterministic.
- Claude is not the source of truth for chapter/entry structure.
