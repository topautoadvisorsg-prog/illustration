/**
 * CHAPTER-ENDING ILLUSTRATION — generate the ASSET, composite it deterministically.
 *
 * ─── THE RULE THIS SCRIPT EXISTS TO ENFORCE ───────────────────────────────
 * The image model is shown the real canonical page so it can see the
 * typography, the ending passage and the shape of the white it has to work
 * with. It is NEVER trusted to give any of that back. Whatever the endpoint
 * returns, only the pixels inside the approved art region are kept; the page
 * everywhere else is the original canonical render, untouched, byte-for-byte.
 *
 * Type is never rasterised, never regenerated, never "restored". Pagination
 * cannot move because nothing is re-typeset: the page PNG is produced once, and
 * compositing is a paste at fixed coordinates.
 *
 * ─── COST ─────────────────────────────────────────────────────────────────
 * ONE paid image call per invocation, and only when --render is passed.
 * Without it the script does everything except spend: geometry, mask, prompt,
 * and a dry-run report. Always look at that first.
 *
 *   yarn workspace @wildlands/backend art:page -- 152               (dry run)
 *   yarn workspace @wildlands/backend art:page -- 152 --render      (SPENDS)
 *   yarn workspace @wildlands/backend art:page -- 152 --place-only  (re-place, free)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
loadDotenv({ path: path.join(ROOT, '.env') });
loadDotenv({ path: path.join(ROOT, '.env.development.local'), override: true });

const MANUSCRIPT =
  process.env.WL_QA_MANUSCRIPT ?? 'C:/Users/jovan/Downloads/puberty boy book/export/NO-ONE-TOLD-ME-THAT_FINAL.md';

const OUT = path.join(ROOT, 'qa-shots', 'art');

const pageArg = Number(process.argv[2]);
const willRender = process.argv.includes('--render');
/** Re-place an already-approved asset. Never generates, never spends. */
const placeOnly = process.argv.includes('--place-only');
if (!Number.isFinite(pageArg) || pageArg < 1) {
  console.error('usage: art:page -- <page> [--render]');
  process.exit(1);
}

/** Screenshot scale. 4x of a 528x816 CSS page gives a 2112x3264 canonical page. */
const SHOT_SCALE = 4;
/** Breathing room between the last line of type and the top of the art. */
const ART_GAP_IN = 0.22;
/** The model's portrait canvas. */
const GEN_W = 1024;
const GEN_H = 1536;

/**
 * RESOLUTION IS DECIDED BY PLACEMENT SIZE, NOT BY RESAMPLING.
 *
 * The only honest resolution figure is NATIVE detail: the pixels the model
 * actually generated, divided by the physical size the art is printed at.
 * Enlarging the raster afterwards raises the pixel count and adds no detail, so
 * a page can show 384 ppi of grid and 234 ppi of picture. This pipeline sizes
 * the placement so the NATIVE figure clears 300, and reports both numbers so
 * the difference is never quietly lost.
 *
 * TARGET is what we aim for and leaves a small margin; MIN is the hard gate. A
 * page whose composition genuinely needs to be larger than MIN allows is
 * FLAGGED for a decision, never silently upscaled to pretend otherwise.
 */
const TARGET_NATIVE_PPI = 310;
const MIN_NATIVE_PPI = 300;

const { sanitizeManuscript } = await import('../src/pipeline/stage-1-ingestion/sanitize-manuscript.js');
const { buildTypesetHtml, parseTypesetSections, typesetMarginsForTrim, TYPESET_DONE_JS } = await import(
  '../src/pipeline/typeset/typeset-book.js'
);
const { resolveTypesetLayoutStandard } = await import('../src/pipeline/typeset/layout-standards/registry.js');
const { getProductionProfile } = await import('../src/pipeline/production-profiles/registry.js');
const { resolveChromiumPath, loadPagedPolyfill } = await import('../src/pipeline/stage-6-layout/render-pdf.js');
const { getStyleDna } = await import('../src/pipeline/publishing-standard/style-dna.js');
const { ProjectConfigSchema } = await import('@wildlands/shared');

