/**
 * WHERE EVERY STAMPED IMAGE ACTUALLY SITS ACROSS THE PAGE.
 *
 * A plate that is off-centre is invisible to every check that reads a PDF as
 * data and obvious to anyone looking at a spread. This measures it, so the fix
 * is applied to a number rather than to an impression.
 *
 * THREE REFERENCES, because "centred" is ambiguous in a book with an asymmetric
 * margin:
 *
 *   page centre       the physical middle of the sheet
 *   text-block centre the middle of the type measure, which is what the reader's
 *                     eye actually uses as the column
 *
 * On a 6in page with a 0.625in gutter and a 0.5in outside margin those two are
 * 0.0625in apart, and they sit on OPPOSITE sides depending on recto or verso.
 * A plate centred on the page therefore looks 1/16in out on every leaf, and a
 * plate centred on the text block is correct on both.
 *
 *   npx tsx scripts/pdf-image-centering.ts <pdf> [gutterIn] [outsideIn]
 */
import { readFileSync } from 'node:fs';

const PDF = process.argv[2];
if (!PDF) throw new Error('usage: pdf-image-centering.ts <pdf> [gutterIn] [outsideIn]');
const GUTTER_IN = Number(process.argv[3] ?? 0.625);
const OUTSIDE_IN = Number(process.argv[4] ?? 0.5);

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pdfjs as any).GlobalWorkerOptions.workerSrc = '';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const doc = await (pdfjs as any)
  .getDocument({ data: new Uint8Array(readFileSync(PDF)), useSystemFonts: false, disableFontFace: true })
  .promise;
const { OPS } = pdfjs as unknown as { OPS: Record<string, number> };

type Matrix = [number, number, number, number, number, number];
const mul = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];

console.log(`pdf     : ${PDF}`);
console.log(`margins : gutter ${GUTTER_IN}in, outside ${OUTSIDE_IN}in\n`);
console.log('  page  side   plate x-range (in)   plate ctr   page ctr   text ctr   off text-ctr');
console.log('  ' + '-'.repeat(84));

let worst = 0;
const rows: Array<{ page: number; offText: number }> = [];

for (let p = 1; p <= doc.numPages; p += 1) {
  const page = await doc.getPage(p);
  const [, , pageWpt, ] = page.view as number[];
  const pageWin = (pageWpt ?? 432) / 72;
  const ops = await page.getOperatorList();
  const fns = ops.fnArray as number[];
  const args = ops.argsArray as unknown[][];

  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];

  for (let i = 0; i < fns.length; i += 1) {
    const fn = fns[i]!;
    if (fn === OPS.save) stack.push([...ctm] as Matrix);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(args[i] as unknown as Matrix, ctm);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintImageMaskXObject) {
      const wIn = Math.hypot(ctm[0], ctm[1]) / 72;
      const x0 = ctm[4] / 72;
      const x1 = x0 + wIn;
      const plateCtr = (x0 + x1) / 2;
      const pageCtr = pageWin / 2;
      /** Odd page numbers are rectos, where the gutter is the LEFT margin. */
      const isRecto = p % 2 === 1;
      const left = isRecto ? GUTTER_IN : OUTSIDE_IN;
      const right = isRecto ? OUTSIDE_IN : GUTTER_IN;
      const textCtr = (left + (pageWin - right)) / 2;
      const offText = plateCtr - textCtr;
      worst = Math.max(worst, Math.abs(offText));
      rows.push({ page: p, offText });
      console.log(
        `  p${String(p).padStart(3)}  ${(isRecto ? 'recto' : 'VERSO').padEnd(6)} ` +
          `${x0.toFixed(3)} to ${x1.toFixed(3)}     ` +
          `${plateCtr.toFixed(3)}      ${pageCtr.toFixed(3)}      ${textCtr.toFixed(3)}      ` +
          `${offText >= 0 ? '+' : ''}${offText.toFixed(3)}in` +
          `${Math.abs(offText) > 0.02 ? '   <-- OFF' : ''}`,
      );
    }
  }
}

console.log('');
const bad = rows.filter((r) => Math.abs(r.offText) > 0.02);
console.log(`${rows.length} image(s). Worst offset from the text-block centre: ${worst.toFixed(3)}in.`);
if (bad.length) {
  console.log(`OFF-CENTRE: ${bad.length} plate(s) -> ${bad.map((b) => `p${b.page}`).join(', ')}`);
  process.exit(1);
}
console.log('All plates centred on the text block within 0.02in.');
process.exit(0);
