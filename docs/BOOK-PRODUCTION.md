# Book production

The operator path, end to end, as it actually runs today.

The console drives everything up to the finished interior. From the cover onward,
production currently happens in `backend/scripts/` at a terminal. That is a fact
about the platform, not a recommendation.

---

## Adding a new book

1. **Create the project** in the console and upload the manuscript. Ingest retains
   the operator's exact bytes and their sha256 alongside a sanitized working copy.
   Upload **once** — re-uploading a restored textarea stores the derivative as
   canonical and the hash then proves the wrong thing.
2. **Set the book up**: trim, paper stock, and the layout-standard id. The
   standard is pinned by version. There is deliberately no "latest".
3. **Paginate — TRACK A ONLY.** The flow engine settles the page count.
   **On the typeset track (Track B) this step does not exist.** Intake reports
   `breakdown SKIPPED` and `paginate SKIPPED`, because page breaks come from the
   typesetter itself. Running them would build manifests and page rows nothing
   reads. Which track you are on is decided by the production profile's
   `bodyRenderTrack`.
4. **Front and back matter.** Track B books carry their own title, copyright and
   contents pages, produced by the same standard as the body.
5. **Render and review.** Look at pages. This is a gate, not a formality.
6. **Build.**
7. Set `PROJECT_ID` in the repo-root `.env` before running any operator script.
   `scripts/_project.ts` reads it and **refuses to default to a book**, so a
   script cannot silently act on the wrong project.

**How long this takes, measured on the platform** (5.5x8.5, 211 KB / 3,136-line
manuscript, `bw-educational-nonfiction`):

| Step | Measured |
|---|---|
| Intake: create project + upload manuscript + readiness audit | 0.4 s |
| First typeset build (168 pp, 28 sections, no illustrations) | 8.1 s |
| Same book with 11 stamped 300 ppi illustrations | 19.6 s |
| **Intake to first paginated PDF** | **8.5 s** |

Compute is not the constraint. The wall clock is the review passes in step 5 —
budget tens of minutes of looking at pages, not hours of machine time. A first
intake can legitimately come back `BLOCKED` on the readiness audit (a parse
retention gap, unvendored fonts); resolving that is judgment, not a rebuild.

Adding a **new book class** means adding a new versioned entry to
`typeset/layout-standards/registry.ts`. Never edit an existing standard in place:
a shipped book is pinned to its version and editing it changes that book's
rebuild.

---

## Making a correction

Pick the smallest level that fits.

| You want to change | Level | How |
|---|---|---|
| A comma, a word, a label | **Book-specific** | A `text` correction. On a book frozen WITH provenance: `tsx scripts/qa/book.ts correct` — one command, one build, one report. See [CORRECTION-FAST-PATH.md](CORRECTION-FAST-PATH.md). Otherwise `scripts/qa/corrections.ts`. |
| Author, title, imprint | Book-specific | `ProjectConfig` via the API — but the cover currently also carries it in script literals and in painted artwork |
| Keep a heading with its text | Book-specific | A `keepTogether` layout override on the block id, via the API or the console panel. **This already works and is the model.** |
| Move one illustration | Artifact | Change the plate's anchor — block id plus `pageOffset` — and re-stamp |
| Running head, TOC entry | Book-specific | A `runningHead` or `tocDisplay` correction, keyed by section slug. No renderer change. |
| Page design for a whole class of books | Book-class | A **new version** of that layout standard |
| A genuine renderer defect | Systemic | Shared code, with a test |

**The rule:** shared renderer code changes only for a genuinely systemic defect.
If a fix is reached for on one book, it belongs in that book's overrides until a
second book needs it.

### Why an override can stop applying

Block ids come from manuscript text. If the text moves, the override no longer
matches. It is **reported, not silently dropped** — read the report.

`scripts/national-parks-layout-overrides.ts` **merges**. Deleting a line from that
script does not delete the override from the database. The API is the authority.

---

## Building a cover

Read [COVERS-AND-SPINES.md](COVERS-AND-SPINES.md) first. Today this means
choosing among per-book scripts; **18 different scripts emit a cover PDF**.

Non-negotiables regardless of which one you use:

- page count comes from the **final interior PDF**, never typed;
- the barcode reserve is a **2.0 × 1.2in rectangle** in the bottom right of the
  back cover, not a full-width band;
