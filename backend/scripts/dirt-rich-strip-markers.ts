/**
 * Strip the production markers that are now satisfied, and re-anchor the art.
 *
 * ─── WHY THESE TWO THINGS ARE ONE OPERATION ───────────────────────────────
 * The figures are anchored to the MARKER paragraphs, because that is where the
 * figure belongs on the page. Delete a marker and its illustration orphans: the
 * anchor block no longer exists in the render, the stamper reports it as
 * orphaned, and the art silently stops appearing. So stripping and re-anchoring
 * cannot be separate steps — this script does both and verifies the result.
 *
 * Each figure is re-anchored to the LAST PARAGRAPH BEFORE its marker: the
 * lead-in the author wrote, which is stable, is what the figure illustrates, and
 * puts the art directly beneath the text that introduces it.
 *
 * FIGURE E.1 IS DELIBERATELY KEPT. It is the one item not yet produced, and its marker is the only thing standing between "not done yet"
 * and a silently missing figure in a printed book.
 *
 * The CANONICAL manuscript on disk is never modified. This writes a separate
 * print manuscript and points the dev project at it.
 *
 *   yarn tsx scripts/dirt-rich-strip-markers.ts            # dry run
 *   yarn tsx scripts/dirt-rich-strip-markers.ts --write
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { ProjectConfigSchema, type PageIllustration } from '@wildlands/shared';
import { getProject, setManuscript, updateProjectConfig } from '../src/db/repositories/projects.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { TRADE_NONFICTION_GUIDE_TYPESET_V1 as STD } from '../src/pipeline/typeset/layout-standards/trade-nonfiction-guide-v1.js';

const PROJECT_ID = '55d7bce0-2f71-4f02-8131-e6c750c8506e';
const CANONICAL = 'C:/Users/jovan/Downloads/DIRT-RICH-ABBY-FENWICK_FINAL.md';
const PRINT_OUT = 'C:/Users/jovan/Downloads/DIRT-RICH-PRINT-markers-stripped.md';
const WRITE = process.argv.includes('--write');

/** Satisfied: the thing the marker asked for now exists on the page. */
const STRIP = ['FIGURE 5.1', 'FIGURE 10.1', 'TABLE A.1', 'TABLE B.1', 'TABLE C.1', 'CHECKLIST D.1'];
/** Not satisfied: still needs a person. */
const KEEP = ['FIGURE E.1'];

const canonical = readFileSync(CANONICAL, 'utf8');
const lines = canonical.split('\n');

