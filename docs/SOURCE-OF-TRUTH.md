# Source-of-truth matrix

One authority per production datum, or an explicit statement that there is none.

A datum with two authorities is not a style problem. It is how a book ends up
with a spine that does not match its interior, or an override that stops
applying without anyone being told. Where this document says **UNRESOLVED**, that
is a live defect with a phase attached, not a gap in the documentation.

**Conflict risk** is the chance the copies disagree *and* the disagreement
reaches a printed artifact.

---

## The matrix

| Datum | Current authority | Secondary copies | Consumers | Conflict risk | Target authority | Migration |
|---|---|---|---|---|---|---|
| **Manuscript text** | `projects.canonical_manuscript_path` + `canonical_manuscript_sha256` (migration 0015) — the operator's exact uploaded bytes | The sanitized working copy in the same row; loose `LAYOUT-*.md` files on disk per book | Ingest, typeset, EPUB, fidelity checks | **Medium** — re-uploading a restored textarea stores the derivative as canonical, and the hash then proves the wrong thing | Unchanged | No |
| **Metadata** (title, subtitle, author, imprint, ISBN) | `ProjectConfig` in Postgres | Hardcoded constants in per-book cover scripts; painted into cover artwork by the image model | Interior front matter, cover, EPUB, manifest | **High** — an author name lives in config, in script literals, and in pixels | `ProjectConfig`, with cover type set from it | **Yes** — Phase 1 |
| **Project / book id** | `PROJECT_ID` in the repo-root `.env`, read by `scripts/_project.ts` | None. It refuses to default to a hardcoded book. | 117 operator scripts | **Low** | Unchanged; relocate to `scripts/lib/project.ts` | Path move only |
| **Book configuration** | `ProjectConfig` (Zod, `shared/src/index.ts`) | CLI flags and env overrides in book scripts (`NP_WRAP_W`, `NP_SPINE`) | Every pipeline stage | **Medium** | `ProjectConfig`; forbid geometry env overrides | **Yes** — Phase 1 |
| **Trim size** | `ProjectConfig.trimSize` | Re-declared as literals in most cover scripts | Pagination, typeset, cover geometry | **Medium** | `ProjectConfig` | **Yes** — Phase 1 |
| **Paper stock** | `ProjectConfig.paperStock` | `PAGE_THICKNESS_IN` in `stage-6-layout/render-html.ts`; literals in `cover-preflight.ts`; `PER_PAGE = 0.002347` default in `print-prep/paperback-preview.ts` | Spine width, wrap width | **High** — `paperback-preview.ts` defaults to Premium Color regardless of what the book is printed on | `ProjectConfig`, consumed by one geometry module | **Yes** — Phase 1 |
| **Page count** | The final interior PDF | Typed into scripts; passed via env vars; stored as `builtForPageCount` on a cover entry | Spine, both wraps, Kindle crop, delivery check | **High** — a typed page count cannot be wrong loudly | The interior PDF, **read at build time**; forbid it as an argument | **Yes** — Phase 1 |
| **Interior PDF** | The shipped file in the delivery folder | Build outputs in `_np_build/` and similar scratch directories | Cover, Kindle crop, QA, manifest | **Medium** — the build is **not byte-reproducible**, so a log hash is not the artifact's hash | Unchanged; hash the shipped file, never a log | No |
| **Illustrations (assets)** | Asset keys, immutable once rendered; R2 is the store | Supabase read fallback for pre-migration objects; local copies in scratch folders | Stamping, EPUB, covers | **Low** | Unchanged | No |
| **Illustration placement** | The plate's anchor: a stable block id plus `pageOffset` | Page numbers written into one-off scripts | `stamp-illustrations.ts` | **Low** — the stamper refuses to draw a stale anchor rather than clipping it | Unchanged | No |
| **Fonts** | Vendored faces in `backend/assets/fonts`, embedded at render | System fonts if a family list drifts between the three files that name it | Typeset, cover type, EPUB | **Medium** — a silent fallback is invisible until the proof | Vendored only; assert embedding in CI | **Yes** — Phase 3 |
| **Cover artwork** | The approved image file, referenced by hash | Per-book copies under many names in build folders | Wrap builder, Kindle crop | **Medium** — "approved" has been ambiguous between two similar paintings | Approved asset recorded on the project, identified by hash | **Yes** — Phase 1 |
| **Paperback geometry** | **UNRESOLVED.** In practice `computeCoverDimensions` in `stage-6-layout/render-html.ts` — a Track A module | `kdp-cover-specs.ts` (**hardcover readings only**); literals in `cover-preflight.ts`; `paperback-preview.ts`; per-book script constants | delivery-check, cover-geometry, readiness, cover-spine-repair, 18 cover scripts | **HIGH** — five implementations, three per-page numbers, **zero verified paperback readings** | New `publishing-standard/cover-geometry-authority.ts`, resolving verified reading → validated formula → refuse | **Yes** — Phase 1 |
| **Hardcover geometry** | `kdp-cover-specs.ts` `VERIFIED_SPECS` — four measured readings, fail-closed | 11 hardcover scripts with their own arithmetic | Hardcover builders | **Medium** — the authority is correct but most callers bypass it | Same module as paperback, with a format discriminator | **Yes** — Phase 1 |
| **Spine typography** | `publishing-standard/spine-type.ts` (11 importers) | `stage-6-layout/cover-spine-typeset.ts` (3 importers); `cover/spine-band-repair.ts` (477 loc) vs `stage-6-layout/cover-spine-repair.ts` (248 loc), both live and different | Cover builders | **High** — two spine repairs and two typesetters | `publishing-standard/spine-type.ts`, single | **Yes** — Phase 1 |
| **Barcode-safe area** | Reimplemented per cover script | — | Cover validation | **High** — at least one implementation tested a full-width row band instead of KDP's 2.0×1.2in rectangle and condemned a valid cover | One geometry module; a rectangle, not a row test | **Yes** — Phase 1 |
| **EPUB content** | `stage-8-epub/` reading the typeset content | The shipped `.epub`, whose internal `OEBPS/cover.jpeg` can go stale independently of the delivery folder | Kindle upload | **Medium** — a stale cover sealed inside a zip is invisible from the folder | Unchanged; assert the internal cover against the marketing cover | **Yes** — Phase 3 |
| **Final artifact manifest** | The per-book `KDP-UPLOAD-MANIFEST.md` | The same four hashes duplicated inside `national-parks-package-check-3.ts` | Upload, package check | **Medium** — two files that must be edited in lockstep | Generated from the shipped files | **Yes** — Phase 5 |