const markdown = sanitizeManuscript(await readFile(MANUSCRIPT, 'utf8'));
const profile = getProductionProfile('bw-educational-nonfiction');
const standard = resolveTypesetLayoutStandard(profile.typesetLayoutStandardId!);
const dna = getStyleDna(profile.defaultStyleDnaId!);

const trim = { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 };
const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'NO ONE TOLD ME THAT',
  authorName: 'Nolan Whitlow',
  productionProfileId: profile.id,
  typesetLayoutStandardId: standard.id,
  trimSize: trim,
  typography: {
    bodyPt: 12,
    lineHeight: 1.3,
    headingFont: standard.type.headingFont,
    bodyFont: standard.type.bodyFont,
  },
  layoutOverrides: process.env.WL_OVERRIDES ? JSON.parse(process.env.WL_OVERRIDES) : {},
});

const margins = typesetMarginsForTrim(trim);
const html = buildTypesetHtml({
  sections: parseTypesetSections(markdown),
  config,
  margins,
  polyfillJs: await loadPagedPolyfill(),
  layoutStandard: standard,
  chaptersStartRecto: standard.chaptersStartRecto,
});

const chromium = resolveChromiumPath();
if (!chromium) throw new Error('No Chromium. Set CHROMIUM_PATH.');

await mkdir(OUT, { recursive: true });

// ── 1. The canonical page, and where the type actually ends ────────────────
const { default: puppeteer } = await import('puppeteer-core');
const browser = await puppeteer.launch({
  executablePath: chromium,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
});

let canonicalPng: Buffer;
/** Lowest painted type on the page, in CSS px from the page top. */
let typeBottomCss: number;
let pageCssW: number;
let pageCssH: number;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300, deviceScaleFactor: SHOT_SCALE });
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForFunction(TYPESET_DONE_JS, { timeout: 300_000, polling: 250 });

  const el = await page.$(`.pagedjs_page[data-page-number="${pageArg}"]`);
  if (!el) throw new Error(`page ${pageArg} not found`);
  await el.scrollIntoView();
  canonicalPng = (await el.screenshot()) as Buffer;

  // Measured, not predicted. The art region starts below whatever the page
  // actually painted, which is the only honest definition of "the empty part".
  const measured = (await page.evaluate(
    `(() => {
      const p = document.querySelector('.pagedjs_page[data-page-number="${pageArg}"]');
      const box = p.getBoundingClientRect();
      let bottom = 0;
      p.querySelectorAll('[data-block-id]').forEach(function (el) {
        const r = document.createRange();
        r.selectNodeContents(el);
        const rects = r.getClientRects();
        for (let i = 0; i < rects.length; i++) {
          const b = rects[i];
          if (b.width < 0.5 && b.height < 0.5) continue;
          bottom = Math.max(bottom, b.bottom - box.top);
        }
      });
      return { bottom: bottom, w: box.width, h: box.height };
    })()`,
  )) as { bottom: number; w: number; h: number };
  typeBottomCss = measured.bottom;
  pageCssW = measured.w;
  pageCssH = measured.h;
  await page.close();
} finally {
  await browser.close();
}

const meta = await sharp(canonicalPng).metadata();
const pxPerCss = (meta.width ?? 0) / pageCssW;
const pxPerIn = (meta.width ?? 0) / trim.widthIn;

// ── 2. The approved art region, in canonical page pixels ───────────────────
const artLeftPx = Math.round(margins.gutterIn * pxPerIn);
const artRightPx = Math.round((trim.widthIn - margins.outsideIn) * pxPerIn);
const artTopPx = Math.round(typeBottomCss * pxPerCss + ART_GAP_IN * pxPerIn);
const artBottomPx = Math.round((trim.heightIn - margins.bottomIn) * pxPerIn);
const artW = artRightPx - artLeftPx;
const artH = artBottomPx - artTopPx;
if (artH < 100) throw new Error(`page ${pageArg} has no usable empty region (${artH}px)`);

const artWIn = artW / pxPerIn;
const artHIn = artH / pxPerIn;

