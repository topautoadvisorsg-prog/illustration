# Local layout overrides — design

**Status:** designed, not built. Recorded so the book can keep moving.

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

The review grid already knows which blocks are on which page, so:

- a page carrying an overridden block gets a marker in the grid, like the
  existing `blank` / `overflow` flags;
- the enlarge modal lists that page's overridden blocks with their values and a
  **Reset to standard** button per block;
- a project-level list shows every override with its note, so a book cannot
  accumulate invisible local hacks.

Visibility is the point. An override nobody can see is a landmine for whoever
regenerates the book next.

## Smallest implementation path

**Phase 1 — identity + renderer (small).** `blockId` generation,
`layoutOverrides` on `ProjectConfig`, CSS emission, override-targets-missing-block
reporting in Layer 1. No UI; overrides settable via the config PATCH endpoint
that Book Setup already uses. This alone unblocks isolated fixes.

**Phase 2 — visibility (small).** Grid marker + modal list + reset button +
project-level list.

**Phase 3 — authoring (only if wanted).** Click a block in the preview to open
an override editor. Not required for the book; Phase 1 plus a config PATCH is
enough for an operator working with an agent.

## Deliberately out of scope

A general page-layout editor, per-page CSS, drag-to-adjust, or anything that can
change manuscript text. Each of those turns an escape hatch into a second,
unversioned layout system competing with the standard — which is the problem the
layout standard was built to solve.
