import sharp from 'sharp';
import { readdirSync } from 'node:fs';
const D = 'C:/Users/jovan/Downloads/before-you-need-it/06-PRODUCTION/illustrations';
const files = readdirSync(D).filter((f) => f.endsWith('.png') && !f.startsWith('_')).sort();
const CW = 512, CH = 341, COLS = 3;
const rows = Math.ceil(files.length / COLS);
const tiles = await Promise.all(files.map(async (f, i) => ({
  input: await sharp(`${D}/${f}`).resize(CW, CH, { fit: 'contain', background: '#ffffff' }).toBuffer(),
  left: (i % COLS) * CW,
  top: Math.floor(i / COLS) * CH,
})));
await sharp({ create: { width: CW * COLS, height: CH * rows, channels: 3, background: '#e8e8e8' } })
  .composite(tiles).png().toFile(`${D}/_contact-sheet.png`);
console.log(files.map((f, i) => `${i + 1}. ${f}`).join('\n'));
console.log(`\n-> ${D}/_contact-sheet.png`);
process.exit(0);
