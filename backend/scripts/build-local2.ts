/* Build Book → LOCAL files. Reuses the production spine order + PDF merge, but
 * writes the (large) interior PDF straight to disk instead of uploading ~600 MB
 * to Supabase (which fails from a local connection). Cover PDF is small and is
 * rendered via the normal path, then copied locally too.
 *   node --max-old-space-size=8192 ../node_modules/tsx/dist/cli.mjs scripts/build-local2.ts <projectId> <outDir>
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProject } from '../src/db/repositories/projects.repo.js';
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { listBookReadyRenders } from '../src/db/repositories/whole-page-render.repo.js';
import { resolveSpine } from '../src/pipeline/book-assembly/spine-order.js';
import { mergeSinglePagePdfs } from '../src/pipeline/book-assembly/pdf-merge.js';
import { renderCoverPdf } from '../src/pipeline/stage-6-layout/render-chapter.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';

const P = process.argv[2]!;
const OUT = process.argv[3] ?? 'C:/Users/jovan/Downloads';
const st = getProjectStorage();

const project = await getProject(P);
if (!project) { console.error('project_not_found'); process.exit(1); }

const pageRows = await listPaginatedPagesForProject(P);
const spine = resolveSpine(pageRows.map((p: any) => ({ id: p.id, pageKey: p.pageKey, chapterNumber: p.chapterNumber, plannedPageNumber: p.plannedPageNumber, section: p.section, spineOrder: p.spineOrder })));
const renders = await listBookReadyRenders(P);
const byPage = new Map<string, any>(renders.map((r: any) => [r.pageId, r]));

console.log(`spine pages: ${spine.length}`);
const ordered: Buffer[] = [];
let missing = 0;
for (const pg of spine) {
  const r = byPage.get(pg.id);
  if (!r?.printPdfPath) { missing++; console.log(`  MISSING print PDF: ${pg.pageKey}`); continue; }
  ordered.push(await st.readProjectFile(r.printPdfPath));
}
if (missing) { console.error(`ABORT: ${missing} pages missing a print PDF`); process.exit(1); }
console.log(`read ${ordered.length} print PDFs, total ${(ordered.reduce((s, b) => s + b.length, 0) / 1048576).toFixed(1)} MB`);

console.log('merging interior …');
const interior = await mergeSinglePagePdfs(ordered);
const interiorPath = join(OUT, 'THE_WILDLANDS_NEW_ENGLAND_interior.pdf');
writeFileSync(interiorPath, interior);
const interiorMB = interior.length / 1048576;
console.log(`interior → ${interiorPath}  (${interiorMB.toFixed(1)} MB, ${spine.length} pages)  KDP 650MB → ${interiorMB <= 650 ? 'OK' : 'OVER'}`);

console.log('\nrendering cover PDF …');
const c: any = await renderCoverPdf(P, {});
const coverBuf = await st.readProjectFile(c.storedPath);
const coverPath = join(OUT, 'THE_WILDLANDS_NEW_ENGLAND_cover.pdf');
writeFileSync(coverPath, coverBuf);
console.log(`cover → ${coverPath}  (${(coverBuf.length / 1048576).toFixed(1)} MB, ${c.dimensions?.fullWidthIn}x${c.dimensions?.fullHeightIn}in, spine ${c.dimensions?.spineIn?.toFixed?.(4)}in)`);

console.log('\n=== DONE — both files in', OUT, '===');
process.exit(0);
