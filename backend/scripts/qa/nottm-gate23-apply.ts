/**
 * GATES 2 and 3 — make the control exact, then apply two approved sentences.
 *
 *   tsx scripts/qa/nottm-gate23-apply.ts --confirm
 *
 * Without --confirm it runs every check and mutates NOTHING. That is the default
 * on purpose: this writes to the production project for a book that has already
 * shipped.
 *
 * ─── WHAT IT CHANGES, AND NOTHING ELSE ────────────────────────────────────
 *
 *   config.publishing.edition        "First Edition" -> ""
 *   config.publishing.copyrightYear  (unset)         -> 2026
 *
 *   manuscript, two sentences:
 *     "Read the box below for what isn’t."  ->  "The next page covers what isn’t."
 *     "Read the box below."                 ->  "See the box on the next page."
 *
 * WHY THE EDITION FIELD. The shipped interior omits an edition statement. Commit
 * e90c76d (2026-08-22) introduced `publicationFacts`, which did not exist before
 * it, and began passing six publication fields to front matter for the first
 * time. This project had stored `edition: "First Edition"` all along, inert
 * because nothing read it. Emptying the field restores the shipped page without
 * touching shared code — the documented off-switch, used as documented.
 *
 * WHY THE YEAR. `year: p.copyrightYear ?? new Date().getFullYear()`. The project
 * stores no year, so the page currently reads 2026 only because it IS 2026. A
 * rebuild in January would silently reprint the book with a new copyright year.
 * Pinning it changes nothing visible today and removes that trap.
 *
 * The canonical rev14 source is never touched: `replaceWorkingManuscript` omits
 * those columns from its SET clause entirely.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PROJECT_ID = '3b7ed37a-8a07-4bfd-a0c3-14ae5dc4a6ff';
const SHIPPED = 'C:/Users/jovan/Downloads/NO_ONE_TOLD_ME_THAT_KDP/NO_ONE_TOLD_ME_THAT_interior_rev25_170pp_FINAL.pdf';
const CONFIRM = process.argv.includes('--confirm');

const CORRECTIONS = [
  {
    id: 'p64-false-cross-reference',
    expect: 'Read the box below for what isn\u2019t.',
    replace: 'The next page covers what isn\u2019t.',
  },
  {
    id: 'p77-false-cross-reference',
    expect: 'Read the box below.',
    replace: 'See the box on the next page.',
  },
];

const raw = readFileSync(path.join(REPO_ROOT, '.env'), 'utf8');
const PROD_URL = raw
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

const { getProject, updateProjectConfig, replaceWorkingManuscript } = await import(
  '../../src/db/repositories/projects.repo.js'
);
const { getProjectStorage } = await import('../../src/services/storage/project-storage.js');
const { buildTypesetInterior } = await import('../../src/pipeline/typeset/build-typeset-interior.js');
const { ProjectConfigSchema } = await import('@wildlands/shared');
const { buildPageModel } = await import('../../src/pipeline/page-qa/page-model.js');
const { classifyPages } = await import('../../src/pipeline/page-qa/page-roles.js');

const OUT = '.page-qa/nottm';
mkdirSync(OUT, { recursive: true });
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const say = (s = '') => console.log(s);
const die = (msg: string): never => {
  say(`\n  ABORTED — ${msg}\n`);
  process.exit(1);
};

say('');
say(`GATES 2-3 — ${CONFIRM ? 'APPLYING' : 'DRY RUN (nothing will be written)'}`);
say('─'.repeat(94));
say(`  connection       ${host}   (this process only)`);

const project = await getProject(PROJECT_ID);
if (!project) die(`project ${PROJECT_ID} not found`);
const storage = getProjectStorage();

// ── the shipped artifact, for comparison ────────────────────────────────────
const shippedModel = await buildPageModel(readFileSync(SHIPPED));
const pageText = (p: { lines: { text: string }[] }) => p.lines.map((l) => l.text).join('').replace(/\s+/g, '');
const shippedText = shippedModel.pages.map(pageText);
const shippedProfile = shippedModel.pages.map((p) => p.body.length).join(',');

// ── STEP 1: reproducibility settings ────────────────────────────────────────
const config = ProjectConfigSchema.parse(project!.config);
const pub = config.publishing as Record<string, unknown>;
say('');
say('  STEP 1 — reproducibility settings');
say(`    edition        ${JSON.stringify(pub.edition)} -> ""`);
say(`    copyrightYear  ${JSON.stringify(pub.copyrightYear ?? null)} -> 2026`);
if (pub.edition !== 'First Edition') say(`    NOTE: edition is not the expected "First Edition"; continuing with what is stored.`);

const nextConfig = ProjectConfigSchema.parse({
  ...config,
  publishing: { ...config.publishing, edition: '', copyrightYear: 2026 },
});

if (CONFIRM) {
  await updateProjectConfig(PROJECT_ID, nextConfig);
  say('    written.');
} else {
  say('    (dry run — not written)');
}

// ── STEP 2: rebuild the control and require an EXACT match ──────────────────
say('');
say('  STEP 2 — control build, must match the shipped artifact exactly');
const control = await buildTypesetInterior(PROJECT_ID, CONFIRM ? nextConfig : nextConfig, {
  chaptersStartRecto: false,
});
writeFileSync(path.join(OUT, 'control.pdf'), control.pdf);
const controlModel = await buildPageModel(control.pdf);
const controlText = controlModel.pages.map(pageText);
const controlProfile = controlModel.pages.map((p) => p.body.length).join(',');
const controlDiff = shippedText.map((t, i) => (t === controlText[i] ? -1 : i + 1)).filter((n) => n > 0);

say(`    pages                ${controlModel.pageCount}`);
say(`    body-line profile    ${controlProfile === shippedProfile ? 'identical to shipped' : 'DIFFERS from shipped'}`);
say(`    pages differing      ${controlDiff.length}${controlDiff.length ? ` (${controlDiff.join(', ')})` : ''}`);
say(`    control sha256       ${sha(control.pdf)}`);

if (controlModel.pageCount !== 170) die(`control is ${controlModel.pageCount} pages, expected 170`);
if (controlProfile !== shippedProfile) die('control body-line profile differs from the shipped artifact');
if (controlDiff.length !== 0) die(`control still differs from shipped on page(s) ${controlDiff.join(', ')}`);
say('    CONTROL IS EXACT.');

// ── STEP 3: the two corrections, verified before mutation ───────────────────
say('');
say('  STEP 3 — the two approved corrections');
const manuscriptPath = project!.manuscriptPath!;
const original = (await storage.readProjectFile(manuscriptPath)).toString('utf8');
say(`    working manuscript   ${manuscriptPath}`);
say(`    sha256 before        ${sha(original)}`);

let corrected = original;
for (const c of CORRECTIONS) {
  const hits = corrected.split(c.expect).length - 1;
  say(`    ${c.id}`);
  say(`      expect occurrences ${hits}`);
  if (hits !== 1) die(`${c.id}: expected exactly one occurrence of ${JSON.stringify(c.expect)}, found ${hits}`);
  corrected = corrected.replace(c.expect, c.replace);
  say(`      "${c.expect}" -> "${c.replace}"`);
}
say(`    sha256 after         ${sha(corrected)}`);
say(`    bytes                ${Buffer.byteLength(original)} -> ${Buffer.byteLength(corrected)}`);

if (!CONFIRM) {
  say('');
  say('  DRY RUN COMPLETE — every gate passed. Re-run with --confirm to write.');
  say('');
  process.exit(0);
}

const stored = await storage.writeProjectFile(PROJECT_ID, ['manuscripts', 'NO-ONE-TOLD-ME-THAT_rev26.md'], corrected);
await replaceWorkingManuscript(PROJECT_ID, {
  manuscriptPath: stored.relativePath,
  manuscriptSha256: sha(corrected),
});
say(`    stored as            ${stored.relativePath}`);

// ── STEP 4: rebuild and prove locality ──────────────────────────────────────
say('');
say('  STEP 4 — rebuild and prove only the two pages moved');
const after = await buildTypesetInterior(PROJECT_ID, nextConfig, { chaptersStartRecto: false });
writeFileSync(path.join(OUT, 'corrected.pdf'), after.pdf);
const afterModel = await buildPageModel(after.pdf);
const afterText = afterModel.pages.map(pageText);
const afterProfile = afterModel.pages.map((p) => p.body.length).join(',');
const changed = controlText.map((t, i) => (t === afterText[i] ? -1 : i + 1)).filter((n) => n > 0);
const roles = classifyPages(afterModel.pages, afterModel.norms);
const openers = roles.filter((r) => r.role === 'CHAPTER_OPENER').map((r) => r.page).join(',');
const shippedOpeners = classifyPages(shippedModel.pages, shippedModel.norms)
  .filter((r) => r.role === 'CHAPTER_OPENER')
  .map((r) => r.page)
  .join(',');
const targets = (m: string) => (m.match(/p\.\s?\d{1,3}/g) ?? []).length;

say(`    pages                ${afterModel.pageCount}`);
say(`    body-line profile    ${afterProfile === controlProfile ? 'identical to control' : 'DIFFERS from control'}`);
say(`    pages changed        ${changed.length}${changed.length ? ` (${changed.join(', ')})` : ''}`);
say(`    opener pagination    ${openers === shippedOpeners ? 'unchanged' : 'CHANGED'}`);
say(`    illustrations        ${Object.keys(nextConfig.illustrations ?? {}).length}`);
say(`    page targets in src  ${targets(corrected)} (was ${targets(original)})`);
say(`    corrected sha256     ${sha(after.pdf)}`);
writeFileSync(
  path.join(OUT, 'result.json'),
  JSON.stringify(
    {
      manuscriptShaBefore: sha(original),
      manuscriptShaAfter: sha(corrected),
      manuscriptPath: stored.relativePath,
      controlPdfSha: sha(control.pdf),
      correctedPdfSha: sha(after.pdf),
      pageCount: afterModel.pageCount,
      pagesChanged: changed,
      openersUnchanged: openers === shippedOpeners,
    },
    null,
    2,
  ),
);
say('');
say('  Not frozen, not promoted. Report and wait.');
say('');
