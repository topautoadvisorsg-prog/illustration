/**
 * TRAIN THE DOG YOU'VE GOT — build the paperback wrap.
 *
 * ALL TEXT IS LIVE TYPE. Nothing on this cover is painted into the artwork:
 * not the title, not the subtitle, not the author, not the spine, not the back
 * copy. The artwork is illustration and nothing else. That is the owner's
 * ruling and it is the whole reason this script exists rather than a prompt.
 *
 * WHAT IS SHARED AND WHAT IS LOCAL.
 *
 *   SHARED, used read-only, not one line modified:
 *     resolveCoverGeometry   the single authority for trim, bleed, spine, folds,
 *                            safe areas and the barcode reserve
 *     planArtwork/renderArtwork   fitting, cropping and effective-PPI measurement
 *     validateCover          the seven gates
 *     renderProof            the guided proof
 *     planCopyColumn         the back-cover copy column
 *
 *   LOCAL, because it is this book's design and not an engine capability:
 *     the stacked front title, the subtitle, the front author, the spine
 *     typography and the palette.
 *
 * This script computes NO dimension of its own. Every inch it places type at is
 * derived from the resolved geometry, and where it needed a figure the resolver
 * does not carry — KDP's 8.750in spine-safe length — it takes it from the dated
 * calculator reading in `geometry-check.ts` rather than inventing one.
 *
 *   yarn tsx scripts/train-the-dog-cover/build.ts
 *
 * Local and free: no model, no network.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { resolveCoverGeometry } from '../../src/pipeline/cover/compositor/geometry.js';
import { readInteriorPageCount } from '../../src/pipeline/cover/compositor/build-cover.js';
import { planArtwork, renderArtwork } from '../../src/pipeline/cover/compositor/artwork.js';
import { validateCover, worstStatus } from '../../src/pipeline/cover/compositor/validate.js';
import type { Check, ContentBox } from '../../src/pipeline/cover/compositor/validate.js';
import { renderProof } from '../../src/pipeline/cover/compositor/proof.js';
import { planCopyColumn } from '../../src/pipeline/publishing-standard/cover-copy-column.js';
import { AUTHOR, BOOK, COVER_DIR, INTERIOR_NAME, INTERIOR_PDF, KDP_CONFIG, TITLE } from './book.js';
import { BACK_COPY, PALETTE, FACES, LAYOUT, TITLE_BREAKS } from './design.js';
import { assertFontResolves, fitUniform, inkBox, planSpine, setStack } from './type.js';

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const argOf = (name: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

/**
 * KDP's own spine-safe LENGTH, from the calculator reading dated in
 * `geometry-check.ts`. The shared resolver gives the spine-safe rect the full
 * wrap height including bleed; KDP's template says 8.750in. Taken from KDP.
 */
const KDP_SPINE_SAFE_LENGTH_IN = 8.75;

// ── 0 · prove every typeface resolves before a glyph is placed ──────────────
for (const f of Object.values(FACES)) await assertFontResolves(f.family, f.weight);

// ── 1 · geometry, from the interior that is actually shipping ──────────────
const interiorPdf = readFileSync(INTERIOR_PDF);
const pageCount = await readInteriorPageCount(interiorPdf);
const g = resolveCoverGeometry({ ...KDP_CONFIG, pageCount });

const DPI = 300;
const WPX = Math.round(g.fullWidthIn * DPI);
const HPX = Math.round(g.fullHeightIn * DPI);
const px = (inches: number) => inches * DPI;

// ── 2 · artwork ────────────────────────────────────────────────────────────
/**
 * A PLACEHOLDER GROUND IS NOT A COVER, and this script says so out loud.
 *
 * The approved mockup has not been supplied yet, so with no `--artwork=` the
 * build lays the type over a flat field in the approved blue. That proves every
 * measurement, every clearance and the whole live-type path without pretending
 * to be the finished article. Every artefact it writes is stamped PLACEHOLDER
 * in its filename, and the manifest records `artworkIsPlaceholder: true`, so a
 * proof cannot be mistaken for a cover later.
 */
const artworkArg = argOf('artwork');
const usingPlaceholder = !artworkArg;
if (artworkArg && !existsSync(artworkArg)) throw new Error(`--artwork not found: ${artworkArg}`);

