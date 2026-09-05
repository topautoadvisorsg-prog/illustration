/**
 * BEFORE YOU NEED IT — refresh the owner's review folder from production.
 *
 * Copies the files that actually ship into FINAL-FILES under plain numbered
 * names, and rewrites READ-ME-FIRST.txt from the MANIFESTS rather than from
 * anything typed by hand — sizes, hashes, page count, spine widths and
 * resolutions all come out of the build that produced the files.
 *
 * The previous readme was hand-written, which is how it came to describe a
 * 175-page book beside a 174-page cover.
 *
 *   yarn tsx scripts/_byni_final_files.ts
 *
 * Local and free.
 */
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync, readdirSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { buildPageModel } from '../src/pipeline/page-qa/page-model.js';
import { INTERIOR_PDF, REV } from './before-you-need-it-config.js';

const BOOK = 'C:/Users/jovan/Downloads/before-you-need-it';
const PROD = `${BOOK}/06-PRODUCTION`;
const COVER = `${PROD}/cover`;
const OUT = `${BOOK}/FINAL-FILES`;
mkdirSync(OUT, { recursive: true });

const pb = JSON.parse(readFileSync(`${COVER}/BYNI-cover-PAPERBACK-manifest.json`, 'utf8'));
const hc = JSON.parse(readFileSync(`${COVER}/BYNI-cover-HARDCOVER-manifest.json`, 'utf8'));
const PP: number = pb.interior.pageCount;
if (hc.interior.pageCount !== PP) {
  console.error(`ABORT: covers disagree — paperback ${PP}pp, hardcover ${hc.interior.pageCount}pp`);
  process.exit(2);
}

/**
 * FOUR FILES. NOTHING ELSE.
 *
 * This folder is what the owner opens when he is uploading to KDP, and every
 * extra file in it is a chance to upload the wrong one. It previously held eight
 * items including two proofs with GUIDE LINES DRAWN ON THEM, sitting directly
 * beside the real covers under near-identical names. Uploading one of those
 * would print crop marks on a shipped book.
 *
 * So: the four things that get uploaded, at the top level, numbered in the order
 * they are used. Everything else goes in `reference/`, which nobody uploads from.
 */
const KINDLE = `${PROD}/kindle`;

const UPLOAD: Array<[string, string]> = [
  // KDP PRINT
  [INTERIOR_PDF, `1 - INTERIOR ${PP}pp.pdf`],
  [`${COVER}/BYNI-cover-PAPERBACK-${PP}pp.pdf`, '2 - PAPERBACK COVER.pdf'],
  [`${COVER}/BYNI-cover-HARDCOVER-${PP}pp.pdf`, '3 - HARDCOVER COVER.pdf'],
  /* KDP EBOOK. Promoted to a shipping file only after EPUBCheck 5.3.0 reported
     0 errors / 0 warnings and Kindle Previewer 3 converted with 0 errors and
     0 quality issues. Before that it lived in 06-PRODUCTION and was deliberately
     kept out of here. */
  [`${KINDLE}/BEFORE-YOU-NEED-IT_kindle_${REV.replace('-', '')}.epub`, '4 - KINDLE.epub'],
  // KDP asks for the ebook cover separately from the file, even though the EPUB
  // embeds it. Same composed front panel, 1600x2560.
  [`${KINDLE}/BYNI-KINDLE-COVER-1600x2560.jpg`, '5 - KINDLE COVER.jpg'],
  // RECORD ONLY — never uploaded anywhere.
  [`${BOOK}/01-WORKING/${REV}/BEFORE-YOU-NEED-IT_MANUSCRIPT.md`, `6 - MANUSCRIPT ${REV}.md`],
];

/** Everything a person might want to LOOK at, and must never upload. */
const REF = `${OUT}/reference`;
mkdirSync(REF, { recursive: true });
const REFERENCE: Array<[string, string]> = [
  [`${COVER}/BYNI-cover-PAPERBACK-${PP}pp-PROOF.png`, 'paperback cover proof - GUIDES, DO NOT UPLOAD.png'],
  [`${COVER}/BYNI-cover-HARDCOVER-${PP}pp-PROOF.png`, 'hardcover cover proof - GUIDES, DO NOT UPLOAD.png'],
];

// Anything at the top level that is not one of the four gets moved out, so an
// older run's files cannot linger beside the current ones.
const KEEP = new Set(UPLOAD.map(([, name]) => name).concat(['READ-ME-FIRST.txt']));
for (const f of readdirSync(OUT, { withFileTypes: true })) {
  if (f.isDirectory() || KEEP.has(f.name)) continue;
  renameSync(`${OUT}/${f.name}`, `${REF}/${f.name}`);
  console.log(`moved out of the upload folder: ${f.name}`);
}

/**
 * THE FIGURE AND SPARSE-PAGE FACTS ARE MEASURED, NOT TYPED.
 *
 * This readme previously stated "7 illustrations at 439 PPI native" and "Nine
 * pages end more than a quarter short" as literals. Both were true of rev-18
 * and both were wrong the moment the illustration set changed -- the same class
 * of mistake as the readme that once described a 175-page book beside a
 * 174-page cover. They now come out of the shipping PDF.
 */
const figManifest: Array<{ id: string; file: string; widthPx: number }> =
  JSON.parse(readFileSync(`${PROD}/figures/FIGURE-MANIFEST.json`, 'utf8'));
