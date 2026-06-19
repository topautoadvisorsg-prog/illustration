/* Throwaway: print ALL content keys+values for given opener keys. */
import { getDb } from '../src/db/client.js';
import { manifests } from '../src/db/schema/index.js';
import { and, eq, inArray } from 'drizzle-orm';

const PROJECT = process.argv[2]!;
const KEYS = process.argv.slice(3);
const db = getDb();
const rows = await db
  .select({ externalId: manifests.externalId, content: manifests.content })
  .from(manifests)
  .where(and(eq(manifests.projectId, PROJECT), eq(manifests.kind, 'PAGE'), inArray(manifests.externalId, KEYS)));
for (const r of rows) {
  const c = (r.content ?? {}) as Record<string, unknown>;
  console.log('==== ' + r.externalId + ' ====');
  for (const [k, v] of Object.entries(c)) {
    if (k === 'bodyMarkdown' || k === 'body') { console.log('  ' + k + ': <' + String(v).length + ' chars>'); continue; }
    console.log('  ' + k + ': ' + (typeof v === 'object' ? JSON.stringify(v) : String(v)).slice(0, 160));
  }
  console.log('');
}
process.exit(0);
