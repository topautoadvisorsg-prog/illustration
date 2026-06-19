/* Build a small print-ready sample PDF from the active (clean) renders of a few
 * pages — real bleed + 7x10 TrimBox, the exact thing KDP trims — so the operator
 * can verify the new architecture in the official preview before any chapter run. */
import { writeFileSync } from 'node:fs';
import { eq, and, desc } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { ProjectConfigSchema } from '@wildlands/shared';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { getProject } from '../src/db/repositories/projects.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { resolveGeometry } from '../src/pipeline/publishing-standard/index.js';
import { composePrintPage } from '../src/pipeline/print-prep/print-prep.js';

const P = '66c1c69c-2c81-409e-a4b5-bff3f3bb04ba';
const KEYS = process.argv.slice(2);
const db = getDb();
const storage = getProjectStorage();
const cfg = ProjectConfigSchema.parse((await getProject(P))!.config);
const geo = resolveGeometry(cfg);
const canvasIn = geo.canvasIn;
const trimW = geo.trimSize.widthIn, trimH = geo.trimSize.heightIn, bleed = geo.trimSize.bleedIn;
const all = await listPaginatedPagesForProject(P);

// order the requested pages by folio
const ordered = KEYS.map((k) => ({ k, folio: all.find((p) => p.pageKey === k)?.plannedPageNumber ?? 9999 }))
  .sort((a, b) => a.folio - b.folio);

const out = await PDFDocument.create();
for (const { k, folio } of ordered) {
  const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, k))))[0];
  if (!row) { console.log('skip', k); continue; }
  const rend = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0];
  if (!rend?.imagePath) { console.log('no active render', k); continue; }
  const png = await storage.readProjectFile(rend.imagePath);
  const composed = await composePrintPage(png, null, String(folio), canvasIn);
  const src = await PDFDocument.load(composed.pdfBuffer);
  const [pg] = await out.copyPages(src, [0]);
  out.addPage(pg);
  const { width, height } = pg.getSize();
  const ix = (width - trimW * 72) / 2, iy = (height - trimH * 72) / 2;
  pg.setTrimBox(ix, iy, trimW * 72, trimH * 72);
  pg.setBleedBox(0, 0, width, height);
  console.log('added folio', folio, k, `(${(width / 72).toFixed(3)}x${(height / 72).toFixed(3)}in, TrimBox ${trimW}x${trimH})`);
}
const buf = Buffer.from(await out.save());
writeFileSync('C:/Users/jovan/Downloads/THE_WILDLANDS_sample_pages.pdf', buf);
console.log('sample → C:/Users/jovan/Downloads/THE_WILDLANDS_sample_pages.pdf', `(${(buf.length / 1048576).toFixed(1)} MB, ${out.getPageCount()} pages)`);
process.exit(0);
