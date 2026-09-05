/**
 * TRAIN THE DOG YOU'VE GOT — step 3: the two things the image model cannot do.
 *
 * The approved artwork carries the title, the subtitle and the back-cover copy,
 * painted by the image model, which sets display type better than compositing
 * SVG over a raster ever will. It carries NO author name and NO spine text,
 * deliberately, because those are the two places a generator is unreliable: a
 * 0.419in spine is a fraction of an inch of legibility with a fold on each side,
 * and an author's name has to be spelled exactly right forever.
 *
 * So this adds exactly those two things, as live type, measured:
 *   - "Drew Corley" on the front panel
 *   - the title and the author down the spine
 *
 * Geometry comes from the shared resolver. Nothing here computes a dimension.
 *
 *   yarn tsx scripts/train-the-dog-cover/finish.ts --art=<png>
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { resolveCoverGeometry } from '../../src/pipeline/cover/compositor/geometry.js';
import { readInteriorPageCount } from '../../src/pipeline/cover/compositor/build-cover.js';
import { planArtwork, renderArtwork } from '../../src/pipeline/cover/compositor/artwork.js';
import { validateCover, worstStatus } from '../../src/pipeline/cover/compositor/validate.js';
import type { Check } from '../../src/pipeline/cover/compositor/validate.js';
import { renderProof } from '../../src/pipeline/cover/compositor/proof.js';
import { AUTHOR, BOOK, COVER_DIR, INTERIOR_NAME, INTERIOR_PDF, KDP_CONFIG, TITLE } from './book.js';
import { FACES, LAYOUT, PALETTE } from './design.js';
import { assertFontResolves, fitUniform, inkBox, planSpine, setStack } from './type.js';

const arg = (n: string, d?: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

const ARTWORK = arg('art');
if (!ARTWORK) throw new Error('--art=<png> is required');
const STEM_IN = arg('out');

/**
 * PAPERBACK or HARDCOVER, from the same approved artwork.
 *
 * A hardcover is not a paperback with a wider spine: the case wraps boards that
 * are LARGER than the trim, and there is a hinge either side of the spine. All
 * of that comes out of the shared resolver, which was checked against KDP's own
 * calculator on 2026-09-02 and matched to the thousandth of an inch.
 */
const BINDING = (arg('binding', 'PAPERBACK') as 'PAPERBACK' | 'HARDCOVER');

/** KDP's own spine-safe LENGTH, from the dated calculator readings. */
const KDP_SPINE_SAFE_LENGTH_IN = BINDING === 'HARDCOVER' ? 8.986 : 8.75;

for (const f of [FACES.author, FACES.spineTitle, FACES.spineAuthor]) {
  await assertFontResolves(f.family, f.weight);
}

// ── geometry, from the interior that is actually shipping ──────────────────
const interiorPdf = readFileSync(INTERIOR_PDF);
const pageCount = await readInteriorPageCount(interiorPdf);
const g = resolveCoverGeometry({ ...KDP_CONFIG, binding: BINDING, pageCount });

const DPI = 300;
const WPX = Math.round(g.fullWidthIn * DPI);
const HPX = Math.round(g.fullHeightIn * DPI);
const px = (i: number) => i * DPI;

// ── place the artwork ──────────────────────────────────────────────────────
const artwork = readFileSync(ARTWORK);
const artworkPlan = await planArtwork(artwork, g, { mode: 'cover', renderDpi: DPI });
let composed = await renderArtwork(artwork, artworkPlan);

/**
 * INSET THE ARTWORK AND EXTEND ITS OWN BACKGROUND TO FILL THE REST.
 *
 * A hardcover's safe inset is 0.635in against a paperback's 0.25in, because the
 * case has to allow for the boards and the hinge. Artwork composed for the
 * paperback therefore lands too far out: measured on the first hardcover
 * composite, the back copy's left edge sat at 0.540in, which is PAST the board
 * edge at 0.591in -- those letters would have wrapped around the board and been
 * glued to the inside.
 *
 * The approved artwork is not regenerated for this. It is placed smaller and
 * centred, and the band left around it is filled by stretching the artwork's
 * own outermost row and column outward. The edges of this design are flat blue,
 * so the extension is invisible, and it is the same technique that removed the
 * seam when the picture was first slid down the panel.
 */
