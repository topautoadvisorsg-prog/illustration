/**
 * HISTORICAL - DO NOT USE FOR NEW BOOKS.
 *
 * The rev26 freeze of NO ONE TOLD ME THAT. Kept as the audit trail for that
 * freeze; the generic path is `scripts/qa/book.ts`.
 *
 * Kept, not deleted: it is the record of a write to a production book.
 *
 * FREEZE rev26 as the shipping paperback interior of NO ONE TOLD ME THAT.
 *
 *   tsx scripts/qa/nottm-freeze-rev26.ts [--confirm]
 *
 * Dry run by default. Writes to the production project only with --confirm.
 *
 * ─── WHAT A FREEZE IS HERE ────────────────────────────────────────────────
 * A BOOK_PROOF entry in `config.proofArtifacts`, carrying a BuildProvenance
 * record. rev20 through rev24 have no provenance because they predate it; those
 * records are history and are not rewritten to pretend otherwise. rev26 gets a
 * full one.
 *
 * ─── WHAT IS UPLOADED, AND WHERE THE PLACEMENTS COME FROM ─────────────────
 * The bytes uploaded are the APPROVED ones, sha 1c99e65d…, read from disk and
 * hash-checked before and after upload. They are never replaced by a rebuild.
 *
 * A rebuild still happens, because the provenance record has to say where each
 * of the 11 illustrations was PLACED, in inches and at what native ppi, and the
 * only source for that is a build.
 *
 * THE PDF IS NOT BYTE-DETERMINISTIC. Two builds from identical inputs produce
 * different bytes — almost certainly image re-encoding, since page count, page
 * text and illustration placement all match. So "rebuild == approved" cannot be
 * the check. The check is LAYOUT EQUIVALENCE: same page count, same text on
 * every page, 11 stamped and 0 orphaned. That is what makes the rebuild's
 * placements true of the approved artifact. Anything less and this script stops.
 *
 * This also means `pdfSha256` in any freeze record here identifies a FILE, not
 * something a rebuild can be expected to reproduce. Worth knowing before anyone
 * treats a sha mismatch on rebuild as evidence the book changed.
 *
 * ─── ENGINE CLEANLINESS ───────────────────────────────────────────────────
 * `assertEngineCleanForProduction` refuses a dirty renderer, and its own text
 * says the override is for development, never for a freeze. It is called here
 * rather than skipped, so a dirty tree has to be an explicit, recorded decision
 * instead of an omission. If it throws, this script stops and the operator is
 * told which file and why.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PROJECT_ID = '3b7ed37a-8a07-4bfd-a0c3-14ae5dc4a6ff';
const CONFIRM = process.argv.includes('--confirm');

/** Every value the owner approved. Nothing is inferred; a mismatch stops the run. */
const APPROVED = {
  manuscriptSha: '22ebbb8fc3bd4dd123921f7efd22bc999ced7f30721be41fe7eda3cf7fdd308b',
  pdfSha: '1c99e65d8780e7983be5b14473beb87d5165186aeccd2f5758a253138933ce98',
  canonicalSha: '3947322d7c42de9b2912245d7d9fd29614cbf8b0f94c8635972d052ffd97a302',
  pageCount: 170,
  illustrations: 11,
  expressions: 121,
  targets: 124,
} as const;

const REV = 26;
const PROOF_ID = `book-proof-rev${REV}`;
const EXPORT_NAME = `NO_ONE_TOLD_ME_THAT_interior_rev${REV}_170pp.pdf`;
const APPROVED_PDF = 'C:/Users/jovan/Downloads/wildlands agents platform/backend/.page-qa/nottm/corrected.pdf';

