# Stage 1.75 — Pagination (Reading Block flow)

**Status:** v1 implemented behind `PAGINATION_V1_ENABLED=false`. No API
endpoint exposes this yet — the modules are unit-testable and the
orchestrator returns `PaginatedPage[]` ready for persistence.

See `SPEC_PAGINATION_V1.md` at the repo root for the full SPEC.

## What it does

Turns the ordered output of Breakdown (one PAGE manifest per `##` entry)
into a list of real printed pages. Each printed page owns a Reading Block —
the actual character capacity of its layout's Reading Field at the project's
typography. Manuscript text is poured through Reading Blocks left-to-right;
overflow becomes a continuation page, soft breaks let two short adjacent
entries share one page.

Pagination is fully deterministic. No LLM. No image API spend.

## Module map

| File | Responsibility |
|---|---|
| `stream.ts` | Convert ordered entries into a typed token stream. Atomic blocks (code fences, image embeds, HTML comments) become single tokens. Each entry-start token carries its derived `breakBehavior` (hard / soft). |
| `layout-sequence.ts` | Provisional layout sequence: opener for each entry (from content type) + estimated continuation slots. The flow engine treats this as a hint, not a contract. |
| `capacity.ts` | Wraps Stage 6 `analyzeTextFit` to compute per-block char capacity and classify a Reading Block's fit status (FITS / TIGHT / OVERFLOW / UNDERFILL). |
| `flow-engine.ts` | The heart. Walks the stream, opens Reading Blocks, pours tokens, opens continuations when blocks fill, applies the entry-break policy at entry boundaries. |
| `tail-rebalance.ts` | Last-page underfill recovery: identifies a drop candidate in the sequence (or accepts the orphan with a warning). v1 only reports the candidate; full reflow is deferred. |
| `paginate.ts` | Orchestrator. Composes the pipeline and returns `PaginatedPage[]` + summary + warnings. |

## Algorithms in plain English

### Entry-to-stream

Walk each PAGE manifest's `bodyMarkdown` line by line. Code fences (` ``` ` or
`~~~`) and HTML comment blocks are absorbed as single atomic tokens (never
split across pages). Standalone image embed lines are atomic. Section
headings (`##` and deeper) become their own tokens. Everything else
accumulates into paragraph tokens, delimited by blank lines. Each entry is
preceded by one `entry-start` token carrying the entry's title, content type,
image subject, and break behavior.

### Layout sequence

For each entry: push the entry's preferred opener layout (from
content-type table, same as the Stage 2 planner but without overflow
auto-route), then push roughly `ceil(words / 560) − 1` continuation slots of
`LAYOUT_2_TEXT_HEAVY`. The estimate exists only so the flow engine rarely
has to append continuations at the end — the actual page count is whatever
the flow produces.

### Flow

Maintain one open `WorkingBlock`. For each token:

- `entry-start`: decide hard vs soft. Hard breaks close the current block and
  open a fresh opener block (capacity computed from the entry's preferred
  layout). Soft breaks (only when at least `softBreakMinLinesRemaining = 8`
  lines remain) continue in the current block and append the entry's key to
  `compactedEntryKeys`.
- Body token (paragraph / heading / atomic): if it fits the current block,
  pour it in. If not, close the block, open a continuation for the current
  entry (uses `LAYOUT_2_TEXT_HEAVY` capacity), and pour the token there.
- Atomic body token that alone exceeds the continuation's capacity: place it
  whole and mark `fit_status = OVERFLOW`.

After the stream is exhausted, flush the final block and compute `totalParts`
for each entry's chain.

### Tail rebalance

If the last printed page is UNDERFILL, scan backward for an opener whose
layout is in `DISCRETIONARY_LAYOUTS` (currently
`LAYOUT_3_ILLUSTRATION_DOMINANT`, `LAYOUT_8_MARGIN_ILLUSTRATION`). If found,
emit a candidate warning. If none found, accept the orphan with
`orphan_tail_accepted`. v1 does not auto-reflow — the orchestrator only
reports the recommendation.

## Behavior emerges from the model

Two SPEC concerns that needed dedicated modules in earlier drafts now happen
naturally:

- **Splitting a long entry** = the flow engine closes the block when capacity
  is exhausted and opens a continuation for the same entry.
- **Compacting short adjacent entries** = the soft break appends the next
  entry's key to the current block when room remains.

No special-case `splitter.ts` or `compactor.ts` exists. Both behaviors live
inside `flow-engine.ts`.

## Feature flag

```env
PAGINATION_V1_ENABLED=false   # default; safe to ship dormant
```

Wire the orchestrator into an API route ONLY after the full Stage 1.8
(Reading-Field preview) + frontend Page Production tab + acceptance test pass.

## Tests

```
__tests__/stream.test.ts
__tests__/layout-sequence.test.ts
__tests__/flow-engine.test.ts
__tests__/tail-rebalance.test.ts
__tests__/paginate.integration.test.ts
```

Run with `corepack yarn vitest run` from `backend/`.