const insetFrac = Number(arg('inset', '0'));
if (insetFrac > 0) {
  const innerW = Math.round(WPX * (1 - insetFrac));
  const innerH = Math.round(HPX * (1 - insetFrac));
  const offX = Math.round((WPX - innerW) / 2);
  const offY = Math.round((HPX - innerH) / 2);
  const inner = await sharp(composed).resize(innerW, innerH, { kernel: 'lanczos3' }).toBuffer();

  /**
   * MIRROR the edge outward. Do NOT stretch it.
   *
   * The first version replicated the outermost pixel column across the whole
   * band. On flat blue that is invisible; on the grass strip and the boy's
   * sleeve it drags them into horizontal streaks, and that distortion reached a
   * cover the owner was asked to approve. Mirroring reflects the adjacent strip
   * instead, so grass continues as grass and the join is a plausible
   * continuation rather than a smear.
   */
  const mirrorL = await sharp(inner)
    .extract({ left: 0, top: 0, width: Math.min(offX, innerW), height: innerH })
    .flop().toBuffer();
  const mirrorR = await sharp(inner)
    .extract({ left: Math.max(0, innerW - (WPX - offX - innerW)), top: 0,
               width: Math.min(WPX - offX - innerW, innerW), height: innerH })
    .flop().toBuffer();
  const band = await sharp({ create: { width: WPX, height: innerH, channels: 3, background: '#000' } })
    .composite([
      { input: mirrorL, left: 0, top: 0 },
      { input: mirrorR, left: offX + innerW, top: 0 },
      { input: inner, left: offX, top: 0 },
    ]).png().toBuffer();
  const mirrorT = await sharp(band)
    .extract({ left: 0, top: 0, width: WPX, height: Math.min(offY, innerH) })
    .flip().toBuffer();
  const mirrorB = await sharp(band)
    .extract({ left: 0, top: Math.max(0, innerH - (HPX - offY - innerH)),
               width: WPX, height: Math.min(HPX - offY - innerH, innerH) })
    .flip().toBuffer();
  composed = await sharp({ create: { width: WPX, height: HPX, channels: 3, background: '#000' } })
    .composite([
      { input: mirrorT, left: 0, top: 0 },
      { input: mirrorB, left: 0, top: offY + innerH },
      { input: band, left: 0, top: offY },
    ]).png().toBuffer();
}

// ── find the clear band on the front panel, rather than assuming one ───────
/**
 * The author's baseline is NOT a constant. The artwork decides where the dog's
 * paws stop, and that moves between rounds; a hard-coded baseline prints the
 * name through the dog's feet on the next render. So the panel is read: rows
 * are scanned for pixels that differ from the panel's own background blue, and
 * the name is placed inside the lowest genuinely empty band.
 */
const panelLeftPx = Math.round(px(g.frontPanel.xIn));
const panelWPx = Math.round(px(g.panelWidthIn));
const scanTopPx = Math.round(px(5.5));
const scanHPx = Math.round(px(g.frontPanel.yIn + g.panelHeightIn - g.safeInsetIn)) - scanTopPx;
const { data: pan, info: panInfo } = await sharp(composed)
  .extract({ left: panelLeftPx, top: scanTopPx, width: panelWPx, height: scanHPx })
  .raw()
  .toBuffer({ resolveWithObject: true });
const ch = panInfo.channels;
/** Background = the most common colour in the scanned band, i.e. the blue. */
const sampleAt = (x: number, y: number) => {
  const i = (y * panInfo.width + x) * ch;
  return [pan[i]!, pan[i + 1]!, pan[i + 2]!];
};
const bg = sampleAt(4, 4);
const differs = (x: number, y: number) => {
  const [r, gg, b] = sampleAt(x, y);
  return Math.abs(r - bg[0]!) + Math.abs(gg - bg[1]!) + Math.abs(b - bg[2]!) > 60;
};
const rowBusy: boolean[] = [];
for (let y = 0; y < panInfo.height; y += 1) {
  let n = 0;
  for (let x = 0; x < panInfo.width; x += 4) if (differs(x, y)) n += 1;
  rowBusy.push(n > panInfo.width / 4 / 60);
}
/** The lowest run of clear rows tall enough to hold the name with air around it. */
const needPx = Math.round(px(LAYOUT.authorCapIn * 2.4));
let bandTop = -1;
let bandBottom = -1;
let run = 0;
for (let y = 0; y < rowBusy.length; y += 1) {
  if (!rowBusy[y]) {
    run += 1;
    if (run >= needPx) {
      bandTop = y - run + 1;
      bandBottom = y;
    }
  } else run = 0;
}
/**
 * WHEN THERE IS NO EMPTY BAND, SET THE NAME OVER THE ARTWORK ON PURPOSE.
 *
 * The kids-direction cover fills its lower half with the boy, the dog and the
 * grass; the only genuinely blank strip is 0.25in tall at the very foot, which
 * cannot hold the name at a readable size. Refusing outright was wrong -- an
 * author name at the foot of a cover, in white over the picture with a dark
 * halo under the letterform, is the ordinary solution and it is what the design
 * wants. What matters is that it is a DECLARED fallback that reports itself,
 * not a silent slide from "empty band" to "on top of the dog's face".
 *
 * The fallback baseline is measured up from the bottom trim and is checked
 * against the safe area like everything else.
 */
