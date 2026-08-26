/**
 * PRINT READINESS — the properties of the FILE, not of its words.
 *
 * Text fidelity is checked separately, against the manuscript. This asks the
 * questions a printer asks: is every page the right size, is every glyph the
 * reader will see actually embedded, does the furniture appear where it should,
 * and does the page count let a cover be built.
 *
 *   npx tsx scripts/national-parks-print-check.ts <pdf>
 *
 * Read-only. Reads the file from disk; renders nothing.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFNumber } from 'pdf-lib';
import { PAGE_THICKNESS_IN } from '../src/pipeline/publishing-standard/cover-dimensions.js';

const PDF_PATH = process.argv[2];
if (!PDF_PATH) throw new Error('usage: national-parks-print-check.ts <pdf>');

const bytes = readFileSync(PDF_PATH);
const sha = createHash('sha256').update(bytes).digest('hex');

let failures = 0;
let warnings = 0;
const fail = (l: string, d: string): void => { failures += 1; console.log(`  [FAIL] ${l}: ${d}`); };
const warn = (l: string, d: string): void => { warnings += 1; console.log(`  [WARN] ${l}: ${d}`); };
const pass = (l: string, d: string): void => console.log(`  [PASS] ${l}: ${d}`);

const doc = await PDFDocument.load(bytes, { updateMetadata: false });
const pages = doc.getPages();

console.log(`pdf    : ${PDF_PATH}`);
console.log(`sha256 : ${sha}`);
console.log(`bytes  : ${bytes.length}`);
console.log(`pages  : ${pages.length}\n`);

// ── 1. Page geometry ───────────────────────────────────────────────────────
console.log('1. PAGE GEOMETRY');
{
  const WANT_W = 6 * 72;
  const WANT_H = 9 * 72;
  const TOL = 0.5; // half a point: PDF sizes are floats
  const odd = pages
    .map((p, i) => ({ i: i + 1, w: p.getWidth(), h: p.getHeight() }))
    .filter((p) => Math.abs(p.w - WANT_W) > TOL || Math.abs(p.h - WANT_H) > TOL);
  if (odd.length === 0) pass('every page 6 x 9 in', `${pages.length} pages at ${WANT_W} x ${WANT_H} pt`);
  else {
    fail('page size', `${odd.length} page(s) are not 6 x 9`);
    for (const o of odd.slice(0, 6)) console.log(`         p${o.i}: ${o.w} x ${o.h} pt`);
  }

  /**
   * A no-bleed interior must not declare a BleedBox or TrimBox smaller than the
   * page: KDP reads those, and a stray box would crop the text block. Absent is
   * correct here — the page IS the trim.
   */
  const boxed = pages
    .map((p, i) => ({ i: i + 1, node: p.node }))
    .filter(({ node }) => node.get(PDFName.of('TrimBox')) || node.get(PDFName.of('BleedBox')));
  if (boxed.length === 0) pass('no stray trim/bleed boxes', 'the page is the trim, as a zero-bleed interior requires');
  else {
    // Not a failure on its own: a TrimBox equal to the MediaBox is harmless.
    const wrong = boxed.filter(({ node }) => {
      const tb = node.lookupMaybe(PDFName.of('TrimBox'), PDFArray);
      if (!tb) return false;
      const v = tb.asArray().map((n) => (n instanceof PDFNumber ? n.asNumber() : Number.NaN));
      return !(Math.abs(v[0]!) < TOL && Math.abs(v[1]!) < TOL && Math.abs(v[2]! - WANT_W) < TOL && Math.abs(v[3]! - WANT_H) < TOL);
    });
    if (wrong.length === 0) pass('trim boxes', `${boxed.length} page(s) declare a box, all equal to the trim`);
    else fail('trim boxes', `${wrong.length} page(s) declare a box that is not the trim`);
  }
}

