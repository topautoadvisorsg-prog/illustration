/** Crop both spine versions and stack them for a like-for-like look. */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
const DIR = 'C:/Users/jovan/Downloads/before-you-need-it/06-PRODUCTION/cover';
const kind = process.argv[2] ?? 'PAPERBACK';
const files: Array<[string, string]> = [
  ['A  black, author at the foot', `${DIR}/BYNI-cover-${kind}-175pp-PROOF.png`],
  ['B  navy, author lifted 0.30in', `${DIR}/BYNI-cover-${kind}-175pp-VERSION-B-navy-spine-PROOF.png`],
];
const strips: Buffer[] = [];
for (const [label, f] of files) {
  const m = await sharp(f).metadata();
  const w = m.width!, h = m.height!;
  const strip = Math.round(w * 0.075);
  const cut = await sharp(f)
    .extract({ left: Math.round(w / 2 - strip / 2), top: 0, width: strip, height: h })
    .rotate(-90)
    .png()
    .toBuffer();
  strips.push(cut);
  const px = await sharp(cut).greyscale().raw().toBuffer();
  let min = 255;
  for (const v of px) if (v < min) min = v;
  console.log(`${label.padEnd(32)} darkest pixel ${min}/255`);
}
const metas = await Promise.all(strips.map((b) => sharp(b).metadata()));
const W = Math.max(...metas.map((m) => m.width!));
const H = metas.reduce((a, m) => a + m.height! + 16, 0);
const out = await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
  .composite(strips.map((input, i) => ({ input, left: 0, top: i * (metas[0]!.height! + 16) })))
  .png()
  .toBuffer();
writeFileSync(`${DIR}/_spine-compare-${kind}.png`, out);
console.log(`-> _spine-compare-${kind}.png`);
process.exit(0);
