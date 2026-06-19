/* Proofing tool: print the VERBATIM source text the pipeline fed the renderer for
 * each given page key — the heading/title plus the reading-field body — so it can be
 * diffed word-for-word against the text baked into the rendered image. */
import { listPaginatedPagesForProject, getEntryMetaByKeys } from '../src/db/repositories/pagination.repo.js';

const PROJECT = process.argv[2]!;
const KEYS = process.argv.slice(3);
const pages = await listPaginatedPagesForProject(PROJECT);
const openerKeys = pages.filter((p) => p.pageRole === 'opener').map((p) => p.pageKey);
const meta = await getEntryMetaByKeys(PROJECT, openerKeys);
for (const key of KEYS) {
  const p = pages.find((x) => x.pageKey === key) as Record<string, any> | undefined;
  if (!p) { console.log(`\n===== ${key} :: NOT FOUND =====`); continue; }
  const title = p.pageRole === 'opener' ? meta.get(key)?.entryTitle ?? '' : '';
  console.log(`\n===== ${key} (role=${p.pageRole}, fm=${p.frontMatterType ?? '-'}) =====`);
  if (title) console.log(`TITLE: ${title}`);
  console.log('BODY:');
  console.log(p.readingFieldText ?? '(none)');
}
process.exit(0);
