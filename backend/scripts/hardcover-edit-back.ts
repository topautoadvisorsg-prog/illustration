/*
 * RETIRED — SUPERSEDED. DO NOT USE, DO NOT EXTEND.
 *
 * Reason: a one-off back-panel patch applied to a wrap that has since shipped.
 *
 * Kept rather than deleted because removal is not trivially provable safe in
 * this phase, and a deleted script cannot be consulted when someone asks how
 * a shipped artifact was made. It has no place in any current workflow.
 *
 * New cover production: tsx scripts/qa/build-cover.ts. See
 * docs/COVERS-AND-SPINES.md.
 */
/* Targeted edit: take the APPROVED finished wrap art and move ONLY the back-cover
 * text block down ~1 inch into the empty bottom space, freezing the front, spine,
 * wildlife, landscape, and all wording. Preserves the approved front (no re-roll).
 * gpt-image edit on the stored art → cover PDF + review + console push. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { ProjectConfigSchema } from '@wildlands/shared';
import { getProject, updateProjectConfig } from '../src/db/repositories/projects.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { generateImageFromBlueprint } from '../src/services/openai/openai.js';

const P = process.argv[2]!;
const OUT = 'C:/Users/jovan/Downloads';
const DPI = 300;
const fullW = Math.round(16.409 * DPI), fullH = Math.round(11.417 * DPI);

const EDIT = `This is a FINISHED hardcover book-cover wrap: BACK cover on the LEFT, SPINE in the CENTER, FRONT cover on the RIGHT.

KEEP EVERYTHING IDENTICAL — do not change, move, resize, or restyle anything except the one item below. Specifically keep unchanged: the ENTIRE FRONT cover (the bull moose, the title "THE WILDLANDS / NEW ENGLAND", the subtitle/description, "Wade Brannock", the series line, and all front artwork); the SPINE (vertical title + author); and ALL wildlife, water, mountains, forest, and botanical detail everywhere. Keep every word of text exactly the same — do not alter, add, or remove any wording.

Make ONLY this change: on the BACK cover (the LEFT panel), the body text block — the opening paragraph "Everything the New England backcountry…" through the "INSIDE THIS VOLUME" list — currently sits too HIGH, too close to the top edge, with a lot of empty illustration below it. MOVE that entire back-cover text block DOWN by about one inch so it has a generous top margin and sits more centered in the back panel, using the empty space below. Fill the freed space above the text with a natural continuation of the existing sky and forest. Keep the back-cover wording identical and keep the lower-left corner clear.

Return the full wrap at the same dimensions, with only the back-cover text block shifted down.`;

const storage = getProjectStorage();
const art = await storage.readProjectFile(`${P}/cover/cover-wrap-art.png`);
console.log('editing back-cover text position (gpt-image edit, paid) …');
const edited = await generateImageFromBlueprint({ prompt: EDIT, blueprintPng: art, size: '1536x1024' });
await storage.writeProjectFile(P, ['cover', 'cover-wrap-art.png'], edited.pngBuffer);

const composed = await sharp(edited.pngBuffer)
  .resize({ width: fullW, height: fullH, fit: 'cover', position: 'centre', kernel: 'lanczos3' })
  .jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
const pdf = await PDFDocument.create();
const page = pdf.addPage([16.409 * 72, 11.417 * 72]);
page.drawImage(await pdf.embedJpg(composed), { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
writeFileSync(join(OUT, 'THE_WILDLANDS_NEW_ENGLAND_HARDCOVER_cover.pdf'), Buffer.from(await pdf.save()));
writeFileSync(join(OUT, 'hardcover_cover_review.png'), await sharp(composed).resize({ width: 1400 }).png().toBuffer());

const cfg = ProjectConfigSchema.parse((await getProject(P))!.config);
await updateProjectConfig(P, { ...cfg, publishing: { ...cfg.publishing, coverSync: { builtForPageCount: 275, spineIn: 0.834, generatedAt: new Date().toISOString() } } });
console.log('DONE — back-cover text nudged down. Review hardcover_cover_review.png (restore SAVED2 if the front changed).');
process.exit(0);
