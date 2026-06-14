/* NO-SPEND subject audit: list each opener's title + resolved image subject for
 * a chapter prefix, so a wrong subject is caught BEFORE any render is paid for.
 * Resolved subject = cleanSubject || imageSubject (mirrors the render path). */
import { listPaginatedPagesForProject, getEntryMetaByKeys } from '../src/db/repositories/pagination.repo.js';

const PROJECT = process.argv[2]!;
const PREFIX = process.argv[3] ?? 'CH04';
const pages = await listPaginatedPagesForProject(PROJECT);
// Opener page keys for the chapter (entry manifests are keyed by the opener key).
const openerKeys = pages
  .filter((p) => p.pageKey.startsWith(PREFIX) && p.pageRole === 'opener')
  .map((p) => p.pageKey)
  .sort();
const byKey = await getEntryMetaByKeys(PROJECT, openerKeys);
console.log(`SUBJECT AUDIT — ${PREFIX} — ${openerKeys.length} entries\n`);
for (const k of openerKeys) {
  const m = byKey.get(k);
  const subject = m?.cleanSubject || m?.imageSubject || '(none)';
  const hz = m?.hazard?.length ? ` [hazard:${m.hazard.join(',')}]` : '';
  console.log(`${k}  ${m?.entryTitle ?? '(no title)'}`);
  console.log(`     → ${subject}${hz}\n`);
}
process.exit(0);