let overArtwork = false;
let bandTopIn: number;
let bandBottomIn: number;
if (bandTop < 0) {
  overArtwork = true;
  const safeBottomIn = g.frontSafe.yIn + g.frontSafe.heightIn;
  const baseIn = safeBottomIn - LAYOUT.authorFootClearIn;
  bandTopIn = baseIn - LAYOUT.authorCapIn;
  bandBottomIn = baseIn;
} else {
  bandTopIn = (scanTopPx + bandTop) / DPI;
  bandBottomIn = (scanTopPx + bandBottom) / DPI;
}

// ── front author, live type ────────────────────────────────────────────────
const authorFit = await fitUniform([AUTHOR], FACES.author, px(LAYOUT.authorMaxWidthIn), px(LAYOUT.authorCapIn));
/** Centred in the clear band, not measured up from the trim: the band is the constraint. */
const authorBaselinePx = px((bandTopIn + bandBottomIn) / 2) + authorFit.capPx / 2;
const author = await setStack({
  lines: [AUTHOR],
  style: FACES.author,
  centreXPx: px(g.frontPanel.xIn + g.panelWidthIn / 2),
  firstBaselinePx: authorBaselinePx,
  sizePx: authorFit.sizePx,
  leadingEm: 1,
  fill: PALETTE.titleInk,
  halo: PALETTE.halo,
  /** A heavier halo when the name crosses the picture, so it holds over grass. */
  haloEm: overArtwork ? LAYOUT.authorHaloOverArtEm : LAYOUT.haloEm,
  wrapWidthPx: WPX,
  wrapHeightPx: HPX,
  scanRegion: { left: panelLeftPx, top: authorBaselinePx - px(1), width: panelWPx, height: px(1.6) },
});
composed = await sharp(composed).composite([{ input: Buffer.from(author.svg), left: 0, top: 0 }]).toBuffer();

// ── spine, live type ───────────────────────────────────────────────────────
const spine = await planSpine({
  title: TITLE,
  author: AUTHOR,
  titleStyle: FACES.spineTitle,
  authorStyle: FACES.spineAuthor,
  spineWidthPx: Math.round(px(g.spineIn)),
  wrapHeightPx: HPX,
  safeLengthPx: px(KDP_SPINE_SAFE_LENGTH_IN),
  gapPx: px(LAYOUT.spineGapIn),
  /** House margin ABOVE KDP's 0.0625in floor: sizing to the floor leaves nothing for press wander. */
  targetClearPx: px(g.foldVarianceIn * LAYOUT.spineClearanceFactor),
  fill: PALETTE.titleInk,
  halo: PALETTE.halo,
  haloEm: LAYOUT.haloEm,
  minSizePx: 18,
});
composed = await sharp(composed)
  .composite([{ input: Buffer.from(spine.svg), left: Math.round(px(g.foldLeftIn)), top: 0 }])
  .toBuffer();

// ── validate ───────────────────────────────────────────────────────────────
const checks: Check[] = validateCover({
  geometry: g,
  artwork: artworkPlan,
  spineText: { requested: true, placed: true, measuredClearPerSideIn: spine.measuredClearPerSidePx / DPI },
});

const safe = {
  l: px(g.frontSafe.xIn),
  r: px(g.frontSafe.xIn + g.frontSafe.widthIn),
  t: px(g.frontSafe.yIn),
  b: px(g.frontSafe.yIn + g.frontSafe.heightIn),
};
const aClear = {
  left: (author.ink.left - safe.l) / DPI,
  right: (safe.r - author.ink.right) / DPI,
  top: (author.ink.top - safe.t) / DPI,
  bottom: (safe.b - author.ink.bottom) / DPI,
};
const aWorst = Math.min(aClear.left, aClear.right, aClear.top, aClear.bottom);
checks.push({
  id: 'front_author_safe_area',
  label: 'Front author inside safe area',
  status: aWorst >= 0 ? 'PASS' : 'FAIL',
  detail:
    aWorst >= 0
      ? `"${AUTHOR}" clears the front safe area by ${aWorst.toFixed(3)}in at its tightest, measured off drawn ink ` +
        `with the halo included. ` +
        (overArtwork
          ? `Set OVER the artwork at the foot (${bandTopIn.toFixed(2)}-${bandBottomIn.toFixed(2)}in) with a heavier ` +
            `halo: the panel was read and has no empty band tall enough for the name.`
          : `Set inside a band of the panel that was read as empty (${bandTopIn.toFixed(2)}-${bandBottomIn.toFixed(2)}in), ` +
            `not at an assumed baseline.`)
      : `"${AUTHOR}" crosses the front safe area by ${Math.abs(aWorst).toFixed(3)}in.`,
});

