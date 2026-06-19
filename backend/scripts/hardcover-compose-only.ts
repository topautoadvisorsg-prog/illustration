/* Re-compose the hardcover cover PDF from the already-fixed stored art (barcode
 * removed). No render, no edit, no white box. → Downloads. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { getProjectStorage } from '../src/services/storage/project-storage.js';

const P = process.argv[2]!;
const OUT = process.argv[3] ?? 'C:/Users/jovan/Downloads';
const dims = { fullWidthIn: 16.409, fullHeightIn: 11.417, spineIn: 0.834 };

const storage = getProjectStorage();
const artPng = await storage.readProjectFile(`${P}/cover/cover-wrap-hardcover-art.png`);
const dpi = 300;
const composed = await sharp(artPng)
  .resize({ width: Math.round(dims.fullWidthIn * dpi), height: Math.round(dims.fullHeightIn * dpi), fit: 'cover', position: 'centre', kernel: 'lanczos3' })
  .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
  .toBuffer();

const pdf = await PDFDocument.create();
const page = pdf.addPage([dims.fullWidthIn * 72, dims.fullHeightIn * 72]);
const img = await pdf.embedJpg(composed);
page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
const pdfBuffer = Buffer.from(await pdf.save());

writeFileSync(join(OUT, 'THE_WILDLANDS_NEW_ENGLAND_HARDCOVER_cover.pdf'), pdfBuffer);
console.log(`hardcover cover → THE_WILDLANDS_NEW_ENGLAND_HARDCOVER_cover.pdf (${(pdfBuffer.length / 1048576).toFixed(1)} MB, ${dims.fullWidthIn}x${dims.fullHeightIn}in, spine ${dims.spineIn}in)`);
process.exit(0);
