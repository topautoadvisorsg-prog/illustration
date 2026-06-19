/* Remove the AI-painted fake barcode from the hardcover back cover and re-compose
 * with NO white box (KDP adds its own barcode). Edits the stored art, recomposes
 * the PDF at the exact KDP wrap, writes cover PDF + review PNG. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { generateImageFromBlueprint } from '../src/services/openai/openai.js';

const P = process.argv[2]!;
const OUT = process.argv[3] ?? 'C:/Users/jovan/Downloads';
const dims = { fullWidthIn: 16.409, fullHeightIn: 11.417, spineIn: 0.834 };

const EDIT_PROMPT = `This is a FINISHED full-wrap book cover (back cover, spine, front cover). Keep the ENTIRE image EXACTLY as it is — all artwork (the bull moose, the black bear, the loon, the eagle, mountains, forest, water, ferns and botanical detail), every color and the lighting, the spine, and ALL text (title "THE WILDLANDS", "NEW ENGLAND", the subtitle, "Wade Brannock", "THE WILDLANDS — SERIES I", the entire back-cover paragraph and the "INSIDE THIS VOLUME" list) — unchanged.

Make EXACTLY ONE change: in the LOWER-LEFT area of the BACK cover (the left panel), there is a small printed BARCODE graphic (black and white vertical bars) that does NOT belong on the artwork. REMOVE it completely and paint over that spot with natural forest-floor detail — ferns, moss, fallen autumn leaves, a few small pinecones — that blends seamlessly into the surrounding botanical border. Leave that corner calm and natural. Do NOT add any barcode, box, rectangle, label, or white patch anywhere. Change nothing else. Return the full wrap at the same dimensions.`;

const storage = getProjectStorage();
const artPng = await storage.readProjectFile(`${P}/cover/cover-wrap-hardcover-art.png`);
console.log('editing art to remove the painted barcode (gpt-image edit, paid) …');
const edited = await generateImageFromBlueprint({ prompt: EDIT_PROMPT, blueprintPng: artPng, size: '1536x1024' });
await storage.writeProjectFile(P, ['cover', 'cover-wrap-hardcover-art.png'], edited.pngBuffer);

const dpi = 300;
const canvasW = Math.round(dims.fullWidthIn * dpi);
const canvasH = Math.round(dims.fullHeightIn * dpi);
const composed = await sharp(edited.pngBuffer)
  .resize({ width: canvasW, height: canvasH, fit: 'cover', position: 'centre', kernel: 'lanczos3' })
  .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
  .toBuffer();

const pdf = await PDFDocument.create();
const page = pdf.addPage([dims.fullWidthIn * 72, dims.fullHeightIn * 72]);
const img = await pdf.embedJpg(composed);
page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
const pdfBuffer = Buffer.from(await pdf.save());

writeFileSync(join(OUT, 'THE_WILDLANDS_NEW_ENGLAND_HARDCOVER_cover.pdf'), pdfBuffer);
writeFileSync(join(OUT, 'hardcover_cover_review.png'), await sharp(composed).png().toBuffer());
console.log(`cover PDF → THE_WILDLANDS_NEW_ENGLAND_HARDCOVER_cover.pdf (${(pdfBuffer.length / 1048576).toFixed(1)} MB) — no barcode, no box`);
process.exit(0);
