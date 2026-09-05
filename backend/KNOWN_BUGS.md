# Known platform bugs

## Per-page blueprint overrides were not being applied to opener pages

**Root cause:** In `prepareRender` (`src/pipeline/whole-page-render/render-whole-page.ts`)
the per-page composition override was read only from `pageOverride`:

```
const entryKey = pageRow.entryKey ?? pageRow.pageKey;
const pageOverride = pageRow.pageKey !== entryKey ? entryMeta.get(pageRow.pageKey) : undefined;
...
if (pageOverride?.imagePlacement) allocation.imagePlacement = pageOverride.imagePlacement;
if (pageOverride?.textPlacement) allocation.textPlacement = pageOverride.textPlacement;
```

For an entry-opener page, `pageRow.pageKey === entryKey`, so `pageOverride` is always
`undefined`. The page's own manifest instead loads as `meta`, whose `imagePlacement` /
`textPlacement` were never consulted. Result: opener pages could not be pinned to an
explicit blueprint at all.

**Affected code path:** `prepareRender` → `directLayout` (allocation) → `buildPageSpec`
→ `assemblePagePrompt`. Specifically the placement-override block in `prepareRender`.

**Symptoms:** Re-rendering an entry opener produced a composition that did NOT match the
approved render. Because no override could be applied, the re-render fell through to the
newer prompt-assembler behavior (rewritten in the post-2026-06-19 "standards" commits
12b711c / 96e856d / 35a9d24 / 39745ef). The composition PROSE was identical between
approved and drifted renders; the drift was the reading-field geometry narrowing
(approved ~5.88"x1.8" → re-render 4.9"x1.7") and the AI flipping the layout to
illustration-top / text-crammed-bottom instead of the approved subject-bottom / text-top.

**Fix applied:** extend the override so an opener (`pageRow.pageKey === entryKey`) also
reads placement from `meta`:

```
if (pageOverride?.imagePlacement) allocation.imagePlacement = pageOverride.imagePlacement;
else if (pageRow.pageKey === entryKey && meta?.imagePlacement) allocation.imagePlacement = meta.imagePlacement;
if (pageOverride?.textPlacement) allocation.textPlacement = pageOverride.textPlacement;
else if (pageRow.pageKey === entryKey && meta?.textPlacement) allocation.textPlacement = meta.textPlacement;
```

Additive — only fires when an opener has an explicit placement manifest set (via
`_setopenerscene.ts`). Default behavior for openers without an override is unchanged.

**Validation method:** `tsc --noEmit` clean. Set an explicit opener blueprint (subject
anchored bottom, title + text top) via `_setopenerscene.ts`, confirmed with `_inspect.ts`
that the override now appears in the composition contract (previously it did not), then
re-rendered and compared the output image against the approved render.

**Pages used to reproduce:** `CH02_P015` (barred owl, folio 55) and `CH02_P021`
(wood frog, folio 66). Both re-rendered against the corrected blueprint now match the
approved composition (title + text top, animal anchored bottom).

## FLAKY — `pagination.routes.guards.test.ts` fails only in the full suite

Two of its cases ("returns 409 when approved pages exist…", "proceeds past the
guard when mode is replace") fail intermittently under `vitest run`, and the
COUNT VARIES between runs — two failures, then one, then none. The same file
passes 7/7 in isolation.

Confirmed not caused by any recent change: reverting the change under suspicion
and re-running reproduced the failure anyway. It is shared state or worker
ordering inside the suite, not the code under test.

Do not chase this while investigating an unrelated change. Re-run the file on its
own; if it passes there, the full-suite failure is this.
