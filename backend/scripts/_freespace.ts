/** READ-ONLY. Free region under the type on every page in a range. */
import { readFileSync } from 'node:fs';
const [PDF, FROM, TO] = process.argv.slice(2);
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pdfjs as any).GlobalWorkerOptions.workerSrc = '';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const doc = await (pdfjs as any).getDocument({ data: new Uint8Array(readFileSync(PDF!)), useSystemFonts: false, disableFontFace: true }).promise;
const { OPS } = pdfjs as unknown as { OPS: Record<string, number> };
type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [a[0]*b[0]+a[1]*b[2], a[0]*b[1]+a[1]*b[3], a[2]*b[0]+a[3]*b[2], a[2]*b[1]+a[3]*b[3], a[4]*b[0]+a[5]*b[2]+b[4], a[4]*b[1]+a[5]*b[3]+b[5]];
const H = 9, BOT = 0.625, GAP = 0.3;
console.log('  page  type ends   art   free region   opening words');
for (let p = Number(FROM); p <= Number(TO); p += 1) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  let hi = -Infinity; const strs: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const it of tc.items as any[]) {
    if (!it.str?.trim()) continue;
    const yTop = H - it.transform[5] / 72;
    if (yTop < 0.55 || yTop > 8.5) continue;
    hi = Math.max(hi, yTop); strs.push(it.str);
  }
  const ops = await page.getOperatorList();
  const fns = ops.fnArray as number[]; const args = ops.argsArray as unknown[][];
  let ctm: M = [1,0,0,1,0,0]; const stack: M[] = []; let art = 0;
  for (let i = 0; i < fns.length; i += 1) {
    const fn = fns[i]!;
    if (fn === OPS.save) stack.push([...ctm] as M);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(args[i] as unknown as M, ctm);
    else if (fn === OPS.paintImageXObject) art += Math.hypot(ctm[2], ctm[3]) / 72;
  }
  const typeEnd = Number.isFinite(hi) ? hi : 0;
  const free = H - BOT - typeEnd - GAP - art;
  console.log(`  p${String(p).padStart(3)}  ${typeEnd.toFixed(2)}in     ${art.toFixed(2)}  ${free.toFixed(2)}in       ${strs.join(' ').replace(/\s+/g, ' ').slice(0, 44)}`);
}
process.exit(0);
