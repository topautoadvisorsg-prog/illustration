/** Read-only: prove the repeated header is in the shipped PDF. */
import { readFileSync } from 'node:fs';
import { buildPageModel } from '../src/pipeline/page-qa/page-model.js';
const PDF = process.argv[2]!;
const model = await buildPageModel(readFileSync(PDF));
for (const n of [162, 163]) {
  const p = model.pages.find((x) => x.n === n);
  if (!p) { console.log(`p${n}: not found`); continue; }
  const lines = p.lines.map((l) => l.text.trim()).filter(Boolean);
  console.log(`\n=== p${n} — first 4 text lines ===`);
  for (const l of lines.slice(0, 4)) console.log('   ' + l.slice(0, 78));
  const joined = lines.join(' ');
  console.log(`   HAS "wondering": ${joined.includes('wondering')}   HAS "Go to": ${joined.includes('Go to')}`);
}
process.exit(0);
