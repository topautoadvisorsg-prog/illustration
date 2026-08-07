import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { wholePageRenders, pages } from '../src/db/schema/index.js';
import { P } from './_project.js';

const db = getDb();
const all = await db.select().from(wholePageRenders).where(eq(wholePageRenders.projectId, P));
const failed = all.filter((r) => r.status === 'FAILED');
const billingFailed = failed.filter((r) => (r.errorMessage ?? '').includes('Billing hard limit'));
const otherFailed = failed.filter((r) => !(r.errorMessage ?? '').includes('Billing hard limit'));

console.log(`total FAILED renders: ${failed.length}`);
console.log(`  billing-hard-limit failures: ${billingFailed.length}`);
console.log(`  other failures: ${otherFailed.length}`);
for (const f of otherFailed) console.log(`    ${f.pageId} v${f.version}: "${f.errorMessage}"`);

if (billingFailed.length) {
  const times = billingFailed.map((f) => new Date(f.createdAt as any).getTime());
  console.log(`\nbilling failures span: ${new Date(Math.min(...times)).toString()}  ->  ${new Date(Math.max(...times)).toString()}`);
}

// which pageIds have NO successful render at all (every attempt failed)?
const allPages = await db.select().from(pages).where(eq(pages.projectId, P));
const neverSucceeded: string[] = [];
for (const pg of allPages) {
  const r = all.filter((x) => x.pageId === pg.id);
  if (r.length > 0 && !r.some((x) => x.status === 'RENDERED' || x.status === 'APPROVED')) {
    neverSucceeded.push(`${pg.pageKey} (planned #${pg.plannedPageNumber})`);
  }
}
console.log(`\npages with attempts but ZERO successful render (${neverSucceeded.length}):`);
console.log(neverSucceeded.join(', '));

// pages with NO render attempts whatsoever
const noAttempt = allPages.filter((pg) => !all.some((x) => x.pageId === pg.id)).map((pg) => `${pg.pageKey} (#${pg.plannedPageNumber})`);
console.log(`\npages with NO render attempt at all (${noAttempt.length}):`);
console.log(noAttempt.join(', '));
process.exit(0);
