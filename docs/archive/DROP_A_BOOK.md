# Drop a book in

Two ways in. Both do the same thing and run the same code.

## From the console

Step 1 → **Drop a book in**. Pick the manuscript, name the book, choose the kind
of book and the trim. One button.

It creates the project, ingests the manuscript, runs breakdown and pagination
where that track uses them, and finishes with a **readiness report**. It spends
nothing.

## From an agent (MCP)

Add this to your MCP client config. `WILDLANDS_KEY` is the console password.

```json
{
  "mcpServers": {
    "wildlands": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "cwd": "C:/Users/jovan/Downloads/wildlands agents platform/backend",
      "env": {
        "WILDLANDS_API": "https://wildlandsbackend-production.up.railway.app",
        "WILDLANDS_KEY": "<console password>"
      }
    }
  }
}
```

Then: *"take in this manuscript as a B&W educational nonfiction book, 5.5x8.5,
cream"* and the agent calls `intake_options` → `book_intake` → `book_readiness`.

### The tools

| Tool | Cost |
|---|---|
| `list_books`, `book_status`, `book_readiness` | free |
| `intake_options`, `cover_preflight`, `cover_versions` | free |
| `book_intake`, `cover_upload`, `cover_select_version` | free |
| `cover_generate` | **SPENDS** — refuses without `confirm: true` |
| `build_interior` | long compute — refuses without `confirm: true` |

The refusal is not a convention, it is enforced in the tool. An agent that tries
to "just run it" gets an error telling it to read the preflight first.

## The readiness gate

`GET /api/projects/:id/readiness`, or the **Check readiness (free)** button on
Render & Review. Deterministic, read-only, no spend. It answers one question:
*is this book set up correctly enough that spending money on it is reasonable?*

What it checks:

- the production profile, typeset layout standard and Style DNA **resolve**
  rather than silently falling back — both `getProductionProfile` and
  `getStyleDna` fall back by design, which is how a black-and-white book was
  once told its ink was warm sepia
- the breakdown parser held: no numbered catalog entry was dropped
- **no other book's region has leaked into this book's prompts**, generalized
  past "New England" to every other project's subtitle
- print faces are vendored, not fetched from a CDN at render time
- layouts are not a monoculture
- a cover is geometrically buildable at the current page count

Checks are selected by the profile's `bodyRenderTrack`. Breakdown, pagination
and per-page layouts belong to the AI whole-page track; a typeset book reports
them as N/A with the reason rather than failing.

### The rule the gate lives by

**A check may only FAIL on evidence.** "I could not tell" is a WARN or an N/A.

This is not decoration. The first live run blocked NO ONE TOLD ME THAT, which
was already at the printer, and the second blocked THE WILDLANDS | NEW ENGLAND,
which is on sale. Both were the gate's fault, not the books'. A gate that fails
shipped books is one the operator learns to ignore, and an ignored gate is worse
than no gate at all.

Current state of the three books on the platform:

```
THE WILDLANDS | NEW ENGLAND        WARNING   canonical source not retained
THE WILDLANDS | CANADIAN ROCKIES   WARNING   canonical source not retained
NO ONE TOLD ME THAT                READY     nothing blocking
```

## What still needs a code change per book

Two things, both deliberately left until a printed proof exists, because they
touch the render path:

- **A new region's default biome** — `REGION_DEFAULT_ENVIRONMENT` in
  `pipeline/stage-2-planner/plan-pages.ts`. Adding a region is a code edit and a
  deploy. Should be a config field.
- **Per-page illustration subjects** — the `SUBJECTS` map in
  `scripts/render-illustration.ts`. Adding a book means hand-writing prompts
  into a script. Should be rows in the database.

See `docs/SPEC_BOOK_INTAKE.md` phase 4.
