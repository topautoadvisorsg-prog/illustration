/**
 * PULL THE SPINE OUT OF A FINISHED COVER PDF AND LOOK AT IT.
 *
 * A spine is a few hundred pixels wide on a wrap several thousand wide. At any
 * zoom that shows the whole cover it is a sliver, and two defects hid there on
 * this platform's covers before anyone saw them:
 *
 *   - cream type over a sunlit sky, invisible for the first six characters while
 *     the rest of the title read perfectly against dark rock
 *   - a title long enough to run straight through the author block, the two
 *     printing on top of each other
 *
 * Both were obvious the moment the strip was cropped out and turned the right way
 * up. Neither was visible in a full-wrap proof, and no geometry check can see
 * them — they are about contrast and length, not dimensions.
 *
 * Read-only. Extracts the wrap raster the PDF already carries; renders nothing.
 *
 *   npx tsx scripts/cover-spine-proof.ts <coverPdf> <wrapWidthIn> <spineIn> <outPng>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument, PDFName, PDFDict, PDFRawStream } from 'pdf-lib';
import sharp from 'sharp';

const PDF = process.argv[2];
const WRAP_W = Number(process.argv[3]);
const SPINE = Number(process.argv[4]);
const OUT = process.argv[5];
if (!PDF || !OUT || !Number.isFinite(WRAP_W) || !Number.isFinite(SPINE)) {
  throw new Error('usage: cover-spine-proof.ts <coverPdf> <wrapWidthIn> <spineIn> <outPng>');
}

const doc = await PDFDocument.load(readFileSync(PDF), { updateMetadata: false });
const page = doc.getPages()[0]!;
const xo = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
if (!xo) throw new Error('this cover has no image XObject — is it a vector cover?');

let art: Buffer | undefined;
for (const k of xo.keys()) {
  const raw = xo.context.lookup(xo.get(k));
  const d = raw instanceof PDFDict ? raw : (raw as { dict?: InstanceType<typeof PDFDict> })?.dict;
  if (!d || String(d.get(PDFName.of('Subtype')) ?? '') !== '/Image') continue;
  art = Buffer.from((raw as PDFRawStream).contents);
}
if (!art) throw new Error('no image found on page 1');

const meta = await sharp(art).metadata();
const px = meta.width! / WRAP_W;

/** A little of each neighbouring panel, so the spine's edges are visible too. */
const PAD_IN = 0.5;
const left = Math.round(((WRAP_W - SPINE) / 2 - PAD_IN) * px);
const width = Math.round((SPINE + PAD_IN * 2) * px);

const strip = await sharp(art)
  .extract({ left, top: 0, width, height: meta.height! })
  .toBuffer();
/** Turned so the spine reads left to right, the way it is printed. */
const out = await sharp(strip).rotate(-90).png().toBuffer();
writeFileSync(OUT, out);

const o = await sharp(out).metadata();
console.log(`wrap  : ${meta.width} x ${meta.height} px (${px.toFixed(0)} px/in)`);
console.log(`spine : ${SPINE} in plus ${PAD_IN} in either side`);
console.log(`file  : ${OUT} (${o.width} x ${o.height})`);
process.exit(0);
