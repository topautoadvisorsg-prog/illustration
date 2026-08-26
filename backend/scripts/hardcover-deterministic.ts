/*
 * RETIRED — SUPERSEDED. DO NOT USE, DO NOT EXTEND.
 *
 * Reason: an early deterministic hardcover build, superseded by the compositor.
 *
 * Kept rather than deleted because removal is not trivially provable safe in
 * this phase, and a deleted script cannot be consulted when someone asks how
 * a shipped artifact was made. It has no place in any current workflow.
 *
 * New cover production: tsx scripts/qa/build-cover.ts. See
 * docs/COVERS-AND-SPINES.md.
 */
/* Deterministic hardcover cover: AI paints a CLEAN full-bleed scene (no text);
 * we composite the title/spine/back-copy ourselves at exact safe-zone coordinates
 * from KDP's template. Margins guaranteed. Back copy shortened (no bio). Barcode
 * corner left to the art (KDP stamps over it). → cover PDF + review PNG. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { ProjectConfigSchema } from '@wildlands/shared';
import { getProject } from '../src/db/repositories/projects.repo.js';
import { generateImage } from '../src/services/openai/openai.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';

const P = process.argv[2]!;
const OUT = process.argv[3] ?? 'C:/Users/jovan/Downloads';
const FORCE_SCENE = process.argv.includes('newscene');
const W_IN = 16.409, H_IN = 11.417, DPI = 300;
const W = Math.round(W_IN * DPI), H = Math.round(H_IN * DPI);
const px = (inch: number) => Math.round(inch * DPI);
const INK = '#2b1d10', INK2 = '#3a2a18';
const SERIF = "Georgia, 'Times New Roman', 'Liberation Serif', serif";
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const project = await getProject(P);
const config = ProjectConfigSchema.parse(project!.config);
const ART = (config.publishing as any).coverArtDirection ?? '';

// ---- 1. Clean full-bleed SCENE (no text) ----
const storage = getProjectStorage();
let scenePng: Buffer;
const scenePath = `${P}/cover/cover-hardcover-scene.png`;
if (!FORCE_SCENE) { try { scenePng = await storage.readProjectFile(scenePath); console.log('reusing stored clean scene'); } catch { scenePng = Buffer.alloc(0); } } else { scenePng = Buffer.alloc(0); }
if (!scenePng.length) {
  const prompt = `Paint ONE continuous, full-bleed museum-quality naturalist cover scene that wraps across back cover, spine, and front cover of a hardcover book. ${ART}

ABSOLUTELY NO TEXT, NO LETTERING, NO TYPOGRAPHY, NO TITLES, NO WORDS anywhere in the image — artwork only. The painting must FILL THE ENTIRE CANVAS edge to edge and bleed off all four sides (no borders, no white, no frame). Keep three CALM, light, aged-parchment areas with gentle low-detail tone for text to be placed on later: (a) the upper portion of the FRONT (right) cover for a title, (b) a quiet vertical strip down the CENTER for the spine, and (c) generous calm negative space across the BACK (left) cover for body copy. Keep the lower-LEFT corner of the back cover calm and simple. The bull moose hero belongs on the FRONT lower-right; the black bear as a candid sighting on the BACK; loon and a distant eagle only; botanical detail throughout. Warm early-autumn dawn, archival brushwork.`;
  console.log('generating clean scene (paid) …');
  const img = await generateImage({ prompt, size: '1536x1024', quality: 'high' });
  scenePng = img.pngBuffer;
  await storage.writeProjectFile(P, ['cover', 'cover-hardcover-scene.png'], scenePng);
}
const scene = await sharp(scenePng).resize({ width: W, height: H, fit: 'cover', position: 'centre', kernel: 'lanczos3' }).toBuffer();

// ---- 2. Text layer (SVG) at safe coordinates ----
// Panels: full 16.409. Spine centred ~8.205, 0.834 wide. Front cover = right 7.197.
const SAFE = 0.72; // wrap+margin inset
const frontCx = 16.409 - 7.197 / 2;             // ~12.81" centre of front
const frontW = 7.197 - 2 * SAFE;                 // usable front text width
const backX = SAFE;                              // back text left
const backW = 7.197 - SAFE - 0.55;               // back usable width (stop before hinge)
const spineCx = 8.205;

function wrap(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      if ((line + ' ' + w).trim().length > maxChars) { out.push(line.trim()); line = w; } else line += ' ' + w;
    }
    out.push(line.trim());
  }
  return out;
}
const tspanCentre = (lines: string[], cx: number, y0: number, lh: number, size: number, fill = INK, ls = 0) =>
  lines.map((l, i) => `<text x="${px(cx)}" y="${px(y0) + i * lh}" text-anchor="middle" font-family="${SERIF}" font-size="${size}" letter-spacing="${ls}" fill="${fill}">${esc(l)}</text>`).join('');
const tLeft = (l: string, x: number, y: number, size: number, fill = INK, weight = 'normal', ls = 0) =>
  `<text x="${px(x)}" y="${y}" font-family="${SERIF}" font-size="${size}" font-weight="${weight}" letter-spacing="${ls}" fill="${fill}">${esc(l)}</text>`;

const sub = config.publishing.coverDescription ?? '';
const series = 'THE WILDLANDS — SERIES I';
const blurb1 = "Everything the New England backcountry can teach you — and everything it can do to you if you're not ready.";
const blurb2 = "From the white-pine ridgelines of the North Woods to the alpine summits of the Presidential Range, this is a working field guide for anyone who wants to understand the landscape more deeply — hikers, foragers, hunters, paddlers, naturalists, and curious readers alike. Honest about the beauty of wild places, and honest about the risk.";
const items = [
  ['Animals', 'identification, behavior, and handling an encounter.'],
  ['Plants & Foraging', "what's edible, what's medicinal, and the look-alikes that can kill you."],
  ['Trees & Fungi', 'four-season identification and the deadly mushroom doubles.'],
  ['Terrain & Navigation', 'reading the land, the water, and the weather.'],
  ['Survival & First Aid', 'wilderness medicine for when help is hours away.'],
  ['Bushcraft', 'fire, shelter, water, and working with the living forest.'],
];

const parts: string[] = [];
// FRONT
parts.push(tspanCentre(['THE WILDLANDS'], frontCx, 1.65, 0, px(0.62), INK, 8));
parts.push(tspanCentre(['NEW ENGLAND'], frontCx, 2.35, 0, px(0.30), INK, 14));
parts.push(`<line x1="${px(frontCx - 1.4)}" y1="${px(2.55)}" x2="${px(frontCx + 1.4)}" y2="${px(2.55)}" stroke="${INK}" stroke-width="3"/>`);
parts.push(tspanCentre(wrap(sub, 38), frontCx, 3.0, px(0.34), px(0.20), INK2));
parts.push(tspanCentre(['Wade Brannock'], frontCx, 9.0, 0, px(0.42), INK));
parts.push(tspanCentre([series], frontCx, 9.85, 0, px(0.17), INK2, 4));
// SPINE (vertical)
parts.push(`<g transform="translate(${px(spineCx)}, ${px(H_IN / 2)}) rotate(90)"><text text-anchor="middle" font-family="${SERIF}" font-size="${px(0.34)}" letter-spacing="10" fill="${INK}">THE WILDLANDS</text></g>`);
parts.push(`<g transform="translate(${px(spineCx)}, ${px(H_IN - 3.0)}) rotate(90)"><text text-anchor="middle" font-family="${SERIF}" font-size="${px(0.24)}" letter-spacing="3" fill="${INK}">Wade Brannock</text></g>`);
// BACK — build into its own list so we can size a parchment panel behind it
const backParts: string[] = [];
let by = 1.0;
const bsize = px(0.17); const blh = bsize * 1.5;
for (const l of wrap(blurb1, 44)) { backParts.push(tLeft(l, backX, px(by), px(0.20), INK, 'bold')); by += 0.33; }
by += 0.16;
for (const l of wrap(blurb2, 50)) { backParts.push(tLeft(l, backX, px(by), bsize, INK2)); by += blh / DPI; }
by += 0.34;
backParts.push(tLeft('INSIDE THIS VOLUME', backX, px(by), px(0.215), INK, 'bold', 4)); by += 0.13;
backParts.push(`<line x1="${px(backX)}" y1="${px(by)}" x2="${px(backX + 4.5)}" y2="${px(by)}" stroke="${INK}" stroke-width="2"/>`); by += 0.32;
for (const [name, desc] of items) {
  const lines = wrap(`${name} — ${desc}`, 46);
  lines.forEach((ln, i) => {
    if (i === 0) {
      const lead = `${name} —`;
      const rest = ln.slice(lead.length);
      backParts.push(`<text x="${px(backX)}" y="${px(by)}" font-family="${SERIF}" font-size="${bsize}" fill="${INK2}"><tspan font-weight="bold" fill="${INK}">${esc(lead)}</tspan>${esc(rest)}</text>`);
    } else backParts.push(tLeft(ln, backX, px(by), bsize, INK2));
    by += blh / DPI;
  });
  by += 0.08;
}
// soft aged-parchment panel behind the back copy (feathered, translucent) — guarantees legibility
const pL = 0.40, pT = 0.70, pR = 6.85, pB = by + 0.12;
parts.push(`<rect x="${px(pL)}" y="${px(pT)}" width="${px(pR - pL)}" height="${px(pB - pT)}" rx="${px(0.14)}" fill="#f1e8d4" opacity="0.72" filter="url(#soft)"/>`);
parts.push(...backParts);

const textSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="soft" x="-8%" y="-8%" width="116%" height="116%"><feGaussianBlur stdDeviation="16"/></filter></defs>${parts.join('')}</svg>`;
const textPng = await sharp(Buffer.from(textSvg)).png().toBuffer();

// ---- 3. Composite + PDF ----
const composed = await sharp(scene).composite([{ input: textPng, left: 0, top: 0 }]).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
const pdf = await PDFDocument.create();
const page = pdf.addPage([W_IN * 72, H_IN * 72]);
page.drawImage(await pdf.embedJpg(composed), { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
writeFileSync(join(OUT, 'THE_WILDLANDS_NEW_ENGLAND_HARDCOVER_cover.pdf'), Buffer.from(await pdf.save()));
writeFileSync(join(OUT, 'hardcover_cover_review.png'), await sharp(composed).resize({ width: 1400 }).png().toBuffer());

// Push the same wrap to the console preview path so the Operator Console shows it.
const consolePng = await sharp(composed).png().toBuffer();
await storage.writeProjectFile(P, ['cover', 'cover-wrap-art.png'], consolePng);
const cfg2 = ProjectConfigSchema.parse((await getProject(P))!.config);
await import('../src/db/repositories/projects.repo.js').then(m => m.updateProjectConfig(P, {
  ...cfg2,
  publishing: { ...cfg2.publishing, coverSync: { builtForPageCount: 275, spineIn: 0.834, generatedAt: new Date().toISOString() } },
}));
console.log('DONE — deterministic cover written + pushed to console. Refresh the console.');
process.exit(0);
