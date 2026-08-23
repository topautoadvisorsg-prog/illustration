import { readFileSync } from 'node:fs';
import { PDFDocument, PDFName, PDFDict, PDFRawStream } from 'pdf-lib';
import sharp from 'sharp';

const PDF = process.argv[2]!;
const WRAP_W = Number(process.argv[3]!);
/** Rows to measure, in inches: the blurb block and the label under it. */
const BANDS: Array<[string, number, number]> = [
  ['blurb tail', 2.9, 3.22],
  ['PARK LIST', 3.25, 3.75],
  ['INSIDE THIS VOLUME', 3.78, 3.96],
];
const CROP: [number, number] = [2.8, 4.2];

const doc = await PDFDocument.load(readFileSync(PDF), { updateMetadata: false });
const xo = doc.getPages()[0]!.node.Resources()!.lookupMaybe(PDFName.of('XObject'), PDFDict)!;
let art: Buffer | undefined;
for (const k of xo.keys()) {
  const raw = xo.context.lookup(xo.get(k));
  const d = raw instanceof PDFDict ? raw : (raw as { dict?: InstanceType<typeof PDFDict> })?.dict;
  if (!d || String(d.get(PDFName.of('Subtype')) ?? '') !== '/Image') continue;
  art = Buffer.from((raw as PDFRawStream).contents);
}
if (!art) throw new Error('no image');
const m = await sharp(art).metadata();
const px = m.width! / WRAP_W;
const W = Math.round(6.125 * px);
const { data, info } = await sharp(art)
  .extract({ left: 0, top: 0, width: W, height: m.height! })
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

for (const [name, a, b] of BANDS) {
  const y0 = Math.round(a * px);
  const y1 = Math.round(b * px);
  let left = info.width;
  let right = -1;
  for (let y = y0; y < y1; y += 1) {
    for (let x = 0; x < Math.round(4.9 * px); x += 1) {
      if (data[y * info.width + x]! > 225) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  console.log(
    `${name.padEnd(20)} left ${(left / px).toFixed(3)}in   right ${(right / px).toFixed(3)}in   measure ${((right - left) / px).toFixed(3)}in`,
  );
}

{
  const y0 = Math.round(CROP[0] * px);
  const y1 = Math.round(CROP[1] * px);
  await sharp(art)
    .extract({ left: 0, top: y0, width: W, height: y1 - y0 })
    .png()
    .toFile(process.argv[4]!);
  console.log(`
crop ${CROP[0]}-${CROP[1]}in -> ${process.argv[4]}`);
}
process.exit(0);