console.log(`CANONICAL PAGE ${pageArg}`);
console.log(`  page        ${meta.width}x${meta.height}px  (${trim.widthIn}x${trim.heightIn}in @ ${Math.round(pxPerIn)} ppi)`);
console.log(`  type ends   ${typeBottomCss.toFixed(1)} css px from page top`);
console.log(`  ART REGION  ${artW}x${artH}px  =  ${artWIn.toFixed(2)} x ${artHIn.toFixed(2)} in`);
console.log(`              ${((artHIn / (trim.heightIn - margins.topIn - margins.bottomIn)) * 100).toFixed(0)}% of the text block height\n`);

await writeFile(path.join(OUT, `p${pageArg}-canonical.png`), canonicalPng);

// ── 3. Context canvas + mask for the model ─────────────────────────────────
// The context is a SLICE of the page, not the whole page: the art region plus a
// strip of the real type directly above it.
//
// The first attempt letterboxed the entire page into the canvas, which spent
// most of the model's pixels on margins and the text further up, and left the
// art region only 791px for a 4.38in placement (181 ppi). At that density a 1pt
// line cannot exist, so the direction's line-weight floor was unreachable no
// matter how well the model drew.
//
// The strip is sized so the slice's aspect ratio MATCHES the canvas exactly.
// Then the crop fills the canvas edge to edge with no letterboxing, the art
// region gets the full canvas width, and the model still sees genuine
// typography sitting directly above where its drawing has to live.
const sliceW = artW;
const wantSliceH = Math.round(sliceW * (GEN_H / GEN_W));
const typeStripPx = Math.min(Math.max(wantSliceH - artH, 0), artTopPx);
const sliceTop = artTopPx - typeStripPx;
const sliceH = typeStripPx + artH;

const sliceScale = Math.min(GEN_W / sliceW, GEN_H / sliceH);
const fitW = Math.round(sliceW * sliceScale);
const fitH = Math.round(sliceH * sliceScale);
const offX = Math.round((GEN_W - fitW) / 2);
const offY = Math.round((GEN_H - fitH) / 2);

const slicePng = await sharp(canonicalPng)
  .extract({ left: artLeftPx, top: sliceTop, width: sliceW, height: sliceH })
  .toBuffer();

const contextPng = await sharp({
  create: { width: GEN_W, height: GEN_H, channels: 3, background: '#ffffff' },
})
  .composite([{ input: await sharp(slicePng).resize(fitW, fitH).toBuffer(), top: offY, left: offX }])
  .png()
  .toBuffer();

