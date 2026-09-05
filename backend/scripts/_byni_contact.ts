/**
 * BEFORE YOU NEED IT — contact sheets of the WHOLE shipping interior.
 *
 * Rasterises every page out of the finished PDF and lays them out in order, so
 * the book can be swept by eye for shape: short pages, holes, stranded lines,
 * openers landing wrong, illustrations sitting badly. Small but legible enough
 * that a broken page shows up without reading a word.
 *
 * Reads the SHIPPING FILE, not a re-render, so what is reviewed is what prints.
 *
 *   yarn tsx scripts/_byni_contact.ts [--cols=4] [--rows=3] [--thumb=300]
 *
 * Local and free.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { rasterizePages } from '../src/pipeline/page-qa/raster.js';
import { contactSheets } from '../src/pipeline/page-qa/proof-sheets.js';
import { INTERIOR_PDF } from './before-you-need-it-config.js';

const arg = (k: string, d: number): number =>
  Number(process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d);

const PDF = INTERIOR_PDF;
const OUT = 'C:/Users/jovan/Downloads/before-you-need-it/06-PRODUCTION/contact';
mkdirSync(OUT, { recursive: true });

const bytes = readFileSync(PDF);
// Page count comes from the file, so this cannot silently review a subset.
const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.js');
const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true })
  .promise;
const all = Array.from({ length: doc.numPages }, (_, i) => i + 1);
console.log(`${doc.numPages} pages in ${PDF.split('/').pop()}`);

const raster = await rasterizePages(bytes, all, { scale: 1.4 });
if (raster.pages.size !== all.length) {
  console.error(`ABORT: rasterised ${raster.pages.size} of ${all.length} pages`);
  process.exit(2);
}

const sheets = await contactSheets(
  all.map((n) => ({ n, png: raster.pages.get(n)! })),
  { cols: arg('cols', 4), rows: arg('rows', 3), thumbWidthPx: arg('thumb', 300) },
);
sheets.forEach((png, i) => {
  const p = `${OUT}/sheet-${String(i + 1).padStart(2, '0')}.png`;
  writeFileSync(p, png);
  console.log(`  ${p}`);
});
console.log(`\n${sheets.length} sheet(s) covering ${all.length} pages.`);
process.exit(0);