/** Generated at the wrap's own aspect so the placeholder contributes no crop of its own. */
const PLACEHOLDER_W = 6144;
const artwork = artworkArg
  ? readFileSync(artworkArg)
  : await sharp({
      create: {
        width: PLACEHOLDER_W,
        height: Math.round((PLACEHOLDER_W * g.fullHeightIn) / g.fullWidthIn),
        channels: 3,
        background: PALETTE.ground,
      },
    })
      .png()
      .toBuffer();

const artworkPlan = await planArtwork(artwork, g, {
  mode: 'cover',
  renderDpi: DPI,
  /**
   * Cap the side crop. Generated wrap art is nearer 1.50:1 than this wrap's
   * 1.3696:1, and uncapped `cover` eats 0.55in off each side — enough to take
   * the dog's muzzle with it.
   */
  maxSideCropIn: LAYOUT.maxSideCropIn,
});
let composed = await renderArtwork(artwork, artworkPlan);

// ── 3 · front panel type ───────────────────────────────────────────────────
const frontCentreIn = g.frontPanel.xIn + g.panelWidthIn / 2;
const frontSafe = g.frontSafe;

/** Build the front type once per candidate title break, so the two can be compared at thumbnail. */
async function composeFront(titleLines: string[], base: Buffer) {
  const measurePx = px(LAYOUT.titleMeasureIn);
  const titleFit = await fitUniform(titleLines, FACES.title, measurePx, px(LAYOUT.titleMaxCapIn));

  const titleTopPx = px(LAYOUT.titleTopIn);
  const title = await setStack({
    lines: titleLines,
    style: FACES.title,
    centreXPx: px(frontCentreIn),
    firstBaselinePx: titleTopPx + titleFit.capPx,
    sizePx: titleFit.sizePx,
    leadingEm: LAYOUT.titleLeadingEm,
    fill: PALETTE.titleInk,
    halo: PALETTE.halo,
    haloEm: LAYOUT.haloEm,
    wrapWidthPx: WPX,
    wrapHeightPx: HPX,
    scanRegion: { left: px(frontSafe.xIn) - 40, top: 0, width: px(frontSafe.widthIn) + 80, height: px(5) },
  });

  /** The subtitle hangs off the title's MEASURED ink, not off a fixed y. */
  const subFit = await fitUniform(
    LAYOUT.subtitleLines,
    FACES.subtitle,
    px(LAYOUT.subtitleMeasureIn),
    px(LAYOUT.subtitleMaxCapIn),
  );
  const subtitle = await setStack({
    lines: LAYOUT.subtitleLines,
    style: FACES.subtitle,
    centreXPx: px(frontCentreIn),
    firstBaselinePx: title.ink.bottom + px(LAYOUT.subtitleGapIn) + subFit.capPx,
    sizePx: subFit.sizePx,
    leadingEm: LAYOUT.subtitleLeadingEm,
    fill: PALETTE.subtitleInk,
    halo: PALETTE.halo,
    haloEm: LAYOUT.haloEm,
    wrapWidthPx: WPX,
    wrapHeightPx: HPX,
    scanRegion: {
      left: px(frontSafe.xIn) - 40,
      top: title.ink.bottom,
      width: px(frontSafe.widthIn) + 80,
      height: px(2.5),
    },
  });

  /**
   * The author sits at a baseline measured UP FROM THE BOTTOM TRIM, not down
   * from the top of the wrap. The bottom trim is where the eye reads the
   * margin from, and it is the edge the knife is near.
   */
  const authorBaselinePx = px(g.frontPanel.yIn + g.panelHeightIn - LAYOUT.authorBaselineFromBottomIn);
  const authorFit = await fitUniform([AUTHOR], FACES.author, px(LAYOUT.authorMaxWidthIn), px(LAYOUT.authorCapIn));
  const author = await setStack({
    lines: [AUTHOR],
    style: FACES.author,
    centreXPx: px(frontCentreIn),
    firstBaselinePx: authorBaselinePx,
    sizePx: authorFit.sizePx,
    leadingEm: 1,
    fill: PALETTE.authorInk,
    halo: PALETTE.halo,
    haloEm: LAYOUT.haloEm,
    wrapWidthPx: WPX,
    wrapHeightPx: HPX,
    scanRegion: {
      left: px(frontSafe.xIn) - 40,
      top: authorBaselinePx - px(1),
      width: px(frontSafe.widthIn) + 80,
      height: px(1.4),
    },
  });

  const out = await sharp(base)
    .composite([
      { input: Buffer.from(title.svg), left: 0, top: 0 },
      { input: Buffer.from(subtitle.svg), left: 0, top: 0 },
      { input: Buffer.from(author.svg), left: 0, top: 0 },
    ])
    .toBuffer();
  return { out, title, subtitle, author, titleFit, subFit, authorFit };
}