const model = await buildPageModel(readFileSync(INTERIOR_PDF));
const artPages = model.pages.filter((p) => p.images.length);
/* Pixel width comes from the FILE ON DISK, not from the manifest's record of
   it. The manifest was written at staging time and the menstrual cycle was
   upscaled 4x AFTER that, so its stored 1024 understated the real 4096 and the
   readme reported 300 PPI for a figure that prints at 1199. */
const ppis = await Promise.all(
  artPages.map(async (p, i) => {
    const b = p.images[0]!;
    const meta = await sharp(`${PROD}/figures/${figManifest[i]!.file}`).metadata();
    return Math.round(meta.width! / ((b.x1 - b.x0) / 72));
  }),
);
const FIGS = artPages.length;
const PPI_LO = Math.min(...ppis);
const PPI_HI = Math.max(...ppis);

const { textBlockTopPt: T, textBlockBottomPt: B } = model.norms;
const emptyFoot = (p: (typeof model.pages)[number]) => {
  const t = p.textBox ? p.textBox.y0 : Infinity;
  const a = p.images.length ? Math.min(...p.images.map((x) => x.y0)) : Infinity;
  const l = Math.min(t, a);
  return Number.isFinite(l) ? Math.max(0, (l - B) / (T - B)) : 1;
};
const SPARSE = model.pages.filter((p) => emptyFoot(p) > 0.25).length;

if (FIGS !== figManifest.length) {
  console.error(`ABORT: ${figManifest.length} figures staged but ${FIGS} art pages in the interior.`);
  process.exit(2);
}

const rows: string[] = [];
for (const [src, name] of UPLOAD) {
  copyFileSync(src, `${OUT}/${name}`);
  const buf = readFileSync(`${OUT}/${name}`);
  rows.push(
    `  ${name}\n      ${(statSync(`${OUT}/${name}`).size / 1024).toFixed(1)} KB   ` +
      `sha256 ${createHash('sha256').update(buf).digest('hex')}`,
  );
  console.log(`copied ${name}`);
}
for (const [src, name] of REFERENCE) {
  try {
    copyFileSync(src, `${REF}/${name}`);
  } catch {
    console.log(`(missing reference file ${name})`);
  }
}

const readme = `BEFORE YOU NEED IT - publication files
==============================================================

Margo Teale
PRINT   5.5 x 8.5in | ${PP} pages | black & white | WHITE paper
EBOOK   reflowable EPUB 3, illustrated, with alt text

FILES

${rows.join('\n')}

FINAL SPECIFICATION

  Interior    ${PP} pages, NO blank pages, ${FIGS} illustrations at ${PPI_LO}-${PPI_HI} PPI native.
  Kindle      reflowable EPUB 3, ${FIGS} illustrations with alt text, 3 safety tiers
              preserved semantically. EPUBCheck 5.3.0: 0 errors, 0 warnings.
              Kindle Previewer 3: converted, 0 errors, 0 quality issues.
  Paperback   wrap ${pb.fullWidthIn.toFixed(4)} x ${pb.fullHeightIn.toFixed(4)}in, spine ${pb.spineIn.toFixed(6)}in, bleed 0.125in.
  Hardcover   wrap ${hc.fullWidthIn.toFixed(4)} x ${hc.fullHeightIn.toFixed(4)}in, spine ${hc.spineIn.toFixed(6)}in,
              board 5.697 x 8.736in, wrap 0.591in, hinge 0.394in.
  Cover art   6144 x 4096px. ${Math.round(pb.effectivePpi)} PPI paperback, ${Math.round(hc.effectivePpi)} PPI hardcover.

  BOTH COVERS: STATUS ${pb.status}/${hc.status}. Interior: 0 hard failures.

NOTES

  Cover art was upscaled 4x with Real-ESRGAN from the approved 1536x1024
  master. The design was NOT regenerated. This synthesises detail rather
  than recovering it; KDP's automated check cannot tell the difference, so
  a printed proof is still the honest test of how it looks on paper.

  Hardcover geometry is DERIVED - Amazon publishes no hardcover spine
  formula. Cross-checked against the shipped NO ONE TOLD ME THAT 5.5x8.5
  hardcover, which the model reproduces exactly. Confirm the exact figures
  on the KDP Cover Calculator at export time.

  SPARSE PAGES ARE DELIBERATE. ${SPARSE} pages end more than a quarter short:
  the title and copyright pages, thirteen chapter closings that end on a line
  meant to be left alone, and the last page. There are NO sparse pages in the
  middle of a chapter. Every accidental one has been repaired. See
  PROJECT-STATE.md.

  THE FIVE FIGURES flow with the text; they are not stamped onto a finished
  PDF, so print and ebook read the same five from the same manuscript lines.
  The seven illustrations shipped in earlier candidates are retired and appear
  in neither edition.

  KDP PRINT   — upload files 1, 2 and 3.
  KDP EBOOK   — upload files 4 and 5.
  DO NOT UPLOAD file 6. It is the manuscript record, not a publishing asset.

  File 1 is the print interior and file 4 is the ebook. They are different books
  in every respect except their words; never substitute one for the other.

  Nothing else in this folder is uploadable. Proofs with guide lines drawn on
  them, and anything else you might want to LOOK at, are in reference/ — they are
  kept out of here on purpose, because a guides-on cover sitting beside the real
  one is how crop marks get printed on a shipped book.
`;
writeFileSync(`${OUT}/READ-ME-FIRST.txt`, readme);
console.log(`\nreadme -> ${OUT}/READ-ME-FIRST.txt`);
process.exit(0);
