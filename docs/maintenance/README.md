# Maintenance inventory

Machine-generated inventories of the operator script surface. These are
**maintenance infrastructure, not a one-time report** — regenerate them whenever
`backend/scripts/` changes materially, and use them to decide dispositions
rather than deciding by filename.

| File | Rows | What it covers |
|---|---|---|
| `script-census.tsv` | 310 | Every tracked script in `backend/scripts/` |
| `unknown-review.tsv` | 68 | The scripts the census could not classify, reviewed individually |
| `scratch-inventory.tsv` | 431 | Every file in the untracked `backend/scripts/_scratch/` workbench |

## How the census was built

Import edges are **resolved specifiers**, not filename matches: every relative
`import`/`from` in `backend/src`, `backend/scripts` and `shared/src` is resolved
against the real file list, including `.js` → `.ts` rewriting. An earlier
filename-based pass produced two false positives and both were wrong in a way
that would have caused damage, so this distinction matters.

## Columns

| Column | Meaning |
|---|---|
| `class` | PLATFORM / BOOK-CLASS / BOOK-SPECIFIC / MIGRATION / QA-DIAGNOSTIC / SCRATCH / LEGACY / UNKNOWN |
| `owner` | The book it belongs to, `platform`, `multi-book`, or `unassigned` |
| `safety` | SAFE-READONLY / WRITES-FILES / MUTATES-STATE / SPENDS / MUTATES+SPENDS / **DESTRUCTIVE** |
| `destructive` | Removes persistent state: `db.delete(...)`, an object-store delete, `DROP TABLE`, `TRUNCATE`, or a `--repaginate` path |
| `importers` | Count of files that actually import it |
| `in_package_json` / `in_ci` | Whether anything invokes it |
| `proposed_home` | Where it should live after relocation |
| `disposition` | KEEP / PROMOTE / RELOCATE / ARCHIVE / REVIEW |

`WRITES-FILES` means it writes to disk only. Temp-directory cleanup after
`mkdtempSync` is **not** counted as destructive — an earlier revision of this
generator did count it and mislabelled `pdf-page-proof.ts`, a read-only QA tool,
as destructive.

## Safety distribution, all 310 tracked scripts

| Safety | Count |
|---|---|
| SAFE-READONLY | 133 |
| MUTATES-STATE | 75 |
| WRITES-FILES | 63 |
| SPENDS | 24 |
| MUTATES+SPENDS | 13 |
| **DESTRUCTIVE** | **2** |

## The two rules this inventory exists to enforce

### 1. The underscore prefix is not a safety signal

It is treated as one by eye, and it is wrong in both directions.

- `_project.ts` is underscore-prefixed and is the **most-imported module in the
  toolchain** — 117 scripts depend on it for the active `PROJECT_ID`, and it
  deliberately refuses to default to a hardcoded book. Archiving it as "scratch"
  breaks 117 operator tools at once.
- `_buildbook.ts` is underscore-prefixed and is one of only two **DESTRUCTIVE**
  scripts in the tree. It runs `db.delete(wholePageRenders)` and
  `db.delete(pages)` scoped by project id.

A sweep that trusted the prefix would have archived a shared library and quietly
kept a row-deleter.

### 2. "Nothing imports it" is not evidence of death

288 of 310 scripts have no caller of any kind, because operator tools are
invoked directly by a human at a terminal. That is the design, not a defect.
Disposition needs the `safety`, `owner` and `disposition` columns together.

## The two destructive scripts

| Script | Class | What it removes |
|---|---|---|
| `_buildbook.ts` | SCRATCH | `wholePageRenders` and `pages` rows for a project id |
| `r2-cleanup-stray-project.ts` | UNKNOWN | Objects from the R2 bucket via `DeleteObjectCommand` |

Neither may be archived, relocated or wrapped without an explicit decision. Both
should carry a confirmation guard before anything else happens to them.

## Regenerating

The generators are not yet checked in — they ran from a scratch directory during
Phase 0A/0B. Promoting them into `backend/scripts/qa/` is a Phase 3 task, at
which point this inventory becomes a CI artifact rather than a manual one.
