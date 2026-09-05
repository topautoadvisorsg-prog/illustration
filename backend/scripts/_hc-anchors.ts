import { VERIFIED_SPECS } from '../src/pipeline/publishing-standard/kdp-cover-specs.js';
const hc = VERIFIED_SPECS.filter((s) => s.config.binding === 'HARDCOVER');
console.log(`HARDCOVER verified anchors: ${hc.length}\n`);
console.log('trim       ink                paper  pages  spine     fullW      fullH      wrap    hinge   margin');
for (const s of hc.sort((a, b) => a.config.pageCount - b.config.pageCount)) {
  const c = s.config;
  console.log(
    `${c.trimSize.padEnd(10)} ${c.interiorType.padEnd(18)} ${c.paperType.padEnd(6)} ${String(c.pageCount).padStart(5)}  ` +
    `${s.spineIn.toFixed(4)}  ${s.fullWidthIn.toFixed(4)}  ${s.fullHeightIn.toFixed(4)}  ` +
    `${s.wrapIn.toFixed(3)}  ${s.hingeIn.toFixed(3)}  ${s.marginIn.toFixed(3)}`,
  );
}
console.log('\nspine per page, by anchor:');
for (const s of hc.sort((a, b) => a.config.pageCount - b.config.pageCount)) {
  console.log(`  ${s.config.pageCount}pp ${s.config.trimSize} ${s.config.paperType}: ${s.spineIn.toFixed(4)} -> ${(s.spineIn / s.config.pageCount).toFixed(6)} in/pp`);
}
process.exit(0);
