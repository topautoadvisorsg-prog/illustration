/*
 * RETIRED — SUPERSEDED. DO NOT USE, DO NOT EXTEND.
 *
 * Reason: a one-off blueprint preview for a case wrap that has since shipped.
 *
 * Kept rather than deleted because removal is not trivially provable safe in
 * this phase, and a deleted script cannot be consulted when someone asks how
 * a shipped artifact was made. It has no place in any current workflow.
 *
 * New cover production: tsx scripts/qa/build-cover.ts. See
 * docs/COVERS-AND-SPINES.md.
 */
/* Generate the hardcover wrap: hand the model the CONTENT-PLACEMENT blueprint
 * (shared lib) + the cover prompt with v1.3 PRODUCTION LAYOUT RULES injected, so
 * it paints one continuous scene AND bakes the engraved text inside the marked
 * zones. Composes the PDF at the exact KDP wrap and pushes the art to the console
 * preview path. Writes blueprint + review + cover PDF to Downloads. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { ProjectConfigSchema, buildBackCoverCopy } from '@wildlands/shared';
import { getProject, updateProjectConfig } from '../src/db/repositories/projects.repo.js';
import { generateImageFromBlueprint } from '../src/services/openai/openai.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { buildBlueprintSvg, buildMasterPrompt, stripAuthorBio } from './lib/cover-blueprint.js';

const P = process.argv[2]!;
const OUT = process.argv[3] ?? 'C:/Users/jovan/Downloads';
const dims = { fullWidthIn: 16.409, fullHeightIn: 11.417, spineIn: 0.834 };
const W = 1536, H = 1024;

const blueprintSvg = buildBlueprintSvg(W, H);
const blueprintPng = await sharp(Buffer.from(blueprintSvg)).png().toBuffer();
writeFileSync(join(OUT, 'hardcover_blueprint.png'), blueprintPng);

const project = await getProject(P);
const config = stripAuthorBio(ProjectConfigSchema.parse(project!.config));
const prompt = buildMasterPrompt(buildBackCoverCopy((config.publishing as any).bookDescription) ?? undefined);
writeFileSync(join(OUT, 'hardcover_cover_PROMPT.txt'), prompt);

console.log('generating cover via operator master prompt (paid) …');
const image = await generateImageFromBlueprint({ prompt, blueprintPng, size: '1536x1024' });
const storage = getProjectStorage();
await storage.writeProjectFile(P, ['cover', 'cover-wrap-art.png'], image.pngBuffer);

const dpi = 300;
const composed = await sharp(image.pngBuffer)
  .resize({ width: Math.round(dims.fullWidthIn * dpi), height: Math.round(dims.fullHeightIn * dpi), fit: 'cover', position: 'centre', kernel: 'lanczos3' })
  .jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
const pdf = await PDFDocument.create();
const page = pdf.addPage([dims.fullWidthIn * 72, dims.fullHeightIn * 72]);
page.drawImage(await pdf.embedJpg(composed), { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
writeFileSync(join(OUT, 'THE_WILDLANDS_NEW_ENGLAND_HARDCOVER_cover.pdf'), Buffer.from(await pdf.save()));
writeFileSync(join(OUT, 'hardcover_cover_review.png'), await sharp(composed).resize({ width: 1400 }).png().toBuffer());

// push to console preview
const cfg2 = ProjectConfigSchema.parse((await getProject(P))!.config);
await updateProjectConfig(P, { ...cfg2, publishing: { ...cfg2.publishing, coverSync: { builtForPageCount: 275, spineIn: 0.834, generatedAt: new Date().toISOString() } } });
console.log('DONE — cover written + pushed to console. Review hardcover_cover_review.png.');
process.exit(0);
