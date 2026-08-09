# Local layout overrides

**Status:** BUILT and operator-facing (commit `0367756`). Phases 1 and 2 shipped
together: an override only a developer can set is not a fix for the operator, it
is a config mutation with extra steps.

| Piece | Where |
|---|---|
| Block identity | `backend/src/pipeline/typeset/block-identity.ts` |
| Override → CSS | `backend/src/pipeline/typeset/layout-overrides.ts` |
| Storage | `LayoutOverrideSchema`, `ProjectConfig.layoutOverrides` (shared) |
| API | `PUT` / `DELETE /api/projects/:id/layout-overrides/:blockId` |
| Block-to-page map | `TypesetReport.pageBlocks`, measured after Paged.js finishes |
| Operator UI | Typeset preview: grid marker, per-page block list, project-level panel |
| Tests | `backend/src/__tests__/layout-overrides.test.ts` (18) |

## The problem

Two kinds of layout defect keep turning up, and only one of them has a home:

| Kind | Example | Correct fix |
|---|---|---|
| Systemic | folios flush left on every page; `SEE A DOCTOR IF` never boxed | change `educational-nonfiction-typeset@1` |
| Isolated | *this* chapter ending looks thin; *this* callout wants tighter spacing | **no mechanism today** |

Without the second, every one-page problem is a choice between editing a frozen
manuscript, changing the global standard for the whole book class, or shipping
the page as-is. All three are wrong. Findings 12 and the sparse chapter endings
are exactly this shape.

## The rule

```
systemic defect  -> fix the reusable layout standard
isolated defect  -> local override
manuscript       -> frozen, always
```

## What an override may NOT be keyed to

**Not the page number.** Pagination has moved four times in this session alone
(153 → 157 → 159), and every move would silently re-point every override at the
wrong content. A page number is a rendering result, not an identity.

## Stable block identity

Key overrides to **content identity**, derived from the manuscript and stable
across pagination, layout-standard edits, and re-renders:

```
blockId = sha1(sectionSlug + ':' + blockKind + ':' + normalisedFirstText).slice(0, 8)
```

- `sectionSlug` — from the section title, not its index (an index shifts if a
  section is added).
- `blockKind` — `p` | `h3` | `h4` | `ul` | `ol` | `callout` | `alert-panel` |
  `takeaway` | `scene-break`.
- `normalisedFirstText` — first ~60 chars, alphanumerics only, lowercased. The
  same normalisation Layer 1 already uses for text fidelity.

This id changes only if the manuscript text changes — and the manuscript is
frozen, so in practice it never changes. It survives every layout change.

## Storage

```ts
// ProjectConfig
layoutOverrides: Record<string /* blockId */, LayoutOverride>

interface LayoutOverride {
  marginTopEm?: number;
  marginBottomEm?: number;
  keepWithNext?: boolean;     // break-after: avoid
  keepTogether?: boolean;     // break-inside: avoid
  breakBefore?: 'auto' | 'page' | 'avoid';
  breakAfter?: 'auto' | 'page' | 'avoid';
  variant?: string;           // component variant, e.g. 'compact'
  note?: string;              // why, for the next reviewer
}
```

Per-project, so it travels with the book and never touches the standard. A
closed set of properties on purpose: this is a layout escape hatch, not a
stylesheet. Anything needed repeatedly is evidence of a systemic gap and belongs
in the standard instead.

## Renderer

1. `bodyToHtml` already emits every block; add `data-block-id` to each.
2. After the standard's CSS, emit one rule per override:
   `[data-block-id="a1b2c3d4"] { margin-top: 0.4em; break-inside: avoid; }`

Overrides come last, so they win by source order without `!important`, and the
standard stays readable. An override for a block that no longer exists is inert
and reported rather than silently dropped.

## Operator UI

Visibility is the point. An override nobody can see is a landmine for whoever
regenerates the book next: they change the standard trying to fix a page that is
already deliberately different, and nothing explains why.

- a page carrying a customised block is marked and outlined in the grid,
  alongside the existing `blank` / `overflow` flags;
- the enlarged page lists every block on it with an editor and **Reset to
  standard**;
- a project-level panel lists all exceptions with their reasons, and names any
  override pointing at content no longer in the book.

## What shipped

**Identity + renderer.** `blockId` generation, `layoutOverrides` on
`ProjectConfig`, CSS emitted last in the stylesheet so overrides win by source
order without `!important`, and orphaned-override reporting.

**Visibility and authoring.** The review grid marks and outlines any page
carrying a customised block. Enlarging a page lists the blocks that landed on it
— kind, opening text, block id — each with an editor for the closed property set
and **Reset to standard**. A project-level panel lists every exception with its
reason, so a book cannot accumulate invisible local hacks.

The per-page block list is driven by `TypesetReport.pageBlocks`, which is
**measured** in the browser after Paged.js reports completion. Where a block
lands is a pagination result and must never be predicted — the same reason an
override is not keyed to a page in the first place.

### Two guarantees worth keeping

1. **Nothing is keyed to a page number.** The page is only how the operator
   *finds* a block; what gets stored is the block's content-derived id. A test
   asserts no emitted rule can select a page.
2. **No arbitrary CSS, no text editing.** Every control maps to one bounded
   property the schema validates. The schema rejects an unknown key, an unknown
   variant, and an out-of-range value, and a note cannot close the CSS comment it
   lands in and escape into live declarations.

## Deliberately out of scope

A general page-layout editor, per-page CSS, drag-to-adjust, or anything that can
change manuscript text. Each of those turns an escape hatch into a second,
unversioned layout system competing with the standard — which is the problem the
layout standard was built to solve.
