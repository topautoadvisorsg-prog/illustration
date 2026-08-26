# The Wildlands Publishing Platform

Turns a finished manuscript into print-ready KDP artifacts: a 6×9 interior PDF, a
paperback cover wrap, a Kindle EPUB and a marketing cover. It runs as a Fastify
API with a React operator console, Postgres for book state, Cloudflare R2 for
artifacts, and Chromium doing the actual page rendering.

Four books have shipped through it.

---

## Read this before anything else: there are two tracks, and only one is live

| | **Track B — ACTIVE** | **Track A — LEGACY / DORMANT** |
|---|---|---|
| What it does | Typesets real text with Paged.js, then stamps illustrations onto the finished PDF | Renders whole pages as AI artwork with text-safe zones |
| Lives in | `backend/src/pipeline/typeset/` | `backend/src/pipeline/whole-page-render/` and most of `stage-6-layout/` |
| Books | DIRT RICH, No One Told Me That, 7 National Parks, the MG chapter book | Earlier Wildlands illustrated volumes |
| Status | **Every book shipped in the last three months** | Preserved, not extended. No new books. No new features. |

**Track A still owns cover geometry.** `computeCoverDimensions` and the paper
thickness table live in `stage-6-layout/render-html.ts`, and the whole platform
imports them from there. Extracting them is Phase 1. Until that lands, "legacy"
describes the render path, not the whole module. See
[docs/LEGACY.md](docs/LEGACY.md).

> If you have read older documentation pointing at `RENDER_MODEL.md` as the
> current system, it is describing Track A. That guidance is superseded.

---

## Repository map

```
backend/
  src/
    api/                     Fastify routes. projects.routes.ts is 3,092 loc and 43 routes.
    pipeline/
      stage-1-ingestion/     extract -> sanitize -> parse outline -> block ids
      stage-1.75-pagination/ flow engine, capacity, rebalance. Best-tested subsystem.
      typeset/               TRACK B. Paged.js, layout-standard registry, overrides, stamping.
      whole-page-render/     TRACK A. Dormant.
      stage-6-layout/        TRACK A renderer + the cover geometry everything depends on.
      cover/                 Blueprint, geometry, preflight, prompt, spec, art validation.
      publishing-standard/   Geometry, style DNA, badges, verified KDP specs, spine type.
      print-prep/            Print-side cover composition and previews.
      stage-8-epub/          EPUB assembly.
      book-assembly/         delivery-check, pdf-inspect, pdf-merge. Runs against FINISHED files.
      readiness/             Pre-flight audit of a project.
    db/                      Drizzle schema, 16 migrations, repositories.
    services/                Model providers, storage, redis, cost, page-quality, review routing.
    mcp/                     The platform as agent-callable tools. No business logic.
  scripts/                   310 operator tools. See docs/maintenance/.
    _scratch/                UNTRACKED workbench. Never a production authority.
frontend/src/                Operator console. 4,178 loc of plain JS; ProductionConsole.js is 3,699.
shared/src/index.ts          1,467 loc of Zod schemas. The contract between all three workspaces.
docs/                        See the documentation index below.
```

---

## How a book moves through the platform

```
manuscript (DOCX or MD)
  -> ingest            original bytes + sha256 retained; sanitized working copy derived
  -> parse outline     chapters, blocks, STABLE BLOCK IDS
  -> project config    trim, paper, layout-standard id, overrides  (Postgres)
  -> typeset           Paged.js in Chromium
  -> PAGE COUNT EMERGES HERE
  -> pad to even       parity blanks
  -> stamp plates      anchored to block ids, never page numbers
  -> deterministic QA  fidelity, spacing, print check, image PPI
  -> HUMAN LOOKS AT PAGES        <- the only gate that has ever caught a layout defect
  -> cover             page count READ FROM THE INTERIOR PDF -> spine -> wrap
  -> Kindle            EPUB + a 1600x2560 crop of the wrap
  -> delivery folder + manifest, hashes taken from the shipped files
```

