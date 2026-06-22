/* Dump the EXACT prompt that was stored + sent for a page's active render (not a
 * rebuilt one) so we can see what the model actually got. Read-only.
 * Usage: _storedprompt.ts <pageKey> */
import { writeFileSync } from 'node:fs';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { P } from './_project.js';
const KEY = process.argv[2]!;
const db = getDb();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0]!;
const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0] as Record<string, unknown>;
const ap = (r.assembledPrompt as string) ?? '';
writeFileSync(`C:/Users/jovan/Downloads/_storedprompt_${KEY}.txt`, ap);
console.log(`${KEY} active v${r.version} — stored prompt → _storedprompt_${KEY}.txt (${ap.length} chars)`);
console.log('\n--- subject + continuation excerpts ---');
for (const l of ap.split('\n')) {
  if (/subject|primary|CONTINUATION|SAME subject|different perspective|pups|family|litter|composition contract|image placement/i.test(l)) console.log(l.slice(0, 240));
}
process.exit(0);
