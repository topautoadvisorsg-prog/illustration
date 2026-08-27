/**
 * HISTORICAL - DO NOT USE FOR NEW BOOKS.
 *
 * Superseded by `scripts/qa/book.ts reproduce`, which does the same job for any
 * book by reading the frozen recipe instead of hard-coding this one.
 *
 * Kept, not deleted: it is the record of a write to a production book.
 *
 * GATE 1 — prove the production project reproduces the SHIPPING layout.
 *
 * Read-only. Nothing is written to the database, to storage, or to the book.
 * Its whole job is to earn the right to write later: if this build does not come
 * back as the book that shipped, no correction may be applied, because a diff
 * against a baseline that is already wrong proves nothing.
 *
 * ─── SCOPED PRODUCTION CONNECTION ─────────────────────────────────────────
 * `env.ts` loads `.env` (production) and then `.env.development.local`
 * (local Postgres) with override, so the developer default always wins. This
 * script reads the production URL out of `.env` itself and puts it back into
 * THIS PROCESS ONLY, after the dotenv layers have run and before the database
 * client is first constructed.
 *
 * No file is edited. No other command changes behaviour. Run something else in
 * another terminal and it still points at the developer database.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PROJECT_ID = '3b7ed37a-8a07-4bfd-a0c3-14ae5dc4a6ff';

/** The production connection string, read from `.env` and used only here. */
function productionDatabaseUrl(): string {
  const raw = readFileSync(path.join(REPO_ROOT, '.env'), 'utf8');
  const line = raw.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('.env has no DATABASE_URL');
  return line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
}
const PROD_URL = productionDatabaseUrl();
const host = PROD_URL.replace(/.*@/, '').replace(/\?.*/, '');
if (host.startsWith('127.0.0.1') || host.startsWith('localhost')) {
  throw new Error(`.env DATABASE_URL is not a production host (${host}). Refusing to continue.`);
}

// Import env first so its dotenv layers run, THEN reclaim the connection.
await import('../../src/env.js');
process.env.DATABASE_URL = PROD_URL;

const { getProject } = await import('../../src/db/repositories/projects.repo.js');
const { getProjectStorage } = await import('../../src/services/storage/project-storage.js');
const { buildTypesetInterior } = await import('../../src/pipeline/typeset/build-typeset-interior.js');
const { ProjectConfigSchema } = await import('@wildlands/shared');

console.log('');
console.log('GATE 1 — REPRODUCE THE SHIPPING LAYOUT');
console.log('─'.repeat(90));
console.log(`  connection       ${host}   (this process only)`);

const project = await getProject(PROJECT_ID);
if (!project) throw new Error(`project ${PROJECT_ID} not found on ${host}`);
const config = ProjectConfigSchema.parse(project.config);

console.log(`  project          ${project.title}`);
console.log(`  status           ${project.status}`);
console.log(`  standard         ${config.typesetLayoutStandardId ?? '(resolved by profile)'}`);
console.log(`  profile          ${config.productionProfileId ?? '(default)'}`);
console.log(`  trim             ${config.trimSize.widthIn} x ${config.trimSize.heightIn}in, bleed ${config.trimSize.bleedIn}`);
console.log(`  layoutOverrides  ${Object.keys(config.layoutOverrides ?? {}).length}`);
console.log(`  illustrations    ${Object.keys(config.illustrations ?? {}).length}`);
console.log(`  corrections      ${(config.corrections ?? []).length}`);
console.log(`  manuscriptPath   ${project.manuscriptPath ?? '(none)'}`);
console.log(`  manuscript sha   ${project.manuscriptSha256 ?? '(none)'}`);

// ── build, with NO correction applied ───────────────────────────────────────
console.log('\n  building the control (no correction)…');
const t0 = Date.now();
const interior = await buildTypesetInterior(PROJECT_ID, config, { chaptersStartRecto: false });
console.log(`  built in         ${((Date.now() - t0) / 1000).toFixed(0)}s`);

const pdf = interior.pdf;
const doc = await PDFDocument.load(pdf);
const pageCount = doc.getPageCount();

const { createHash } = await import('node:crypto');
const sha = createHash('sha256').update(pdf).digest('hex');
const { writeFileSync, mkdirSync } = await import('node:fs');
mkdirSync('.page-qa/control', { recursive: true });
writeFileSync('.page-qa/control/control.pdf', pdf);

// ── the checks that decide whether writing is allowed ───────────────────────
const { buildPageModel } = await import('../../src/pipeline/page-qa/page-model.js');
const { classifyPages } = await import('../../src/pipeline/page-qa/page-roles.js');
const model = await buildPageModel(pdf);
const roles = classifyPages(model.pages, model.norms);
const openers = roles.filter((r) => r.role === 'CHAPTER_OPENER').length;

const allText = model.pages.map((p) => p.lines.map((l) => l.text).join(' ')).join('\n');
const refExpressions = allText.match(/p\.\s?\d{1,3}/g) ?? [];
const storage = getProjectStorage();
const manuscript = project.manuscriptPath
  ? (await storage.readProjectFile(project.manuscriptPath)).toString('utf8')
  : '';
const srcExpressions = manuscript.match(/p\.\s?\d{1,3}/g) ?? [];

const check = (label: string, actual: string | number, expected: string | number) => {
  const ok = String(actual) === String(expected);
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label.padEnd(34)} ${actual}${ok ? '' : `   expected ${expected}`}`);
  return ok;
};

console.log('');
console.log('  CONTROL BUILD');
console.log(`  sha256           ${sha}`);
let ok = true;
ok = check('page count', pageCount, 170) && ok;
// The brief's "23" is a count of CHAPTERS. This classifier counts opener-shaped
  // PAGES and reports 27 on the shipped artifact too, so the meaningful check is
  // control-against-shipped, not against a human tally of a different thing.
  ok = check('chapter opener pages (shipped reports 27)', openers, 27) && ok;
ok = check('illustrations configured', Object.keys(config.illustrations ?? {}).length, 11) && ok;
ok = check('reference expressions in source', srcExpressions.length, 121) && ok;
  // 121 expressions carry 124 individual page targets: three name two pages each.
console.log(`  [ -- ] ${'reference expressions in PDF'.padEnd(34)} ${refExpressions.length}`);

console.log('');
console.log(ok ? '  GATE 1 PASSED — writing is permitted.' : '  GATE 1 FAILED — do not write. Report why.');
console.log('');
process.exit(ok ? 0 : 1);
