/**
 * book — one command for correcting and reproducing a frozen book.
 *
 *   tsx scripts/qa/book.ts recipe    --project <id>
 *   tsx scripts/qa/book.ts reproduce --project <id>
 *   tsx scripts/qa/book.ts correct   --project <id> --corrections <file.json> [--confirm]
 *   tsx scripts/qa/book.ts freeze    --project <id> --pdf <approved.pdf> --rev <n> [--confirm]
 *
 * ─── WHY THIS REPLACES SIX SCRIPTS ───────────────────────────────────────────
 * Correcting two sentences in NO ONE TOLD ME THAT produced four bespoke scripts
 * and two throwaways. Each re-implemented the same four things: read the
 * production URL out of `.env`, reclaim it for this process, hash a buffer, and
 * re-derive which layout standard the book uses. Three of them shipped with a
 * bug in that boilerplate — a wrong repo-relative import path, a function name
 * that does not exist (`updateProjectStatus` for `setProjectStatus`), and a
 * config field that does not exist (`assetPath` for `approvedAssetPath`). Two of
 * those failed only AFTER writing to production, because a dry run never called
 * them.
 *
 * That is the actual cost of a correction: not the 19.6-second build, but a new
 * script per step, each with a fresh chance to be wrong in the plumbing.
 *
 * ─── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
 * It does not run editorial QA. A frozen book has already had that, and rerunning
 * it on an unchanged manuscript re-asks a question that was answered and
 * approved. This runs REGRESSION QA: did anything move that was not supposed to.
 * The two are different jobs and conflating them is how a one-line edit turns
 * into a whole-book audit.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// ── argv ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const command = argv[0];
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name: string) => argv.includes(`--${name}`);
/** Every value of a repeatable flag, in the order given. */
const flags = (name: string): string[] =>
  argv.reduce<string[]>((acc, a, i) => (a === `--${name}` && argv[i + 1] ? [...acc, argv[i + 1]!] : acc), []);
const CONFIRM = has('confirm');
const PROJECT_ID = flag('project');

const say = (s = '') => console.log(s);
const die = (msg: string): never => {
  say(`\n  STOPPED — ${msg}\n`);
  process.exit(1);
};

if (!command || !['recipe', 'reproduce', 'correct', 'freeze'].includes(command)) {
  say('');
  say('  tsx scripts/qa/book.ts recipe    --project <id>');
  say('  tsx scripts/qa/book.ts reproduce --project <id>');
  say('  tsx scripts/qa/book.ts correct   --project <id> --corrections <file.json> [--confirm]');
  say('  tsx scripts/qa/book.ts freeze    --project <id> --pdf <approved.pdf> --rev <n> [--confirm]');
  say('                                   [--reanchor <oldBlockId>:<newBlockId>]…');
  say('                                   [--accept-level-3 "<who approved it, and why>"]');
  say('');
  process.exit(1);
}
if (!PROJECT_ID) die('--project <id> is required');

// ── production connection ────────────────────────────────────────────────────
/**
 * Selected through the sanctioned entry point, which is the only thing in this
 * repository allowed to decide which database a script talks to.
 *
 * `correct --confirm` writes to a production book, so it asks for write intent
 * and carries a grant. Everything else here reads. Until this migration this
 * script read `.env` itself and had NO host check at all, which made the
 * sanctioned fast path the least guarded of the five write-capable scripts.
 */
const { openOperationalDatabase, ProductionWriteGrant, describeAccess } = await import(
  '../../src/db/operational-access.js',
);
await import('../../src/env.js');
const WILL_WRITE = (command === 'correct' || command === 'freeze') && CONFIRM;
const access = openOperationalDatabase({
  environment: 'production',
  intent: WILL_WRITE ? 'write' : 'read',
  ...(WILL_WRITE
    ? {
        grant: ProductionWriteGrant.declare({
          reason:
            command === 'freeze'
              ? `Freeze the approved interior of project ${PROJECT_ID} as a BOOK_PROOF and store the export`
              : `Apply approved corrections to project ${PROJECT_ID} and store the corrected manuscript`,
          confirmed: CONFIRM,
        }),
      }
    : {}),
});
const host = access.target;

const { getProject, updateProjectConfig, replaceWorkingManuscript, setProjectStatus } = await import(
  '../../src/db/repositories/projects.repo.js'
);
/**
 * Checked up front, not at the call site. Destructuring a name that a module
 * does not export yields `undefined` silently, so a typo survives every dry run
 * and throws only after the writes before it have already landed. That is
 * exactly how a freeze ended up half-applied.
 */
for (const [name, fn] of Object.entries({ getProject, updateProjectConfig, replaceWorkingManuscript, setProjectStatus })) {
  if (typeof fn !== 'function') die(`${name} is not exported by projects.repo — refusing to run`);
}

