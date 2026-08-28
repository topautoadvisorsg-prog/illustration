/** READ-ONLY. How full is every page of the shipped interior, and what is on it. */
import { readFileSync } from 'node:fs';
const PDF = process.argv[2]!;
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pdfjs as any).GlobalWorkerOptions.workerSrc = '';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const doc = await (pdfjs as any).getDocument({ data: new Uint8Array(readFileSync(PDF)), useSystemFonts: false, disableFontFace: true }).promise;
const { OPS } = pdfjs as unknown as { OPS: Record<string, number> };
type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [a[0]*b[0]+a[1]*b[2], a[0]*b[1]+a[1]*b[3], a[2]*b[0]+a[3]*b[2], a[2]*b[1]+a[3]*b[3], a[4]*b[0]+a[5]*b[2]+b[4], a[4]*b[1]+a[5]*b[3]+b[5]];
const TOP = 0.625, BOT = 0.625, H = 9;
const BLOCK = H - TOP - BOT;
const rows: { p: number; textIn: number; artIn: number; fill: number; first: string }[] = [];
for (let p = 1; p <= doc.numPages; p += 1) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  let hi = -Infinity, lo = Infinity; const strs: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const it of tc.items as any[]) {
    if (!it.str?.trim()) continue;
    const yTop = H - it.transform[5] / 72;
    if (yTop < 0.55 || yTop > 8.5) continue;      // skip running head and folio
    hi = Math.max(hi, yTop); lo = Math.min(lo, yTop); strs.push(it.str);
  }
  const textIn = Number.isFinite(hi) ? hi - TOP : 0;
  let artIn = 0;
  const ops = await page.getOperatorList();
  const fns = ops.fnArray as number[]; const args = ops.argsArray as unknown[][];
  let ctm: M = [1,0,0,1,0,0]; const stack: M[] = [];
  for (let i = 0; i < fns.length; i += 1) {
    const fn = fns[i]!;
    if (fn === OPS.save) stack.push([...ctm] as M);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(args[i] as unknown as M, ctm);
    else if (fn === OPS.paintImageXObject) artIn += Math.hypot(ctm[2], ctm[3]) / 72;
  }
  const fill = Math.min(1, Math.max(textIn, 0) / BLOCK + (artIn > 0 && textIn < 0.1 ? artIn / BLOCK : 0));
  const inked = artIn > 0 ? Math.min(1, (Math.max(textIn, 0) + artIn) / BLOCK) : fill;
  rows.push({ p, textIn: Math.max(textIn, 0), artIn, fill: inked, first: strs.join(' ').replace(/\s+/g, ' ').slice(0, 52) });
}
console.log(`${doc.numPages} pages. Text block ${BLOCK.toFixed(2)}in.\n`);
console.log('  page  text    art     filled   opening words');
console.log('  ' + '-'.repeat(84));
for (const r of rows) {
  const blank = r.textIn === 0 && r.artIn === 0;
  const flag = blank ? '  (parity blank)' : r.fill < 0.45 ? '  <<< UNDER HALF' : '';
  if (r.fill < 0.62 || blank) {
    console.log(`  p${String(r.p).padStart(3)}  ${r.textIn.toFixed(2)}in  ${r.artIn.toFixed(2)}in  ${(r.fill * 100).toFixed(0).padStart(4)}%   ${r.first}${flag}`);
  }
}
const bad = rows.filter((r) => r.fill < 0.45 && !(r.textIn === 0 && r.artIn === 0));
console.log(`\n${bad.length} page(s) under half full and not a parity blank: ${bad.map((b) => `p${b.p}`).join(', ') || 'none'}`);
process.exit(0);