const front = await composeFront(TITLE_BREAKS.primary, composed);
composed = front.out;

// ── 4 · spine ──────────────────────────────────────────────────────────────
const spine = await planSpine({
  title: TITLE,
  author: AUTHOR,
  titleStyle: FACES.spineTitle,
  authorStyle: FACES.spineAuthor,
  spineWidthPx: Math.round(px(g.spineIn)),
  wrapHeightPx: HPX,
  safeLengthPx: px(KDP_SPINE_SAFE_LENGTH_IN),
  gapPx: px(LAYOUT.spineGapIn),
  /**
   * HOUSE MARGIN, above KDP's floor. KDP's fold variance is 0.0625in and that
   * is the hard minimum; sizing to the floor leaves nothing for press wander.
   */
  targetClearPx: px(g.foldVarianceIn * LAYOUT.spineClearanceFactor),
  fill: PALETTE.spineInk,
  halo: PALETTE.halo,
  haloEm: LAYOUT.haloEm,
  minSizePx: 18,
});
composed = await sharp(composed)
  .composite([{ input: Buffer.from(spine.svg), left: Math.round(px(g.foldLeftIn)), top: 0 }])
  .toBuffer();

// ── 5 · back cover copy, set by the shared column typesetter ───────────────
const copy = await planCopyColumn({
  blocks: BACK_COPY,
  columnLeftPx: px(LAYOUT.backColumnLeftIn),
  columnRightPx: px(LAYOUT.backColumnRightIn),
  bandTopPx: px(LAYOUT.backBandTopIn),
  bandBottomPx: px(LAYOUT.backBandBottomIn),
  wrapWidthPx: WPX,
  wrapHeightPx: HPX,
  maxSizePx: px(LAYOUT.backMaxSizeIn),
  minSizePx: px(LAYOUT.backMinSizeIn),
  font: FACES.backCopy.family,
  fill: PALETTE.backInk,
  halo: PALETTE.halo,
});
composed = await sharp(composed).composite([{ input: Buffer.from(copy.svg), left: 0, top: 0 }]).toBuffer();

/** Where the back copy's ink ACTUALLY landed, so the barcode gate tests ink and not intent. */
const copyInk = (await inkBox(copy.svg, WPX, HPX, {
  left: 0,
  top: 0,
  width: px(g.backPanel.xIn + g.backPanel.widthIn),
  height: HPX,
}))!;

// ── 6 · validate, with real content boxes ──────────────────────────────────
const toRect = (b: { left: number; right: number; top: number; bottom: number }) => ({
  xIn: b.left / DPI,
  yIn: b.top / DPI,
  widthIn: (b.right - b.left) / DPI,
  heightIn: (b.bottom - b.top) / DPI,
});
const contentBoxes: ContentBox[] = [{ id: 'back-cover-copy', rect: toRect(copyInk) }];

const checks: Check[] = validateCover({
  geometry: g,
  artwork: artworkPlan,
  spineText: {
    requested: true,
    placed: true,
    measuredClearPerSideIn: spine.measuredClearPerSidePx / DPI,
  },
  contentBoxes,
});

/**
 * TWO GATES THE SHARED VALIDATOR DOES NOT HAVE, added here because this cover
 * has live type on the FRONT and the shared compositor has never had any.
 *
 * The validator checks the spine's clearance and the back copy's barcode
 * clash. Nothing in it looks at whether a front title is inside the front safe
 * area — because until this book, no front title was ever set as type.
 */
const safeR = { l: px(frontSafe.xIn), r: px(frontSafe.xIn + frontSafe.widthIn), t: px(frontSafe.yIn), b: px(frontSafe.yIn + frontSafe.heightIn) };
const frontBlocks: Array<[string, { left: number; right: number; top: number; bottom: number }]> = [
  ['title', front.title.ink],
  ['subtitle', front.subtitle.ink],
  ['author', front.author.ink],
];
const breaches = frontBlocks
  .map(([id, b]) => ({
    id,
    leftIn: (b.left - safeR.l) / DPI,
    rightIn: (safeR.r - b.right) / DPI,
    topIn: (b.top - safeR.t) / DPI,
    bottomIn: (safeR.b - b.bottom) / DPI,
  }))
  .map((m) => ({ ...m, worstIn: Math.min(m.leftIn, m.rightIn, m.topIn, m.bottomIn) }));
