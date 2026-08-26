import sharp from 'sharp';
const [src, out, l, t, w, h, scale] = process.argv.slice(2);
await sharp(src!)
  .extract({ left: Number(l), top: Number(t), width: Number(w), height: Number(h) })
  .resize({ width: Math.round(Number(w) * Number(scale ?? 1)) })
  .png()
  .toFile(out!);
console.log(`${out} <- [${l},${t} ${w}x${h}] x${scale ?? 1}`);
