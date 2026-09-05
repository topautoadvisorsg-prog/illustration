import { VERIFIED_SPECS } from '../src/pipeline/publishing-standard/kdp-cover-specs.js';
const hc = VERIFIED_SPECS.filter((s) => s.config.binding === 'HARDCOVER');
const trimOf = (t: string) => t.split('x').map(Number) as [number, number];
console.log('offset from trim, per anchor:');
console.log('trim   pp   fullW-spine-2W  fullH-H   frontW-W  frontH-H  spineSafeW-spine  spineSafeH');
for (const s of hc) {
  const [tw, th] = trimOf(s.config.trimSize);
  console.log(
    `${s.config.trimSize.padEnd(6)} ${String(s.config.pageCount).padStart(4)}  ` +
    `${(s.fullWidthIn - s.spineIn - 2 * tw).toFixed(4)}         ` +
    `${(s.fullHeightIn - th).toFixed(4)}    ` +
    `${(s.frontWidthIn - tw).toFixed(4)}    ` +
    `${(s.frontHeightIn - th).toFixed(4)}    ` +
    `${(s.spineSafeWidthIn - s.spineIn).toFixed(4)}           ` +
    `${s.spineSafeHeightIn.toFixed(4)}`,
  );
}
// spine model: spine = board + pages * factor
const fam = (s: typeof hc[number]) => `${s.config.interiorType}/${s.config.paperType}`;
const groups = new Map<string, typeof hc>();
for (const s of hc) { const k = fam(s); groups.set(k, [...(groups.get(k) ?? []), s]); }
console.log('\nspine model per ink/paper (least squares over ALL trims):');
for (const [k, list] of groups) {
  if (list.length < 2) { console.log(`  ${k}: only ${list.length} anchor, skipped`); continue; }
  const n = list.length;
  const sx = list.reduce((a, s) => a + s.config.pageCount, 0);
  const sy = list.reduce((a, s) => a + s.spineIn, 0);
  const sxy = list.reduce((a, s) => a + s.config.pageCount * s.spineIn, 0);
  const sxx = list.reduce((a, s) => a + s.config.pageCount ** 2, 0);
  const factor = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const board = (sy - factor * sx) / n;
  let worst = 0;
  for (const s of list) worst = Math.max(worst, Math.abs(board + factor * s.config.pageCount - s.spineIn));
  console.log(`  ${k}: board ${board.toFixed(6)}in + ${factor.toFixed(6)} in/pp   worst residual ${worst.toFixed(5)}in  (${n} anchors)`);
}
process.exit(0);
