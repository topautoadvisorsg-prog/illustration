/* Re-compose the hardcover cover from the already-generated art (no new render):
 * resize to the exact KDP wrap, then reserve a clean white 2x1.2in barcode area
 * at the lower-left of the back cover (KDP places its own barcode there; artwork
 * must be clear). Writes the cover PDF + review PNG. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { getKdpCoverDimensions } from '../src/pipeline/publishing-standard/kdp-cover-specs.js';
import { HARDCOVER_RULES } from '../src/pipeline/publishing-standard/kdp-spec.js';

const P = process.argv[2]!;
const OUT = process.argv[3] ?? 'C:/Users/jovan/Downloads';
// Geometry comes from the verified Cover Calculator reading for this exact
// configuration, not from numbers typed here. The literals this replaced
// (16.409 x 11.417, spine 0.834, wrap 0.591) matched the fixture exactly, so
// no cover moves.
const KDP = getKdpCoverDimensions({
  binding: 'HARDCOVER',
  coverType: 'CASE_LAMINATE',
  interiorType: 'PREMIUM_COLOR',
  paperType: 'WHITE',
  trimSize: '7x10',
  pageCount: 275,
});
const dims = { fullWidthIn: KDP.fullWidthIn, fullHeightIn: KDP.fullHeightIn, spineIn: KDP.spineIn };
const WRAP = KDP.wrapIn;
const BC_LEFT_MARGIN = KDP.barcodeMarginWidthIn;
const BC_BOTTOM_MARGIN = KDP.barcodeMarginHeightIn;
const BC_W = HARDCOVER_RULES.barcode.value.widthIn;
const BC_H = HARDCOVER_RULES.barcode.value.heightIn;

const storage = getProjectStorage();
const artPng = await storage.readProjectFile(`${P}/cover/cover-wrap-hardcover-art.png`);

const dpi = 300;
const canvasW = Math.round(dims.fullWidthIn * dpi);
const canvasH = Math.round(dims.fullHeightIn * dpi);
const art = await sharp(artPng).resize({ width: canvasW, height: canvasH, fit: 'cover', position: 'centre', kernel: 'lanczos3' }).toBuffer();

// Clean white barcode-reserve box, lower-left of the back cover (inside wrap + margins).
const leftIn = WRAP + BC_LEFT_MARGIN;            // 0.841"
const bottomIn = WRAP + BC_BOTTOM_MARGIN;        // 0.966"
const L = Math.round(leftIn * dpi);
const T = Math.round((dims.fullHeightIn - bottomIn - BC_H) * dpi);
const W = Math.round(BC_W * dpi);
const H = Math.round(BC_H * dpi);
const box = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}"><rect x="${L}" y="${T}" width="${W}" height="${H}" fill="#ffffff"/></svg>`;
const overlay = await sharp(Buffer.from(box)).png().toBuffer();

const composed = await sharp(art).composite([{ input: overlay, left: 0, top: 0 }]).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();

const pdf = await PDFDocument.create();
const page = pdf.addPage([dims.fullWidthIn * 72, dims.fullHeightIn * 72]);
const img = await pdf.embedJpg(composed);
page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
const pdfBuffer = Buffer.from(await pdf.save());

const pdfPath = join(OUT, 'THE_WILDLANDS_NEW_ENGLAND_HARDCOVER_cover.pdf');
const pngPath = join(OUT, 'hardcover_cover_review.png');
writeFileSync(pdfPath, pdfBuffer);
writeFileSync(pngPath, await sharp(composed).png().toBuffer());
console.log(`barcode reserve box: ${BC_W}x${BC_H}in at left ${leftIn.toFixed(3)}in, bottom ${bottomIn.toFixed(3)}in`);
console.log(`cover PDF → ${pdfPath} (${(pdfBuffer.length / 1048576).toFixed(1)} MB)`);
console.log(`review PNG → ${pngPath}`);
process.exit(0);
