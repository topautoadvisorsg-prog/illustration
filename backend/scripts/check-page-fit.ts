/* Checks whether a page's text fits its printed capacity, using the SAME
 * char-grid model the real pagination/render pipeline uses. No spend, no
 * writes — read-only. Run this on every planned edit BEFORE writing it to
 * the DB or rendering, so you don't discover OVERFLOW after paying for an
 * image.
 *
 * Usage:
 *   tsx scripts/check-page-fit.ts <projectId> <pageKey>
 *     -> checks the page's CURRENT live text.
 *   tsx scripts/check-page-fit.ts <projectId> <pageKey> --text-file <path>
 *     -> checks the text in <path> instead (your draft replacement), against
 *        that same page's real layoutTemplate/trimSize/typography.
 */
import { getDb } from '../src/db/client.js';
import { pages, projects } from '../src/db/schema/index.js';
import { and, eq } from 'drizzle-orm';
import { computePaginationCapacity } from '../src/pipeline/stage-1.75-pagination/capacity.js';
import { readFileSync } from 'node:fs';

const [PROJECT, PAGE_KEY] = process.argv.slice(2);
const textFileFlagIdx = process.argv.indexOf('--text-file');
const textFile = textFileFlagIdx !== -1 ? process.argv[textFileFlagIdx + 1] : undefined;

if (!PROJECT || !PAGE_KEY) {
  console.error('Usage: tsx scripts/check-page-fit.ts <projectId> <pageKey> [--text-file <path>]');
  process.exit(1);
}

const db = getDb();
const [proj] = await db.select().from(projects).where(eq(projects.id, PROJECT)).limit(1);
if (!proj) { console.error(`Project ${PROJECT} not found`); process.exit(1); }
const config = (proj as any).config ?? {};
const trimSize = config.trimSize ?? config.publishing?.trimSize;

const [row] = await db.select().from(pages).where(and(eq(pages.projectId, PROJECT), eq(pages.pageKey, PAGE_KEY))).limit(1);
if (!row) { console.error(`${PAGE_KEY} not found in project ${PROJECT}`); process.exit(1); }

const text = textFile ? readFileSync(textFile, 'utf8') : (row.readingFieldText ?? '');

const result = computePaginationCapacity({
  readingFieldText: text,
  layoutTemplate: row.layoutTemplate as any,
  trimSize,
  bodyPt: config.typography?.bodyPt ?? 10.5,
  lineHeight: config.typography?.lineHeight ?? 1.35,
});

console.log(`${PAGE_KEY} | layout: ${row.layoutTemplate} | source: ${textFile ? textFile : '(live DB text)'}`);
console.log(JSON.stringify(result, null, 2));
if (result.status === 'OVERFLOW') {
  console.log('\n⚠ OVERFLOW — this text will not fit. Trim before writing/rendering.');
}
process.exit(0);
