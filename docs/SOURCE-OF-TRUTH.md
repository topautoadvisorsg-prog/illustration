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
| **Paperback geometry** | `publishing-standard/cover-dimensions.ts`, which derives every figure from `kdp-spec.ts` | None. Seventeen scripts carried their own factors; all now call the authority | delivery-check, cover-geometry, readiness, cover-spine-repair, the cover scripts | **Low** — one implementation; every factor carries its authority and retrieval date; unsupported configurations refuse rather than approximate | Achieved | **Resolved — Phase 1A/1B** |
| **Hardcover geometry** | `kdp-cover-specs.ts` `VERIFIED_SPECS` — nine measured Cover Calculator readings, fail-closed | None. All six scripts that carried their own case-wrap arithmetic now call the authority | Hardcover builders, `scripts/qa/cover-spec.ts`, `lib/cover-blueprint.ts` | **Low** — one owner. A hardcover case board is **larger than its trim**, and nothing derives a hardcover wrap from trim arithmetic any more | Achieved | **Resolved — Phase 1B** |
| **Spine typography** | `publishing-standard/spine-type.ts` (11 importers) | `stage-6-layout/cover-spine-typeset.ts` (3 importers); `cover/spine-band-repair.ts` (477 loc) vs `stage-6-layout/cover-spine-repair.ts` (248 loc), both live and different | Cover builders | **High** — two spine repairs and two typesetters | `publishing-standard/spine-type.ts`, single | **Yes** — Phase 1 |
| **Barcode-safe area** | `kdp-spec.ts` — the hardcover rectangle as `OFFICIAL_STATIC_RULE`, the paperback reserve as `HOUSE_POLICY` because Amazon publishes none | None | Cover validation, `scripts/qa/cover-spec.ts` | **Low** — a 2.0×1.2in rectangle stated once, never a full-width row test, and the two bindings do not share a definition | Achieved | **Resolved — Phase 1B** |
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

## Kept honest by a test, not by memory

This file went stale once: it described paperback geometry as UNRESOLVED after
that had been fixed, and pointed at a Track A module that no longer held the
logic. `backend/src/__tests__/source-of-truth-matrix.test.ts` now fails if

- the paperback row says UNRESOLVED while published formulas exist,
- a cover row names a module that does not exist, or names `render-html.ts`,
  which is a re-export shim rather than an authority, or
- any file outside the authority and its tests carries an executable cover-
  geometry constant.

That last check is the one with teeth: the matrix can only claim a single owner
while nothing else quietly recomputes the same numbers.
