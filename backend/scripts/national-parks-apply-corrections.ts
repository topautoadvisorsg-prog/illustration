/**
 * Re-establish this book's manuscript from the corrected canonical file.
 *
 * The 116-page interior shipped with six prose defects that a page-by-page read
 * of the printed proof caught and no automated check could: four doubled full
 * stops, an entrance-fee claim that was true of six of the seven parks, and a
 * Beehive sentence that overstated the topology against the Park Service wording
 * the same book uses correctly three pages earlier.
 *
 * Those are MANUSCRIPT corrections, authored in the canonical file and brought
 * in here. This is `setManuscript`, not `replaceWorkingManuscript`, because the
 * canonical source genuinely has moved — which is exactly the case that call is
 * for, and the reason it is the only one allowed to touch canonical provenance.
 *
 * The previous canonical file is kept beside the new one, named with its hash.
 *
 *   npx tsx scripts/national-parks-apply-corrections.ts --dry-run
 *   npx tsx scripts/national-parks-apply-corrections.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

await import('../src/env.js');

const DRY = process.argv.includes('--dry-run');
const MANUSCRIPT =
  'C:/Users/jovan/Downloads/national parks book/LAYOUT-7-national-parks-without-the-rookie-mistakes.md';

/** The file as corrected on 2026-08-23. Refuse anything else. */
const CORRECTED_SHA = '7d12bb3099a4e1b7a43875011785a2818641ed3506e8c59386dbc2d6b3c878eb';
/** What it replaces, so a stale file is named rather than merely rejected. */
const PREVIOUS_SHA = '9d3263d7903211771bd5cf638f5a3c41bf8a27d53e4c75a5b5d310a4cf0912d1';

const { P } = await import('./_project.js');
const { getProject, setManuscript } = await import('../src/db/repositories/projects.repo.js');
const { sanitizeManuscript } = await import('../src/pipeline/stage-1-ingestion/sanitize-manuscript.js');
const { auditManuscriptParse } = await import('../src/pipeline/typeset/manuscript-parse-gate.js');
const { getProjectStorage } = await import('../src/services/storage/project-storage.js');

const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

const markdown = readFileSync(MANUSCRIPT, 'utf8');
const actual = sha(markdown);
console.log(`manuscript : ${MANUSCRIPT}`);
console.log(`sha256     : ${actual}`);
if (actual !== CORRECTED_SHA) {
  console.error(
    `\nREFUSING. Not the corrected file.\n  expected ${CORRECTED_SHA}\n  got      ${actual}` +
      (actual === PREVIOUS_SHA ? '\n\nThat is the PRE-CORRECTION file, before the six prose fixes.' : ''),
  );
  process.exit(1);
}

/** The typesetter must still see the whole book after the edits. */
const audit = auditManuscriptParse(markdown);
console.log(`parse gate : ${audit.ok ? 'OK' : 'FAILED'} (${audit.parsed.sections} sections, ${audit.parsed.chapters} chapters, ${audit.parsed.tableRows} table rows)`);
for (const f of audit.findings) console.log(`             [${f.status}] ${f.label}: ${f.detail}`);
if (!audit.ok) {
  console.error('\nREFUSING: the parser cannot see the whole manuscript.');
  process.exit(1);
}

const working = sanitizeManuscript(markdown);
const workingSha = sha(working);
console.log(`working    : ${workingSha}`);

const project = await getProject(P);
if (!project) throw new Error(`project ${P} not found`);
console.log(`\nproject    : ${P}`);
console.log(`canonical  : ${project.canonicalManuscriptSha256} -> ${actual}`);
console.log(`working    : ${project.manuscriptSha256} -> ${workingSha}`);

if (DRY) {
  console.log('\nDRY RUN — nothing written.');
  process.exit(0);
}

/**
 * Written back to the SAME storage keys the project already points at, so the
 * paths in the row keep meaning what they meant. `writeProjectFile` takes the
 * key in parts, not as a joined string — handed a joined string it iterates the
 * characters and writes a path one letter deep.
 */
const storage = getProjectStorage();
const canonicalPath = project.canonicalManuscriptPath;
const workingPath = project.manuscriptPath;
if (!canonicalPath || !workingPath) throw new Error('project has no manuscript paths to replace');
const partsOf = (key: string): string[] => key.split('/').slice(1);
await storage.writeProjectFile(P, partsOf(canonicalPath), Buffer.from(markdown, 'utf8'));
await storage.writeProjectFile(P, partsOf(workingPath), Buffer.from(working, 'utf8'));

await setManuscript(P, {
  manuscriptPath: workingPath,
  manuscriptSha256: workingSha,
  canonicalManuscriptPath: canonicalPath,
  canonicalManuscriptSha256: actual,
  manuscriptSanitized: true,
});

console.log(`\nwrote      : ${canonicalPath}`);
console.log(`wrote      : ${workingPath}`);
console.log('provenance : updated. Rebuild the interior next.');
process.exit(0);