- type stays 0.25in inside the trim on every panel;
- spine type clears each fold by more than 0.0625in;
- render the wrap with guides drawn on and **look at it**.

---

## Shipping a package

A delivery folder holds exactly the upload artifacts plus a manifest:

```
<book>-KDP-UPLOAD/
  <book>-interior-<trim>-<pages>pp.pdf
  <book>-cover-PAPERBACK-<trim>-<pages>pp.pdf
  <book>-KINDLE.epub
  <book>-KINDLE-cover-1600x2560.jpg
  KDP-UPLOAD-MANIFEST.md
```

**Hash the shipped files, never a build log.** The interior build is not
byte-reproducible: two runs on identical inputs differ at the PDF creation-date
field. A hash quoted from a log has already been reported wrong once.

---

## Final production checklist

- [ ] Page count read from the shipped interior PDF, not from a build log
- [ ] Every hash in the manifest taken from the file in the delivery folder
- [ ] Interior: correct trim on every page, fonts embedded, no Type 3
- [ ] Interior: every image DeviceGray for a B&W book, ≥300 PPI at printed size
- [ ] Folios match their page index; parity blanks carry no furniture
- [ ] Plates centred on the text block and anchored to live blocks
- [ ] Cover spine matches the interior page count and paper stock
- [ ] Cover: barcode rectangle clear; type 0.25in inside trim; folds clear
- [ ] Cover guide proof rendered **and looked at**
- [ ] EPUB: sources section present, internal cover current, EPUBCheck clean
- [ ] Pages rendered and reviewed by a human
- [ ] **Both** typecheck gates green: `tsc -p tsconfig.json` (library) AND
      `node scripts/typecheck-ratchet.mjs` (scripts). The first does not cover
      the second.
- [ ] Printed contents folios checked against real section starts, after the
      LAST repagination

---

## Connecting to a database

Operational scripts select their connection through **one** entry point:

```ts
const { openOperationalDatabase, ProductionWriteGrant } = await import(
  '../src/db/operational-access.js',
);
await import('../src/env.js');
openOperationalDatabase({ environment: 'production', intent: 'read' });
```

**Direct `process.env.DATABASE_URL` manipulation is prohibited.** So is reading
`.env` yourself, and so is writing your own `127.0.0.1` check. `db/client.ts`
refuses an off-box connection that nothing declared, so the old pattern now fails
loudly instead of quietly working.

- Production is identified by WHERE credentials are declared, not by the URL.
- `intent: 'read'` needs no ceremony. A dry run should ask for `read`.
- `intent: 'write'` against production needs a `ProductionWriteGrant`, which takes
  a real reason and an explicit confirmation, and records the reason.

## Things that will bite you

- **A plate vanished.** Its anchor went stale when pagination moved. The stamper
  refuses to draw rather than clip, by design. Re-anchor it.
- **Re-pagination lost renders.** It CASCADE-deletes body render rows. Check what
  exists before re-paginating; recover from R2 if it is already done.
- **A change to `shared/` had no effect.** You are in a git worktree, where
  `node_modules/@wildlands/shared` is a junction into the main checkout. See the
  README.
- **Four tests fail on a clean checkout.** Known and pre-existing: they read real
  book manuscripts from absolute paths outside the repository. Not your change.
- **Every render throws `TypesetUnavailableError`.** Chromium is required and
  there is no fallback on Windows. `export CHROMIUM_PATH=".../chrome.exe"`. It
  reads like a broken build and is a missing environment variable.
- **"tsc is clean" does not mean the scripts are.** `tsconfig.json` includes
  `src/**/*` only, and operator scripts run through `tsx`, which transpiles
  WITHOUT typechecking — so a type error there reaches runtime with nothing in
  front of it. `tsconfig.scripts.json` plus `scripts/typecheck-ratchet.mjs`
  covers `scripts/**` as a ratchet: it records today's per-file error counts and
  fails only on a file that gets WORSE. Run both gates and report them
  separately.
- **A cover looks stale for no reason.** Its manifest records the interior's
  sha256. Rebuild both covers whenever the interior changes, even when the page
  count does not, or they claim an interior that no longer exists.
- **Page numbers in a comment are a description of a build, not a fact.** One
  book moved 184 -> 175 -> 174 -> 173 -> 172 in a single session. Re-measure
  before quoting a page number, including one you wrote an hour ago.
