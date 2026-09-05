import sharp from 'sharp';
const D = 'C:/Users/jovan/Downloads/before-you-need-it/06-PRODUCTION/cover';
for (const id of ['A', 'B']) {
  await sharp(`${D}/BYNI-cover-wrap-art-${id}_1536x1024.png`)
    .extract({ left: 481, top: 855, width: 234, height: 140 })
    .resize({ width: 702 })
    .toFile(`${D}/_qa-barcode-zone-${id}.png`);
  console.log(`wrote _qa-barcode-zone-${id}.png (3x zoom of the 2.0x1.2in reserve)`);
}
process.exit(0);
