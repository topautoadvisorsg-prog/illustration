/* Generate the HARDCOVER full-wrap cover at KDP's exact case-laminate dimensions
 * (7x10, 275pp, premium color → 16.409 x 11.417in, spine 0.834in) using the same
 * saved cover art direction (moose front, bear back, panorama, branding). Writes
 * the cover PDF + a review PNG to disk. Barcode zone left clear (KDP adds it). */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { ProjectConfigSchema } from '@wildlands/shared';
import { getProject } from '../src/db/repositories/projects.repo.js';
import { buildCoverWrapPrompt } from '../src/pipeline/stage-6-layout/render-chapter.js';
import { generateImage } from '../src/services/openai/openai.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';

const P = process.argv[2]!;
const OUT = process.argv[3] ?? 'C:/Users/jovan/Downloads';
const PAGE_COUNT = 275;
// KDP hardcover cover calculator output (7x10, 275pp, premium color, white):
const dims = { fullWidthIn: 16.409, fullHeightIn: 11.417, spineIn: 0.834 };

const project = await getProject(P);
if (!project) { console.error('project_not_found'); process.exit(1); }
const config = ProjectConfigSchema.parse(project.config);

console.log(`building HARDCOVER wrap prompt: ${dims.fullWidthIn} x ${dims.fullHeightIn}in, spine ${dims.spineIn}in …`);
const prompt = buildCoverWrapPrompt(config, PAGE_COUNT, dims as any);
console.log('generating cover art (gpt-image, paid) …');
const image = await generateImage({ prompt, size: '1536x1024', quality: 'high' });

const storage = getProjectStorage();
const stored = await storage.writeProjectFile(P, ['cover', 'cover-wrap-hardcover-art.png'], image.pngBuffer);
console.log('art stored →', stored.relativePath);

// Compose the print PDF at the exact hardcover wrap size, 300 DPI. fit:'cover'
// fills the case canvas; the barcode zone stays clear for KDP's own barcode.
const dpi = 300;
const canvasW = Math.round(dims.fullWidthIn * dpi);
const canvasH = Math.round(dims.fullHeightIn * dpi);
const artJpg = await sharp(image.pngBuffer)
  .resize({ width: canvasW, height: canvasH, fit: 'cover', position: 'centre', kernel: 'lanczos3' })
  .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
  .toBuffer();

const pdf = await PDFDocument.create();
const page = pdf.addPage([dims.fullWidthIn * 72, dims.fullHeightIn * 72]);
const img = await pdf.embedJpg(artJpg);
page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
const pdfBuffer = Buffer.from(await pdf.save());

const pdfPath = join(OUT, 'THE_WILDLANDS_NEW_ENGLAND_HARDCOVER_cover.pdf');
const pngPath = join(OUT, 'hardcover_cover_review.png');
writeFileSync(pdfPath, pdfBuffer);
writeFileSync(pngPath, image.pngBuffer);
console.log(`cover PDF → ${pdfPath} (${(pdfBuffer.length / 1048576).toFixed(1)} MB, ${dims.fullWidthIn}x${dims.fullHeightIn}in, spine ${dims.spineIn}in)`);
console.log(`review PNG → ${pngPath}`);
process.exit(0);
