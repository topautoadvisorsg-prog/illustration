/*
 * RETIRED — SUPERSEDED. DO NOT USE, DO NOT EXTEND.
 *
 * Reason: a one-off trim adjustment applied to a wrap that has since shipped.
 *
 * Kept rather than deleted because removal is not trivially provable safe in
 * this phase, and a deleted script cannot be consulted when someone asks how
 * a shipped artifact was made. It has no place in any current workflow.
 *
 * New cover production: tsx scripts/qa/build-cover.ts. See
 * docs/COVERS-AND-SPINES.md.
 */
/* Deterministic "shave": take the already-generated cover art and scale it INWARD
 * by a fixed inset (default 0.3in) so every baked text line pulls away from the
 * trim edges at once. The freed outer strip is filled by clamping/stretching the
 * edge pixels — it lands in the hardcover fold zone, so it's never visible.
 * NO AI spend — reuses the stored wrap art. → cover PDF + review + console push. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { ProjectConfigSchema } from '@wildlands/shared';
import { getProject, updateProjectConfig } from '../src/db/repositories/projects.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';

const P = process.argv[2]!;
const INSET_IN = Number(process.argv[3] ?? '0.3');   // how much to shave inward, per edge
const OUT = 'C:/Users/jovan/Downloads';
const DPI = 300;
const fullW = Math.round(16.409 * DPI), fullH = Math.round(11.417 * DPI);
const insetPx = Math.round(INSET_IN * DPI);

const storage = getProjectStorage();
const art = await storage.readProjectFile(`${P}/cover/cover-wrap-art.png`);

// scale the whole wrap to (canvas - 2*inset), then clamp-extend the edge back out to full bleed
const innerW = fullW - 2 * insetPx, innerH = fullH - 2 * insetPx;
const inner = await sharp(art).resize({ width: innerW, height: innerH, fit: 'cover', position: 'centre', kernel: 'lanczos3' }).toBuffer();
const composedPng = await sharp(inner)
  .extend({ top: insetPx, bottom: insetPx, left: insetPx, right: insetPx, extendWith: 'copy' })
  .toBuffer();
const composed = await sharp(composedPng).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();

const pdf = await PDFDocument.create();
const page = pdf.addPage([16.409 * 72, 11.417 * 72]);
page.drawImage(await pdf.embedJpg(composed), { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
writeFileSync(join(OUT, 'THE_WILDLANDS_NEW_ENGLAND_HARDCOVER_cover.pdf'), Buffer.from(await pdf.save()));
writeFileSync(join(OUT, 'hardcover_cover_review.png'), await sharp(composed).resize({ width: 1400 }).png().toBuffer());

// push the shaved art to the console preview path + bump cache-buster
await storage.writeProjectFile(P, ['cover', 'cover-wrap-art.png'], composedPng);
const cfg = ProjectConfigSchema.parse((await getProject(P))!.config);
await updateProjectConfig(P, { ...cfg, publishing: { ...cfg.publishing, coverSync: { builtForPageCount: 275, spineIn: 0.834, generatedAt: new Date().toISOString() } } });
console.log(`DONE — shaved ${INSET_IN}in inward. All text pulled off the edges. Review hardcover_cover_review.png.`);
process.exit(0);
