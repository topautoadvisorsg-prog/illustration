# Track A — legacy and dormant

**Status: LEGACY / DORMANT. Preserved, not deleted. Not extended.**

Product-owner ruling, 2026-08-26:

- do not delete Track A;
- do not extend Track A with new features;
- do not move new books onto Track A;
- extract still-authoritative shared logic out of it first;
- retire it only after equivalence and regression proof.

> **No live dependency may remain hidden inside a legacy track.**
> This document exists so that nothing does.

---

## What Track A is

The original render model: whole pages produced as AI artwork with text-safe
zones, rather than typeset text. It made the earlier Wildlands illustrated
volumes. No book shipped on it in the last three months.

| Piece | Path | Files |
|---|---|---|
| Render model | `backend/src/pipeline/whole-page-render/` | 11 |
| Renderer and layout | `backend/src/pipeline/stage-6-layout/` | 13 |
| Its own specs | `whole-page-render/SPEC.md`, `SPEC_PRODUCTIONIZE.md` | 2 |

---

## What still depends on it, exactly

Track A's renderer is more imported than Track B's — `render-html.ts` has 38
importers, `render-whole-page.ts` 32. That number is misleading, and the precise
figure is what matters: **every consumer outside Track A takes one of only four
symbols.**

| Exported symbol | Non-Track-A consumers |
|---|---|
| `computeCoverDimensions` | `book-assembly/delivery-check.ts`, `cover/cover-geometry.ts`, `readiness/audit-readiness.ts`, `stage-6-layout/cover-spine-repair.ts`, and three tests |
| `COVER_BLEED_IN` | `cover/cover-geometry.ts`, `cover-spine-repair.ts` |
| `CoverDimensions` (type) | `print-prep/cover-print.ts`, one test |
| `coverAllowsSpineText` | `cover/cover-spec.ts` |
| `PAGE_THICKNESS_IN` | Module-private, but it is the value **every shipped paperback spine came from** |

Everything else in that 874-line module — `buildBookHtml`, `buildCoverHtml`,
`buildPageHtml`, `buildChapterHtml` — is used only by Track A itself and Track A's
tests.

**So the extraction is four symbols and one constant table.** It is mechanical,
provable by typecheck, and it is the first half of Phase 1.

---

## Why the cover geometry ended up here

`computeCoverDimensions` is nine lines: trim, plus a spine of
`max(0.06, pageCount × PAGE_THICKNESS_IN[paperStock])`, plus bleed. It was
written where it was first needed — inside the HTML renderer that drew the cover —
and every later subsystem imported it from there rather than moving it.

That is how a legacy module becomes load-bearing: not by being good, by being
first.

---

## Retirement conditions

Track A may be retired when **all** of these hold. Not before.

1. The four symbols and `PAGE_THICKNESS_IN` live in
   `publishing-standard/cover-geometry-authority.ts`, and `render-html.ts`
   imports them rather than defining them.
2. Every non-Track-A consumer imports from the new module. Verified by resolved
   specifiers, not by search-and-replace.
3. The new module reproduces the geometry of **every shipped book**, or explains
   the difference. See `COVERS-AND-SPINES.md`.
4. The duplicated spine work is resolved: one spine repair, not
   `cover/spine-band-repair.ts` (477 loc) *and*
   `stage-6-layout/cover-spine-repair.ts` (248 loc); one spine typesetter, not
   `publishing-standard/spine-type.ts` *and*
   `stage-6-layout/cover-spine-typeset.ts`.
5. No route reaches a Track A renderer. Today `books`, `pagination`, `projects`
   and `whole-page` routes all still can.
6. The fixture book builds green without Track A in the graph.

---

## Until then

- **Bugs in Track A are not fixed**, unless they block a shipped book.
- **New books go to Track B.** There is no supported path onto Track A.
- **Do not "clean up" `stage-6-layout/`** before condition 1. It holds the cover
  geometry the whole platform runs on.

---

## Historical documents

These describe Track A and were, at various times, presented as current. They are
in `docs/archive/` and are kept for the reasoning in them, not as instructions:

- `RENDER_MODEL.md` — full-page artwork and text-safe zones. Was named by the old
  `docs/README.md` as "how the system actually works today". It is Track A.
- `whole-page-render/SPEC.md` and `SPEC_PRODUCTIONIZE.md`
- `LEGACY_DRIFT_AUDIT.md`
- `LAYERED_LAYOUT.md`, `LAYOUT_ALLOCATION_MAP.md`, `PUBLISHING_DIRECTION.md`
