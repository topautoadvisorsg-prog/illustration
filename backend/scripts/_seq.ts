/* List every page in reading order with its folio, key, and LAST non-empty line.
 * Lets a human eyeball trailing headings the marker scan can't catch (plain-text
 * headings with no ** or ### — e.g. the intro's zone primer). Read-only.
 * Usage: _seq.ts [keyPrefixFilter] */
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { P } from './_project.js';
const FILTER = process.argv[2];
const ordered = await listPaginatedPagesForProject(P);
for (const p of ordered) {
  if (FILTER && !p.pageKey.startsWith(FILTER)) continue;
  const ne = (p.readingFieldText ?? '').replace(/\s+$/, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const last = ne[ne.length - 1] ?? '(empty)';
  console.log(`f${String(p.plannedPageNumber ?? '?').padStart(3)} ${p.pageKey.padEnd(26)} | ${last.slice(0, 80)}`);
}
process.exit(0);
