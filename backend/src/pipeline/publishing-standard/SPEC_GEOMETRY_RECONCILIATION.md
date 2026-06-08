# SPEC — Geometry Reconciliation (trim + drop-cap + blueprint auditability)

**Status:** draft — awaiting operator sign-off. No code until approved.
**Origin:** the forensic audit (multi-render). Proven facts it rests on:
- 8/8 renders compose for **7×10**; print-prep/assembly use **8.75×11.25**.
- Trim is defined in TWO places: `ProjectConfigSchema` default `{7,10}`
  (shared/index.ts:457) and the Standard `SPACING` `{8.5×11 / 8.75×11.25}`.
- 8/8 specs have `dropCap: null`; 4/4 page types still render a drop-cap,
  because `typographyDNA.decorativeInitial` is emitted on every page.
- The reading-field region IS computed per-layout and IS honored — NOT broken.
- The whole-page render discards its blueprint PNG (no per-render audit trail).

**Priority (operator-set):** 1) trim single-source-of-truth · 2) drop-cap
governance · 3) re-evaluate body-size AFTER trim is corrected.

**Scope guard:** this SPEC does NOT change body-size enforcement, pagination
thresholds, overflow handling, or the reading-field regions. Those are
re-evaluated *after* trim is correct (§5 verification informs them).

---

## 0. The box model (the mental model all geometry must reflect)

```
OUTER BLEED CANVAS  — 8.75×11.25 (trim + 2×bleed). The full exported, print-ready
   ↓                  page. Background parchment / full-bleed art may extend here.
INNER TRIM BOX      — 8.5×11. The actual book page. Everything the reader must see
   ↓                  lives inside this. No important content depends on bleed.
SAFE CONTENT ZONES  — trim inset by margins / KDP safe zone.
   ↓
TEXT / IMAGE / BADGES / FOLIO  — all positioned inside the safe zones.
```

Resolver ownership:
- `resolveGeometry().canvasIn` = OUTER BLEED CANVAS (derived: trim + 2×bleed).
- `resolveGeometry().trimSize` = INNER TRIM BOX.
- The render spec hands the model `trim + bleed`; print-prep composes the canvas.
- **Content frame derives from the TRIM box, never the bleed page**
  (`page-geometry.ts`: `textWidthIn = trim − margins`). Deriving it from
  `trim + bleed` inflated the safe area by the bleed — that was the model
  violation, now fixed. `pageWidthIn/pageHeightIn` remain the legacy bound-page
  print box (HTML/PDF size only); they are NOT the content box.

---

## 1. Trim ownership — single source of truth

**Principle:** the Publishing Standard owns trim / bleed / canvas / DPI. Every
stage derives geometry from ONE resolver; render and print-prep can never use
different trims.

### 1.1 The Standard owns the tokens + the canonical default
In `standard.ts` (Rule Zero — one definition):
```
SPACING.bleedIn      = 0.125
SPACING.printDpi     = 300
SPACING.defaultTrimIn = { w: 8.5, h: 11 }     // the canonical default
SUPPORTED_TRIMS       = [ {6,9}, {7,10}, {8.5,11}, … ]  // the allowed set
```
**Canvas is DERIVED, never a separate constant:** `canvas = trim + 2×bleed`.
(Today `SPACING.canvasIn = {8.75,11.25}` is a hardcoded duplicate of
`trim + bleed` — it becomes a derivation, killing the drift.)

### 1.2 One resolver, called by everyone
```
resolveGeometry(projectConfig) → { trimIn, bleedIn, canvasIn, dpi }
  - if projectConfig has a supported explicit trim → use it
  - if no trim                                     → SPACING.defaultTrimIn
  - if an UNSUPPORTED explicit trim                → throw (see §2)
  - canvasIn = { w: trim.w + 2*bleed, h: trim.h + 2*bleed }
```
Every consumer switches to this resolver:
| Stage | Today | After |
|---|---|---|
| Pagination capacity | `config.trimSize` (paginate.ts:100) | `resolveGeometry(config).trimIn` |
| Page-spec geometry | `computePageGeometry(config.trimSize)` (build-page-spec:149) | `resolveGeometry(config)` |
| Blueprint pixel size | `pickSize(geometry.trim…)` | from the same resolved trim |
| Print-prep canvas | `SPACING.canvasIn` (print-prep:64) | `resolveGeometry(config).canvasIn` |
| Assembly page size | `SPACING.canvasIn` | `resolveGeometry(config).canvasIn` |

After this, **the whole pipeline shares one trim.** The render↔print-prep break
is gone.

### 1.3 The schema default changes
`TrimSizeSchema.default({7,10})` (shared/index.ts:457) → **remove the silent
7×10 default.** A missing trim resolves to `SPACING.defaultTrimIn` (8.5×11) at
resolve-time, not via a schema default that silently bakes 7×10 into configs.

---

## 2. Backward compatibility — no silent mismatch, ever

- **Explicit + supported trim** → respected through the ENTIRE pipeline
  (pagination, render, blueprint, print-prep, assembly all use it; print-prep
  canvas = that trim + bleed, NOT a hardcoded 8.75×11.25).
