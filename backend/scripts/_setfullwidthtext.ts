/* Pin a text-heavy CONTINUATION page to a FULL-WIDTH text-first blueprint so the body
 * text cannot be squeezed into a narrow side column by a large illustration (the cause
 * of bottom-guideline overflow). Sets imagePlacement/textPlacement on the page manifest;
 * for continuations (pageKey != entryKey) prepareRender applies pageOverride directly.
 * Read+write, NO render. Usage: _setfullwidthtext.ts <pageKey> [pageKey ...] */
import { getDb } from '../src/db/client.js';
import { manifests } from '../src/db/schema/index.js';
import { and, eq } from 'drizzle-orm';
import { P } from './_project.js';

const imagePlacement =
  'A calm, restful TEXT-FIRST page: a SUBTLE full-page aged-parchment / soft naturalist atmosphere field across the whole page (never blank paper), with NO bold subject illustration. Any decorative naturalist touch must stay a faint, low-contrast background texture ONLY — it must NEVER become a defined illustration occupying a side column, and must NEVER push or narrow the body text. The text is the priority on this page.';
const textPlacement =
  'ALL the body text fills ONE single FULL-WIDTH reading column spanning the full text-safe width of the page, flowing top to bottom over the calm field. Size the text DOWN to the smallest still-clearly-readable book size as needed so that EVERY line — including the final section and its last line — fits comfortably ABOVE the bottom safety rail with a clear margin. Never wrap the text into a narrow side column beside an illustration; never let any line touch or cross the safety rail.';

const KEYS = process.argv.slice(2);
if (!KEYS.length) { console.error('Usage: _setfullwidthtext.ts <pageKey> [pageKey ...]'); process.exit(1); }
const db = getDb();
for (const KEY of KEYS) {
  const content = { imagePlacement, textPlacement };
  const [existing] = await db.select({ id: manifests.id, content: manifests.content })
    .from(manifests).where(and(eq(manifests.projectId, P), eq(manifests.kind, 'PAGE'), eq(manifests.externalId, KEY))).limit(1);
  if (existing) {
    await db.update(manifests).set({ content: { ...(existing.content as object), ...content } }).where(eq(manifests.id, existing.id));
    console.log(`${KEY}: updated page manifest (full-width text override)`);
  } else {
    await db.insert(manifests).values({ projectId: P, kind: 'PAGE', externalId: KEY, content });
    console.log(`${KEY}: inserted page manifest (full-width text override)`);
  }
}
process.exit(0);
