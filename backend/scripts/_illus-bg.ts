import sharp from 'sharp';
import { readdirSync } from 'node:fs';
const D = 'C:/Users/jovan/Downloads/before-you-need-it/06-PRODUCTION/illustrations';
for (const f of readdirSync(D).filter((x) => x.endsWith('.png') && !x.startsWith('_'))) {
  const { data, info } = await sharp(`${D}/${f}`).raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => {
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]].join(',');
  };
  console.log(`${f.padEnd(34)} corners: ${at(2, 2)} | ${at(info.width - 3, 2)} | ${at(2, info.height - 3)} | ${at(info.width - 3, info.height - 3)}`);
}
process.exit(0);