Page count is **emergent, not declared**. Everything downstream of it — spine,
both wraps, the Kindle cover crop — is invalidated by any change upstream of it.

Full detail: [docs/BOOK-PRODUCTION.md](docs/BOOK-PRODUCTION.md).

---

## Canonical sources of truth

The full matrix, including secondary copies and conflict risk, is
[docs/SOURCE-OF-TRUTH.md](docs/SOURCE-OF-TRUTH.md). The short version:

| Datum | Authority |
|---|---|
| Manuscript | `projects.canonical_manuscript_path` + `_sha256` — the operator's original bytes |
| Book configuration | `ProjectConfig` (Zod, `shared/src/index.ts`) in Postgres |
| Layout standard | `typeset/layout-standards/registry.ts` — versioned, pinned per book, never "latest" |
| Per-block exceptions | `ProjectConfig.layoutOverrides`, via the API |
| Page count | The final interior PDF. Read it; never type it. |
| Cover geometry | `publishing-standard/kdp-spec.ts` — the published KDP factors and rules, each with its source and retrieval date. Hardcover spines from verified calculator fixtures in `kdp-cover-specs.ts`. |
| Artifact hashes | Computed from the shipped file. The interior build is **not** byte-reproducible. |

---

## Production boundaries

- **`backend/src` never imports `backend/scripts`.** Verified by resolved
  specifiers. Keep it that way.
- **`scripts/_scratch/` is untracked and is never a production authority.**
- **Tests cannot reach production.** `backend/src/test-safety.ts` denies by
  default and aborts the run if a production database, key or bucket is
  reachable. Do not weaken it to make a test run.
- **Spending is opt-in.** MCP tools that spend refuse without `confirm: true`;
  the console enforces the same on its buttons.
- Of the 310 operator scripts, **75 mutate state, 13 both mutate and spend, and
  2 are destructive**. Check [docs/maintenance/](docs/maintenance/README.md)
  before running one you do not recognise.

---

## Where things are generated

| Artifact | Built by |
|---|---|
| Interior PDF | `typeset/build-typeset-interior.ts` -> `typeset-book.ts` |
| Illustration plates | `typeset/stamp-illustrations.ts`, onto the finished PDF |
| Paperback cover | Currently per-book scripts in `backend/scripts/`; **18 scripts emit a cover PDF**. Being unified in Phase 1. |
| Hardcover cover | No verified geometry exists for the current block. `kdp-cover-specs.ts` refuses to interpolate, by design. |
| Kindle EPUB | `stage-8-epub/` |
| Kindle cover | A 1600x2560 crop of the finished paperback wrap |
| Delivery package | Per-book delivery folder plus a manifest of hashes |

---

## Local development

```bash
yarn install
yarn workspace @wildlands/shared build     # backend typechecks against shared/dist
yarn dev:backend                            # Fastify on :8001
yarn workspace @wildlands/frontend start    # console on :3000
```

Health check: `GET /` and `GET /health`.

**Storage is Cloudflare R2-primary with Supabase as read fallback.** Writes always
go to R2. Reads try R2 first and fall back to Supabase for objects predating the
migration. Older documentation describing Supabase as *the* storage backend is
out of date.

### Working in a git worktree — read this

`node_modules/@wildlands/shared` and `@wildlands/backend` are **junctions into
whichever checkout ran the yarn install**. A worktree that borrows that
`node_modules` therefore typechecks and tests against the *other* checkout: a
change to `shared/src` appears to do nothing, and a merge that adds a field to it
appears to fail.

**Set the worktree up once:**

```bash
# from the worktree root, with <MAIN> = the checkout that ran yarn install
#
# 1. borrow third-party dependencies from <MAIN> (read-only)
mklink /J node_modules "<MAIN>
ode_modules"
#
# 2. give the worktree its OWN backend/node_modules, so @wildlands wins locally.
#    Move the borrowed junction aside first — never delete it, that risks the target.
move backend
ode_modules backend_node_modules_mainlink
mkdir backend
ode_modules@wildlands
#    re-link the few non-hoisted packages from <MAIN>, then override @wildlands:
mklink /J backend
ode_modules@wildlandsshared  "<WORKTREE>shared"
mklink /J backend
ode_modules@wildlandsackend "<WORKTREE>ackend"
```

