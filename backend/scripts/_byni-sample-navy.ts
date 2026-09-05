import sharp from 'sharp';
const F = 'C:/Users/jovan/Downloads/before-you-need-it/06-PRODUCTION/cover/BYNI-cover-wrap-art-A_1536x1024.png';
const { data, info } = await sharp(F).raw().toBuffer({ resolveWithObject: true });
const px = (x: number, y: number) => {
  const i = (y * info.width + x) * info.channels;
  return [data[i]!, data[i + 1]!, data[i + 2]!] as const;
};
// Title "BEFORE" sits roughly x 840..1200, y 80..200 in the 1536x1024 art.
const counts = new Map<string, number>();
for (let x = 840; x < 1200; x += 1) for (let y = 80; y < 200; y += 1) {
  const [r, g, b] = px(x, y);
  if (b > r + 25 && b > 60 && r < 110) counts.set(`${r},${g},${b}`, (counts.get(`${r},${g},${b}`) ?? 0) + 1);
}
const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log('most common navy pixels in the title:');
for (const [rgb, n] of top) {
  const [r, g, b] = rgb.split(',').map(Number);
  console.log(`  rgb(${rgb})  #${[r, g, b].map((v) => v!.toString(16).padStart(2, '0')).join('')}  x${n}`);
}
process.exit(0);
