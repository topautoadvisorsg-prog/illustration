/* CLEAN print-ready PAPERBACK cover wrap PDF for KDP (300 DPI, Premium Color spine).
 * Full-bleed art ONLY — NO barcode box, NO placeholder text, NO guides. KDP adds
 * the barcode itself; we never draw anything in that area. No spend.
 */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { ProjectConfigSchema } from '@wildlands/shared';
import { getProject } from '../src/db/repositories/projects.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { P } from './_project.js';
import { resolvePaperbackSpine } from '../src/pipeline/publishing-standard/kdp-spec.js';
const project = await getProject(P);
const t = ProjectConfigSchema.parse(project!.config).trimSize;
const coverPath = ProjectConfigSchema.parse(project!.config).publishing.coverAssetPath!;
const art = await getProjectStorage().readProjectFile(coverPath);
const PAGES = 276;
const spineIn = +resolvePaperbackSpine({ ink: 'PREMIUM_COLOR', paper: 'WHITE', trim: '6x9', pageCount: PAGES }).spineIn.toFixed(3);
const fullW = t.widthIn * 2 + spineIn + t.bleedIn * 2;
const fullH = t.heightIn + t.bleedIn * 2;
const DPI = 300;
const canvasW = Math.round(fullW * DPI), canvasH = Math.round(fullH * DPI);
// Just the art, scaled to the wrap. NOTHING drawn over it.
const png = await sharp(art).resize(canvasW, canvasH, { fit: 'cover', position: 'centre', kernel: 'lanczos3' }).withMetadata({ density: DPI }).png().toBuffer();
const pdf = await PDFDocument.create();
const page = pdf.addPage([fullW * 72, fullH * 72]);
const img = await pdf.embedPng(png);
page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
writeFileSync('C:/Users/jovan/Downloads/WILDLANDS_PAPERBACK_COVER.pdf', Buffer.from(await pdf.save()));
writeFileSync('C:/Users/jovan/Downloads/WILDLANDS_PAPERBACK_COVER_proof.png', png);
console.log('CLEAN paperback cover:', fullW.toFixed(3), 'x', fullH.toFixed(2), 'in @', DPI, 'DPI =', canvasW + 'x' + canvasH, 'px | spine', spineIn, 'in | NO barcode box drawn');
process.exit(0);
