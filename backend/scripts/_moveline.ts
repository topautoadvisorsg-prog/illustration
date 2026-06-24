/* Move an explicit trailing heading/label/lead-in line (any format — marker-less
 * included) off page A's end and prepend it to page B's start. Verifies A actually
 * ends with the expected line (safety), prints the resulting tail/head for review,
 * and pins B (and A) to LAYOUT_D_PURE_TEXT only when the approved render is the
 * full-page field (reproduces the original blueprint). NO renders.
 * Usage: _moveline.ts <fromKey> <toKey> "<expected last line substring>" */
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { P } from './_project.js';

const FROM = process.argv[2]!, TO = process.argv[3]!, EXPECT = process.argv[4]!;
const db = getDb();
async function get(key: string) {
  return (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, key))))[0];
}
async function approvedIsFullPageField(pageId: string): Promise<boolean> {
  const r = (await db.select().from(wholePageRenders)
    .where(and(eq(wholePageRenders.pageId, pageId), eq(wholePageRenders.active, true))).limit(1))[0] as Record<string, unknown> | undefined;
  const ip = ((r?.specJson as any)?.composition?.imagePlacement ?? '') as string;
  return /^a SUBTLE full-page/i.test(ip);
}

const from = await get(FROM), to = await get(TO);
if (!from || !to) { console.error('page not found'); process.exit(1); }
const lines = (from.readingFieldText ?? '').replace(/\s+$/, '').split('\n');
let idx = -1;
for (let i = lines.length - 1; i >= 0; i--) { if (lines[i]!.trim() === '') continue; idx = i; break; }
const lastLine = idx >= 0 ? lines[idx]!.trim() : '';
if (!lastLine.includes(EXPECT)) {
  console.error(`ABORT: ${FROM} last line ${JSON.stringify(lastLine)} does not contain ${JSON.stringify(EXPECT)}`);
  process.exit(1);
}
const newFrom = lines.slice(0, idx).join('\n').replace(/\s+$/, '');
const newTo = lastLine + '\n\n' + (to.readingFieldText ?? '');
await db.update(pages).set({ readingFieldText: newFrom }).where(eq(pages.id, from.id));
await db.update(pages).set({ readingFieldText: newTo }).where(eq(pages.id, to.id));
console.log(`MOVED ${JSON.stringify(lastLine)}  ${FROM} → ${TO}`);
console.log(`  ${FROM} now ENDS: …${JSON.stringify(newFrom.slice(-90))}`);
console.log(`  ${TO}   now STARTS: ${JSON.stringify(newTo.slice(0, 110))}…`);

for (const pg of [from, to]) {
  const rowLayout = (pg as any).layoutTemplate;
  if (rowLayout === 'LAYOUT_D_PURE_TEXT') { console.log(`  ${pg.pageKey}: already LAYOUT_D_PURE_TEXT`); continue; }
  if (await approvedIsFullPageField(pg.id)) {
    await db.update(pages).set({ layoutTemplate: 'LAYOUT_D_PURE_TEXT' } as Record<string, unknown>).where(eq(pages.id, pg.id));
    console.log(`  pin ${pg.pageKey}: ${rowLayout} → LAYOUT_D_PURE_TEXT (approved = full-page field)`);
  } else {
    console.log(`  keep ${pg.pageKey}: ${rowLayout} (approved blueprint reproduces from its own row)`);
  }
}
process.exit(0);
