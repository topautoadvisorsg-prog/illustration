import { VERIFIED_SPECS, getKdpCoverDimensions } from '../src/pipeline/publishing-standard/kdp-cover-specs.js';
let bad = 0;
console.log('1. every stored reading still returns VERIFIED and exact:');
for (const s of VERIFIED_SPECS) {
  const d = getKdpCoverDimensions(s.config);
  const ok = d.provenance === 'verified' && Math.abs(d.spineIn - s.spineIn) < 1e-9 &&
    Math.abs(d.fullWidthIn - s.fullWidthIn) < 1e-9 && Math.abs(d.fullHeightIn - s.fullHeightIn) < 1e-9;
  if (!ok) { bad += 1; console.log(`   FAIL ${s.config.trimSize} ${s.config.pageCount}pp`); }
}
console.log(`   ${VERIFIED_SPECS.length - bad}/${VERIFIED_SPECS.length} exact\n`);

console.log('2. ACCEPTANCE — reproduce the shipped NO ONE TOLD ME THAT hardcover');
console.log('   (5.5x8.5, 170pp, CREAM — no anchor exists at this trim)');
const nottm = getKdpCoverDimensions({
  binding: 'HARDCOVER', coverType: 'CASE_LAMINATE', interiorType: 'BLACK_AND_WHITE',
  paperType: 'CREAM', trimSize: '5.5x8.5', pageCount: 170,
});
const want = { fullWidthIn: 13.189, fullHeightIn: 9.917, spineIn: 0.614 };
for (const k of ['spineIn', 'fullWidthIn', 'fullHeightIn'] as const) {
  const got = nottm[k], exp = want[k], delta = Math.abs(got - exp);
  console.log(`   ${k.padEnd(13)} model ${got.toFixed(4)}  shipped ${exp.toFixed(4)}  delta ${delta.toFixed(5)}in ${delta < 0.001 ? 'PASS' : 'FAIL'}`);
  if (delta >= 0.001) bad += 1;
}
console.log(`   provenance: ${nottm.provenance}\n`);

console.log('3. BEFORE YOU NEED IT — 5.5x8.5 hardcover, 184pp, WHITE');
const byni = getKdpCoverDimensions({
  binding: 'HARDCOVER', coverType: 'CASE_LAMINATE', interiorType: 'BLACK_AND_WHITE',
  paperType: 'WHITE', trimSize: '5.5x8.5', pageCount: 184,
});
console.log(`   spine        ${byni.spineIn.toFixed(4)}in`);
console.log(`   wrap         ${byni.fullWidthIn.toFixed(4)} x ${byni.fullHeightIn.toFixed(4)}in`);
console.log(`   front panel  ${byni.frontWidthIn.toFixed(4)} x ${byni.frontHeightIn.toFixed(4)}in`);
console.log(`   wrap/hinge   ${byni.wrapIn} / ${byni.hingeIn}in`);
console.log(`   provenance   ${byni.provenance}`);
process.exit(bad ? 1 : 0);