const { getProjectStorage } = await import('../../src/services/storage/project-storage.js');
const { buildTypesetInterior } = await import('../../src/pipeline/typeset/build-typeset-interior.js');
const { ProjectConfigSchema } = await import('@wildlands/shared');
const { buildPageModel } = await import('../../src/pipeline/page-qa/page-model.js');
const { classifyPages } = await import('../../src/pipeline/page-qa/page-roles.js');
const { rasterizePages } = await import('../../src/pipeline/page-qa/raster.js');
const { loadFrozenRecipe, checkRecipeIntegrity, NoFrozenRecipeError } = await import(
  '../../src/pipeline/corrections/frozen-recipe.js'
);
const { assessChange, pageTargets } = await import('../../src/pipeline/corrections/escalation.js');

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

const project = await getProject(PROJECT_ID!);
if (!project) die(`project ${PROJECT_ID} not found on ${host}`);
const liveConfig = ProjectConfigSchema.parse(project!.config);
const storage = getProjectStorage();

let recipe;
try {
  recipe = loadFrozenRecipe(PROJECT_ID!, liveConfig);
} catch (err) {
  // A freeze is how the FIRST recipe comes into existence, so "no prior freeze"
  // is a normal state for it and a fatal one for everything else.
  if (err instanceof NoFrozenRecipeError && command === 'freeze') recipe = undefined;
  else if (err instanceof NoFrozenRecipeError) die(err.message);
  else throw err;
}

const OUT = path.join('.book', PROJECT_ID!);
mkdirSync(OUT, { recursive: true });

say('');
say(`${command.toUpperCase()} — ${project!.title}`);
say('─'.repeat(94));
say(describeAccess(access));
if (recipe) {
  say(`  freeze         ${recipe.freezeId}   ${recipe.pageCount}pp   ${recipe.builtAt}`);
  say(`  standard       ${recipe.layoutStandardId}   profile ${recipe.productionProfileId ?? '(default)'}`);
  say(
    `  buildOptions   chaptersStartRecto=${recipe.buildOptions.chaptersStartRecto}   ` +
      `${recipe.buildOptionsRecorded ? 'RECORDED' : 'INFERRED — not in the freeze record'}`,
  );
} else {
  say('  freeze         (none yet — this would be the first)');
}

// ── recipe ───────────────────────────────────────────────────────────────────
if (command === 'recipe') {
  say('');
  say('  RECIPE');
  say(`    frozen pdf         ${recipe.pdfSha256}`);
  say(`    stored at          ${recipe.storagePath}`);
  say(`    bytes / pages      ${recipe.fileSizeBytes} / ${recipe.pageCount}`);
  say(`    manuscript         ${recipe.manuscriptSha256}`);
  say(`    canonical          ${recipe.canonicalManuscriptSha256 ?? '(none)'}`);
  say(`    configSnapshotSha  ${recipe.configSnapshotSha256}`);
  say(`    engineFingerprint  ${recipe.engineFingerprint}`);
  say(`    engineDirty        ${recipe.engineDirty}${recipe.dirtyFiles.length ? ` ${JSON.stringify(recipe.dirtyFiles)}` : ''}`);
  say(`    illustrations      ${recipe.illustrations.length} (pages ${recipe.illustrations.map((i) => i.page).join(', ')})`);
  const integrity = checkRecipeIntegrity(recipe, liveConfig);
  say('');
  say(`  INTEGRITY          ${integrity.intact ? 'INTACT — a rebuild reproduces the freeze' : 'BROKEN'}`);
  for (const r of integrity.reasons) say(`    - ${r}`);
  writeFileSync(path.join(OUT, 'recipe.json'), `${JSON.stringify(recipe, null, 2)}\n`);
  say('');
  say(`  written            ${path.join(OUT, 'recipe.json')}`);
  say('');
  process.exit(integrity.intact ? 0 : 1);
}

// ── shared: the frozen artifact's page model, read not rebuilt ───────────────
/**
 * The baseline comes from the STORED FROZEN PDF, not from a control rebuild.
 * Rebuilding the book unchanged to prove it is unchanged costs a build and
 * proves only that the recipe is intact, which `checkRecipeIntegrity` already
 * answers with a string compare.
 */
async function frozenModel() {
  const bytes = await storage.readProjectFile(recipe!.storagePath);
  const actual = sha(bytes);
  if (actual !== recipe!.pdfSha256) {
    die(
      `the stored frozen artifact does not match its freeze record\n` +
        `    recorded ${recipe!.pdfSha256}\n` +
        `    stored   ${actual}\n` +
        `  The baseline is not trustworthy, so no diff against it means anything.`,
    );
  }
  return { bytes, model: await buildPageModel(bytes) };
}

// ── freeze ───────────────────────────────────────────────────────────────────
/**
 * Promote an APPROVED pdf to this book's shipping BOOK_PROOF.
 *
 * This existed only as `nottm-freeze-rev26.ts`, a book-specific script whose own
 * header says "the generic path is scripts/qa/book.ts" — which was not true,
 * because no such path existed. Every future book would have forked that script
 * again, which is the pattern this file was written to end.
 *
 * The approved BYTES are what ship. A rebuild still happens, because a
 * provenance record has to say where each illustration was PLACED and the only
 * source for that is a build — but the rebuild's bytes are thrown away. PDFs are
 * not byte-deterministic here (identical inputs, three different shas, identical
 * pages), so the check is LAYOUT EQUIVALENCE: same page count, same text on every
 * page, all illustrations stamped, none orphaned. Anything less and the rebuild
 * describes a different artifact and may not be recorded against this one.
 */
