/** Smoke-check the typeset MODULE (no HTTP), against the seeded dev project. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
loadDotenv({ path: path.join(ROOT, '.env') });
loadDotenv({ path: path.join(ROOT, '.env.development.local'), override: true });

const { getProject } = await import('../src/db/repositories/projects.repo.js');
const { getProjectStorage } = await import('../src/services/storage/project-storage.js');
const { renderTypesetBook } = await import('../src/pipeline/typeset/render-typeset.js');
const { ProjectConfigSchema } = await import('@wildlands/shared');

const id = process.argv[2]!;
const p = await getProject(id);
if (!p?.manuscriptPath) throw new Error('no manuscript');
const markdown = (await getProjectStorage().readProjectFile(p.manuscriptPath)).toString('utf8');
const config = ProjectConfigSchema.parse(p.config);

console.log('rendering…');
const t0 = Date.now();
const r = await renderTypesetBook({ markdown, config, chaptersStartRecto: true });
console.log(`took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('pages   :', r.report.totalPages);
console.log('trim    :', r.report.trim.widthIn + 'x' + r.report.trim.heightIn);
console.log('type    :', r.report.bodyPt + 'pt/' + r.report.lineHeight, 'gutter', r.report.marginsIn.gutterIn);
console.log('blanks  :', r.report.blankPages.length);
console.log('overflow:', r.report.verticalOverflowPages.length);
console.log('pdf     :', r.pdf.length, 'bytes');
console.log('chapters:', r.report.sectionStarts.filter((s) => s.label).slice(0, 4).map((s) => s.label + ' p' + s.page).join(', '));
process.exit(0);
