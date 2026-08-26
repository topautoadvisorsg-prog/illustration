import sharp from 'sharp';
const SRC = process.argv[2]!;
const X0 = Number(process.argv[3] ?? 1500), X1 = Number(process.argv[4] ?? 2250);
const meta = await sharp(SRC).metadata();
const W = meta.width!, H = meta.height!;
const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const ch = info.channels;
const px = (x: number, y: number): [number, number, number] => {
  const i = (y * info.width + x) * ch;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
};
console.log(`src ${SRC}  ${W} x ${H}\n`);
for (const y of [200, 500, 900, 1400, 1900, 2300, 2600].filter((v) => v < H)) {
  // walk out from the centre of the region while the colour stays near the centre colour
  const cx = Math.round((X0 + X1) / 2);
  const [cr, cg, cb] = px(cx, y);
  const near = (x: number): boolean => {
    const [r, g, b] = px(x, y);
    return Math.abs(r - cr) < 14 && Math.abs(g - cg) < 14 && Math.abs(b - cb) < 14;
  };
  let l = cx; while (l > 0 && near(l - 1)) l -= 1;
  let r = cx; while (r < W - 1 && near(r + 1)) r += 1;
  console.log(`y=${String(y).padStart(4)}  centre rgb(${cr},${cg},${cb})  flat run ${l}..${r} (${r - l + 1}px, ${((r - l + 1) / 300).toFixed(3)}in)`);
}
console.log(`\ncolumn sd over the region (step 6):`);
const ys: number[] = []; for (let y = 20; y < H - 20; y += 7) ys.push(y);
for (let x = X0; x <= X1; x += 6) {
  const l: number[] = []; let sr = 0, sg = 0, sb = 0;
  for (const y of ys) { const [r, g, b] = px(x, y); sr += r; sg += g; sb += b; l.push(0.299 * r + 0.587 * g + 0.114 * b); }
  const n = ys.length, mL = l.reduce((a, v) => a + v, 0) / n;
  const sd = Math.sqrt(l.reduce((a, v) => a + (v - mL) ** 2, 0) / n);
  console.log(`  x=${String(x).padStart(4)}  sd=${sd.toFixed(1).padStart(6)}  rgb(${Math.round(sr / n)},${Math.round(sg / n)},${Math.round(sb / n)})${sd < 20 ? '  FLAT' : ''}`);
}
