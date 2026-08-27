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

**One book needs something different? Correct the book, not the platform.**

    book-specific change  ->  book-local correction
    systemic defect       ->  shared platform change
    manuscript            ->  frozen, always

A typo, an author name, a running head, a contents entry, a heading treatment, a
spacing nudge, a plate placement: all of these are book-local corrections keyed to
stable block ids, and none of them require touching shared renderer code.

```bash
tsx scripts/qa/corrections.ts blocks   --manuscript book.md
tsx scripts/qa/corrections.ts add      --corrections c.json --type text --id fix-1 \
    --anchor e43f3d0a --expect "5 p.m.. and" --replace "5 p.m. and" --reason "..."
tsx scripts/qa/corrections.ts report   --manuscript book.md --corrections c.json
```

An anchor that matches nothing, matches twice, or whose expected text has changed
BLOCKS the build. See [docs/CORRECTIONS.md](docs/CORRECTIONS.md), which answers how to
correct a typo, change metadata, change only a running head, keep a heading with its
text, and when a change is systemic enough to belong in the platform instead.

**One command corrects a FROZEN book.** Once a book has been frozen with build
provenance, a small correction is one command, one build, one report — not an audit:

```bash
tsx scripts/qa/book.ts recipe    --project <id>   # what it was frozen from; still reproducible?
tsx scripts/qa/book.ts reproduce --project <id>   # rebuild and prove it matches
tsx scripts/qa/book.ts correct   --project <id> --corrections fixes.json --pages 64
```

Dry run by default, and genuinely read-only: the build runs off an in-memory
manuscript override, so nothing in the project moves until `--confirm`. It reads the
frozen recipe instead of rediscovering it, diffs against the stored frozen artifact,
renders only the changed pages and their neighbours, and **escalates only when a coded
trigger fires** — page count, unexpected diff, reflow without a text change, opener
moved, illustration moved or orphaned, reference-target count, renderer fingerprint.

Measured: a full 170-page build with 11 stamped illustrations is **19.6s**; text-only
is **8.1s**; intake to first paginated PDF is **8.5s**. Compute was never the
bottleneck — see [docs/CORRECTION-FAST-PATH.md](docs/CORRECTION-FAST-PATH.md).

**One way to reach a database.** Operational scripts must select their connection
through the sanctioned entry point. Reading `.env` by hand, assigning
`process.env.DATABASE_URL`, or inventing a localhost check is **prohibited** — that
is how eighteen scripts each ended up with their own safety story, and how the one
written to BE the safe path ended up with no host check at all.

```ts
const { openOperationalDatabase, ProductionWriteGrant } = await import(
  '../src/db/operational-access.js',
);
await import('../src/env.js');           // dotenv layers run first
openOperationalDatabase({ environment: 'production', intent: 'read' });
```

A write asks for it, and says why:

```ts
openOperationalDatabase({
  environment: 'production',
  intent: 'write',
  grant: ProductionWriteGrant.declare({ reason: 'Freeze rev26', confirmed: CONFIRM }),
});
```

The environment is decided by WHERE credentials are declared — production in `.env`,
development in `.env.development.local` — never by what the URL looks like. A
production write with no grant is refused, a grant cannot be built from a bare
`true`, and `db/client.ts` refuses an off-box connection that nothing declared, so
the old pattern fails rather than quietly working.

**One command builds a cover.** New production covers, paperback or hardcover,
are made with a single tool:

```bash
tsx scripts/qa/build-cover.ts --interior final.pdf --art approved-wrap.png \
    --binding paperback --ink bw --paper white --trim 6x9 \
    --title "..." --author "..." --out cover.pdf --proof proof.png --manifest cover.json
```

It reads the page count from the interior PDF, takes its geometry from the
published KDP specification (paperback) or a verified Cover Calculator reading
(hardcover), validates effective resolution and the barcode reserve, emits a
proof for human approval, and writes a manifest pairing the cover to the
interior it was built from. See [docs/COVERS-AND-SPINES.md](docs/COVERS-AND-SPINES.md).

The per-book cover scripts in `backend/scripts/` are **not** alternatives. Each is
marked in its own header as `HISTORICAL — DO NOT USE FOR NEW BOOKS` or
`RETIRED — SUPERSEDED`. They exist to reproduce artifacts that already shipped.

> If you have read older documentation pointing at `RENDER_MODEL.md` as the
> current system, it is describing Track A. That guidance is superseded.

---

## Repository map

```
backend/
  src/
    api/                     Fastify routes. projects.routes.ts is 3,096 loc and 43 routes.
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
  scripts/                   341 tracked operator tools. See docs/maintenance/
                             (its census is stale — 310 rows, no qa/ coverage).
    _scratch/                UNTRACKED workbench. Never a production authority.
frontend/src/                Operator console. 4,017 loc of plain JS; ProductionConsole.js is 3,699.
shared/src/index.ts          1,673 loc of Zod schemas. The contract between all three workspaces.
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
- **The portable suite owns its own book.**
  `backend/src/__tests__/fixtures/fixture-book/` is a small synthetic manuscript
  carrying every structure the engine can break on: part dividers, a chapter
  opener, both list kinds, a labelled callout, a narrow table, a wide table that
  must trigger the stacked fallback, a plate, a preformatted block, an appendix,
  a sources section and a heading with a drawn mark. Nothing in the default test
  run reads a file outside this repository.

- **End to end, on that book:**

  ```bash
  npm run qa:fixture-smoke   # manuscript -> PDF -> covers -> manifest
  ```

  Needs Chromium (set `CHROMIUM_PATH`). Exits 4 if none is found, so CI can tell
  "environment not ready" from "the book is broken".

- **Operator tests are separate.** `*.operator.test.ts` assert against real
  commercial manuscripts outside the repo and are excluded from the default run.
  `OPERATOR_TESTS=1 npm run test:operator` on a machine that holds the books.
- **Tests cannot reach production.** `backend/src/test-safety.ts` denies by
  default and aborts the run if a production database, key or bucket is
  reachable. Do not weaken it to make a test run.
- **Spending is opt-in.** MCP tools that spend refuse without `confirm: true`;
  the console enforces the same on its buttons.
- Of the 310 scripts the census covered, **75 mutate state, 13 both mutate and spend, and
  2 are destructive**. Check [docs/maintenance/](docs/maintenance/README.md)
  before running one you do not recognise.

---

## Where things are generated

| Artifact | Built by |
|---|---|
| Interior PDF | `typeset/build-typeset-interior.ts` -> `typeset-book.ts` |
| Illustration plates | `typeset/stamp-illustrations.ts`, onto the finished PDF |
| Paperback cover | **Resolved.** One compositor, `scripts/qa/build-cover.ts`. The per-book scripts are marked HISTORICAL or RETIRED and are not entry points. |
| Hardcover cover | **Resolved for 6x9 and 7x10.** Nine verified Cover Calculator readings in `kdp-cover-specs.ts`; anything outside them still refuses to interpolate, by design. |
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
| [docs/CORRECTION-FAST-PATH.md](docs/CORRECTION-FAST-PATH.md) | Correcting a frozen book: the one command, the four levels, the escalation triggers |
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
