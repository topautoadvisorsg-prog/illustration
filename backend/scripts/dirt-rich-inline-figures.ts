/**
 * Put Figures 5.1 and 10.1 into the TEXT FLOW, where they belong.
 *
 * ─── WHY THIS REPLACES THE STAMPING APPROACH ──────────────────────────────
 * Stamping draws art into whatever space is left at the foot of a page. That
 * suits the illustrated track, where pages are built around art. DIRT RICH runs
 * 94 of its 119 typeset pages at 90-100% full, so there is almost no such space:
 * anchoring by stamp pushed Figure 5.1 eight pages and Figure 10.1 five pages
 * away from the passages they illustrate, which is editorially wrong.
 *
 * A figure in the flow makes the typesetter RESERVE its height, so pagination
 * accounts for it and the figure stays with its text. That is how a figure works
 * in a typeset book.
 *
 * Writes a print manuscript with an image reference where each marker was, and
 * clears the stamp anchors so the art cannot be placed twice.
 *
 *   yarn tsx scripts/dirt-rich-inline-figures.ts            # dry run
 *   yarn tsx scripts/dirt-rich-inline-figures.ts --write
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { ProjectConfigSchema } from '@wildlands/shared';
import { getProject, setManuscript, updateProjectConfig } from '../src/db/repositories/projects.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';

const PROJECT_ID = '55d7bce0-2f71-4f02-8131-e6c750c8506e';
const CANONICAL = 'C:/Users/jovan/Downloads/DIRT-RICH-ABBY-FENWICK_FINAL.md';
const PRINT_OUT = 'C:/Users/jovan/Downloads/DIRT-RICH-PRINT-markers-stripped.md';
const WRITE = process.argv.includes('--write');

/** Marker tag -> the figure that replaces it, and its printed caption. */
const FIGURES: Record<string, { asset: string; caption: string }> = {
  'FIGURE 5.1': {
    asset: 'figure-5-1-cost-per-dozen.png',
    caption: '**Figure 5.1.** What a dozen backyard eggs actually cost.',
  },
  'FIGURE 10.1': {
    asset: 'figure-10-1-hours-per-week.png',
    caption: '**Figure 10.1.** Hours per week, by month. A floating bar is a range, not an average.',
  },
};
/** Satisfied by the renderer itself — marker simply goes. */
const DROP = ['TABLE A.1', 'TABLE B.1', 'TABLE C.1', 'CHECKLIST D.1'];
/** Not produced yet. Kept, deliberately. */
const KEEP = ['FIGURE E.1'];

const canonical = readFileSync(CANONICAL, 'utf8');
const isMarker = (l: string): string | null => {
  const m = /^>\s*\*\*\[([A-Z]+ [0-9A-Z.]+)/.exec(l.trim());
  return m ? m[1]! : null;
};

const out: string[] = [];
const actions: string[] = [];
const lines = canonical.split('\n');
for (let i = 0; i < lines.length; i++) {
  const tag = isMarker(lines[i]!);
  if (tag && FIGURES[tag]) {
    const f = FIGURES[tag]!;
    out.push(`![${f.caption}](${f.asset})`);
    actions.push(`${tag}: marker -> inline figure (${f.asset})`);
    if ((lines[i + 1] ?? '').trim() === '') i++;
    continue;
  }
  if (tag && DROP.includes(tag)) {
    actions.push(`${tag}: marker removed (already set by the renderer)`);
    if ((lines[i + 1] ?? '').trim() === '') i++;
    continue;
  }
  if (tag && KEEP.includes(tag)) actions.push(`${tag}: marker KEPT — not produced yet`);
  out.push(lines[i]!);
}

const printMd = out.join('\n');
for (const a of actions) console.log(`  ${a}`);
const remaining = printMd.split('\n').map(isMarker).filter(Boolean);
console.log(`\nmarkers remaining: ${remaining.join(', ') || 'none'}`);
console.log(`figure references: ${(printMd.match(/^!\[/gm) ?? []).length}`);

if (!WRITE) {
  console.log('\nDRY RUN — nothing written.');
  process.exit(0);
}

writeFileSync(PRINT_OUT, printMd, 'utf8');
const project = await getProject(PROJECT_ID);
if (!project) throw new Error('project not found');
const config = ProjectConfigSchema.parse(project.config);
const storage = getProjectStorage();
const stored = await storage.writeProjectFile(PROJECT_ID, ['manuscripts', 'DIRT-RICH-PRINT.md'], printMd);

// Clear the stamp anchors: the art is in the flow now, and leaving them would
// draw each figure a second time.
await updateProjectConfig(PROJECT_ID, { ...config, illustrations: {} });
await setManuscript(PROJECT_ID, {
  manuscriptPath: stored.relativePath,
  manuscriptSha256: createHash('sha256').update(printMd).digest('hex'),
  canonicalManuscriptPath: project.canonicalManuscriptPath ?? project.manuscriptPath!,
  canonicalManuscriptSha256: project.canonicalManuscriptSha256 ?? project.manuscriptSha256!,
  manuscriptSanitized: true,
});
console.log(`\nwrote ${stored.relativePath}; stamp anchors cleared (figures are in the flow now).`);
