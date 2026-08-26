/**
 * EFFECTIVE PRINT RESOLUTION of every image actually embedded in a PDF.
 *
 * Not the resolution recorded in a config, and not the resolution of the file on
 * disk that was uploaded: the pixels that are IN the PDF divided by the size
 * they are DRAWN at on the page. Those three can disagree, and only the last one
 * is what the printer sees.
 *
 * The drawn size comes from the current transformation matrix at the moment the
 * image is painted. An image XObject is always drawn into a 1x1 unit square, so
 * the CTM's scale terms ARE its width and height in points.
 *
 *   npx tsx scripts/pdf-image-ppi.ts <pdf> [minPpi]
 *
 * Exits non-zero if any image falls below minPpi (default 300), so this can gate
 * a delivery rather than merely describe one.
 */
import { readFileSync } from 'node:fs';

const PDF = process.argv[2];
if (!PDF) throw new Error('usage: pdf-image-ppi.ts <pdf> [minPpi]');
const MIN_PPI = Number(process.argv[3] ?? 300);

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

interface Row {
  page: number;
  name: string;
  px: string;
  drawnIn: string;
  ppiW: number;
  ppiH: number;
}

const rows: Row[] = [];

for (let p = 1; p <= doc.numPages; p += 1) {
  const page = await doc.getPage(p);
  const ops = await page.getOperatorList();
  const fns = ops.fnArray as number[];
  const args = ops.argsArray as unknown[][];

  /** Graphics-state stack, so a q/Q pair cannot leak a scale into the next image. */
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];

  for (let i = 0; i < fns.length; i += 1) {
    const fn = fns[i]!;
    if (fn === OPS.save) stack.push([...ctm] as Matrix);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(args[i] as unknown as Matrix, ctm);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintImageMaskXObject) {
      const name = String((args[i] as unknown[])[0] ?? '?');
      /**
       * The object may live on the page or, for a shared resource, in the common
       * object store. Ask both rather than assuming.
       */
      let img: { width?: number; height?: number } | undefined;
      try {
        img = page.objs.get(name) as { width?: number; height?: number };
      } catch {
        try {
          img = doc.commonObjs.get(name) as { width?: number; height?: number };
        } catch {
          img = undefined;
        }
      }
      /** Drawn size in points: the CTM scale, sign-independent. */
      const wPt = Math.hypot(ctm[0], ctm[1]);
      const hPt = Math.hypot(ctm[2], ctm[3]);
      const wIn = wPt / 72;
      const hIn = hPt / 72;
      const pxW = img?.width ?? 0;
      const pxH = img?.height ?? 0;
      rows.push({
        page: p,
        name,
        px: pxW ? `${pxW} x ${pxH}` : '(pixels not reported)',
        drawnIn: `${wIn.toFixed(2)} x ${hIn.toFixed(2)} in`,
        ppiW: wIn > 0 && pxW ? Math.round(pxW / wIn) : 0,
        ppiH: hIn > 0 && pxH ? Math.round(pxH / hIn) : 0,
      });
    }
  }
}

console.log(`pdf   : ${PDF}`);
console.log(`pages : ${doc.numPages}`);
console.log(`gate  : ${MIN_PPI} PPI\n`);
console.log('  page  embedded pixels     drawn at            effective PPI');
console.log('  ' + '-'.repeat(66));

let worst = Number.POSITIVE_INFINITY;
let below = 0;
for (const r of rows) {
  const ppi = Math.min(r.ppiW, r.ppiH);
  if (ppi > 0) worst = Math.min(worst, ppi);
  const flag = ppi === 0 ? '  ??' : ppi < MIN_PPI ? '  BELOW GATE' : '';
  if (ppi > 0 && ppi < MIN_PPI) below += 1;
  console.log(
    `  p${String(r.page).padStart(3)}  ${r.px.padEnd(18)}  ${r.drawnIn.padEnd(18)}  ${String(ppi || '?').padStart(5)}${flag}`,
  );
}

console.log('');
console.log(`${rows.length} image(s). Lowest effective resolution: ${Number.isFinite(worst) ? `${worst} PPI` : 'unknown'}.`);
if (below > 0) {
  console.log(`RESULT: FAIL — ${below} image(s) below ${MIN_PPI} PPI at printed size.`);
  process.exit(1);
}
console.log(`RESULT: PASS — every image at or above ${MIN_PPI} PPI at printed size.`);
process.exit(0);