const worstBreach = breaches.reduce((a, b) => (a.worstIn <= b.worstIn ? a : b));
checks.push({
  id: 'front_type_safe_area',
  label: 'Front type inside safe area',
  status: worstBreach.worstIn >= 0 ? 'PASS' : 'FAIL',
  detail:
    worstBreach.worstIn >= 0
      ? `All ${frontBlocks.length} live-type blocks clear the front safe area. Tightest: ${worstBreach.id} at ` +
        `${worstBreach.worstIn.toFixed(3)}in. Measured off drawn ink with the halo included, not from font metrics.`
      : `${worstBreach.id} crosses the front safe area by ${Math.abs(worstBreach.worstIn).toFixed(3)}in.`,
});

const copyToBarcodeIn = (g.barcodeSafe.yIn - copyInk.bottom / DPI);
checks.push({
  id: 'back_copy_barcode_gap',
  label: 'Back copy clear of barcode',
  status: copyToBarcodeIn >= LAYOUT.backCopyBarcodeGapIn ? 'PASS' : copyToBarcodeIn > 0 ? 'WARN' : 'FAIL',
  detail:
    `Back copy ends ${copyToBarcodeIn.toFixed(3)}in above the barcode reserve ` +
    `(house minimum ${LAYOUT.backCopyBarcodeGapIn}in). The reserve is HOUSE POLICY borrowed from KDP's ` +
    'hardcover figure; KDP publishes no paperback size.',
});

const status: 'READY' | 'BLOCKED' = worstStatus(checks) === 'FAIL' ? 'BLOCKED' : 'READY';

// ── 7 · outputs ────────────────────────────────────────────────────────────
const STAMP = usingPlaceholder ? '-PLACEHOLDER-ART' : '';
const STEM = `TTDYG-cover-PAPERBACK-${pageCount}pp${STAMP}`;
/** Guided files live in their own folder. A guides-on cover beside the real one is how crop marks get printed. */
const PROOF_DIR = `${COVER_DIR}/proof`;
mkdirSync(COVER_DIR, { recursive: true });
mkdirSync(PROOF_DIR, { recursive: true });

const flat = await sharp(composed).jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toBuffer();
const pdf = await PDFDocument.create();
const page = pdf.addPage([g.fullWidthIn * 72, g.fullHeightIn * 72]);
page.drawImage(await pdf.embedJpg(flat), { x: 0, y: 0, width: g.fullWidthIn * 72, height: g.fullHeightIn * 72 });
const productionPdf = Buffer.from(await pdf.save({ useObjectStreams: false }));

/** The shared guided proof, then this build's own extra guides drawn over it. */
const baseProof = await renderProof(composed, g, { dpi: DPI, checks });
const PD = 150;
const p = (i: number) => Math.round(i * PD);
const kdpSpineTop = (g.fullHeightIn - KDP_SPINE_SAFE_LENGTH_IN) / 2;
const inkRect = (b: { left: number; right: number; top: number; bottom: number }, c: string, label: string) =>
  `<rect x="${p(b.left / DPI)}" y="${p(b.top / DPI)}" width="${p((b.right - b.left) / DPI)}" ` +
  `height="${p((b.bottom - b.top) / DPI)}" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="3 3"/>` +
  `<text x="${p(b.left / DPI)}" y="${p(b.top / DPI) - 3}" font-family="monospace" font-size="11" fill="${c}" ` +
  `stroke="#fff" stroke-width="0.6" paint-order="stroke">${label}</text>`;
const extra =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${p(g.fullWidthIn)}" height="${p(g.fullHeightIn)}">` +
  frontBlocks.map(([id, b]) => inkRect(b, '#12b886', `ink:${id}`)).join('') +
  inkRect(copyInk, '#12b886', 'ink:back-copy') +
  `<rect x="${p(g.spineSafe.xIn)}" y="${p(kdpSpineTop)}" width="${p(g.spineSafe.widthIn)}" ` +
  `height="${p(KDP_SPINE_SAFE_LENGTH_IN)}" fill="none" stroke="#e8590c" stroke-width="2"/>` +
  `<text x="${p(g.spineSafe.xIn) + 4}" y="${p(kdpSpineTop) + 14}" font-family="monospace" font-size="10" ` +
  `fill="#e8590c" stroke="#fff" stroke-width="0.6" paint-order="stroke">KDP 8.750</text>` +
  '</svg>';