/**
 * EDGE DISTORTION GATE.
 *
 * ADDED AFTER A SMEARED COVER WAS PUT IN FRONT OF THE OWNER FOR APPROVAL.
 * The inset padding used to replicate the outermost pixel column across the
 * whole band. Where the edge was flat blue that is invisible; where it crossed
 * the grass strip and the boy's sleeve it dragged them into horizontal streaks
 * that ran the full height of the wrap. Nothing in the pipeline noticed,
 * because every existing check measures POSITION -- is the type inside the safe
 * area, is the copy clear of the barcode -- and none of them looks at whether
 * the picture itself is intact.
 *
 * The signature of a stretched edge is precise and easy to test: adjacent
 * columns become identical while the column itself still varies vertically. A
 * mirrored edge does not do that, and a genuinely flat background edge has no
 * vertical variation to smear. So the rule is:
 *
 *     an outer band whose columns are near-identical to each other, while
 *     carrying real vertical detail, is a smear -- and it FAILS.
 */
const bandPx = Math.max(24, Math.round(WPX * 0.006));
const edgeReport: string[] = [];
let smeared = false;
for (const side of ['left', 'right'] as const) {
  const { data, info } = await sharp(composed)
    .extract({ left: side === 'left' ? 0 : WPX - bandPx, top: 0, width: bandPx, height: HPX })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => data[y * info.width + x]!;
  /** How much neighbouring COLUMNS differ. Near zero means the band was stretched. */
  let adj = 0;
  let n = 0;
  for (let y = 0; y < info.height; y += 3) {
    for (let x = 1; x < info.width; x += 1) {
      adj += Math.abs(at(x, y) - at(x - 1, y));
      n += 1;
    }
  }
  adj = n ? adj / n : 0;
  /** How much the band varies DOWN the page. Near zero means there is nothing to smear. */
  let vert = 0;
  let m = 0;
  for (let y = 3; y < info.height; y += 3) {
    vert += Math.abs(at(Math.floor(info.width / 2), y) - at(Math.floor(info.width / 2), y - 3));
    m += 1;
  }
  vert = m ? vert / m : 0;
  const bad = adj < 0.35 && vert > 1.2;
  if (bad) smeared = true;
  edgeReport.push(`${side}: column-to-column ${adj.toFixed(3)}, vertical detail ${vert.toFixed(2)}${bad ? '  <-- SMEARED' : ''}`);
}
checks.push({
  id: 'edge_distortion',
  label: 'Edges not stretched',
  status: smeared ? 'FAIL' : 'PASS',
  detail: smeared
    ? `An outer band is a replicated column: the picture is smeared at the trim. ${edgeReport.join('; ')}`
    : `No stretched edge. ${edgeReport.join('; ')}`,
});

const status: 'READY' | 'BLOCKED' = worstStatus(checks) === 'FAIL' ? 'BLOCKED' : 'READY';

// ── outputs ────────────────────────────────────────────────────────────────
const STEM = STEM_IN ?? `TTDYG-cover-${BINDING}-${pageCount}pp`;
const PROOF_DIR = `${COVER_DIR}/proof`;
mkdirSync(COVER_DIR, { recursive: true });
mkdirSync(PROOF_DIR, { recursive: true });

const flat = await sharp(composed).jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toBuffer();
const pdf = await PDFDocument.create();
const page = pdf.addPage([g.fullWidthIn * 72, g.fullHeightIn * 72]);
page.drawImage(await pdf.embedJpg(flat), { x: 0, y: 0, width: g.fullWidthIn * 72, height: g.fullHeightIn * 72 });
const productionPdf = Buffer.from(await pdf.save({ useObjectStreams: false }));

writeFileSync(`${COVER_DIR}/${STEM}.pdf`, productionPdf);
writeFileSync(`${COVER_DIR}/${STEM}.png`, await sharp(composed).png().toBuffer());
writeFileSync(`${PROOF_DIR}/${STEM}-GUIDES.png`, await renderProof(composed, g, { dpi: DPI, checks }));

