/* Validate any interior PDF by path: page count, page size, TrimBox. */
import { readFileSync, statSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
const path = process.argv[2]!;
const inch = (pt: number) => (pt / 72).toFixed(4) + '"';
const s = statSync(path);
console.log('file:', path);
console.log('size:', s.size, 'bytes (' + (s.size / 1048576).toFixed(1) + ' MB)');
const d = await PDFDocument.load(readFileSync(path), { updateMetadata: false });
console.log('page count:', d.getPageCount());
const szs = new Map<string, number>(); const tbs = new Map<string, number>();
for (let n = 0; n < d.getPageCount(); n++) {
  const p = d.getPage(n); const { width, height } = p.getSize(); const t = p.getTrimBox();
  szs.set(`${inch(width)} x ${inch(height)}`, (szs.get(`${inch(width)} x ${inch(height)}`) ?? 0) + 1);
  tbs.set(`x=${inch(t.x)} y=${inch(t.y)} ${inch(t.width)}x${inch(t.height)}`, (tbs.get(`x=${inch(t.x)} y=${inch(t.y)} ${inch(t.width)}x${inch(t.height)}`) ?? 0) + 1);
}
console.log('page size:', [...szs].map(([k, c]) => `${k} ×${c}`).join(' | '));
console.log('TrimBox  :', [...tbs].map(([k, c]) => `${k} ×${c}`).join(' | '));
process.exit(0);
