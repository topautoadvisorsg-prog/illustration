/**
 * BEFORE YOU NEED IT — the Kindle edition.
 *
 * Same manuscript, same section parser and same rights statement as the print
 * interior, so the two editions cannot disagree about what the chapters are or
 * what rights the book asserts. Everything about PRESENTATION is different,
 * because a reflowable file has no pages.
 *
 * ─── THE FIGURES COME FROM THE MANUSCRIPT, AS THEY DO IN PRINT ─────────────
 * Until rev-19 the print edition STAMPED seven illustrations onto the finished
 * PDF at measured coordinates, leaving nothing in the manuscript for an ebook
 * exporter to find, so this script bound art to sections by searching for each
 * illustration's anchor line. That whole mechanism is gone.
 *
 * From rev-19 the five approved figures are written into the manuscript as
 * `![](id){n%}` and flow with the text. Both editions therefore read the SAME
 * five figures from the SAME source lines, and neither can carry a figure the
 * other does not. The old seven — the pouch, the sequence dots, the bra on a
 * chair, the deodorant and hairbrush, the volume dial, the seedlings and the
 * four-circle cycle — are retired, and `illustrations/` is no longer read here.
 * Reading it was how they would have got into the ebook after being removed
 * from print.
 *
 * ─── ALT TEXT IS NOT OPTIONAL ──────────────────────────────────────────────
 * Every image carries alt text describing the figure that ACTUALLY SHIPS,
 * straight out of `figures/FIGURE-MANIFEST.json`, plus alt text on the cover. A
 * puberty guide read by a child on a screen reader must not have silent gaps in
 * it. The build FAILS if any figure has no alt text, and FAILS if any figure in
 * the manuscript resolved to no asset.
 *
 * ─── THE COVER IS THE COMPOSED FRONT PANEL, NOT THE RAW ART ────────────────
 * The title, subtitle and author are set as live type by the cover compositor;
 * they are not painted into the artwork. Cropping the raw wrap would produce a
 * cover with no words on it. So this rasterises the SHIPPING paperback wrap and
 * extracts the front panel from the manifest's own geometry.
 *
 *   yarn tsx scripts/before-you-need-it-kindle.ts
 *
 * Local and free: no model, no network, no database.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { EPub, type Options } from 'epub-gen-memory';
import {
  assembleTypesetEpubModel,
  type EpubFigure,
} from '../src/pipeline/stage-8-epub/assemble-typeset-epub.js';
import { EPUB_CSS } from '../src/pipeline/stage-8-epub/build-epub.js';
import { rasterizePages } from '../src/pipeline/page-qa/raster.js';
import { BOOK, CONFIG, OUT_DIR, REV, readManuscript } from './before-you-need-it-config.js';

const FIGURES_DIR = `${OUT_DIR}/figures`;
const COVER_DIR = `${OUT_DIR}/cover`;
const OUT = `${OUT_DIR}/kindle`;
mkdirSync(OUT, { recursive: true });

/** Images are handed to the packer as files; see the note at the first use. */
const STAGE = join(tmpdir(), 'byni-kindle-figures');
mkdirSync(STAGE, { recursive: true });

const { md, sha } = readManuscript();
console.log(`manuscript ${REV}  sha256 ${sha.slice(0, 16)}
`);

// ── 1. the five approved figures, keyed as the manuscript writes them ──────
interface Fig {
  id: string;
  file: string;
  alt: string;
  teaches: string;
}
const figureManifest: Fig[] = JSON.parse(readFileSync(`${FIGURES_DIR}/FIGURE-MANIFEST.json`, 'utf8'));

const figures = new Map<string, EpubFigure>();
for (const f of figureManifest) {
  if (!f.alt?.trim()) {
    console.error(`ABORT: ${f.id} has no alt text.`);
    process.exit(2);
  }
  /* A `file://` URL, not a data URI. epub-gen-memory fetches every image src
     through node-fetch, whose request builder rejects a data: URL outright —
     the packer dies on `getNodeRequestOptions` with no mention of images. The
     cover path in `build-epub.ts` already writes a temp file for this reason. */
  const staged = join(STAGE, f.file);
  writeFileSync(staged, readFileSync(`${FIGURES_DIR}/${f.file}`));
  figures.set(f.id, { src: pathToFileURL(staged).href, alt: f.alt });
  console.log(`  ${f.id.padEnd(22)} alt ${f.alt.length} chars`);
}

/* The manuscript is the authority on how many figures there are. If someone
   adds a figure line and forgets the asset, or stages an asset nothing
   references, that is a defect in the shipping ebook and it stops the build. */
