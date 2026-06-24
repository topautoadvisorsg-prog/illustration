/* Concrete diff between two render versions of a page: layout/composition, text-area
 * geometry, standard (prompt) version, prompt length/hash. Read-only.
 * Usage: _specdiff.ts <pageKey> <verA> <verB> */
import { createHash } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { P } from './_project.js';

const KEY = process.argv[2]!;
const VA = Number(process.argv[3]!), VB = Number(process.argv[4]!);
const db = getDb();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0]!;
console.log('page.layoutTemplate (row):', (row as any).layoutTemplate);

async function get(v: number) {
  return (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.version, v))).limit(1))[0] as Record<string, unknown> | undefined;
}
function info(r: Record<string, unknown> | undefined) {
  if (!r) return { MISSING: true };
  const s = (r.specJson ?? {}) as any;
  const ap = (r.assembledPrompt as string) ?? '';
  return {
    version: r.version,
    createdAt: r.createdAt,
    standardVersion: (r as any).standardVersion ?? s?.standardVersion,
    pageType: s?.pageType,
    composition_imagePlacement: s?.composition?.imagePlacement,
    composition_textPlacement: s?.composition?.textPlacement,
    readingFieldGeometry: s?.readingFieldGeometry ?? s?.readingField ?? s?.layoutGeometry?.readingField,
    layoutGeometry_margins: s?.layoutGeometry?.marginsIn ?? s?.geometry?.marginsIn,
    layoutGeometry_trim: s?.layoutGeometry?.trim ?? s?.geometry?.trim,
    promptChars: ap.length,
    promptSha8: createHash('sha256').update(ap).digest('hex').slice(0, 8),
  };
}
console.log(`\n================= ${KEY} v${VA} =================`);
console.log(JSON.stringify(info(await get(VA)), null, 2));
console.log(`\n================= ${KEY} v${VB} =================`);
console.log(JSON.stringify(info(await get(VB)), null, 2));
process.exit(0);
