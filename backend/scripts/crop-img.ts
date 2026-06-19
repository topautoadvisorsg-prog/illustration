import sharp from 'sharp';
const [src, dst, left, top, w, h, scale] = process.argv.slice(2);
const img = sharp(src);
const meta = await img.metadata();
console.log('src size:', meta.width, 'x', meta.height);
const region = { left: +left, top: +top, width: +w, height: +h };
await sharp(src).extract(region).resize({ width: Math.round(+w * +scale) }).png().toFile(dst);
console.log('cropped →', dst);
process.exit(0);
