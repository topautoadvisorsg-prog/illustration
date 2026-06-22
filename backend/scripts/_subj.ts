/* Print each page's resolved illustration subject (so I can spot continuations
 * with a garbage page-key subject that need set-page-subject). Read-only.
 * Usage: _subj.ts <key...> */
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';
import { prepareRender } from '../src/pipeline/whole-page-render/render-whole-page.js';
import { P } from './_project.js';

const db = getDb();
for (const KEY of process.argv.slice(2)) {
  const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
  if (!row) { console.log(KEY.padEnd(16), 'NOT FOUND'); continue; }
  const prep = await prepareRender(row.id);
  console.log(KEY.padEnd(16), '|', prep.spec.illustrationDNA.subject.primary.slice(0, 110));
}
process.exit(0);