if (command === 'freeze') {
  const pdfPath = flag('pdf');
  const rev = flag('rev');
  if (!pdfPath) die('--pdf <approved.pdf> is required');
  if (!rev || !/^\d+$/.test(rev)) die('--rev <n> is required (the revision number this freeze records)');

  const { computeEngineFingerprint, assertEngineCleanForProduction, configSnapshotSha256, DirtyEngineError } =
    await import('../../src/pipeline/build-provenance.js');
  const { ProofArtifactSchema } = await import('@wildlands/shared');
  const { PDFDocument } = await import('pdf-lib');

  const PROOF_ID = `book-proof-rev${rev}`;
  let failed = 0;
  const check = (label: string, actual: unknown, expected: unknown) => {
    const ok = String(actual) === String(expected);
    if (!ok) failed += 1;
    say(`    ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(40)} ${actual}${ok ? '' : `   expected ${expected}`}`);
  };

  /**
   * 1 — the engine. A freeze must come from committed code: the fingerprint
   * hashes file CONTENT, so bytes living only in an uncommitted file are
   * unrecoverable once that file changes. That is how rev24 was lost.
   */
  say('');
  say('  1 — ENGINE');
  const fp = computeEngineFingerprint();
  say(`    fingerprint  ${fp.engineFingerprint}`);
  say(`    commit       ${fp.gitCommit?.slice(0, 12)} (${fp.gitBranch})`);
  let dirtyOverrideReason: string | undefined;
  try {
    ({ dirtyOverrideReason } = assertEngineCleanForProduction(fp));
    if (dirtyOverrideReason) {
      say(`    clean        NO — OVERRIDDEN, and recorded in the provenance`);
      for (const f of fp.dirtyFiles) say(`                 dirty: ${f}`);
      say(`    reason       ${dirtyOverrideReason}`);
    } else {
      say(`    clean        yes — every renderer source is committed`);
    }
  } catch (err) {
    if (!(err instanceof DirtyEngineError)) throw err;
    say(`    clean        NO`);
    for (const f of fp.dirtyFiles) say(`                 ${f}`);
    die(`the renderer is dirty and a freeze must come from committed code. Commit the listed file(s) and re-run.`);
  }

  // 2 — the artifact and the stored state have to agree with each other
  say('');
  say('  2 — APPROVED ARTIFACT AND STORED STATE');
  const onDisk = readFileSync(pdfPath!);
  const pdfSha = sha(onDisk);
  say(`    approved pdf ${pdfPath}`);
  say(`    sha256       ${pdfSha}`);
  const manuscript = (await storage.readProjectFile(project!.manuscriptPath!)).toString('utf8');
  check('manuscript bytes match the project row', sha(manuscript), project!.manuscriptSha256);
  const approvedPages = (await PDFDocument.load(onDisk)).getPageCount();
  say(`    pages in pdf ${approvedPages}`);
  const clash = (liveConfig.proofArtifacts ?? []).find((a: { id: string; sha256: string }) => a.id === PROOF_ID);
  if (clash && clash.sha256 !== pdfSha) die(`${PROOF_ID} already exists with a different sha (${clash.sha256})`);
  if (clash) say(`    NOTE: ${PROOF_ID} already recorded with this sha — reconciling, not re-freezing.`);

  // 3 — rebuild for placements, then prove it describes THIS artifact
  say('');
  say('  3 — REBUILD (for illustration placements) + LAYOUT EQUIVALENCE');
  const buildOptions = recipe?.buildOptions ?? { chaptersStartRecto: false };
  const tStart = Date.now();
  const built = await buildTypesetInterior(PROJECT_ID!, liveConfig, buildOptions);
  say(`    built in     ${((Date.now() - tStart) / 1000).toFixed(1)}s`);
  check('page count matches the approved pdf', built.pageCount, approvedPages);
  check('illustrations orphaned', built.orphanedIllustrations.length, 0);
  check('illustrations stamped', built.stampedIllustrations.length, Object.keys(liveConfig.illustrations ?? {}).length);
  const approvedModel = await buildPageModel(onDisk);
  const rebuiltModel = await buildPageModel(built.pdf);
  const normPage = (pg: { lines: { text: string }[] }) => pg.lines.map((l) => l.text).join('').replace(/\s+/g, '');
  const differing = approvedModel.pages
    .map((pg, i) => (normPage(pg) === normPage(rebuiltModel.pages[i]!) ? -1 : i + 1))
    .filter((n) => n > 0);
  check('rebuild pages equal to approved', differing.length ? differing.join(',') : 0, 0);
  say(`    note: rebuild sha ${sha(built.pdf).slice(0, 16)}… != approved — PDF bytes are not deterministic`);
  if (failed) die(`${failed} precondition(s) failed. Nothing was written.`);
  say('    every precondition holds.');

  // 4 — provenance. The record pins the BYTES of the art, not just rectangles.
  const illustrations: {
    blockId: string; assetSha256?: string; page: number;
    xIn: number; yIn: number; widthIn: number; heightIn: number;
  }[] = [];
  for (const s of built.stampedIllustrations) {
    const entry = (liveConfig.illustrations ?? {})[s.blockId] as { approvedAssetPath?: string } | undefined;
    let assetSha256: string | undefined;
    if (entry?.approvedAssetPath) {
      try {
        assetSha256 = sha(await storage.readProjectFile(entry.approvedAssetPath));
      } catch {
        /* recorded as absent rather than guessed */
      }
    }
    illustrations.push({
      blockId: s.blockId, assetSha256, page: s.page,
      xIn: s.xIn, yIn: s.yIn, widthIn: s.widthIn, heightIn: s.heightIn,
    });
  }
  const builtAt = new Date().toISOString();
  const provenance = {
    engineFingerprint: fp.engineFingerprint,
    engineFiles: fp.engineFiles,
    gitCommit: fp.gitCommit,
    gitBranch: fp.gitBranch,
    engineDirty: fp.engineDirty,
    dirtyFiles: fp.dirtyFiles,
    ...(dirtyOverrideReason ? { dirtyOverrideReason } : {}),
    layoutStandardId: built.layoutStandardId,
    productionProfileId: built.productionProfileId,
    manuscriptSha256: project!.manuscriptSha256,
    canonicalManuscriptSha256: project!.canonicalManuscriptSha256,
    configSnapshotSha256: configSnapshotSha256(liveConfig),
    configSnapshot: liveConfig,
    buildOptions,
    illustrations,
    pageCount: built.pageCount,
    pdfSha256: pdfSha,
    nodeVersion: process.version,
    builtAt,
  };
  say('');
  say('  4 — PROVENANCE');
  say(`    configSnapshotSha256   ${provenance.configSnapshotSha256}`);
  say(`    illustrations recorded ${illustrations.length} with page + rectangle`);
  const unhashed = illustrations.filter((i) => !i.assetSha256).length;
  if (unhashed) {
    die(
      `${unhashed} of ${illustrations.length} illustrations have no art hash. ` +
        `The record is supposed to pin the BYTES, not just the rectangle.`,
    );
  }
  say(`    art bytes hashed       ${illustrations.length}/${illustrations.length}`);
  say(`    engineFiles pinned     ${fp.engineFiles.length}`);

  const EXPORT_NAME = flag('export-name') ?? path.basename(pdfPath!);
  const storagePath = `${PROJECT_ID}/exports/${EXPORT_NAME}`;
  const artifact = ProofArtifactSchema.parse({
    id: PROOF_ID,
    kind: 'BOOK_PROOF',
    title: flag('label') ?? `${project!.title} — interior rev${rev} (${built.pageCount}pp, FINAL — SHIPPING)`,
    storagePath,
    sha256: pdfSha,
    fileSizeBytes: onDisk.length,
    totalPages: built.pageCount,
    createdAt: builtAt,
    provenance,
  });

  // 5 — supersede prior shipping proofs, never delete them
  const SUPERSEDE_NOTE = ` — SUPERSEDED by rev${rev}`;
  const priorFinals = (liveConfig.proofArtifacts ?? []).filter(
    (a: { kind: string; title: string }) => a.kind === 'BOOK_PROOF' && !a.title.includes('SUPERSEDED'),
  );
  say('');
  say('  5 — SUPERSEDE');
  for (const a of priorFinals) say(`    ${a.id}  "${a.title}"  ->  +"${SUPERSEDE_NOTE.trim()}"`);
  if (!priorFinals.length) say('    (no un-superseded prior BOOK_PROOF)');
  const nextArtifacts = [
    ...(liveConfig.proofArtifacts ?? [])
      .filter((a: { id: string }) => a.id !== PROOF_ID)
      .map((a: { kind: string; title: string }) =>
        a.kind === 'BOOK_PROOF' && !a.title.includes('SUPERSEDED')
          ? { ...a, title: `${a.title}${SUPERSEDE_NOTE}` }
          : a,
      ),
    artifact,
  ];
  const nextConfig = ProjectConfigSchema.parse({ ...liveConfig, proofArtifacts: nextArtifacts });

  say('');
  say('  6 — WRITE');
  say(`    export        ${storagePath}`);
  say(`    proof         ${PROOF_ID}`);
  say(`    status        ${project!.status} -> EXPORTED`);
  if (!CONFIRM) {
    say('');
    say('  DRY RUN COMPLETE — every gate passed. Re-run with --confirm to freeze.');
    say('');
    process.exit(0);
  }

  const stored = await storage.writeProjectFile(PROJECT_ID!, ['exports', EXPORT_NAME], onDisk);
  if (stored.relativePath !== storagePath) die(`storage path drifted: ${stored.relativePath}`);
  const readBack = await storage.readProjectFile(stored.relativePath);
  if (sha(readBack) !== pdfSha) die(`uploaded bytes read back with a different sha (${sha(readBack)})`);
  say(`    uploaded      ${stored.relativePath}  (read back and re-hashed: matches)`);
  await updateProjectConfig(PROJECT_ID!, nextConfig as never);
  await setProjectStatus(PROJECT_ID!, 'EXPORTED');
  const after = await getProject(PROJECT_ID!);
  const recorded = ((after as { config: { proofArtifacts?: { id: string; sha256: string }[] } }).config.proofArtifacts ?? [])
    .find((a) => a.id === PROOF_ID);
  if (!recorded || recorded.sha256 !== pdfSha) die('the proof artifact did not persist');
  say(`    config        ${PROOF_ID} recorded, sha verified on ${host}`);
  say(`    status        ${(after as { status: string }).status}`);
  say('');
  say(`  FROZEN — ${PROOF_ID}. The approved bytes are the stored bytes.`);
  say('');
  process.exit(0);
}

