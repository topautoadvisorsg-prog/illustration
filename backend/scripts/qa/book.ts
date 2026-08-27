/**
 * book — one command for correcting and reproducing a frozen book.
 *
 *   tsx scripts/qa/book.ts recipe    --project <id>
 *   tsx scripts/qa/book.ts reproduce --project <id>
 *   tsx scripts/qa/book.ts correct   --project <id> --corrections <file.json> [--confirm]
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
const CONFIRM = has('confirm');
const PROJECT_ID = flag('project');

const say = (s = '') => console.log(s);
const die = (msg: string): never => {
  say(`\n  STOPPED — ${msg}\n`);
  process.exit(1);
};

if (!command || !['recipe', 'reproduce', 'correct'].includes(command)) {
  say('');
  say('  tsx scripts/qa/book.ts recipe    --project <id>');
  say('  tsx scripts/qa/book.ts reproduce --project <id>');
  say('  tsx scripts/qa/book.ts correct   --project <id> --corrections <file.json> [--confirm]');
  say('');
  process.exit(1);
}
if (!PROJECT_ID) die('--project <id> is required');

// ── production connection, scoped to this process ────────────────────────────
/**
 * `env.ts` loads `.env` then `.env.development.local` with override, so the
 * developer database always wins. This reads the production URL out of `.env`
 * and puts it back AFTER the dotenv layers have run and BEFORE any database
 * client is constructed. No file is edited; nothing else changes behaviour.
 */
const PROD_URL = readFileSync(path.join(REPO_ROOT, '.env'), 'utf8')
  .split(/\r?\n/)
  .find((l) => l.startsWith('DATABASE_URL='))
  ?.slice('DATABASE_URL='.length)
  .trim()
  .replace(/^["']|["']$/g, '');
if (!PROD_URL) die('.env has no DATABASE_URL');
const host = PROD_URL!.replace(/.*@/, '').replace(/\?.*/, '');
await import('../../src/env.js');
process.env.DATABASE_URL = PROD_URL;

const { getProject, updateProjectConfig, replaceWorkingManuscript } = await import(
  '../../src/db/repositories/projects.repo.js'
);
/**
 * Checked up front, not at the call site. Destructuring a name that a module
 * does not export yields `undefined` silently, so a typo survives every dry run
 * and throws only after the writes before it have already landed. That is
 * exactly how a freeze ended up half-applied.
 */
for (const [name, fn] of Object.entries({ getProject, updateProjectConfig, replaceWorkingManuscript })) {
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
  if (err instanceof NoFrozenRecipeError) die(err.message);
  throw err;
}

const OUT = path.join('.book', PROJECT_ID!);
mkdirSync(OUT, { recursive: true });

say('');
say(`${command.toUpperCase()} — ${project!.title}`);
say('─'.repeat(94));
say(`  connection     ${host}   (this process only)`);
say(`  freeze         ${recipe.freezeId}   ${recipe.pageCount}pp   ${recipe.builtAt}`);
say(`  standard       ${recipe.layoutStandardId}   profile ${recipe.productionProfileId ?? '(default)'}`);
say(
  `  buildOptions   chaptersStartRecto=${recipe.buildOptions.chaptersStartRecto}   ` +
    `${recipe.buildOptionsRecorded ? 'RECORDED' : 'INFERRED — not in the freeze record'}`,
);

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
const built = await buildTypesetInterior(PROJECT_ID!, recipe.configSnapshot, {
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

if (assessment.level >= 3) {
  die(
    `this correction is LEVEL ${assessment.level}, not a fast-path edit. Nothing was written — ` +
      `the build ran off an in-memory override, so the project is exactly as it was found. ` +
      `Structural movement needs the wider checks and a new freeze, which is a deliberate ` +
      `decision rather than a side effect of a text edit.`,
  );
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
