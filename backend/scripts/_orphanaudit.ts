/* READ-ONLY verification pass for the orphaned-subheading fix. For each folio:
 *  - locate the page (by plannedPageNumber) + the next page in reading order
 *  - detect a trailing **heading** orphan (heading stranded with no body after it)
 *  - show the text block that would move + the destination page's current start
 *  - pull the ACTIVE (originally-approved) render's composition + readingField
 *    geometry + margins/trim for BOTH pages = the blueprint of record to reproduce
 * No DB writes, no renders. Usage: _orphanaudit.ts <folio> [folio ...] */
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { wholePageRenders } from '../src/db/schema/index.js';
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { P } from './_project.js';

const FOLIOS = process.argv.slice(2).map(Number);
const db = getDb();
const ordered = await listPaginatedPagesForProject(P);
const byFolio = new Map<number, number>(); // folio -> index in ordered
ordered.forEach((p, i) => { if (p.plannedPageNumber != null) byFolio.set(p.plannedPageNumber, i); });

function lastNonEmpty(text: string, n: number): string[] {
  return (text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(-n);
}
function firstNonEmpty(text: string, n: number): string[] {
  return (text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, n);
}
// A heading line: a bold **…** (optionally followed by an italic *(parenthetical)*),
// or an ATX markdown heading (#, ##, ###). Body text never matches these.
function isHeading(l: string): boolean {
  return /^\*\*.+\*\*(\s*\*?\(.*\)\*?)?$/.test(l) || /^#{1,6}\s+\S.*$/.test(l);
}
// Returns the BLOCK of trailing heading lines (top-to-bottom) stranded at the page
// end with no body after them — that whole block is what must move. [] = no orphan.
function trailingHeadingBlock(text: string): string[] {
  const nonEmpty = (text ?? '').replace(/\s+$/, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const block: string[] = [];
  for (let i = nonEmpty.length - 1; i >= 0; i--) {
    if (isHeading(nonEmpty[i]!)) block.unshift(nonEmpty[i]!);
    else break;
  }
  return block;
}
async function activeRender(pageId: string) {
  const r = (await db.select().from(wholePageRenders)
    .where(and(eq(wholePageRenders.pageId, pageId), eq(wholePageRenders.active, true))).limit(1))[0] as Record<string, unknown> | undefined;
  if (!r) return 'NO ACTIVE RENDER';
  const s = (r.specJson ?? {}) as any;
  const g = s?.readingFieldGeometry ?? s?.readingField ?? {};
  const sz = g?.sizeIn ? `${g.sizeIn.w}x${g.sizeIn.h}` : '?';
  const m = s?.layoutGeometry?.marginsIn ?? s?.geometry?.marginsIn;
  const ip = (s?.composition?.imagePlacement ?? '').slice(0, 70);
  return `v${r.version} | readField ${sz} | margins ${m ? JSON.stringify(m) : '?'} | comp: ${ip}…`;
}

for (const folio of FOLIOS) {
  const idx = byFolio.get(folio);
  console.log(`\n========== FOLIO ${folio} ==========`);
  if (idx == null) { console.log('  ⚠ no page with this plannedPageNumber'); continue; }
  const page = ordered[idx]!;
  const next = ordered[idx + 1];
  const block = trailingHeadingBlock(page.readingFieldText ?? '');
  console.log(`  page: ${page.pageKey}  [${(page as any).layoutTemplate}]  section=${(page as any).section ?? '?'}`);
  console.log(`  ends: ${JSON.stringify(lastNonEmpty(page.readingFieldText ?? '', block.length + 1))}`);
  if (block.length) {
    console.log(`  ORPHAN ✓  move ${block.length} heading line(s) → ${JSON.stringify(block)}`);
  } else {
    console.log(`  ORPHAN ✗  (no trailing heading block — body ends the page; manual review)`);
  }
  if (next) {
    console.log(`  next: ${next.pageKey}  [${(next as any).layoutTemplate}]  (folio ${next.plannedPageNumber})`);
    console.log(`  next starts: ${JSON.stringify(firstNonEmpty(next.readingFieldText ?? '', 1))}`);
  } else {
    console.log('  next: (none — last page)');
  }
  console.log(`  blueprint(page) : ${await activeRender(page.id)}`);
  if (next) console.log(`  blueprint(next) : ${await activeRender(next.id)}`);
}
process.exit(0);