const proofPng = await sharp(baseProof).composite([{ input: Buffer.from(extra), left: 0, top: 0 }]).png().toBuffer();

/** Amazon's search thumbnail is roughly 160px on the front cover's width. */
const THUMB_W = 160;
const frontOnly = await sharp(composed)
  .extract({
    left: Math.round(px(g.frontPanel.xIn)),
    top: Math.round(px(g.frontPanel.yIn)),
    width: Math.round(px(g.panelWidthIn)),
    height: Math.round(px(g.panelHeightIn)),
  })
  .toBuffer();
const thumb = await sharp(frontOnly).resize({ width: THUMB_W, kernel: 'lanczos3' }).png().toBuffer();

/** The same panel with the ALTERNATIVE title break, so the break can be chosen on evidence. */
const altBase = await sharp(artwork)
  .resize({ width: artworkPlan.targetWidthPx, height: artworkPlan.targetHeightPx, fit: 'cover', kernel: 'lanczos3' })
  .toBuffer();
const alt = await composeFront(TITLE_BREAKS.alternative, altBase);
const altThumb = await sharp(alt.out)
  .extract({
    left: Math.round(px(g.frontPanel.xIn)),
    top: Math.round(px(g.frontPanel.yIn)),
    width: Math.round(px(g.panelWidthIn)),
    height: Math.round(px(g.panelHeightIn)),
  })
  .resize({ width: THUMB_W, kernel: 'lanczos3' })
  .png()
  .toBuffer();
const abGap = 12;
const ab = await sharp({
  create: { width: THUMB_W * 2 + abGap * 3, height: Math.round((THUMB_W * 9) / 6) + abGap * 2, channels: 3, background: '#ffffff' },
})
  .composite([
    { input: thumb, left: abGap, top: abGap },
    { input: altThumb, left: abGap * 2 + THUMB_W, top: abGap },
  ])
  .png()
  .toBuffer();

writeFileSync(`${COVER_DIR}/${STEM}.pdf`, productionPdf);
writeFileSync(`${PROOF_DIR}/${STEM}-GUIDES.png`, proofPng);
writeFileSync(`${PROOF_DIR}/${STEM}-THUMB.png`, thumb);
writeFileSync(`${PROOF_DIR}/${STEM}-THUMB-AB.png`, ab);