const maskArt = {
  left: offX,
  top: offY + Math.round(typeStripPx * sliceScale),
  width: fitW,
  height: Math.round(artH * sliceScale),
};
console.log(
  `CONTEXT SLICE  ${sliceW}x${sliceH}px (art + ${(typeStripPx / pxPerIn).toFixed(2)}in of real type above)\n` +
    `  art region in the model canvas: ${maskArt.width}x${maskArt.height}px  =  ${Math.round(
      maskArt.width / artWIn,
    )} ppi native at placement size\n`,
);
// Opaque white holds; a fully transparent hole is what the model may paint.
const maskPng = await sharp({
  create: { width: GEN_W, height: GEN_H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
})
  .composite([
    {
      input: await sharp({
        create: {
          width: maskArt.width,
          height: maskArt.height,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer(),
      top: maskArt.top,
      left: maskArt.left,
      blend: 'dest-out',
    },
  ])
  .png()
  .toBuffer();

await writeFile(path.join(OUT, `p${pageArg}-context.png`), contextPng);
await writeFile(path.join(OUT, `p${pageArg}-mask.png`), maskPng);

// ── 4. The prompt, assembled from the approved Style DNA ───────────────────
/**
 * One subject per chapter ending, each anchored to that chapter's closing
 * "THE ONE THING TO REMEMBER" line.
 *
 * Spread deliberately across four figure types — everyday scene, diagram,
 * object sequence, and metaphor — because fourteen variations on "a boy in a
 * room" would read as filler however well each one is drawn. Body depiction
 * appears only where the non-body framing would teach less (p22 proportions,
 * p49 pore cross-section), per the profile's subject-selection policy.
 */
const SUBJECTS: Record<number, string> = {
  6:
    'A boy of about twelve sitting on the edge of his bed in an ordinary bedroom, evening, a lamp on, THIS book just opened on his knees. ' +
    'He is at the very beginning of it, settling in to read. Calm and private. Nobody else in the room. ' +
    'NOT sad, NOT worried, NOT hiding. DIFFERENT from other scenes in this book: interior bedroom at night, one figure only, seated on a bed rather than at a table.',
  15:
    'A DIAGRAM, no people at all. Four horizontal bars stacked vertically with generous space between them, like four lanes. ' +
    'Each bar represents one person\'s timeline: they start at different points along the width and run for different lengths, and each has one simple filled marker somewhere along it. ' +
    'The point being made visually: the same journey, begun and finished at different times, with no lane ahead of or behind any other. ' +
    'Purely schematic and clean. No faces, no bodies, no arrows racing anyone, no finish line, no podium, no numbers, no labels.',
  22:
    'A DIAGRAM of proportion, drawn as three simple CLOTHED silhouette figures standing side by side in a row, same height. ' +
    'They show one body changing in sequence: in the first, hands and feet are noticeably large for the frame; in the second, arms and legs have lengthened; in the third, the torso has caught up and the whole figure is in proportion. ' +
    'Schematic and neutral, like a growth diagram in a school health book. Plain silhouette shapes with clean interior line, no facial detail, no skin detail, no nudity, nothing clinical or anatomical.',
  28:
    'A DIAGRAM, no people. A single clean line running left to right across the composition like a pitch trace: it holds steady, then jumps sharply up, dips down, wobbles twice, and settles into a steady line lower than where it began. ' +
    'Beneath it, one small simple schematic icon of a voice box (a rounded shape with two horizontal folds inside) as an anchor. ' +
    'The point: the jumps ARE the process working. No people, no faces, no musical notes, no text, no numbers, no axis labels.',
  41:
    'An OBJECT SEQUENCE, no people. Four everyday objects arranged in a clear left-to-right order with a single simple connecting line running through them: ' +
    'a bar of soap, a folded towel, a deodorant stick, and a clean folded t-shirt. Each drawn plainly and completely, evenly spaced, same visual weight. ' +
    'The point: it is a short routine you repeat, not a crisis. Still-life clarity. No hands, no figures, no bathroom scene, no packaging text, no brand marks.',
  49:
    'A DIAGRAM, no people. Two side-by-side cross-sections of a single skin pore, drawn large and simply, like a clean school-textbook figure. ' +
    'On the left a clear pore: an open channel through a simple layered skin cross-section. On the right a blocked one: the same channel plugged near the surface so it cannot drain, with the area beneath it slightly swollen. ' +
    'Schematic and clinical-neutral, flat-toned, no face, no body, no redness, no pus detail, nothing gruesome. No labels, no arrows with text, no numbers.',
  77:
    'An OBJECT METAPHOR, no people. A bicycle seen from the side, drawn cleanly and completely, with the BRAKE CABLE only part-installed: ' +
    'the cable runs from the handlebar lever and stops partway along the frame, its end loose and not yet connected to the brake. ' +
    'The handlebars are straight and the bike is upright and ready to ride. The point: steering already works, the brakes are still being fitted. ' +
    'No rider, no crash, no motion lines, no anger imagery, no text.',
  90:
    'An everyday scene in a classroom. A boy of about twelve is halfway through raising his hand to answer, arm not yet fully up, expression composed but clearly mid-decision. ' +
    'Around him three or four other students sit looking perfectly calm and ordinary. ' +
    'The point: everyone in the room looks composed, and that tells you nothing about what they feel. ' +
    'Undramatic. No teacher looming, no spotlight, no sweat drops, no visible panic, no thought bubbles, no text.',
  102:
    'Two boys of about twelve sitting side by side on a low brick wall outdoors in daylight, comfortable in each other\'s company and not talking. ' +
    'One is leaning back on his hands, the other has his elbows on his knees; both look relaxed and ordinary. No phones anywhere in the picture. ' +
    'The point: the friends you keep are the ones you do not have to perform for. ' +
    'DIFFERENT from other scenes in this book: two peers, no adult present, outdoors on a wall rather than seated on a step or at a table.',
  114:
    'An OBJECT COMPARISON, no people. Two simple solid shapes resting side by side on a plain surface, clearly not able to interlock with each other: ' +
    'their facing edges are different profiles, so they cannot join. Both shapes are intact, undamaged, well made and equally substantial; neither is broken, cracked, smaller or lesser. ' +
    'The point: a no is information about fit, not about worth. Abstract and calm. No hearts, no faces, no people, no puzzle-piece cliché with a missing hole, no text.',
  121:
    'Two young people of about twelve standing facing each other in an ordinary setting, shown from roughly the waist up. ' +
    'One holds out something offered; the other declines with a relaxed, open-palmed hand raised at chest height, and is completely at ease. ' +
    'The one who offered is already accepting the answer, unbothered. The point: a no is a complete answer and nothing bad follows it. ' +
    'Calm and matter-of-fact. No conflict, no anger, no cowering, no pointing, no crowd, no text.',
  129:
    'An OBJECT scene, no people. A phone lying face-up on a desk with a completely BLANK screen, no icons, no text, no glow. ' +
    'Beside the desk, an open door leads to a lit hallway, drawn simply. ' +
    'The point: whatever wants to stay in the private space is exactly the thing to take out of it. ' +
    'Quiet and undramatic. No hands, no faces, no notification symbols, no shadowy figures, no menace, no text on the screen or anywhere else.',
  136:
    'A conversation already underway, and an unremarkable one. A boy of about twelve and a parent sit SIDE BY SIDE on the front step of a house (or on a sofa), ' +
    'both facing forward rather than at each other, which is how these conversations actually happen and what this chapter advises. ' +
    'The parent is listening, unhurried; the boy is mid-sentence, relaxed, hands loose. ' +
    'The idea the picture carries: the conversation turned out shorter and duller than the week he spent dreading it. ' +
    'Ordinary and undramatic. NOT a big emotional moment, NOT a lecture, NOT comforting-after-crying. ' +
    'No hugging, no tears, no hand on shoulder, no eye contact, no confrontation. Nobody is upset. ' +
    'DIFFERENT from the kitchen scene elsewhere in this book: seat both figures together outdoors on a step, in daylight, with no table and no book present.',
  152:
    'The moment BEFORE a conversation starts. A boy of about twelve sits at an ordinary kitchen or dining table with this book open in front of him. ' +
    'He has looked up from the page toward a trusted adult nearby who is doing something everyday and unremarkable (drying a dish, setting something down), ' +
    'and his expression is that of someone deciding to ask. Nobody is speaking yet. ' +
    'The idea the picture carries: the answer was not in the index, and the next step is asking someone. ' +
    'Calm and ordinary. NOT dramatic, NOT sentimental, NOT clinical, NOT childish. No tears, no hugging, no comedy, no exaggerated expressions.',
};
const subject = SUBJECTS[pageArg];
if (!subject) throw new Error(`no approved subject for page ${pageArg} — subjects are approved individually`);

// The non-negotiables lead. The first attempt buried them under nine paragraphs
// of style description and came back with grey contours and continuously
// modelled shading: 0.5% of pixels were solid black, and tone was spread across
// half a dozen values instead of one or two flat ones. Both are unprintable at
// this size on KDP paper, so they are stated first, in absolute terms, and the
// descriptive block follows as elaboration rather than as competition.
const prompt = [
  `Draw ONE black-and-white illustration to fill the empty area of this book page.`,
  ``,
  `THESE FIVE RULES OVERRIDE EVERYTHING ELSE BELOW. If any other instruction seems`,
  `to conflict with them, follow these:`,
  `1. EVERY line is SOLID PURE BLACK (#000000). No grey lines. No soft, faded,`,
  `   pencil, or sketched lines. A reader must see true black ink, not grey.`,
  `2. Lines are THICK and CONFIDENT, like a bold marker or a heavy vector stroke.`,
  `   Err on the side of too thick. Thin hairlines are a defect and will not print.`,
  `3. Tone is FLAT ONLY, and there are EXACTLY TWO greys in the whole drawing:`,
  `   a MID grey (about 25% ink, clearly darker than paper) and a DARK grey`,
  `   (about 45% ink, halfway to black). Every grey area uses one of those two`,
  `   values and nothing in between. Think cut paper or a two-colour screen`,
  `   print. Pale, washed-out, 10-15% greys are a DEFECT and will disappear in`,
  `   print. NO shading, NO blending, NO gradients, NO hatching, NO pencil`,
  `   texture, NO strokes used to model form. Hair, clothing, foliage and shadow`,
  `   are flat shapes, never rendered or brushed.`,
  `   Commit real black weight: large solid black masses (hair, dark clothing,`,
  `   shoes) should carry the drawing, not thin outlines around pale shapes.`,
  `4. Everything is drawn COMPLETE and INSIDE the region. No figure or object may`,
  `   be cut off by any edge of the region. Do not crop heads, bodies or limbs.`,
  `   Primary figures and important props sit fully inside the boundary, and`,
  `   background furniture and architecture should generally stay slightly clear`,
  `   of the edges as well. An element may run to an edge only where the`,
  `   composition genuinely benefits; it is never the default. Keep clean white`,
  `   breathing room around the principal subject.`,
  `5. NO text, letters, words, numbers or symbols anywhere in the drawing.`,
  ``,
  `SUBJECT: ${subject}`,
  ``,
  `STYLE — ${dna.label}:`,
  `Medium: ${dna.medium}`,
  `Mood: ${dna.mood}`,
  `Reference register: ${dna.referenceArtists}`,
  `Line work: ${dna.lineWork} ${dna.lineInkPhrase}`,
  `Tone and colour: ${dna.colorMode}`,
  `Whites: ${dna.whitesPhrase}`,
  `Lighting: ${dna.lighting}`,
  `Surface: ${dna.paperTexture}`,
  `Edges: ${dna.edges}`,
  `Accuracy: ${dna.naturalistPrecision}`,
  ``,
  `CONTEXT: the type visible above the region is the real, finished page. It is`,
  `there so you can see what the drawing sits under. Do NOT redraw it, restyle it,`,
  `or match its light grey weight — your line must be far blacker and heavier than`,
  `the type. Do not extend the text into the region.`,
  ``,
  `HARD CONSTRAINTS:`,
  `- Draw ONLY inside the transparent region of the mask. Do not alter, redraw, restyle or reflow anything else on the page.`,
  `- Do NOT draw, letter, or reproduce ANY text, words, letters, numbers, captions, labels, signage, page numbers or running heads anywhere in the image. The book in the drawing shows only abstract line texture where its type would be.`,
  `- No frame, box, border, panel, rule, drop shadow or vignette around the illustration.`,
  `- No colour of any kind. No gradients, no airbrush, no stippling, no cross-hatching, no photographic rendering, no muddy grey.`,
  `- The illustration must sit on plain white with generous open space, comfortably inside the region, not crowding its edges.`,
  `- Composition should suit a region that is taller than it is wide.`,
].join('\n');

await writeFile(path.join(OUT, `p${pageArg}-prompt.txt`), `${prompt}\n`);
console.log('PROMPT\n' + '-'.repeat(72) + '\n' + prompt + '\n' + '-'.repeat(72) + '\n');

const rawArtPath = path.join(OUT, `p${pageArg}-art-raw.png`);

if (!willRender && !placeOnly) {
  console.log('DRY RUN — nothing spent. Re-run with --render to make the single paid call.');
  process.exit(0);
}

let rawArt: Buffer;
if (placeOnly) {
  // Re-place an ALREADY APPROVED asset. Approval is expensive and the artwork
  // is the thing that was approved, not its position on the page, so changing
  // the placement must never mean generating a new picture.
  rawArt = await readFile(rawArtPath);
  console.log(`--place-only: reusing the approved asset at ${rawArtPath} (no paid call)\n`);
} else {
  // ── 5. The one paid call ─────────────────────────────────────────────────
  console.log('calling the image model (ONE paid request) …');
  const { generateImageFromBlueprint } = await import('../src/services/openai/openai.js');
  const generated = await generateImageFromBlueprint({
    prompt,
    blueprintPng: contextPng,
    maskPng,
    size: `${GEN_W}x${GEN_H}` as never,
  });
  await writeFile(path.join(OUT, `p${pageArg}-raw-full.png`), generated.pngBuffer);
  console.log(`  returned ${generated.widthPx}x${generated.heightPx} from ${generated.model}`);

  // ── 6. Keep ONLY the art region. Everything else is thrown away. ─────────
  // The model was handed a whole page. What comes back outside the art region
  // is its reconstruction of set type, and that is never acceptable in a print
  // master however good it looks. Crop, and discard the rest.
  rawArt = await sharp(generated.pngBuffer)
    .extract({ left: maskArt.left, top: maskArt.top, width: maskArt.width, height: maskArt.height })
    .png()
    .toBuffer();
  await writeFile(rawArtPath, rawArt);
}

// ── 7. Placement, sized by NATIVE resolution ───────────────────────────────
// The art region is the MAXIMUM safe area, not the size the picture has to be.
// Placement is driven by the generated pixel count so native detail clears the
// gate, and the leftover area stays as deliberate white rather than being
// consumed just because it is there.
const nativeMeta = await sharp(rawArt).metadata();
const nativeW = nativeMeta.width ?? 0;
const nativeH = nativeMeta.height ?? 0;

let placeWIn = nativeW / TARGET_NATIVE_PPI;
let placeHIn = nativeH / TARGET_NATIVE_PPI;
// Never exceed the safe region; scale down proportionally if it would.
const shrink = Math.min(artWIn / placeWIn, artHIn / placeHIn, 1);
placeWIn *= shrink;
placeHIn *= shrink;

const nativePpi = nativeW / placeWIn;
if (nativePpi < MIN_NATIVE_PPI) {
  console.error(
    `\nFLAG: page ${pageArg} cannot reach ${MIN_NATIVE_PPI} native ppi.\n` +
      `  ${nativeW}x${nativeH} generated pixels over ${placeWIn.toFixed(2)}x${placeHIn.toFixed(2)}in ` +
      `= ${Math.round(nativePpi)} ppi.\n` +
      `  Its composition needs more physical space than the generated detail can carry.\n` +
      `  Decide before approval; do NOT upscale and call it resolved.`,
  );
  process.exit(2);
}

const placeW = Math.round(placeWIn * pxPerIn);
const placeH = Math.round(placeHIn * pxPerIn);
// Centred horizontally in the text block, and balanced vertically in the region.
const placeLeft = artLeftPx + Math.round((artW - placeW) / 2);
const placeTop = artTopPx + Math.round((artH - placeH) / 2);

// Resampled to the page's working raster only. This changes the grid, not the
// detail, which is why the report below states both numbers separately.
const printArt = await sharp(rawArt)
  .resize(placeW, placeH, { kernel: 'lanczos3', fit: 'fill' })
  .png()
  .toBuffer();
await writeFile(path.join(OUT, `p${pageArg}-art-print.png`), printArt);

// ── 7b. Print-line check, measured on the NATIVE asset ─────────────────────
// A 1pt rule at the final placement is ppi/72 native pixels wide. Measuring the
// enlarged raster would just report the enlargement, so this measures the
// pixels the model actually drew.
const needPx = nativePpi / 72;
const nat = await sharp(rawArt).greyscale().raw().toBuffer({ resolveWithObject: true });
const NW = nat.info.width;
const NH = nat.info.height;
const INK = 100; // anything this dark is line or solid fill

// Thickness is measured PER INK PIXEL and reported weighted by ink area.
// Counting dark RUNS instead would let a one-pixel speck carry the same weight
// as a main contour, which reported 37% of strokes as sub-1pt on artwork whose
// contours are actually 5-9px. The local thickness of an ink pixel is the
// smaller of the horizontal and vertical runs through it: a horizontal stroke
// has a short vertical run and a vertical stroke a short horizontal one, so the
// minimum approximates the stroke width in either orientation.
const hRun = new Uint16Array(NW * NH);
const vRun = new Uint16Array(NW * NH);
for (let y = 0; y < NH; y++) {
  let s = -1;
  for (let x = 0; x <= NW; x++) {
    const on = x < NW && nat.data[y * NW + x] <= INK;
    if (on && s < 0) s = x;
    if (!on && s >= 0) {
      for (let i = s; i < x; i++) hRun[y * NW + i] = x - s;
      s = -1;
    }
  }
}
for (let x = 0; x < NW; x++) {
  let s = -1;
  for (let y = 0; y <= NH; y++) {
    const on = y < NH && nat.data[y * NW + x] <= INK;
    if (on && s < 0) s = y;
    if (!on && s >= 0) {
      for (let i = s; i < y; i++) vRun[i * NW + x] = y - s;
      s = -1;
    }
  }
}
const thickness: number[] = [];
for (let i = 0; i < NW * NH; i++) {
  if (hRun[i] && vRun[i]) thickness.push(Math.min(hRun[i], vRun[i]));
}
thickness.sort((a, b) => a - b);
const pct = (q: number): number => thickness[Math.floor((thickness.length - 1) * q)] ?? 0;
const thinShare = (thickness.filter((t) => t < needPx).length / thickness.length) * 100;

// ── 8. Composite onto the ORIGINAL canonical page ──────────────────────────
const composited = await sharp(canonicalPng)
  .composite([{ input: printArt, top: placeTop, left: placeLeft }])
  .png()
  .toBuffer();
await writeFile(path.join(OUT, `p${pageArg}-composited.png`), composited);

// Prove the type was untouched: everything outside the art region must be
// pixel-identical to the canonical page.
const [canonRaw, compRaw] = await Promise.all([
  sharp(canonicalPng).greyscale().raw().toBuffer(),
  sharp(composited).greyscale().raw().toBuffer(),
]);
const W = meta.width ?? 0;
let outsideDiff = 0;
for (let y = 0; y < (meta.height ?? 0); y++) {
  for (let x = 0; x < W; x++) {
    const inPlaced = x >= placeLeft && x < placeLeft + placeW && y >= placeTop && y < placeTop + placeH;
    if (inPlaced) continue;
    if (canonRaw[y * W + x] !== compRaw[y * W + x]) outsideDiff++;
  }
}

console.log('\nRESULT');
console.log(`  max safe region      ${artWIn.toFixed(2)} x ${artHIn.toFixed(2)} in   (${artW}x${artH}px)`);
console.log(`  PLACEMENT            ${placeWIn.toFixed(2)} x ${placeHIn.toFixed(2)} in   (${placeW}x${placeH}px on the page raster)`);
console.log(`  white left around it ${(artWIn - placeWIn).toFixed(2)}in across, ${(artHIn - placeHIn).toFixed(2)}in down`);
console.log(`  native pixels        ${nativeW}x${nativeH}  (what the model actually drew)`);
console.log(`  NATIVE ppi at size   ${Math.round(nativePpi)}   ${nativePpi >= MIN_NATIVE_PPI ? 'PASS' : 'FAIL'} (gate ${MIN_NATIVE_PPI})`);
console.log(`  page raster grid     ${Math.round(pxPerIn)} ppi  (grid only — adds no detail)`);
console.log('');
console.log(`  PRINT-LINE CHECK — 1pt at this placement = ${needPx.toFixed(1)} native px`);
console.log(`    ink-weighted thickness:    p10 ${pct(0.1)}   p25 ${pct(0.25)}   p50 ${pct(0.5)}   p75 ${pct(0.75)}`);
console.log(`    share of ink under 1pt:    ${thinShare.toFixed(1)}%   ${thinShare < 25 ? 'PASS' : 'REVIEW'}`);
console.log('');
console.log(`  pixels changed outside the placed art: ${outsideDiff}  ${outsideDiff === 0 ? '(type untouched)' : '<< COMPOSITE BUG'}`);
console.log(`\nwritten to ${OUT}`);
process.exit(outsideDiff === 0 ? 0 : 1);