const inManuscript = [...md.matchAll(/^!\[[^\]]*\]\(([^)]+)\)/gm)].map((m) => m[1]!);
const missingAsset = inManuscript.filter((id) => !figures.has(id));
const unusedAsset = [...figures.keys()].filter((id) => !inManuscript.includes(id));
if (missingAsset.length || unusedAsset.length) {
  if (missingAsset.length) console.error(`ABORT: manuscript references assets that are not staged: ${missingAsset.join(', ')}`);
  if (unusedAsset.length) console.error(`ABORT: staged assets the manuscript never uses: ${unusedAsset.join(', ')}`);
  process.exit(2);
}
console.log(`  ${figures.size} figures, ${inManuscript.length} references, 0 unmatched`);

// ── 2. the cover: the COMPOSED front panel, with its type ───────────────────
const manifest = JSON.parse(readFileSync(`${COVER_DIR}/BYNI-cover-PAPERBACK-manifest.json`, 'utf8'));
const PP: number = manifest.interior.pageCount;
const wrapPdf = readFileSync(`${COVER_DIR}/BYNI-cover-PAPERBACK-${PP}pp.pdf`);

const SCALE = 6; // 432 dpi — the front panel lands ~2376px wide before resizing
const raster = await rasterizePages(wrapPdf, [1], { scale: SCALE });
const wrapPng = raster.pages.get(1)!;
const pxPerIn = 72 * SCALE;
const BLEED = 0.125;
const TRIM_W = CONFIG.trimSize.widthIn;
const TRIM_H = CONFIG.trimSize.heightIn;
// Front panel sits after: bleed | back cover | spine.
const left = Math.round((BLEED + TRIM_W + manifest.spineIn) * pxPerIn);
const cover = await sharp(wrapPng)
  .extract({
    left,
    top: Math.round(BLEED * pxPerIn),
    width: Math.round(TRIM_W * pxPerIn),
    height: Math.round(TRIM_H * pxPerIn),
  })
  // 5.5x8.5 is 1:1.545; Kindle wants 1:1.6. `cover` trims the difference evenly
  // off both sides rather than letterboxing, so the centred type stays centred.
  .resize(1600, 2560, { fit: 'cover', position: 'centre' })
  .jpeg({ quality: 90 })
  .toBuffer();
const coverPath = `${OUT}/BYNI-KINDLE-COVER-1600x2560.jpg`;
writeFileSync(coverPath, cover);
console.log(`\ncover  1600x2560 from the composed ${PP}pp wrap  ${(cover.length / 1024) | 0} KB`);

const tmp = join(tmpdir(), 'byni-kindle-cover.jpg');
writeFileSync(tmp, cover);

// ── 3. assemble and pack ────────────────────────────────────────────────────
const DESCRIPTION =
  'An honest, practical guide to periods and puberty for girls aged 8 to 12 — what happens, ' +
  'roughly when, and what to do about it. Written by a mother of three who got it wrong the first time.';

const model = assembleTypesetEpubModel({
  markdown: md,
  config: CONFIG,
  figures,
  meta: {
    title: CONFIG.title,
    subtitle: CONFIG.subtitle,
    authors: [CONFIG.authorName],
    language: 'en',
    description: DESCRIPTION,
    coverAlt:
      'Before You Need It, by Margo Teale. An illustrated cover in soft blues and creams for a ' +
      "girls' guide to periods and puberty.",
  },
});

for (const w of model.stats.warnings) console.log(`  warning: ${w}`);

const epub = await new EPub(
  {
    title: CONFIG.title,
    author: [CONFIG.authorName],
    publisher: CONFIG.authorName,
    description: DESCRIPTION,
    lang: 'en',
    cover: pathToFileURL(tmp).href,
    tocTitle: 'Contents',
    version: 3,
    prependChapterTitles: false,
    css: EPUB_CSS,
  } as Options,
  model.chapters,
).render();
const buffer = await epub.genEpub();

const file = `${OUT}/BEFORE-YOU-NEED-IT_kindle_${REV.replace('-','')}.epub`;
writeFileSync(file, buffer);

console.log(`\nchapters ${model.stats.chapters}  body ${model.stats.bodyChapters}  words ${model.stats.words}`);
// FAIL-CLOSED. `heroesEmbedded` counts what actually reached the XHTML, so a
// figure that silently failed to resolve cannot be reported as shipped.
if (model.stats.heroesEmbedded !== figures.size || model.stats.omittedImages) {
  console.error(
    `
ABORT: ${figures.size} figures expected, ${model.stats.heroesEmbedded} embedded, ` +
      `${model.stats.omittedImages} omitted.`,
  );
  process.exit(2);
}
console.log(`figures embedded ${model.stats.heroesEmbedded}/${figures.size}, every one with alt text`);
console.log(`\n${(buffer.length / 1048576).toFixed(2)} MB  sha256 ${createHash('sha256').update(buffer).digest('hex')}`);
console.log(`-> ${file}`);
console.log(`\nNext: EPUBCheck and Kindle Previewer before upload.`);
void BOOK;
process.exit(0);