const integrity = checkRecipeIntegrity(recipe, liveConfig);
say(`  integrity      ${integrity.intact ? 'intact' : 'engine moved - reproduction gate required'}`);
for (const r of integrity.reasons) say(`    - ${r}`);

/**
 * A CHANGED RENDERER IS A QUESTION, NOT A VERDICT.
 *
 * The fingerprint covers every renderer source, so any edit to any of them
 * invalidates it - including edits that cannot reach this book. Treating that as
 * a hard stop would mean no book could be corrected again after anyone touched
 * the pipeline, which is not safety, it is paralysis.
 *
 * Treating it as nothing is the rev24 incident: work committed for a different
 * book moved two illustrations and 24 pages of a frozen title.
 *
 * So the fingerprint decides whether to ASK, and a build answers. Rebuild the
 * FROZEN manuscript on today's renderer and compare against the frozen artifact.
 * If every page matches, the renderer change is proven inert for this book and
 * the correction proceeds. If any page moved, the renderer moved the book, and
 * that is Level 3 however small the text edit was.
 *
 * This is the one case where a control build earns its 20 seconds.
 */
let engineProvenInert = false;
if (!integrity.engineMatches) {
  const { model: baseline } = await frozenModel();
  say('');
  say('  0 - REPRODUCTION GATE (renderer moved; proving it cannot reach this book)');
  const frozenText = (await storage.readProjectFile(project!.manuscriptPath!)).toString('utf8');
  const t = Date.now();
  const control = await buildTypesetInterior(PROJECT_ID!, recipe.configSnapshot, {
    ...recipe.buildOptions,
    manuscriptOverride: { text: frozenText, sha256: sha(frozenText) },
  });
  const controlModel = await buildPageModel(control.pdf);
  const norm = (pg: { lines: { text: string }[] }) => pg.lines.map((l) => l.text).join('').replace(/\s+/g, '');
  const moved = baseline.pages
    .map((pg, i) => (norm(pg) === norm(controlModel.pages[i]!) ? -1 : i + 1))
    .filter((x) => x > 0);
  say(`    built in           ${((Date.now() - t) / 1000).toFixed(1)}s`);
  say(`    pages              ${controlModel.pageCount} (frozen ${baseline.pageCount})`);
  say(`    pages differing    ${moved.length ? moved.join(', ') : 'none'}`);
  if (controlModel.pageCount !== baseline.pageCount || moved.length) {
    die(
      `the renderer change MOVED THIS BOOK. Page(s) ${moved.join(', ') || '(count changed)'} ` +
        `differ from the freeze with no manuscript edit at all.\n` +
        `  Correcting on top of this would mix a renderer regression into your text change and ` +
        `no diff could separate them. LEVEL 3: resolve the renderer change or re-freeze.`,
    );
  }
  engineProvenInert = true;
  say(`    VERDICT            renderer change is INERT for this book - fast path continues`);
}