- **Explicit + unsupported trim** → **block with a clear error** at the earliest
  stage ("trim 5×8 is not a supported size"), never silently render.
- **No explicit trim** → resolves to the Standard default (8.5×11).
- **The migration nuance (must be handled deliberately):** projects created
  under the OLD `{7,10}` schema default have `7×10` *baked into stored config*,
  indistinguishable from a deliberate 7×10 choice. The resolver would treat them
  as "explicit 7×10." For the current test project (`9e46…`), which never
  deliberately chose 7×10, the correct action is a **one-time data correction**:
  set its config trim to the Standard default (8.5×11). The SPEC must decide the
  general rule — see Open Question Q1.
- **Hard invariant (test-enforced):** render trim == print-prep trim == assembly
  trim for any given project. A test asserts they cannot diverge.

---

## 3. Drop-cap governance — `dropCap` becomes authoritative

**Root cause (proven):** `typographyDNA.decorativeInitial` (the drop-cap wreath
description) is in the prompt on every page, so the model draws a drop-cap even
when `pageText.dropCap = null`.

**Fix:**
- The prompt emits drop-cap language **only when `pageText.dropCap` is non-null.**
  - When `dropCap` is set: include the `decorativeInitial` description + the
    drop-cap hard-constraint line, naming the exact letter and the ~3-line region.
  - When `dropCap` is null: **emit NOTHING about drop-caps** — neither
    `decorativeInitial` in the typography block nor the hard constraint.
- `decorativeInitial` moves out of the always-on `typographyDNA` block and
  becomes a conditional element keyed on `dropCap`.
- Only page types that explicitly set `dropCap` (today: CHAPTER_OPENER) receive
  it. Continuation/interior pages get none.
- (When drop-caps DO render later, the reserved-region work happens then — out of
  scope here; this SPEC only makes the on/off control authoritative.)

---

## 4. Blueprint auditability — stop discarding the layout

The whole-page render builds `blueprintPng` and throws it away. Save it, so every
render's package is complete and reproducible.
- `executeRender` writes the blueprint to
  `experimental/whole-page/<base>.blueprint.png` (alongside the existing
  `.png` / `.json` / `.prompt.txt`).
- Add `blueprintPath` to `whole_page_renders` (additive nullable column).
- The render package is then: **spec JSON + prompt + blueprint + output image** —
  retrievable for any render via the existing file route.

---

## 5. Verification (after implementation — defines the body-size re-eval)

1. **Re-paginate** the project.
2. **Geometry consistency:** assert trim = 8.5×11 and canvas = 8.75×11.25
   everywhere — pagination capacity, page-spec, blueprint, print-prep, assembly —
   via the resolver (a test + a live spec check).
3. **Capacity on the right trim:** confirm pagination fit-status is recomputed on
   8.5×11 (the OVERFLOW/TIGHT counts will change — this is the input to the
   *later* body-size decision, NOT fixed here).
4. **Small test batch** (one each): image-top · image-right · pure-text ·
   continuation.
5. **Confirm:**
   - geometry is 8.5×11 / 8.75×11.25 in every spec.
   - **no unwanted drop-caps** (interior/continuation pages render none).
   - blueprint stored + retrievable for each render.
   - **no text compression attributable to the trim mismatch** (re-judge density
     on the correct trim — this tells us whether a body-size floor is still
     needed).
   - **no false chapter/title embellishment** — NOTE: the "CHAPTER I" invention
     is a *separate* model-embellishment finding, not directly fixed here. We
     VERIFY whether the cleaner prompt (no stray drop-cap language) reduces it;
     if it persists, it becomes its own follow-up (§ Open Question Q3).

---

## Open questions for operator

1. **Migration of the current project's baked-in 7×10.** Treat any project whose
   stored trim equals the old `{7,10}` default as "inherited, not chosen" and
   migrate to the Standard default? Or just correct the one test project
   (`9e46…`) by hand and require explicit trim going forward? (Rec: correct the
   test project to 8.5×11 now; new projects require an explicit supported trim or
   inherit the Standard default — no more silent 7×10.)
2. **Standard trim vs multi-trim future.** v1 makes the Standard own ONE default
   trim (8.5×11) + a supported set. When per-publisher Standards land, trim moves
   into the Standard *instance*. OK to keep it a single global default for now?
3. **The "CHAPTER I" embellishment.** Out of scope for this SPEC (it's model
   behavior, not geometry). Confirm we treat it as a *separate* finding to fix
   later if it survives the prompt cleanup — yes/no?
4. **Blueprint column.** Additive `blueprintPath` migration (0005) — confirm OK,
   or store the blueprint path inside an existing field to avoid a migration.

---

## What this SPEC deliberately does NOT do
- No body-size floor, no pagination-threshold change, no overflow-split, no
  reading-field rework. Those are decided *after* §5 verification, on the correct
  trim. (Building them now would be on the wrong foundation — the whole point of
  the forensic pause.)
