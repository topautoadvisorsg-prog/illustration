/* Pull the embedded page image OUT of an assembled PDF (no rasterizer needed —
 * print pages are single DCTDecode/JPEG XObjects) and crop both bottom corners so
 * we can SEE the folio that's actually in the file. Read-only.
 * Usage: _pdfimg.ts <file.pdf> <0-basedPage> [outName] */
import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument, PDFName, PDFDict, PDFRawStream } from 'pdf-lib';
import sharp from 'sharp';

const f = process.argv[2]!;
const pageIdx = Number(process.argv[3] ?? 0);
const out = process.argv[4] ?? '_pdfimg_corners.png';
const doc = await PDFDocument.load(readFileSync(f), { updateMetadata: false });
const page = doc.getPage(pageIdx);
const resources = page.node.Resources();
const xobjs = resources?.lookup(PDFName.of('XObject'), PDFDict);
if (!xobjs) { console.log('no XObject dict on page', pageIdx); process.exit(1); }

let best: Uint8Array | null = null;
for (const [, value] of xobjs.entries()) {
  const s = doc.context.lookup(value);
  if (s instanceof PDFRawStream) {
    const sub = String(s.dict.lookup(PDFName.of('Subtype')));
    if (sub.includes('Image') && (!best || s.contents.length > best.length)) best = s.contents;
  }
}
if (!best) { console.log('no image xobject'); process.exit(1); }
const jpg = Buffer.from(best);
const m = await sharp(jpg).metadata();
const W = m.width!, H = m.height!;
console.log(`page ${pageIdx}: embedded image ${W}x${H}, ${(jpg.length / 1024).toFixed(0)}KB`);
const dpi = W / 7.25, cw = Math.round(2.3 * dpi), ch = Math.round(1.1 * dpi), top = H - ch;
const leftBox = await sharp(jpg).extract({ left: 0, top, width: cw, height: ch }).resize({ width: 460 }).png().toBuffer();
const rightBox = await sharp(jpg).extract({ left: W - cw, top, width: cw, height: ch }).resize({ width: 460 }).png().toBuffer();
const bh = (await sharp(leftBox).metadata()).height!;
const gap = 18, labelH = 30, sheetW = 460 * 2 + gap * 3, sheetH = bh + labelH + gap;
const labels = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${sheetH}">` +
  `<text x="${gap + 230}" y="22" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#333">bottom-LEFT</text>` +
  `<text x="${gap * 2 + 460 + 230}" y="22" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#333">bottom-RIGHT</text></svg>`;
const sheet = await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#ffffff' } })
  .composite([{ input: leftBox, left: gap, top: labelH }, { input: rightBox, left: gap * 2 + 460, top: labelH }, { input: await sharp(Buffer.from(labels)).png().toBuffer(), left: 0, top: 0 }])
  .png().toBuffer();
writeFileSync(`C:/Users/jovan/Downloads/${out}`, sheet);
const fullName = out.replace(/\.png$/, '_full.png');
writeFileSync(`C:/Users/jovan/Downloads/${fullName}`, await sharp(jpg).resize({ width: 780 }).png().toBuffer());
console.log('→', out, '+', fullName);
process.exit(0);
