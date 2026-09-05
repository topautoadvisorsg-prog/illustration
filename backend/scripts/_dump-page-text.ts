/** Read-only: dump the text of given pages from a rendered PDF. */
import { readFileSync } from 'node:fs';
import { buildPageModel } from '../src/pipeline/page-qa/page-model.js';
const PDF = process.argv[2]!;
const want = process.argv.slice(3).map(Number);
const model = await buildPageModel(readFileSync(PDF));
for (const n of want) {
  const p = model.pages.find((x) => x.n === n);
  if (!p) { console.log(`\n=== p${n}: not found ===`); continue; }
  const lines = p.lines.map((l) => l.text.trim()).filter(Boolean);
  console.log(`\n=== p${n} (${lines.length} lines) ===`);
  for (const l of lines) console.log('   ' + l.slice(0, 92));
}
process.exit(0);