/** Marker paragraphs are single-line blockquotes opening with a bracketed tag. */
const isMarker = (l: string): string | null => {
  const m = /^>\s*\*\*\[([A-Z]+ [0-9A-Z.]+)/.exec(l.trim());
  return m ? m[1]! : null;
};

const out: string[] = [];
const stripped: { tag: string; line: number; anchorText: string }[] = [];
const kept: string[] = [];

for (let i = 0; i < lines.length; i++) {
  const tag = isMarker(lines[i]!);
  if (tag && STRIP.includes(tag)) {
    // Find the paragraph before it, skipping blanks — this becomes the anchor.
    let j = out.length - 1;
    while (j >= 0 && !out[j]!.trim()) j--;
    stripped.push({ tag, line: i + 1, anchorText: (out[j] ?? '').trim().slice(0, 60) });
    // Drop the marker AND the blank line that follows, so no gap is left.
    if ((lines[i + 1] ?? '').trim() === '') i++;
    continue;
  }
  if (tag && KEEP.includes(tag)) kept.push(tag);
  out.push(lines[i]!);
}

const printMd = out.join('\n');

console.log(`stripped ${stripped.length} marker(s):`);
for (const s of stripped) console.log(`  ${s.tag.padEnd(14)} was line ${s.line}   anchor -> "${s.anchorText}…"`);
console.log(`kept ${kept.length}: ${kept.join(', ')}  (still needs a human illustrator)`);

const remaining = printMd.split('\n').filter((l) => isMarker(l)).map((l) => isMarker(l));
console.log(`markers remaining in the print manuscript: ${remaining.join(', ') || 'none'}`);
console.log(
  `words: canonical ${canonical.split(/\s+/).filter(Boolean).length} -> print ${printMd.split(/\s+/).filter(Boolean).length}`,
);

if (!WRITE) {
  console.log('\nDRY RUN — nothing written.');
  process.exit(0);
}

writeFileSync(PRINT_OUT, printMd, 'utf8');
console.log(`\nwrote ${PRINT_OUT} (sha ${createHash('sha256').update(printMd).digest('hex').slice(0, 16)}…)`);

// ── upload as the project's manuscript, then re-anchor ──────────────────────
const project = await getProject(PROJECT_ID);
if (!project) throw new Error('project not found');
const config = ProjectConfigSchema.parse(project.config);
const storage = getProjectStorage();
const stored = await storage.writeProjectFile(PROJECT_ID, ['manuscripts', 'DIRT-RICH-PRINT.md'], printMd);
console.log(`stored print manuscript at ${stored.relativePath}`);

console.log('\nre-rendering to resolve new anchors...');
const r = await renderTypesetBook({
  markdown: printMd,
  config,
  layoutStandard: STD,
  chaptersStartRecto: Boolean(config.typesetChaptersStartRecto),
  frontMatter: {},
});

const oldIllus = config.illustrations ?? {};
const bySubject = new Map(Object.values(oldIllus).map((v) => [v.subject ?? '', v]));
const illustrations: Record<string, PageIllustration> = {};

for (const s of stripped) {
  const art = bySubject.get(s.tag);
  if (!art) continue; // tables/checklist have no artwork — nothing to re-anchor
  // Match on NORMALISED text. The anchor comes from raw markdown
  // (`**Twenty dollars a dozen.**`) while a block preview is the rendered text
  // with tags already stripped, so a literal comparison never matches a
  // paragraph that opens with a bold run-in — and this book uses those heavily.
  const norm = (t: string): string => t.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const key = norm(s.anchorText).slice(0, 40);
  const anchor = r.blocks.find((b) => norm(b.preview).startsWith(key));
  if (!anchor) {
    console.log(`  ${s.tag}: NO NEW ANCHOR FOUND — refusing to drop it silently`);
    continue;
  }
  const page = Object.entries(r.report.pageBlocks).find(([, ids]) => (ids as string[]).includes(anchor.blockId))?.[0];
  illustrations[anchor.blockId] = art;
  console.log(`  ${s.tag} re-anchored to ${anchor.blockId} (p${page ?? '?'})`);
}

const artCount = Object.values(oldIllus).length;
if (Object.keys(illustrations).length !== artCount) {
  throw new Error(
    `re-anchor lost artwork: ${artCount} before, ${Object.keys(illustrations).length} after. Refusing to write.`,
  );
}

await updateProjectConfig(PROJECT_ID, { ...config, illustrations });

// The print manuscript becomes the WORKING copy; the frozen upload stays on the
// row as the canonical source. That is the two-output standard: canonical keeps
// the production stubs and is never what ships, the derived copy is what
// typesetting reads, and the row records both so the freeze stays verifiable.
await setManuscript(PROJECT_ID, {
  manuscriptPath: stored.relativePath,
  manuscriptSha256: createHash('sha256').update(printMd).digest('hex'),
  canonicalManuscriptPath: project.canonicalManuscriptPath ?? project.manuscriptPath!,
  canonicalManuscriptSha256: project.canonicalManuscriptSha256 ?? project.manuscriptSha256!,
  manuscriptSanitized: true,
});

console.log(`\nconfig updated: ${Object.keys(illustrations).length} anchor(s) carried across.`);
console.log(`working manuscript  -> ${stored.relativePath}  (6 markers stripped)`);
console.log(`canonical unchanged -> ${project.canonicalManuscriptPath ?? project.manuscriptPath}`);