// ── reproduce ────────────────────────────────────────────────────────────────
if (command === 'reproduce') {
  const { model: frozen } = await frozenModel();
  const t0 = Date.now();
  const built = await buildTypesetInterior(PROJECT_ID!, recipe.configSnapshot, recipe.buildOptions);
  const rebuilt = await buildPageModel(built.pdf);
  const assessment = assessChange({
    recipe,
    frozen,
    rebuilt,
    frozenRoles: classifyPages(frozen.pages, frozen.norms),
    rebuiltRoles: classifyPages(rebuilt.pages, rebuilt.norms),
    rebuiltIllustrations: built.stampedIllustrations,
    orphanedIllustrations: built.orphanedIllustrations,
    engineMatches: integrity.engineMatches,
  });
  say('');
  say('  REPRODUCTION');
  say(`    built in           ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  say(`    pages              ${rebuilt.pageCount} (frozen ${frozen.pageCount})`);
  say(`    illustrations      ${built.stampedIllustrations.length} stamped, ${built.orphanedIllustrations.length} orphaned`);
  say(`    pages differing    ${assessment.changedPages.length ? assessment.changedPages.join(', ') : 'none'}`);
  // The PDF is not byte-deterministic — three builds from identical inputs gave
  // three shas while every page of text matched. Layout equality is the check.
  say(`    pdf sha            ${sha(built.pdf).slice(0, 16)}… (bytes are not deterministic; layout is)`);
  say('');
  say(`  ${assessment.changedPages.length === 0 ? 'REPRODUCED — layout identical to the freeze' : 'DID NOT REPRODUCE'}`);
  for (const t of assessment.triggers) say(`    [${t.code}] ${t.detail}`);
  say('');
  process.exit(assessment.changedPages.length === 0 ? 0 : 1);
}

// ── correct ──────────────────────────────────────────────────────────────────
interface Correction {
  id: string;
  expect: string;
  replace: string;
  reason: string;
}

const correctionsPath = flag('corrections');
if (!correctionsPath) die('--corrections <file.json> is required');
const corrections: Correction[] = JSON.parse(readFileSync(correctionsPath!, 'utf8'));
if (!Array.isArray(corrections) || !corrections.length) die('corrections file is empty');
for (const c of corrections) {
  if (!c.id || typeof c.expect !== 'string' || typeof c.replace !== 'string' || !c.reason) {
    die(`correction ${JSON.stringify(c.id ?? '(no id)')} needs id, expect, replace and reason`);
  }
}

/**
 * ─── RE-ANCHORING AN ILLUSTRATION ────────────────────────────────────────────
 * A block's identity is a hash of its opening words, so correcting the opening
 * words of an illustrated block moves its id and orphans the art. Refusing the
 * correction on those grounds would mean a page can be illustrated OR correct
 * but not both, which is the wrong way round: the artwork exists to serve the
 * text.
 *
 * So the move is allowed, but only as a stated intention. `--reanchor old:new`
 * carries the art across, and this is deliberately NOT inferred from "exactly
 * one illustration was orphaned and exactly one block is new" — that heuristic
 * is right until the day two blocks move and it silently swaps two plates.
 *
 * Every value is preserved verbatim. Re-anchoring changes WHICH BLOCK the art
 * hangs on and nothing else: not the asset, not the placement, not the size.
 */
interface Reanchor { from: string; to: string }
const reanchors: Reanchor[] = flags('reanchor').map((spec) => {
  const [from, to, ...rest] = spec.split(':');
  if (!from || !to || rest.length) die(`--reanchor expects <oldBlockId>:<newBlockId>, got ${JSON.stringify(spec)}`);
  return { from: from!, to: to! };
});

const frozenIllustrations: Record<string, unknown> = { ...(recipe.configSnapshot.illustrations ?? {}) };
const buildIllustrations: Record<string, unknown> = { ...frozenIllustrations };
if (reanchors.length) {
  say('');
  say(`  0 — RE-ANCHOR — ${reanchors.length} illustration(s)`);
  const seenFrom = new Set<string>();
  const seenTo = new Set<string>();
  for (const { from, to } of reanchors) {
    if (!(from in frozenIllustrations)) {
      die(`--reanchor ${from}:${to} — ${from} is not an illustration in the frozen config snapshot. ` +
          `Known: ${Object.keys(frozenIllustrations).join(', ') || '(none)'}`);
    }
    if (to in frozenIllustrations) die(`--reanchor ${from}:${to} — ${to} is ALREADY an illustration key; this would overwrite it.`);
    if (seenFrom.has(from)) die(`--reanchor — ${from} given twice.`);
    if (seenTo.has(to)) die(`--reanchor — two illustrations re-anchored onto ${to}.`);
    if (from === to) die(`--reanchor ${from}:${to} — source and target are the same block.`);
    seenFrom.add(from);
    seenTo.add(to);
    buildIllustrations[to] = frozenIllustrations[from];
    delete buildIllustrations[from];
    say(`    ${from} -> ${to}   (asset, placement and size carried over verbatim)`);
  }
  if (Object.keys(buildIllustrations).length !== Object.keys(frozenIllustrations).length) {
    die('re-anchoring changed the number of illustrations — refusing to build.');
  }
}
/** Frozen recipe, with only the authorised anchor moves applied. */
const buildConfig = reanchors.length
  ? { ...recipe.configSnapshot, illustrations: buildIllustrations }
  : recipe.configSnapshot;

say('');
say(`  ${CONFIRM ? 'APPLYING' : 'DRY RUN (read-only — the build runs off an in-memory override)'} — ${corrections.length} correction(s)`);

const manuscriptPath = project!.manuscriptPath;
if (!manuscriptPath) die('project has no manuscript');
const original = (await storage.readProjectFile(manuscriptPath!)).toString('utf8');
if (sha(original) !== project!.manuscriptSha256) {
  die(`the stored manuscript does not match the project row's hash — refusing to edit it`);
}

let corrected = original;
say('');
say('  1 — MATCH');
for (const c of corrections) {
  const hits = corrected.split(c.expect).length - 1;
  say(`    ${c.id}`);
  say(`      occurrences      ${hits}`);
  // Occurrences, not lines. An expectation matching twice in one paragraph is
  // refused rather than applied to whichever comes first.
  if (hits !== 1) {
    die(
      `${c.id}: expected exactly one occurrence of ${JSON.stringify(c.expect)}, found ${hits}. ` +
        `Zero means the text has already changed; more than one means the edit is ambiguous.`,
    );
  }
  corrected = corrected.replace(c.expect, c.replace);
  say(`      "${c.expect}"`);
  say(`   -> "${c.replace}"`);
}

const targetsBefore = pageTargets(original);
const targetsAfter = pageTargets(corrected);
say('');
say('  2 — SOURCE INVARIANTS');
say(`    bytes              ${Buffer.byteLength(original)} -> ${Buffer.byteLength(corrected)}`);
say(`    manuscript sha     ${sha(original).slice(0, 16)}… -> ${sha(corrected).slice(0, 16)}…`);
say(`    page targets       ${targetsBefore.targets} -> ${targetsAfter.targets}`);

// ── build once, against the frozen recipe ────────────────────────────────────
const { model: frozen } = await frozenModel();
say('');
say('  3 — REBUILD (one build, from the frozen recipe)');
const t0 = Date.now();
/**
 * Built from the frozen CONFIG SNAPSHOT with the corrected MANUSCRIPT. Live
 * config is deliberately not used: it drifts as zod defaults are added for other
 * books, and a correction must change the text and nothing else.
 */
const previousManuscript = manuscriptPath!;
const built = await buildTypesetInterior(PROJECT_ID!, buildConfig, {
  ...recipe.buildOptions,
  manuscriptOverride: { text: corrected, sha256: sha(corrected) },
});
const rebuilt = await buildPageModel(built.pdf);
say(`    built in           ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// ── assess ───────────────────────────────────────────────────────────────────
const expectedPages = flag('pages')?.split(',').map((n) => Number(n.trim())).filter(Boolean);
const assessment = assessChange({
  recipe,
  frozen,
  rebuilt,
  expectedPages,
  frozenRoles: classifyPages(frozen.pages, frozen.norms),
  rebuiltRoles: classifyPages(rebuilt.pages, rebuilt.norms),
  rebuiltIllustrations: built.stampedIllustrations,
  orphanedIllustrations: built.orphanedIllustrations,
  frozenManuscript: original,
  correctedManuscript: corrected,
  engineMatches: integrity.engineMatches || engineProvenInert,
});

/**
 * A re-anchor is only correct if the art actually landed. `--reanchor` names an
 * intention; this is the proof. Without it a typo'd target id would report a
 * clean build with one plate silently missing from the book.
 */
if (reanchors.length) {
  const stampedBy = new Map(built.stampedIllustrations.map((s: { blockId: string }) => [s.blockId, s]));
  const frozenBy = new Map(recipe.illustrations.map((i: { blockId: string }) => [i.blockId, i]));
  say('');
  say('  3b — RE-ANCHOR VERIFICATION');
  const bad: string[] = [];
  for (const { from, to } of reanchors) {
    const now: any = stampedBy.get(to);
    const before: any = frozenBy.get(from);
    if (!now) { bad.push(`${to} did not stamp`); say(`    FAIL  ${from} -> ${to}   not stamped`); continue; }
    if (stampedBy.has(from)) { bad.push(`${from} still stamped`); say(`    FAIL  ${from} still stamped — the old block did not move`); continue; }
    // Same plate, same printed size. The page number may legitimately change
    // when the corrected text reflows; the geometry may not.
    const sizeSame = before
      ? Math.abs(now.widthIn - before.widthIn) < 1e-6 && Math.abs(now.heightIn - before.heightIn) < 1e-6
      : true;
    if (!sizeSame) bad.push(`${to} changed printed size`);
    say(`    ${sizeSame ? 'PASS' : 'FAIL'}  ${from} -> ${to}   p${before?.page ?? '?'} -> p${now.page}   ` +
        `${now.widthIn.toFixed(4)}×${now.heightIn.toFixed(4)}in @ ${Math.round(now.nativePpi)}ppi` +
        (before ? ` (was ${before.widthIn.toFixed(4)}×${before.heightIn.toFixed(4)}in)` : ''));
  }
  if (built.orphanedIllustrations.length) {
    for (const o of built.orphanedIllustrations) say(`    FAIL  orphaned ${o.blockId} — ${o.reason}`);
    bad.push(`${built.orphanedIllustrations.length} orphaned`);
  }
  if (bad.length) die(`re-anchor did not verify: ${bad.join('; ')}. Nothing was written.`);
}

say('');
say('  4 — REGRESSION');
say(`    pages              ${rebuilt.pageCount} (frozen ${frozen.pageCount})`);
say(`    changed            ${assessment.changedPages.length ? assessment.changedPages.join(', ') : 'none'}`);
say(`    reflowed           ${assessment.reflowedPages.length ? assessment.reflowedPages.join(', ') : 'none'}`);
say(`    illustrations      ${built.stampedIllustrations.length} stamped, ${built.orphanedIllustrations.length} orphaned`);
say(`    page targets       ${targetsAfter.targets}`);
say('');
say(`  ${assessment.summary}`);
if (engineProvenInert) say(`    note: renderer differs from the freeze, proven inert by the reproduction gate`);
for (const t of assessment.triggers) say(`    [${t.code}] ${t.detail}`);

// ── proofs of ONLY what changed ──────────────────────────────────────────────
/**
 * The changed pages and their immediate neighbours, because a callout the text
 * points at usually sits on the next page. Not 170 contact sheets: pages that
 * are byte-identical to an already-approved artifact have nothing to look at.
 */
const toRender = [...new Set(assessment.changedPages.flatMap((p) => [p - 1, p, p + 1]))]
  .filter((p) => p >= 1 && p <= rebuilt.pageCount)
  .sort((a, b) => a - b);
if (toRender.length) {
  const r = await rasterizePages(built.pdf, toRender, { scale: 2 });
  for (const [n, b] of r.pages) writeFileSync(path.join(OUT, `p${String(n).padStart(3, '0')}.png`), b);
  say('');
  say(`  5 — PROOFS           ${toRender.join(', ')}  ->  ${OUT}`);
}

writeFileSync(path.join(OUT, 'corrected.pdf'), built.pdf);
writeFileSync(
  path.join(OUT, 'assessment.json'),
  `${JSON.stringify({ freezeId: recipe.freezeId, ...assessment, manuscriptShaAfter: sha(corrected), pdfSha: sha(built.pdf) }, null, 2)}\n`,
);

if (!CONFIRM) {
  say('');
  say(`  DRY RUN COMPLETE — project restored, nothing written. Re-run with --confirm to apply.`);
  say('');
  process.exit(assessment.level >= 3 ? 1 : 0);
}

/**
 * LEVEL 3 IS A DECISION, NOT A DEFAULT.
 *
 * The fast path refuses structural movement because it must never happen as a
 * SIDE EFFECT of a text edit — that is precisely how a 95-character heuristic
 * reflowed 24 pages of a frozen book. It is not a claim that a frozen book can
 * never reflow again. When the product owner has looked at the movement and
 * accepted it, that is the deliberate decision the refusal was asking for, and
 * it is recorded here in the assessment rather than worked around in a
 * throwaway script.
 */
const level3Reason = flag('accept-level-3');
if (assessment.level >= 3 && !level3Reason) {
  die(
    `this correction is LEVEL ${assessment.level}, not a fast-path edit. Nothing was written — ` +
      `the build ran off an in-memory override, so the project is exactly as it was found. ` +
      `Structural movement needs the wider checks and a new freeze, which is a deliberate ` +
      `decision rather than a side effect of a text edit. If it HAS been decided, re-run with ` +
      `--accept-level-3 "<who approved it, and why>".`,
  );
}
if (assessment.level >= 3) {
  say('');
  say(`  LEVEL ${assessment.level} ACCEPTED — ${level3Reason}`);
}

/**
 * The anchor move is persisted to the LIVE config, not just used for this build.
 * Leaving it in-memory would store a manuscript whose illustrated block no
 * longer exists in the config, so the next build of this book would orphan the
 * plate and nobody would know why.
 */
if (reanchors.length) {
  const liveIllustrations: Record<string, unknown> = { ...(liveConfig.illustrations ?? {}) };
  for (const { from, to } of reanchors) {
    if (!(from in liveIllustrations)) die(`live config no longer has illustration ${from} — refusing to write a partial re-anchor`);
    liveIllustrations[to] = liveIllustrations[from];
    delete liveIllustrations[from];
  }
  await updateProjectConfig(PROJECT_ID!, { ...liveConfig, illustrations: liveIllustrations } as never);
  const after = await getProject(PROJECT_ID!);
  const keys = Object.keys((after as any)?.config?.illustrations ?? {});
  for (const { from, to } of reanchors) {
    if (keys.includes(from) || !keys.includes(to)) die(`re-anchor did not persist: ${from} -> ${to}. Config now has ${keys.join(', ')}`);
  }
  say('');
  say(`  5b — CONFIG WRITTEN     ${reanchors.map((r) => `${r.from}->${r.to}`).join(', ')}   verified on ${host}`);
}

// ── commit the corrected manuscript under a real name ────────────────────────
const revName = flag('as') ?? `${path.basename(previousManuscript).replace(/\.md$/, '')}.corrected.md`;
const stored = await storage.writeProjectFile(PROJECT_ID!, ['manuscripts', revName], corrected);
await replaceWorkingManuscript(PROJECT_ID!, {
  manuscriptPath: stored.relativePath,
  manuscriptSha256: sha(corrected),
});
say('');
say('  6 — WRITTEN');
say(`    manuscript         ${stored.relativePath}`);
say(`    sha256             ${sha(corrected)}`);
say(`    canonical          untouched (${project!.canonicalManuscriptSha256 ?? 'none'})`);
say('');
say(`  DONE — level ${assessment.level}. Not frozen: promote deliberately with a freeze.`);
say('');
process.exit(0);
