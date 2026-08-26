import sharp from 'sharp';
const SRC = process.argv[2]!;
const meta = await sharp(SRC).metadata();
const W = meta.width!, H = meta.height!;
const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const ch = info.channels;
const lum = (x: number, y: number): number => {
  const i = (y * info.width + x) * ch;
  return 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
};
const ys: number[] = []; for (let y = 2; y < H - 2; y += 2) ys.push(y);
const sd = (x: number): number => {
  const l = ys.map((y) => lum(x, y));
  const m = l.reduce((a, v) => a + v, 0) / l.length;
  return Math.sqrt(l.reduce((a, v) => a + (v - m) ** 2, 0) / l.length);
};
console.log(`art ${SRC}  ${W} x ${H}`);
const c = Math.round(W / 2);
let a = c, b = c;
while (a - 1 >= 0 && sd(a - 1) < 12) a -= 1;
while (b + 1 < W && sd(b + 1) < 12) b += 1;
console.log(`centre sd=${sd(c).toFixed(2)}   flat band: ${a}..${b}  (${b - a + 1}px of ${W})`);
for (let x = a - 8; x <= a + 3; x += 1) console.log(`  L x=${x}  sd=${sd(x).toFixed(2)}`);
for (let x = b - 3; x <= b + 8; x += 1) console.log(`  R x=${x}  sd=${sd(x).toFixed(2)}`);
console.log(`\nback scene 0..${a - 1} = ${a}px   front scene ${b + 1}..${W - 1} = ${W - 1 - b}px`);
