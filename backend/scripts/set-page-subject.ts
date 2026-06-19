/* Operator tool: give a SINGLE page (e.g. one continuation) its own distinct study
 * subject via a page-specific PAGE manifest, without touching the shared entry/opener
 * subject. render-whole-page prefers a manifest keyed by the page's own pageKey. */
import { getDb } from '../src/db/client.js';
import { manifests } from '../src/db/schema/index.js';
import { and, eq } from 'drizzle-orm';

const PROJECT = process.argv[2]!;
const PAGE_KEY = process.argv[3]!;
const SUBJECT = process.argv[4]!;
const ENTRY_TITLE = process.argv[5] ?? '';
if (!PROJECT || !PAGE_KEY || !SUBJECT) {
  console.error('usage: set-page-subject.ts <projectId> <pageKey> "<subject>" [entryTitle]');
  process.exit(1);
}

const db = getDb();
const [existing] = await db
  .select({ id: manifests.id, content: manifests.content })
  .from(manifests)
  .where(and(eq(manifests.projectId, PROJECT), eq(manifests.kind, 'PAGE'), eq(manifests.externalId, PAGE_KEY)))
  .limit(1);

// Only set entryTitle when provided — updating an opener must not blank its title.
const content: Record<string, unknown> = { imageSubject: SUBJECT, cleanSubject: SUBJECT };
if (ENTRY_TITLE) content.entryTitle = ENTRY_TITLE;
if (existing) {
  await db.update(manifests).set({ content: { ...(existing.content as object), ...content } }).where(eq(manifests.id, existing.id));
  console.log(`${PAGE_KEY}: updated existing page manifest`);
} else {
  await db.insert(manifests).values({ projectId: PROJECT, kind: 'PAGE', externalId: PAGE_KEY, content });
  console.log(`${PAGE_KEY}: inserted page-specific manifest`);
}
console.log(`  subject = ${SUBJECT.slice(0, 90)}...`);
process.exit(0);
