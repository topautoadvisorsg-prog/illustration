/**
 * Place the six approved interior illustrations at their chapter ends.
 *
 * Anchored STRUCTURALLY — each figure is appended at the end of its named
 * section, immediately before the next heading — rather than by matching the
 * last paragraph's text. Text matching already bit us once: a lead-in written as
 * `**Twenty dollars a dozen.**` never matched a block preview whose markdown had
 * been stripped, and one phrase ("Nobody finds this easy") turns out to appear
 * in two different chapters. A section boundary is unambiguous.
 *
 * Widths follow the operator's weighting: p57 and p99 largest, p83 medium, and
 * p13/p21/p47 tighter, so a chapter-end plate does not carry the same visual
 * weight as a full-measure diagram.
 *
 *   yarn tsx scripts/dirt-rich-place-interiors.ts            # dry run
 *   yarn tsx scripts/dirt-rich-place-interiors.ts --write
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { ProjectConfigSchema } from '@wildlands/shared';
import { getProject, setManuscript } from '../src/db/repositories/projects.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';

const PROJECT_ID = '55d7bce0-2f71-4f02-8131-e6c750c8506e';
const WRITE = process.argv.includes('--write');
const LOCAL_COPY = 'C:/Users/jovan/Downloads/DIRT-RICH-PRINT-markers-stripped.md';

/** Section title -> the plate that closes it, and its share of the measure. */
const PLATES: { section: string; asset: string; widthPct: number }[] = [
  { section: 'Backyard Me v1.0', asset: 'p13-soil-profile.png', widthPct: 70 },
  { section: 'Dirt Before Anything', asset: 'p21-raised-bed.png', widthPct: 70 },
  { section: 'Chickens: The Gateway Animal', asset: 'p47-coop-dusk.png', widthPct: 70 },
  { section: 'The Meat Bird Chapter', asset: 'p57-zucchini.png', widthPct: 100 },
  { section: 'Neighbors, HOAs, and Zoning', asset: 'p83-january-garden.png', widthPct: 85 },
  { section: 'Backyard Me Now', asset: 'p99-quarter-acre.png', widthPct: 100 },
];

const project = await getProject(PROJECT_ID);
if (!project) throw new Error('project not found');
const config = ProjectConfigSchema.parse(project.config);
const storage = getProjectStorage();
const md = (await storage.readProjectFile(project.manuscriptPath!)).toString('utf8');
const lines = md.split('\n');

/** A heading line, at any level — the boundary a section ends at. */
const isHeading = (l: string): boolean => /^#{1,2}\s+/.test(l);
/** The chapter heading for a section, allowing the `Chapter N:` prefix. */
const headingFor = (title: string) => (l: string): boolean =>
  isHeading(l) && l.replace(/^#{1,2}\s+/, '').replace(/^Chapter\s+\d+\s*[:.–—-]\s*/i, '').trim() === title;

const out = [...lines];
const placed: string[] = [];

// Insert from the BOTTOM up so earlier insertions cannot shift later indices.
for (const plate of [...PLATES].reverse()) {
  const start = out.findIndex(headingFor(plate.section));
  if (start < 0) {
    console.log(`  ${plate.section}: HEADING NOT FOUND — skipped`);
    continue;
  }
  let end = start + 1;
  while (end < out.length && !isHeading(out[end]!)) end++;
  // Step back over trailing blanks and any horizontal rule, so the plate sits
  // after the last real line of the chapter rather than after its scene break.
  let at = end - 1;
  while (at > start && (!out[at]!.trim() || /^\s*-{3,}\s*$/.test(out[at]!))) at--;

  out.splice(at + 1, 0, '', `![](${plate.asset}){${plate.widthPct}%}`);
  placed.push(`${plate.section} -> ${plate.asset} at ${plate.widthPct}% (after line ${at + 1})`);
}

for (const p of placed.reverse()) console.log(`  ${p}`);

const next = out.join('\n');
const figureCount = (next.match(/^!\[/gm) ?? []).length;
console.log(`\nfigure references in manuscript: ${figureCount}  (2 charts + ${placed.length} plates)`);

if (!WRITE) {
  console.log('\nDRY RUN — nothing written.');
  process.exit(0);
}

writeFileSync(LOCAL_COPY, next, 'utf8');
const stored = await storage.writeProjectFile(PROJECT_ID, ['manuscripts', 'DIRT-RICH-PRINT.md'], next);
await setManuscript(PROJECT_ID, {
  manuscriptPath: stored.relativePath,
  manuscriptSha256: createHash('sha256').update(next).digest('hex'),
  canonicalManuscriptPath: project.canonicalManuscriptPath ?? project.manuscriptPath!,
  canonicalManuscriptSha256: project.canonicalManuscriptSha256 ?? project.manuscriptSha256!,
  manuscriptSanitized: true,
});
console.log(`\nwrote ${stored.relativePath}`);
void config;
