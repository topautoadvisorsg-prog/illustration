/* How many active+approved renders would stamp a badge (= corner folio, the bug)?
 * Reconstructs badgeContext exactly like printPrepRender, applies badgesForPage.
 * Read-only. Lists affected pageKeys. Usage: _badgecount.ts */
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { badgesForPage } from '../src/pipeline/publishing-standard/badges/badges-for-page.js';
import type { Badge } from '@wildlands/shared';
import { P } from './_project.js';

const db = getDb();
const allPages = await db.select().from(pages).where(eq(pages.projectId, P));
const affected: string[] = [];
let checked = 0;
for (const p of allPages) {
  const r = (await db.select().from(wholePageRenders)
    .where(and(eq(wholePageRenders.pageId, p.id), eq(wholePageRenders.active, true), eq(wholePageRenders.approvedForBook, true))))[0];
  if (!r) continue;
  checked++;
  const spec = r.specJson as { badgeContext?: { region?: string; hazard?: string[]; source?: string } } | null;
  const bc = spec?.badgeContext;
  const badgeSet: Badge[] = bc
    ? [
        ...(bc.region ? [{ family: 'region' as const, value: bc.region }] : []),
        ...(bc.hazard ?? []).map((h) => ({ family: 'hazard' as const, value: h })),
        ...(bc.source ? [{ family: 'source' as const, value: bc.source }] : []),
      ]
    : [];
  if (badgesForPage(badgeSet).length > 0) affected.push(p.pageKey);
}
console.log(`checked ${checked} renders; ${affected.length} would stamp a badge (corner-folio bug):`);
console.log(affected.join(','));
process.exit(0);
