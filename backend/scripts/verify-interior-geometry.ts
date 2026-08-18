/**
 * MEASURE THE ARTIFACT, NOT THE RENDER.
 *
 * ─── THE FAILURE THIS EXISTS TO CATCH ─────────────────────────────────────
 * The pagination gate renders the book in-process and reports on THAT. The
 * shipped PDF is built by the HTTP assemble route on the running server. Those
 * are two different copies of the code, and they drifted: the launcher runs
 * `tsx src/index.ts` with no watch (watch mode hangs the typeset render), so a
 * server started before an edit serves stale code indefinitely. A renderer fix
 * was verified green in-process while the delivered PDF, built minutes later by
 * a two-hour-old server, still had every narrow figure flush left — measured
 * 1.583in off centre on p48.
 *
 * The lesson is not "restart the server". It is that a check which never opens
 * the delivered file cannot certify the delivered file. This opens it.
 *
 *   yarn tsx scripts/verify-interior-geometry.ts <interior.pdf>
 *
 * Exits non-zero on any failure, so it can gate a handoff.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
/* eslint-disable @typescript-eslint/no-explicit-any */
const pdfjs: any = require_('pdfjs-dist/legacy/build/pdf.js');
pdfjs.GlobalWorkerOptions.workerSrc = require_.resolve('pdfjs-dist/legacy/build/pdf.worker.js');

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error('usage: verify-interior-geometry.ts <interior.pdf>');
  process.exit(2);
}

/** A figure may sit off the page centre only by the mirrored margin itself. */
const MIRROR_TOLERANCE_PT = 12; // 0.167in — the inner/outer offset plus rounding
/** Body measure; a heading run is materially larger than this. */
const BODY_PT = 11;
/** Anything below this y is running foot, not content. */
const FOOT_Y = 40;

const mul = (a: number[], b: number[]): number[] => [
  a[0]! * b[0]! + a[2]! * b[1]!, a[1]! * b[0]! + a[3]! * b[1]!,
  a[0]! * b[2]! + a[2]! * b[3]!, a[1]! * b[2]! + a[3]! * b[3]!,
  a[0]! * b[4]! + a[2]! * b[5]! + a[4]!, a[1]! * b[4]! + a[3]! * b[5]! + a[5]!,
];

const doc = await pdfjs.getDocument({
  data: new Uint8Array(readFileSync(pdfPath)), useSystemFonts: true, verbosity: 0,
}).promise;

const OPS = pdfjs.OPS;
const offCentre: string[] = [];
const stranded: string[] = [];
let figures = 0;
let headings = 0;

for (let n = 1; n <= doc.numPages; n++) {
  const page = await doc.getPage(n);
  const pageWidth = page.getViewport({ scale: 1 }).width;

  // ── figures: is the image centred in the measure? ──────────────────────
  const ops = await page.getOperatorList();
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    if (fn === OPS.save) stack.push(ctm.slice());
    else if (fn === OPS.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mul(ctm, ops.argsArray[i]);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
      const width = Math.abs(ctm[0]!);
      if (width < 20) continue; // rule, bullet or other ornament
      figures++;
      const left = ctm[4]!;
      const skew = left - (pageWidth - (left + width));
      if (Math.abs(skew) > MIRROR_TOLERANCE_PT) {
        offCentre.push(`p${n}: ${(skew / 72).toFixed(3)}in off centre (left ${left.toFixed(1)}pt, right ${(pageWidth - left - width).toFixed(1)}pt)`);
      }
    }
  }

  // ── headings: does any heading end a page with its text overleaf? ──────
  // Paged.js ignores `break-after: avoid`, so this cannot be assumed from CSS.
  const lines = new Map<number, { y: number; h: number; text: string }>();
  for (const item of (await page.getTextContent()).items as any[]) {
    if (!item.str.trim()) continue;
    const y = Math.round(item.transform[5]);
    const line = lines.get(y) ?? { y, h: 0, text: '' };
    line.h = Math.max(line.h, Math.abs(item.transform[0]) || 0);
    line.text += item.str;
    lines.set(y, line);
  }
  const content = [...lines.values()].filter((l) => l.y > FOOT_Y).sort((a, b) => b.y - a.y);
  const isHeading = (l: { h: number }): boolean => l.h >= BODY_PT + 0.8;
  for (let i = 0; i < content.length; i++) {
    if (!isHeading(content[i]!)) continue;
    headings++;
    if (!content.slice(i + 1).some((l) => !isHeading(l))) {
      stranded.push(`p${n}: "${content[i]!.text.slice(0, 60)}" ends the page, body starts overleaf`);
    }
  }
}

console.log(`${pdfPath}\n${doc.numPages} pages, ${figures} figures, ${headings} headings\n`);
const report = (label: string, failures: string[], total: number): boolean => {
  if (failures.length === 0) { console.log(`  PASS  ${label} (${total} checked)`); return true; }
  console.log(`  FAIL  ${label} — ${failures.length} of ${total}`);
  for (const f of failures) console.log(`          ${f}`);
  return false;
};
const ok = [
  report(`every figure centred within ${(MIRROR_TOLERANCE_PT / 72).toFixed(3)}in`, offCentre, figures),
  report('no heading stranded at a page foot', stranded, headings),
].every(Boolean);

console.log(ok ? '\nINTERIOR GEOMETRY CLEAN' : '\nINTERIOR GEOMETRY FAILED');
process.exit(ok ? 0 : 1);