// ── 2. Font embedding ──────────────────────────────────────────────────────
console.log('\n2. FONT EMBEDDING');
{
  const found = new Map<string, { subtype: string; embedded: boolean }>();
  for (const page of pages) {
    const res = page.node.Resources();
    const fonts = res?.lookupMaybe(PDFName.of('Font'), PDFDict);
    if (!fonts) continue;
    for (const key of fonts.keys()) {
      const f = fonts.lookupMaybe(key, PDFDict);
      if (!f) continue;
      const base = String(f.get(PDFName.of('BaseFont')) ?? '?').replace(/^\//, '');
      const subtype = String(f.get(PDFName.of('Subtype')) ?? '?').replace(/^\//, '');
      let desc = f.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
      if (!desc) {
        // A Type0 font keeps its descriptor on the descendant CIDFont.
        const kids = f.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray);
        const kid = kids?.lookupMaybe(0, PDFDict);
        desc = kid?.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
      }
      const embedded = Boolean(
        desc && ['FontFile', 'FontFile2', 'FontFile3'].some((k) => desc!.get(PDFName.of(k))),
      );
      found.set(`${subtype}:${base}`, { subtype, embedded });
    }
  }
  if (found.size === 0) fail('fonts', 'no font resources found at all');
  else {
    for (const [name, v] of [...found].sort()) {
      console.log(`         ${v.embedded ? 'embedded' : 'NOT EMBEDDED'}  ${name}`);
    }
    const notEmbedded = [...found].filter(([, v]) => !v.embedded && v.subtype !== 'Type3');
    /**
     * Type3 is a glyph-drawing procedure rather than a font program. It is
     * self-contained — the shapes travel inside the PDF, so nothing is missing —
     * but some print RIPs reject it, which is why it is called out rather than
     * passed silently. See scripts/font-embed-probe.ts.
     */
    const type3 = [...found].filter(([, v]) => v.subtype === 'Type3');
    if (notEmbedded.length === 0 && type3.length === 0) {
      pass('all faces embedded', `${found.size} font resource(s), every one carrying a font program`);
    } else if (notEmbedded.length > 0) {
      fail('unembedded font', `${notEmbedded.length} face(s) reference a font that is not in the file`);
    } else {
      warn(
        'Type3 faces',
        `${type3.length} of ${found.size} face(s) are Type3 glyph procedures. Self-contained, so nothing is missing, but some RIPs reject them — confirm on the printed proof.`,
      );
    }
  }
}

// ── 3. Furniture ───────────────────────────────────────────────────────────
console.log('\n3. RUNNING HEADS AND FOLIOS');
{
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdfjs as any).GlobalWorkerOptions.workerSrc = '';
  const jsDoc = await (
    pdfjs as unknown as { getDocument: (o: unknown) => { promise: Promise<any> } }
  ).getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true }).promise;

  const MARGIN_PT = 0.625 * 72;
  interface PageView { folio: string[]; head: string[]; bodyChars: number }
  const views: PageView[] = [];
  for (let i = 1; i <= jsDoc.numPages; i++) {
    const page = await jsDoc.getPage(i);
    const tc = await page.getTextContent();
    const height = page.getViewport({ scale: 1 }).height;
    const v: PageView = { folio: [], head: [], bodyChars: 0 };
    for (const it of tc.items as Array<{ str?: string; transform?: number[] }>) {
      const s = (it.str ?? '').trim();
      if (!s) continue;
      const y = it.transform?.[5] ?? -1;
      if (y < MARGIN_PT) v.folio.push(s);
      else if (y > height - MARGIN_PT) v.head.push(s);
      else v.bodyChars += s.length;
    }
    views.push(v);
  }

  const blank = views.map((v, i) => ({ ...v, n: i + 1 })).filter((v) => v.bodyChars === 0);
  const withFolio = views.filter((v) => v.folio.join('').match(/\d/));
  const withHead = views.filter((v) => v.head.join('').length > 0);
  console.log(`         ${withFolio.length} page(s) carry a folio, ${withHead.length} carry a running head`);

  // Blank pages must carry NO furniture: a page number on an intentionally
  // blank leaf reads as a printing error.
  const dirtyBlanks = blank.filter((b) => b.folio.length > 0 || b.head.length > 0);
  if (blank.length === 0) pass('blank pages', 'none');
  else if (dirtyBlanks.length === 0) {
    pass('blank pages are clean', `${blank.length} parity blank(s) at ${blank.map((b) => b.n).join(', ')}, none carrying furniture`);
  } else {
    fail('blank pages carry furniture', `p${dirtyBlanks.map((b) => b.n).join(', p')}`);
  }

  // Folios must run in order wherever they appear.
  const numbers = views
    .map((v, i) => ({ n: i + 1, folio: Number((v.folio.join(' ').match(/\b\d+\b/) ?? [])[0]) }))
    .filter((v) => Number.isFinite(v.folio));
  const mismatched = numbers.filter((v) => v.folio !== v.n);
  if (numbers.length === 0) fail('folios', 'no page carries a number');
  else if (mismatched.length === 0) {
    pass('folios match sheet position', `${numbers.length} numbered page(s), every folio equal to its page index`);
  } else {
    fail('folio numbering', `${mismatched.length} page(s) print a folio that is not their position`);
    for (const m of mismatched.slice(0, 6)) console.log(`         sheet ${m.n} prints ${m.folio}`);
  }

  // Front matter convention: title and copyright pages carry no furniture.
  const firstTwo = views.slice(0, 2);
  if (firstTwo.every((v) => v.folio.length === 0 && v.head.length === 0)) {
    pass('title and copyright pages', 'furniture-free, as the convention requires');
  } else {
    fail('title and copyright pages', 'carry a folio or running head');
  }
}

// ── 4. Cover / spine basis ─────────────────────────────────────────────────
console.log('\n4. COVER AND SPINE BASIS');
{
  const n = pages.length;
  if (n % 2 !== 0) fail('page count parity', `${n} is ODD — KDP requires an even interior page count`);
  else pass('page count parity', `${n} pages, even`);

  if (n < 24) fail('minimum page count', `${n} is below KDP's 24-page minimum`);
  else pass('minimum page count', `${n} >= 24`);

  /**
   * KDP white paper, black-and-white interior: 0.002252 inches per page.
   * That is the published multiplier, and it is the ONLY input to the spine
   * besides the page count — which is why the cover cannot be finished until
   * this file is final.
   */
  const PPI = PAGE_THICKNESS_IN.white;
  const spine = n * PPI;
  console.log(`         paper stock          : white`);
  console.log(`         multiplier           : ${PPI} in/page (KDP, B&W on white)`);
  console.log(`         SPINE WIDTH          : ${n} x ${PPI} = ${spine.toFixed(4)} in`);
  console.log(`         full wrap (no bleed) : ${(6 * 2 + spine).toFixed(4)} x 9.0000 in`);
  console.log(`         full wrap (0.125 bleed): ${(6 * 2 + spine + 0.25).toFixed(4)} x ${(9 + 0.25).toFixed(4)} in`);
  if (n >= 79) pass('spine text allowed', `${n} >= 79 pages`);
  else warn('spine text', `${n} pages is under KDP's 79-page threshold — no spine text`);
}

console.log(`\n${'─'.repeat(70)}`);
console.log(`PRINT READINESS: ${failures} failure(s), ${warnings} warning(s)`);
console.log(failures === 0 ? 'PRINT CHECK: PASS' : 'PRINT CHECK: FAIL');
process.exit(failures === 0 ? 0 : 1);
