import { readFileSync } from 'node:fs';
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pdfjs as any).GlobalWorkerOptions.workerSrc = '';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const doc = await (pdfjs as any).getDocument({ data: new Uint8Array(readFileSync(process.argv[2]!)), useSystemFonts: false, disableFontFace: true }).promise;
let all = '';
for (let i = 1; i <= doc.numPages; i += 1) {
  const tc = await (await doc.getPage(i)).getTextContent();
  all += (tc.items as Array<{ str?: string }>).map((x) => x.str ?? '').join('');
}
const sq = all.replace(/\s+/g, '');
console.log(`pages                       : ${doc.numPages}`);
console.log(`sources section at the end  : ${sq.includes('WHERETHESENUMBERSCOMEFROM')}`);
console.log(`all 9 source entries        : ${['grsm','zion','yell','grca','yose','romo','acad'].every((p) => sq.includes(`nps.gov/${p}`))}`);
process.exit(0);
