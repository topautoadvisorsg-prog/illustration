/**
 * BEFORE YOU NEED IT — rasterise named pages OUT OF THE SHIPPING PDF.
 *
 * Diagnostic only, local and free. The variant shooter screenshots the paged
 * HTML, which is the right thing for comparing candidates but renders with
 * whatever fonts the DOM happens to resolve. This reads the finished file, so
 * what is looked at is what a printer receives.
 *
 *   yarn tsx scripts/_byni_shoot_pdf.ts <pdf> <outDir> <page> [page ...]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { rasterizePages } from '../src/pipeline/page-qa/raster.js';

const [pdfPath, outDir, ...pageArgs] = process.argv.slice(2);
if (!pdfPath || !outDir || !pageArgs.length) {
  console.error('usage: _byni_shoot_pdf.ts <pdf> <outDir> <page> [page ...]');
  process.exit(1);
}
const want = pageArgs.map(Number);
mkdirSync(outDir, { recursive: true });

const result = await rasterizePages(readFileSync(pdfPath), want, { scale: 2 });
for (const [n, png] of result.pages) {
  const out = `${outDir}/pdf-p${String(n).padStart(3, '0')}.png`;
  writeFileSync(out, png);
  console.log(`  ${out}  ${result.widthPx}x${result.heightPx}`);
}
process.exit(0);
