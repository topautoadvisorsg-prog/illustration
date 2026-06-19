/* Throwaway: dump manifest content + a body excerpt for given opener keys. */
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
  console.log('==== ' + r.externalId + ' :: ' + (c.entryTitle ?? '') + ' ====');
  console.log('contentType :', c.contentType);
  console.log('category    :', c.category);
  console.log('section     :', c.section);
  console.log('hazard      :', JSON.stringify(c.hazard));
  console.log('imageSubject:', c.imageSubject);
  console.log('cleanSubject:', c.cleanSubject);
  const body = typeof c.bodyMarkdown === 'string' ? c.bodyMarkdown : (typeof c.body === 'string' ? c.body : '');
  const danger = body.match(/[^.]*\b(deadly|toxic|poisonous|venomous|poison)\b[^.]*\./gi);
  console.log('danger-hits :', danger ? danger.slice(0, 4) : 'none');
  console.log('');
}
process.exit(0);
