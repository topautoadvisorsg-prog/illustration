/* Detect which entries contain sub-headings (h3/h4) — the blocks that can orphan
 * at the bottom of a Kindle screen. Read-only. */
import { assembleProjectModel } from '../src/pipeline/stage-8-epub/build-epub.js';
import { P } from './_project.js';
const { model } = await assembleProjectModel(P);
let total = 0; const hits: string[] = [];
for (const c of model.chapters) {
  if (c.entries) {
    for (const e of c.entries) {
      const n = (e.bodyHtml.match(/<h[34]>/g) || []).length;
      if (n) { total += n; hits.push(`  ${c.title} › ${e.title} — ${n} sub-heading(s)`); }
    }
  } else if (c.content) {
    const n = (c.content.match(/<h[34]>/g) || []).length;
    if (n) { total += n; hits.push(`  [${c.kind}] ${c.title} — ${n} sub-heading(s)`); }
  }
}
console.log(`Sub-headings (h3/h4) that can orphan: ${total} across ${hits.length} sections\n`);
console.log(hits.join('\n'));
process.exit(0);
