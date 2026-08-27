# Correcting a frozen book

**A one-line edit stays a one-line edit until evidence says otherwise.**

```
edit  ->  targeted rebuild  ->  regression check  ->  deliver
```

Not: edit → whole-book audit → platform investigation → new tooling → another audit.

---

## The measurement that reframes this

Correcting two sentences in NO ONE TOLD ME THAT took roughly ten full book builds
and four bespoke scripts. The natural assumption is that builds are expensive.
They are not:

| Operation | Measured |
|---|---|
| Full 170-page build, 11 stamped illustrations | **19.6 s** |
| Parsing a finished 10.8 MB PDF into a page model | **0.9 s** |
| Ten builds | ~3 minutes of compute |

Compute was never the bottleneck. The cost was **a new script per step**, each
re-implementing the same plumbing and each with a fresh chance to be wrong in it,
plus **facts re-derived by experiment** because nothing read back what the freeze
record already knew.

So the fast path is not about doing less checking. It is about not rediscovering
what is already written down, and not writing a new tool to ask a question an
existing one answers.

---

## The commands

```bash
tsx scripts/qa/book.ts recipe    --project <id>
```

What this book was frozen from: standard, profile, build options, manuscript
hash, config hash, renderer fingerprint, illustration manifest. Plus whether the
recipe is still **intact** — meaning a rebuild would reproduce the freeze. Runs
in about three seconds and builds nothing.

```bash
tsx scripts/qa/book.ts reproduce --project <id>
```

Rebuild from the recorded recipe and prove it still matches the frozen artifact,
page for page. One build.

```bash
tsx scripts/qa/book.ts correct --project <id> --corrections fixes.json [--pages 64,77] [--confirm] [--as name.md]
```

The fast path. Dry run by default, and the dry run is genuinely read-only: the
build runs off an in-memory manuscript override, so nothing in the project is
touched until `--confirm`.

```json
[
  {
    "id": "p64-false-cross-reference",
    "expect": "Read the box below for what isn't.",
    "replace": "The next page covers what isn't.",
    "reason": "The panel it points at is on p65, not below it."
  }
]
```

`expect` must match **exactly once**. Zero means the text already changed and the
patch is stale. More than one means the edit is ambiguous. Both stop the run
rather than applying to whichever came first.

---

## What the fast path does NOT do

**It does not run editorial QA.** A frozen book has had it, and the manuscript is
unchanged apart from the approved edit. Re-running it re-asks a question that was
answered and approved, and invites re-litigating decisions already on record.

**It does not inspect 170 pages.** Pages byte-identical to an already-approved
artifact have nothing to look at. It renders the changed pages and their
immediate neighbours — neighbours because a sentence usually points at a callout
that sits on the next page, which is the exact defect that started all this.

**It does not rebuild a control.** "Does the config still reproduce the freeze" is
answered by comparing the config hash and renderer fingerprint against the freeze
record. That is a string compare, and it replaces a build *and* a decision.

The one exception is below.

---

## Levels

### Level 1 — text only

Nothing moved but glyphs on the edited pages. This is the default and most
corrections end here.

1. Load the frozen recipe; confirm integrity by hash.
2. Verify each `expect` matches exactly once.
3. One build, from the frozen config snapshot with the corrected text.
4. Page-by-page diff against the stored frozen artifact.
5. Render the changed pages and neighbours; look at them.
6. If no trigger fired, **done**.

### Level 2 — local layout

A page's line count moved but pagination did not. Same flow; the reflowed page
gets looked at properly, its neighbours checked for knock-on. Still fast path.

### Level 3 — structural

Pagination, chapter openers, reference targets, illustration anchors, or the
renderer moved. The fast path **stops and says so**. This needs the wider checks
and a deliberate new freeze — it is not something a text edit should cause as a
side effect.

**Stopping is the default, not the only outcome.** The refusal exists so that
structural movement is never a *side effect*; it is not a claim that a frozen
book can never legitimately reflow. Once someone has looked at the movement and
accepted it, that IS the deliberate decision the refusal was asking for:

```
--accept-level-3 "<who approved it, and why>"
```

The reason is recorded with the correction. Without the flag the behaviour is
unchanged: the tool refuses and nothing is written. Do not reach for it to get
past a surprise — a Level 3 you did not expect means you do not yet understand
what your edit did.

#### Correcting the opening words of an illustrated block

A block's id is a hash of its opening words, so correcting those words moves the
id and orphans the art anchored to it. That must not be a reason to leave a
known defect in a book: the artwork exists to serve the text, not the other way
round.