---

## Resolved, and worth protecting

Four data have exactly one authority today, and each is that way because someone
made it so deliberately. Do not let them drift back.

| Datum | Why it holds |
|---|---|
| **Layout standard** | `typeset/layout-standards/registry.ts`. Versioned ids, pinned per project, resolver throws on an unknown id, and there is deliberately no "latest". This is the model the cover module should copy. |
| **Per-block layout exceptions** | `ProjectConfig.layoutOverrides`. Closed property schema, keyed by block id, and an unmatched override is **reported rather than dropped**. One caveat: `scripts/national-parks-layout-overrides.ts` MERGES, so deleting a line there does not delete the override — the API is the authority, not the script. |
| **Project id** | `scripts/_project.ts` fails loudly rather than defaulting to a book. |
| **Illustration anchoring** | Block id plus `pageOffset`, never a page number. |

---

## The two rules behind the whole matrix

1. **A derived value is never stored beside the thing it derives from.** Page
   count derives from the interior PDF; spine derives from page count and paper.
   Every place one of those is *stored* instead of *read* is a row in this table
   with a High conflict risk.

2. **A value that must be measured is refused, not guessed.** `kdp-cover-specs.ts`
   declines to interpolate a spine it has no reading for, and that has already
   prevented a guessed hardcover. Extend the readings; never relax the rule.
