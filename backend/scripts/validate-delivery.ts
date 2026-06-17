import { readFileSync, statSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
const INT = 'C:/Users/jovan/Downloads/THE_WILDLANDS_NEW_ENGLAND_interior.pdf';
const COV = 'C:/Users/jovan/Downloads/THE_WILDLANDS_NEW_ENGLAND_cover.pdf';

function mb(n: number) { return (n / 1048576).toFixed(1) + ' MB'; }
function inch(pt: number) { return (pt / 72).toFixed(4) + '"'; }

console.log('================ INTERIOR ================');
const iStat = statSync(INT);
console.log('path:', INT);
console.log('size on disk:', iStat.size, 'bytes (' + mb(iStat.size) + ')');
const i = await PDFDocument.load(readFileSync(INT), { updateMetadata: false });
console.log('page count:', i.getPageCount());
// distinct page sizes (trim consistency)
const sizes = new Map<string, number>();
for (let n = 0; n < i.getPageCount(); n++) { const { width, height } = i.getPage(n).getSize(); const k = `${inch(width)} x ${inch(height)}`; sizes.set(k, (sizes.get(k) ?? 0) + 1); }
console.log('page sizes (w x h, incl. bleed):');
for (const [k, c] of sizes) console.log(`   ${k}  ×${c} pages`);
const p0 = i.getPage(0).getSize(), pN = i.getPage(i.getPageCount() - 1).getSize();
console.log('first page:', inch(p0.width), 'x', inch(p0.height));
console.log('last  page:', inch(pN.width), 'x', inch(pN.height));
// TrimBox audit (KDP trim declaration) — should be 7x10 centred, consistent on all pages
const trims = new Map<string, number>();
for (let n = 0; n < i.getPageCount(); n++) { const t = i.getPage(n).getTrimBox(); const k = `x=${inch(t.x)} y=${inch(t.y)} ${inch(t.width)}x${inch(t.height)}`; trims.set(k, (trims.get(k) ?? 0) + 1); }
console.log('TrimBox (KDP trim):');
for (const [k, c2] of trims) console.log(`   ${k}  ×${c2} pages`);
console.log('expected TrimBox: x=0.1250" y=0.1250" 7.0000x10.0000 (7x10 trim, 0.125" bleed all sides)');

console.log('\n================ COVER ================');
const cStat = statSync(COV);
console.log('path:', COV);
console.log('size on disk:', cStat.size, 'bytes (' + mb(cStat.size) + ')');
const c = await PDFDocument.load(readFileSync(COV), { updateMetadata: false });
console.log('page count:', c.getPageCount());
const cs = c.getPage(0).getSize();
console.log('dimensions:', inch(cs.width), 'x', inch(cs.height), `(${cs.width.toFixed(1)} x ${cs.height.toFixed(1)} pt)`);
console.log('expected  : 14.8693" x 10.2500"  (full wrap, spine 0.6193")');
process.exit(0);