```
--reanchor <oldBlockId>:<newBlockId>
```

carries the illustration across, preserving the asset, placement and size
exactly. It is deliberately **not** inferred from "one plate was orphaned and
one block is new" — that heuristic holds right up until two blocks move, and
then it silently swaps two plates. State the move; the tool then proves it,
failing the build unless the target actually stamped, the old id is gone, the
printed size is unchanged, and zero illustrations are orphaned. On `--confirm`
the move is written to the live config too, so the next build of that book does
not orphan the plate again.

Derive the new id with the platform's own `computeBlockId`, and only trust it if
the **old** id reproduces exactly from the same inputs. If it does not, you have
guessed the section slug or the block kind, and a guess here silently moves art
onto the wrong page.

### Level 4 — platform defect

The requested change cannot be verified because the tooling is broken.

**Isolate the book and finish it with the smallest safe workaround if one
exists.** Platform remediation is a separate task unless it genuinely blocks
completion. Do not fix the platform in the middle of a book correction.

---

## Escalation triggers

Computed, not judged. Any one of these ends the fast path:

| Trigger | Meaning |
|---|---|
| `PAGE_COUNT_CHANGED` | The book got longer or shorter. Every later page target is suspect and the cover spine is derived from page count. |
| `UNEXPECTED_PAGE_DIFF` | A page changed outside the edited region. A local edit that moves text elsewhere is not local. |
| `REFLOW_WITHOUT_TEXT_CHANGE` | Same text, different line count. Something changed how the page sets, which is not what a text edit does. |
| `CHAPTER_OPENER_MOVED` | The pagination skeleton shifted. |
| `ILLUSTRATION_MOVED` / `ILLUSTRATION_ORPHANED` / `ILLUSTRATION_COUNT_CHANGED` | Art is anchored to blocks; a moved anchor is structural. |
| `REFERENCE_TARGET_COUNT_CHANGED` | The index may now point at the wrong pages. |
| `ENGINE_FINGERPRINT_CHANGED` | The renderer moved under the book — see below. |
| stored artifact fails its own hash | The baseline is untrustworthy, so no diff against it means anything. |

If none fires, stay on the fast path and finish.

---

## A changed renderer is a question, not a verdict

The fingerprint covers every renderer source, so *any* edit to any of them
invalidates it — including edits that cannot reach this book. Treating that as a
hard stop means no book can be corrected after anyone touches the pipeline. That
is not safety, it is paralysis.

Treating it as nothing is the rev24 incident: work committed for a different book
moved two illustrations and 24 pages of a title that had been frozen for five
days.

So the fingerprint decides whether to **ask**, and a build **answers**:

> Rebuild the **frozen** manuscript on today's renderer. Compare to the frozen
> artifact. Every page matches → the change is proven inert for this book, fast
> path continues. Any page moved → the renderer moved the book, Level 3.

This is the one place a control build earns its 20 seconds, and it only runs when
the fingerprint actually differs.

---

## Isolation

The fast path reads and builds **one project**, from **its own frozen config
snapshot**, over a **process-scoped** production connection.

Two consequences worth stating, because both cost real time before:

- **Unrelated working-tree changes are not investigated.** The dirty-file check
  is scoped to renderer sources that are in the fingerprint. Another operator's
  half-finished script for another book is not this correction's problem, and
  chasing one produced three wasted builds and a scratch worktree.
- **Live config is deliberately ignored.** Builds come from the frozen snapshot,
  because live config drifts as zod defaults are added for other books. If a
  config change is intended, that is a new freeze, not a correction.

---

## Deliver once

One report at the end: what changed, which pages moved, what the triggers said,
the hashes. Not a running commentary on each intermediate discovery.

Stop early only for a real stop condition — a fired trigger, a failed match, an
untrustworthy baseline, or a decision that is genuinely the owner's. Those get
reported immediately with the evidence, because that is the point of having them.

---

## Turnaround

| | Before | Now |
|---|---|---|
| Builds for a Level 1 correction | ~10 | **1** (2 if the renderer moved) |
| Bespoke scripts written | 4 + 2 throwaways | **0** |
| Facts re-derived by experiment | standard, profile, build options, target count, reproducibility | **0** — read from the recipe |
| Pages visually inspected | debated up to 170 | **changed pages + neighbours** |
| Reports | one per step | **one** |

A one-line correction should now be a single command, one build, and one report.