const manifest = {
  book: BOOK,
  builtAt: argOf('at') ?? new Date().toISOString(),
  artworkIsPlaceholder: usingPlaceholder,
  artwork: {
    name: artworkArg ? artworkArg.split('/').pop() : `FLAT-${PALETTE.ground}-placeholder`,
    sha256: sha256(artwork),
    sourcePx: `${artworkPlan.sourceWidthPx}x${artworkPlan.sourceHeightPx}`,
  },
  interior: { name: INTERIOR_NAME, sha256: sha256(interiorPdf), pageCount },
  cover: { name: `${STEM}.pdf`, sha256: sha256(productionPdf) },
  ...KDP_CONFIG,
  spineIn: g.spineIn,
  fullWidthIn: g.fullWidthIn,
  fullHeightIn: g.fullHeightIn,
  geometryAuthority: g.spineAuthority,
  geometrySource: g.spineSource,
  effectivePpi: artworkPlan.effectivePpi,
  liveType: {
    titleLines: TITLE_BREAKS.primary,
    titleFace: `${FACES.title.family} ${FACES.title.weight}`,
    titleSizePx: front.titleFit.sizePx,
    titleCapIn: front.titleFit.capPx / DPI,
    titleThumbCapPx: (front.titleFit.capPx / DPI) * (THUMB_W / g.panelWidthIn),
    subtitleSizePx: front.subFit.sizePx,
    authorSizePx: front.authorFit.sizePx,
    spineTitleSizePx: spine.titleSizePx,
    spineClearPerSideIn: spine.measuredClearPerSidePx / DPI,
    backCopySizePx: copy.sizePx,
    backCopyLines: copy.lineCount,
  },
  checks,
  status,
};
writeFileSync(`${COVER_DIR}/${STEM}-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);

// ── 8 · report ─────────────────────────────────────────────────────────────
const L = (k: string, v: string) => `  ${k.padEnd(26)}${v}`;
const lines: string[] = [''];
lines.push(`COVER BUILD — ${BOOK}`);
lines.push('='.repeat(78));
if (usingPlaceholder) {
  lines.push('  *** PLACEHOLDER ARTWORK — flat ground, no illustration. ***');
  lines.push('  *** This is a TYPOGRAPHY AND GEOMETRY proof, not the cover.  ***');
  lines.push('');
}
lines.push(L('interior', `${INTERIOR_NAME}  ${pageCount}pp (read from the PDF)`));
lines.push(L('wrap', `${g.fullWidthIn.toFixed(6)} x ${g.fullHeightIn.toFixed(6)} in`));
lines.push(L('spine', `${g.spineIn.toFixed(6)} in   ${g.spineAuthority}`));
lines.push(L('raster', `${WPX} x ${HPX} px at ${DPI} dpi`));
lines.push('');
lines.push(L('artwork', `${artworkPlan.sourceWidthPx} x ${artworkPlan.sourceHeightPx} px`));
lines.push(L('effective PPI', `${artworkPlan.effectivePpi.toFixed(1)} against a ${g.minDpi} minimum`));
lines.push(
  L('crop', `${artworkPlan.cropIn.leftIn.toFixed(3)}in per side, ${artworkPlan.cropIn.topIn.toFixed(3)}in top/bottom`),
);
lines.push('');
lines.push('  LIVE TYPE — every string below is set, none is painted into the art');
lines.push(
  L('  title', `${TITLE_BREAKS.primary.join(' / ')}  ${FACES.title.family} ${FACES.title.weight}`),
);
lines.push(
  L('  title size', `${front.titleFit.sizePx}px, cap ${(front.titleFit.capPx / DPI).toFixed(3)}in, ` +
    `${((front.titleFit.capPx / DPI) * (THUMB_W / g.panelWidthIn)).toFixed(1)}px cap at ${THUMB_W}px thumbnail`),
);
lines.push(L('  subtitle', `${front.subFit.sizePx}px, cap ${(front.subFit.capPx / DPI).toFixed(3)}in`));
lines.push(L('  author', `"${AUTHOR}" ${front.authorFit.sizePx}px, baseline ${LAYOUT.authorBaselineFromBottomIn}in from bottom trim`));
lines.push(
  L('  spine', `title ${spine.titleSizePx}px / author ${spine.authorSizePx}px, ` +
    `clearance ${(spine.measuredClearPerSidePx / DPI).toFixed(4)}in per side (measured, halo included)`),
);
lines.push(L('  back copy', `${copy.lineCount} lines at ${copy.sizePx}px, ${(copy.slackPx / DPI).toFixed(2)}in slack at the foot`));
lines.push('');
lines.push('  FRONT TYPE CLEARANCE TO SAFE AREA (measured ink, halo included)');
for (const b of breaches) {
  lines.push(
    `    ${b.id.padEnd(10)} left ${b.leftIn.toFixed(3)}  right ${b.rightIn.toFixed(3)}  ` +
      `top ${b.topIn.toFixed(3)}  bottom ${b.bottomIn.toFixed(3)}`,
  );
}
lines.push('');
lines.push(`  CHECKS  (${checks.filter((c) => c.status === 'PASS').length} pass, ` +
  `${checks.filter((c) => c.status === 'WARN').length} warn, ${checks.filter((c) => c.status === 'FAIL').length} fail)`);
for (const c of checks) lines.push(`    [${c.status.padEnd(4)}] ${c.label}: ${c.detail}`);
lines.push('');
lines.push(L('production', `${COVER_DIR}/${STEM}.pdf`));
lines.push(L('guided proof', `${PROOF_DIR}/${STEM}-GUIDES.png`));
lines.push(L('thumbnail', `${PROOF_DIR}/${STEM}-THUMB.png`));
lines.push(L('title A/B', `${PROOF_DIR}/${STEM}-THUMB-AB.png   (left: primary, right: alternative)`));
lines.push(L('STATUS', status));
lines.push('');
console.log(lines.join('\n'));
process.exit(status === 'READY' ? 0 : 1);