Node resolves `@wildlands/shared` from `backend/` by finding
`backend/node_modules` first, so the worktree's own copy wins; everything else
falls through to the borrowed `node_modules` one level up.

**Then validate with the script that proves it:**

```bash
node scripts/validate-worktree.mjs              # everything
node scripts/validate-worktree.mjs --no-tests   # static checks only
```

It builds this checkout's `shared` itself, prints the resolved package path, and
**refuses to continue if that path lands outside this checkout**. It checks the
`realpath`, not the apparent path: a junction makes another checkout's package
look local, and a path-only check passes while validating the wrong tree. It then
loads the module and compares it against this checkout's source, which is the
check that actually catches it.

---

## Making a change safely

Four levels. Pick the smallest one that fits — this is the rule the platform is
built around, and mixing the levels is what has cost the most time.

| Level | Fix path | Affects |
|---|---|---|
| **Systemic** | Shared renderer, or a **new version** of a layout standard | Every book. Never edit a standard in place. |
| **Book-class** | A new version of that class's layout standard | Books that re-pin to it |
| **Book-specific** | `layoutOverrides` on the project | That book only |
| **Artifact** | Post-render stamping | One rendered file |

A single-book need does not belong in shared renderer code. There is currently no
sanctioned home for a *text* correction at book scope — that gap is Phase 2.

---

## Documentation

| Document | What it is for |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Subsystems, diagrams, and the Track A/B boundary |
| [docs/BOOK-PRODUCTION.md](docs/BOOK-PRODUCTION.md) | The operator path, end to end |
| [docs/COVERS-AND-SPINES.md](docs/COVERS-AND-SPINES.md) | Geometry, KDP readings, safe zones, the current conflict |
| [docs/QA-SYSTEM.md](docs/QA-SYSTEM.md) | What is checked today and what is not |
| [docs/VISION-QA.md](docs/VISION-QA.md) | The vision-model QA engine that already exists — read before building a second one |
| [docs/SOURCE-OF-TRUTH.md](docs/SOURCE-OF-TRUTH.md) | One authority per production datum |
| [docs/LEGACY.md](docs/LEGACY.md) | Track A: what it is, what still depends on it, how it retires |
| [docs/maintenance/](docs/maintenance/README.md) | Script census, safety classification, dispositions |
| [docs/archive/](docs/archive/) | Historical. Superseded by the above. |

---

## Known technical debt

The ranked list lives in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The three
that shape current work:

1. ~~Cover geometry has no single authority.~~ **Resolved in Phase 1A/1B.** One
   module, every value sourced and dated. Remaining: hardcover fixtures at more
   page counts, and the duplicated spine repairs and blueprints.
2. **A comma costs a rebuild.** No book-scoped text correction layer exists, so
   trivial edits reach either the frozen manuscript or shared renderer code.
   Phase 2.
3. **No visual QA gate.** Deterministic checks exist and are good; every defect
   found so far passed them and was caught by a human looking at pages. Phase 3.

## Common failure modes

- **A hash does not match.** The interior build is not byte-reproducible; two
  runs differ at the PDF creation-date field. Hash the shipped file.
- **A plate vanished.** Its anchor went stale when pagination moved. The stamper
  refuses to draw rather than clip. Re-anchor it.
- **Re-pagination lost renders.** It CASCADE-deletes body render rows. Check
  before re-paginating; recover from R2.
- **An override stopped applying.** Block ids come from manuscript text. If the
  text moved, the override no longer matches — it is reported, not dropped.
- **A change to `shared/` had no effect.** You are in a worktree. See above.
- **Four tests fail on a clean checkout.** Known and pre-existing. They read real
  book manuscripts from absolute paths outside the repository, including one
  under `C:/Users/jovan/Downloads/`. The CI fixture book is the fix.
