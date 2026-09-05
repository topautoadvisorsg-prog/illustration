/** Read-only: canonical paperback wrap geometry for BEFORE YOU NEED IT. */
import { computeCoverDimensions, coverAllowsSpineText, PAGE_THICKNESS_IN, COVER_BLEED_IN } from '../src/pipeline/publishing-standard/cover-dimensions.js';
import { CONFIG } from './before-you-need-it-config.js';

console.log('PAGE_THICKNESS_IN :', JSON.stringify(PAGE_THICKNESS_IN));
console.log('COVER_BLEED_IN    :', COVER_BLEED_IN);
for (const pp of [156, 170, 184]) {
  const d = computeCoverDimensions(CONFIG, pp);
  console.log(`\n=== ${pp}pp ===`);
  for (const [k, v] of Object.entries(d)) {
    console.log(`   ${k.padEnd(22)} ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  }
}
console.log(`\nspine text allowed at 184pp: ${coverAllowsSpineText(184)}`);
process.exit(0);
