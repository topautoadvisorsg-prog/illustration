/* Set a PLACEMENT-ONLY per-page blueprint override on an ENTRY OPENER page so the
 * composition reliably matches the approved openers: big subject illustration
 * ANCHORED ACROSS THE BOTTOM, title + body text in the calm UPPER area. Does NOT
 * touch the subject (falls through to entry meta). Reusable template across openers.
 * prepareRender applies pageOverride.imagePlacement/textPlacement after the layout
 * director, so this wins over the underfilled-opener FULL_PAGE prose. Read+write, NO render.
 * Usage: _setopenerscene.ts <pageKey> [pageKey ...] */
import { getDb } from '../src/db/client.js';
import { manifests } from '../src/db/schema/index.js';
import { and, eq } from 'drizzle-orm';
import { P } from './_project.js';

const imagePlacement =
  'ONE large, richly detailed natural-history illustration of THIS page\'s subject, anchored across the BOTTOM 55–60% of the page — the subject large, prominent, and set in its habitat, the scene bleeding off the BOTTOM and the LEFT/RIGHT trim edges. The UPPER ~40% of the page stays calm aged parchment with NO bold illustration, reserved for the title and text. The main subject MUST live in the LOWER half — never place the animal/subject or a big illustration at the TOP of the page, and never leave the bottom as empty parchment.';
const textPlacement =
  'The entry title (and scientific name beneath it) sit at the TOP of the page on the calm parchment, and ALL the body text follows directly BENEATH the title in one clean reading block filling the UPPER ~40% of the page. The text must stay in the upper area, fully inside the safe rail, and must NEVER be pushed to the bottom of the page or overlap the bottom illustration. Title and text on top, illustration on the bottom.';

const KEYS = process.argv.slice(2);
if (!KEYS.length) { console.error('Usage: _setopenerscene.ts <pageKey> [pageKey ...]'); process.exit(1); }
const db = getDb();
for (const KEY of KEYS) {
  const content = { imagePlacement, textPlacement };
  const [existing] = await db.select({ id: manifests.id, content: manifests.content })
    .from(manifests)
    .where(and(eq(manifests.projectId, P), eq(manifests.kind, 'PAGE'), eq(manifests.externalId, KEY)))
    .limit(1);
  if (existing) {
    await db.update(manifests).set({ content: { ...(existing.content as object), ...content } }).where(eq(manifests.id, existing.id));
    console.log(`${KEY}: updated page manifest (placement override)`);
  } else {
    await db.insert(manifests).values({ projectId: P, kind: 'PAGE', externalId: KEY, content });
    console.log(`${KEY}: inserted page manifest (placement override)`);
  }
}
process.exit(0);