const PROD_URL = readFileSync(path.join(REPO_ROOT, '.env'), 'utf8')
  .split(/\r?\n/)
  .find((l) => l.startsWith('DATABASE_URL='))!
  .slice('DATABASE_URL='.length)
  .trim()
  .replace(/^["']|["']$/g, '');
const host = PROD_URL.replace(/.*@/, '').replace(/\?.*/, '');
if (host.startsWith('127.0.0.1') || host.startsWith('localhost')) {
  throw new Error(`.env DATABASE_URL is not production (${host}). Refusing.`);
}
await import('../../src/env.js');
process.env.DATABASE_URL = PROD_URL;

const { getProject, updateProjectConfig, setProjectStatus } = await import(
  '../../src/db/repositories/projects.repo.js'
);
const { getProjectStorage } = await import('../../src/services/storage/project-storage.js');
const { buildTypesetInterior } = await import('../../src/pipeline/typeset/build-typeset-interior.js');
const { ProjectConfigSchema, ProofArtifactSchema } = await import('@wildlands/shared');
const { computeEngineFingerprint, assertEngineCleanForProduction, configSnapshotSha256, DirtyEngineError } =
  await import('../../src/pipeline/build-provenance.js');
const { PDFDocument } = await import('pdf-lib');
const { buildPageModel } = await import('../../src/pipeline/page-qa/page-model.js');


for (const [name, fn] of Object.entries({ updateProjectConfig, setProjectStatus })) {
  if (typeof fn !== 'function') {
    throw new Error(
      `${name} is not exported by projects.repo. Destructuring a missing name from ` +
        `await import() yields undefined silently, so this would only have failed AFTER ` +
        `the earlier writes had already landed. Checked up front for that reason.`,
    );
  }
}

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const say = (s = '') => console.log(s);
const die = (msg: string): never => {
  say(`\n  ABORTED — ${msg}\n`);
  process.exit(1);
};
let failed = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = String(actual) === String(expected);
  if (!ok) failed += 1;
  say(`    [${ok ? 'PASS' : 'FAIL'}] ${label.padEnd(38)} ${actual}${ok ? '' : `   expected ${expected}`}`);
};

say('');
say(`FREEZE rev${REV} — ${CONFIRM ? 'APPLYING' : 'DRY RUN (nothing will be written)'}`);
say('─'.repeat(94));
say(`  connection     ${host}   (this process only)`);

const project = await getProject(PROJECT_ID);
if (!project) die(`project ${PROJECT_ID} not found`);
const config = ProjectConfigSchema.parse(project!.config);
const storage = getProjectStorage();

// ── 1. the engine ───────────────────────────────────────────────────────────
say('');
say('  1 — ENGINE');
const fp = computeEngineFingerprint();
say(`    fingerprint  ${fp.engineFingerprint}`);
say(`    commit       ${fp.gitCommit?.slice(0, 12)} (${fp.gitBranch})`);
let dirtyOverrideReason: string | undefined;
try {
  ({ dirtyOverrideReason } = assertEngineCleanForProduction(fp));
  if (dirtyOverrideReason) {
    // Say so plainly. A line reading "clean" over an overridden gate is how a
    // forced build later gets mistaken for one that was never forced.
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
  die(
    `the renderer is dirty and a freeze must come from committed code.\n` +
      `  The engine fingerprint hashes file CONTENT, so bytes that live only in an\n` +
      `  uncommitted file cannot be recovered if that file is later changed. That is\n` +
      `  precisely how this book lost rev24.\n\n` +
      `  Commit the listed file (it belongs to another operator's work in progress),\n` +
      `  then re-run. Nothing about rev${REV} changes when you do — the book does not\n` +
      `  read that standard, and its bytes are already proven identical.`,
  );
}

// ── 2. stored state must be exactly what was approved ───────────────────────
say('');
say('  2 — STORED STATE');
check('manuscript sha256', project!.manuscriptSha256, APPROVED.manuscriptSha);
check('canonical sha256 (untouched)', project!.canonicalManuscriptSha256, APPROVED.canonicalSha);
check('publishing.edition', JSON.stringify(config.publishing.edition), '""');
check('publishing.copyrightYear', config.publishing.copyrightYear, 2026);
check('illustrations configured', Object.keys(config.illustrations ?? {}).length, APPROVED.illustrations);
check('layout standard', config.typesetLayoutStandardId, 'educational-nonfiction-typeset@3');
check('production profile', config.productionProfileId, 'bw-educational-nonfiction');
const existing = (config.proofArtifacts ?? []).find((a) => a.id === PROOF_ID);
if (existing && existing.sha256 !== APPROVED.pdfSha) die(`${PROOF_ID} exists with a different sha (${existing.sha256})`);
if (existing) say(`    NOTE: ${PROOF_ID} already recorded with the approved sha — reconciling, not re-freezing.`);

const manuscript = (await storage.readProjectFile(project!.manuscriptPath!)).toString('utf8');
check('manuscript bytes re-hashed', sha(manuscript), APPROVED.manuscriptSha);
const expressions = manuscript.match(/p\.\s?\d{1,3}/g) ?? [];
const extra = manuscript.match(/p\.\s?\d{1,3},\s?\d{1,3}/g) ?? [];
check('reference expressions', expressions.length, APPROVED.expressions);
check('page targets (3 name two pages)', expressions.length + extra.length, APPROVED.targets);
check('"Read the box below" remaining', (manuscript.match(/Read the box below/g) ?? []).length, 0);

// ── 3. rebuild, and require the approved bytes ──────────────────────────────
say('');
say('  3 — REBUILD (for illustration placements) + LAYOUT EQUIVALENCE');
const onDisk = readFileSync(APPROVED_PDF);
check('approved file on disk sha256', sha(onDisk), APPROVED.pdfSha);
const built = await buildTypesetInterior(PROJECT_ID, config, { chaptersStartRecto: false });
check('page count', built.pageCount, APPROVED.pageCount);
check('illustrations stamped', built.stampedIllustrations.length, APPROVED.illustrations);
check('illustrations orphaned', built.orphanedIllustrations.length, 0);
check('page count in the approved PDF', (await PDFDocument.load(onDisk)).getPageCount(), APPROVED.pageCount);

// Layout equivalence, page by page. The bytes differ between builds; the book
// must not. If one page of text disagrees, the rebuild's placements describe a
// different artifact and may not be recorded against this one.
const approvedModel = await buildPageModel(onDisk);
const rebuiltModel = await buildPageModel(built.pdf);
const pageText = (p: { lines: { text: string }[] }) => p.lines.map((l) => l.text).join('').replace(/\s+/g, '');
const differing = approvedModel.pages
  .map((p, i) => (pageText(p) === pageText(rebuiltModel.pages[i]!) ? -1 : i + 1))
  .filter((n) => n > 0);
check('rebuild pages equal to approved', differing.length ? differing.join(',') : 0, 0);
check(
  'body-line profile equal',
  approvedModel.pages.map((p) => p.body.length).join(',') === rebuiltModel.pages.map((p) => p.body.length).join(',')
    ? 'yes'
    : 'no',
  'yes',
);
say(`    note: rebuild sha ${sha(built.pdf).slice(0, 16)}… != approved — PDF bytes are not deterministic`);

if (failed) die(`${failed} precondition(s) failed. Nothing was written.`);
say('    every precondition holds.');

// ── 4. the provenance record ────────────────────────────────────────────────
const illustrations = [] as { blockId: string; assetSha256?: string; page: number; xIn: number; yIn: number; widthIn: number; heightIn: number }[];
for (const s of built.stampedIllustrations) {
  // `approvedAssetPath` is the asset actually stamped. `rawAssetPath` is the art as
  // generated, which is NOT necessarily what went on the page after a replacement.
  const entry = (config.illustrations ?? {})[s.blockId] as { approvedAssetPath?: string } | undefined;
  let assetSha256: string | undefined;
  if (entry?.approvedAssetPath) {
    try {
      assetSha256 = sha(await storage.readProjectFile(entry.approvedAssetPath));
    } catch {
      /* recorded as absent rather than guessed */
    }
  }
  illustrations.push({
    blockId: s.blockId,
    assetSha256,
    page: s.page,
    xIn: s.xIn,
    yIn: s.yIn,
    widthIn: s.widthIn,
    heightIn: s.heightIn,
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
  manuscriptSha256: APPROVED.manuscriptSha,
  canonicalManuscriptSha256: APPROVED.canonicalSha,
  configSnapshotSha256: configSnapshotSha256(config),
  configSnapshot: config,
  illustrations,
  pageCount: built.pageCount,
  pdfSha256: APPROVED.pdfSha,
  nodeVersion: process.version,
  builtAt,
};

say('');
say('  4 — PROVENANCE');
say(`    engineFingerprint      ${provenance.engineFingerprint}`);
say(`    layoutStandardId       ${provenance.layoutStandardId}`);
say(`    configSnapshotSha256   ${provenance.configSnapshotSha256}`);
say(`    illustrations recorded ${illustrations.length} with page + rectangle`);
const unhashed = illustrations.filter((i) => !i.assetSha256).length;
if (unhashed) die(`${unhashed} of ${illustrations.length} illustrations have no art hash. The record is supposed to pin the BYTES, not just the rectangle.`);
say(`    art bytes hashed       ${illustrations.length}/${illustrations.length}`);
say(`    engineFiles pinned     ${fp.engineFiles.length}`);

const storagePath = `${PROJECT_ID}/exports/${EXPORT_NAME}`;
const artifact = ProofArtifactSchema.parse({
  id: PROOF_ID,
  kind: 'BOOK_PROOF',
  title: `NO ONE TOLD ME THAT — interior rev${REV} (170pp, FINAL — SHIPPING)`,
  storagePath,
  sha256: APPROVED.pdfSha,
  fileSizeBytes: onDisk.length,
  totalPages: built.pageCount,
  createdAt: builtAt,
  provenance,
});

// ── 5. supersede the previous shipping interior, never delete it ────────────
const SUPERSEDE_NOTE = ` — SUPERSEDED by rev${REV}`;
const priorFinals = (config.proofArtifacts ?? []).filter(
  (a) => a.kind === 'BOOK_PROOF' && !a.title.includes('SUPERSEDED'),
);
say('');
say('  5 — SUPERSEDE');
for (const a of priorFinals) say(`    ${a.id}  "${a.title}"  ->  +"${SUPERSEDE_NOTE.trim()}"`);
if (!priorFinals.length) say('    (no un-superseded prior BOOK_PROOF)');

const nextArtifacts = [
  ...(config.proofArtifacts ?? []).filter((a) => a.id !== PROOF_ID).map((a) =>
    a.kind === 'BOOK_PROOF' && !a.title.includes('SUPERSEDED')
      ? { ...a, title: `${a.title}${SUPERSEDE_NOTE}` }
      : a,
  ),
  artifact,
];
const nextConfig = ProjectConfigSchema.parse({ ...config, proofArtifacts: nextArtifacts });

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

const stored = await storage.writeProjectFile(PROJECT_ID, ['exports', EXPORT_NAME], onDisk);
say(`    uploaded      ${stored.relativePath}`);
if (stored.relativePath !== storagePath) die(`storage path drifted: ${stored.relativePath}`);
const readBack = await storage.readProjectFile(stored.relativePath);
if (sha(readBack) !== APPROVED.pdfSha) die(`uploaded bytes do not read back as the approved sha`);
say(`    read back     sha matches`);

await updateProjectConfig(PROJECT_ID, nextConfig);
await setProjectStatus(PROJECT_ID, 'EXPORTED');
say(`    written.`);

say('');
say(`  FROZEN — ${PROOF_ID}`);
say('');