const manifest = {
  book: BOOK,
  builtAt: new Date().toISOString(),
  artwork: { name: ARTWORK.split(/[\\/]/).pop(), sha256: sha256(artwork), sourcePx: `${artworkPlan.sourceWidthPx}x${artworkPlan.sourceHeightPx}` },
  interior: { name: INTERIOR_NAME, sha256: sha256(interiorPdf), pageCount },
  cover: { name: `${STEM}.pdf`, sha256: sha256(productionPdf) },
  ...KDP_CONFIG,
  binding: BINDING,
  spineIn: g.spineIn,
  fullWidthIn: g.fullWidthIn,
  fullHeightIn: g.fullHeightIn,
  geometryAuthority: g.spineAuthority,
  effectivePpi: artworkPlan.effectivePpi,
  liveType: {
    frontAuthor: { text: AUTHOR, sizePx: authorFit.sizePx, capIn: authorFit.capPx / DPI, bandIn: [bandTopIn, bandBottomIn] },
    spineTitle: { text: TITLE, sizePx: spine.titleSizePx },
    spineAuthor: { text: AUTHOR, sizePx: spine.authorSizePx },
    spineClearPerSideIn: spine.measuredClearPerSidePx / DPI,
  },
  paintedIntoArtwork: ['title', 'subtitle', 'back-cover copy'],
  checks,
  status,
};
writeFileSync(`${COVER_DIR}/${STEM}-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);

const L = (k: string, v: string) => `  ${k.padEnd(24)}${v}`;
const out: string[] = [''];
out.push(`COVER — ${BOOK}`);
out.push('='.repeat(78));
out.push(L('artwork', `${ARTWORK.split(/[\\/]/).pop()}  ${artworkPlan.sourceWidthPx}x${artworkPlan.sourceHeightPx}px`));
out.push(L('interior', `${INTERIOR_NAME}  ${pageCount}pp (read from the PDF)`));
out.push(L('binding', BINDING));
out.push(L('wrap', `${g.fullWidthIn.toFixed(4)} x ${g.fullHeightIn.toFixed(4)} in, spine ${g.spineIn.toFixed(4)} in`));
if (g.panelIsBoard) {
  out.push(L('board', `${g.panelWidthIn} x ${g.panelHeightIn} in (LARGER than the 6x9 trim)`));
  out.push(L('case wrap / hinge', `${g.outerMarginIn} in wrap, ${g.hingeIn} in hinge each side of the spine`));
}
out.push(L('effective PPI', `${artworkPlan.effectivePpi.toFixed(1)} against a ${g.minDpi} minimum`));
out.push(L('crop', `${artworkPlan.cropIn.leftIn.toFixed(3)}in per side`));
out.push('');
out.push('  LIVE TYPE ADDED BY THIS STEP');
out.push(L('  front author', `"${AUTHOR}" ${authorFit.sizePx}px, cap ${(authorFit.capPx / DPI).toFixed(3)}in`));
out.push(L('', overArtwork
  ? `set OVER the artwork at the foot (no empty band tall enough), heavier halo`
  : `set in the clear band ${bandTopIn.toFixed(2)}-${bandBottomIn.toFixed(2)}in, found by reading the panel`));
out.push(L('', `clearance to front safe: left ${aClear.left.toFixed(3)} right ${aClear.right.toFixed(3)} top ${aClear.top.toFixed(3)} bottom ${aClear.bottom.toFixed(3)} in`));
out.push(L('  spine title', `${spine.titleSizePx}px`));
out.push(L('  spine author', `${spine.authorSizePx}px`));
out.push(L('  spine clearance', `${(spine.measuredClearPerSidePx / DPI).toFixed(4)}in per side, measured off drawn ink with the halo`));
out.push(L('', `against KDP's ${g.spineTextClearancePerSideIn}in minimum`));
out.push('');
out.push(`  CHECKS (${checks.filter((c) => c.status === 'PASS').length} pass, ${checks.filter((c) => c.status === 'WARN').length} warn, ${checks.filter((c) => c.status === 'FAIL').length} fail)`);
for (const c of checks) out.push(`    [${c.status.padEnd(4)}] ${c.label}: ${c.detail}`);
out.push('');
out.push(L('production PDF', `${COVER_DIR}/${STEM}.pdf`));
out.push(L('flat PNG', `${COVER_DIR}/${STEM}.png`));
out.push(L('guided proof', `${PROOF_DIR}/${STEM}-GUIDES.png`));
out.push(L('STATUS', status));
out.push('');
console.log(out.join('\n'));
