/*
 * RETIRED — SUPERSEDED. DO NOT USE, DO NOT EXTEND.
 *
 * Reason: a one-off margin patch applied to a wrap that has since shipped.
 *
 * Kept rather than deleted because removal is not trivially provable safe in
 * this phase, and a deleted script cannot be consulted when someone asks how
 * a shipped artifact was made. It has no place in any current workflow.
 *
 * New cover production: tsx scripts/qa/build-cover.ts. See
 * docs/COVERS-AND-SPINES.md.
 */
/* Fix back-cover text margins on the hardcover wrap (KDP previewer flagged text
 * at the trim). Pull the back-cover text block inward (down from top, in from
 * left, up from bottom) and raise the front 'SERIES I' line — preserving the
 * front moose, spine, and all artwork. gpt-image EDIT → recompose → Downloads. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { generateImageFromBlueprint } from '../src/services/openai/openai.js';

const P = process.argv[2]!;
const OUT = process.argv[3] ?? 'C:/Users/jovan/Downloads';
const dims = { fullWidthIn: 16.409, fullHeightIn: 11.417, spineIn: 0.834 };

const EDIT_PROMPT = `This is a FINISHED hardcover book-cover wrap (back cover on the left, spine in the center, front cover on the right). KEEP UNCHANGED: the front-cover bull moose and the whole front scene; the title "THE WILDLANDS", the "NEW ENGLAND" line, the front subtitle, the author name "Wade Brannock"; the entire SPINE (vertical "THE WILDLANDS" + "Wade Brannock"); and all artwork everywhere (bear, loon, eagle, mountains, water, ferns and botanical detail). Keep every word of text identical — do not change, add, or remove any wording.

Make ONLY these margin fixes so no text touches the trim edges:
1) BACK cover (left panel): the opening paragraph, the "INSIDE THIS VOLUME" list, and the author-bio paragraph currently run too close to the TOP, LEFT, and BOTTOM edges. Move that entire text block INWARD — push it down from the top edge, in from the left edge, and up from the bottom edge — and shrink it slightly if needed, so a clear margin of at least half an inch separates all back-cover text from every outer edge. Fill the freed edge space with a natural continuation of the existing forest / botanical background.
2) FRONT cover: the small line "THE WILDLANDS — SERIES I" at the very bottom is too close to the bottom edge — raise it so it sits about half an inch inside the bottom trim.

Generous, even margins; identical wording; everything else unchanged. Return the full wrap at the same dimensions.`;

const storage = getProjectStorage();
const artPng = await storage.readProjectFile(`${P}/cover/cover-wrap-hardcover-art.png`);
console.log('editing back-cover text margins (gpt-image edit, paid) …');
const edited = await generateImageFromBlueprint({ prompt: EDIT_PROMPT, blueprintPng: artPng, size: '1536x1024' });
await storage.writeProjectFile(P, ['cover', 'cover-wrap-hardcover-art.png'], edited.pngBuffer);

const dpi = 300;
const composed = await sharp(edited.pngBuffer)
  .resize({ width: Math.round(dims.fullWidthIn * dpi), height: Math.round(dims.fullHeightIn * dpi), fit: 'cover', position: 'centre', kernel: 'lanczos3' })
  .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
  .toBuffer();
const pdf = await PDFDocument.create();
const page = pdf.addPage([dims.fullWidthIn * 72, dims.fullHeightIn * 72]);
const img = await pdf.embedJpg(composed);
page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
writeFileSync(join(OUT, 'THE_WILDLANDS_NEW_ENGLAND_HARDCOVER_cover.pdf'), Buffer.from(await pdf.save()));
writeFileSync(join(OUT, 'hardcover_cover_review.png'), await sharp(composed).png().toBuffer());
console.log('DONE — margins pulled in. Review hardcover_cover_review.png.');
process.exit(0);
