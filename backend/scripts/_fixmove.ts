/* Orphan-heading fix, batch text move (NO renders, reversible). For each folio:
 *  - cut the trailing heading BLOCK off the page (bold **…**, **…** *(paren)*, or
 *    ATX ###; one or more stacked) and prepend it to the next page where its body is
 *  - reproduce the APPROVED blueprint on re-render: if the page's active (approved)
 *    render is the "subtle full-page field" (the drifted TEXT_HEAVY case), pin the
 *    row to LAYOUT_D_PURE_TEXT so the re-render rebuilds that exact field. Openers /
 *    framed / full-bleed pages reproduce from their own row → left untouched.
 * Prints every action. Usage: _fixmove.ts <folio> [folio ...]   (renders run after) */
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { P } from './_project.js';

const FOLIOS = process.argv.slice(2).map(Number);
const db = getDb();
const ordered = await listPaginatedPagesForProject(P);
const byFolio = new Map<number, number>();
ordered.forEach((p, i) => { if (p.plannedPageNumber != null) byFolio.set(p.plannedPageNumber, i); });

function isHeading(l: string): boolean {
  return /^\*\*.+\*\*(\s*\*?\(.*\)\*?)?$/.test(l) || /^#{1,6}\s+\S.*$/.test(l);
}
function trailingHeadingBlock(text: string): string[] {
  const ne = (text ?? '').replace(/\s+$/, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const block: string[] = [];
  for (let i = ne.length - 1; i >= 0; i--) { if (isHeading(ne[i]!)) block.unshift(ne[i]!); else break; }
  return block;
}
async function approvedIsFullPageField(pageId: string): Promise<boolean> {
  const r = (await db.select().from(wholePageRenders)
    .where(and(eq(wholePageRenders.pageId, pageId), eq(wholePageRenders.active, true))).limit(1))[0] as Record<string, unknown> | undefined;
  const ip = ((r?.specJson as any)?.composition?.imagePlacement ?? '') as string;
  return /^a SUBTLE full-page/i.test(ip);
}

let moved = 0, pinned = 0, skipped = 0;
for (const folio of FOLIOS) {
  const idx = byFolio.get(folio);
  if (idx == null) { console.log(`FOLIO ${folio}: no page — SKIP`); skipped++; continue; }
  const page = ordered[idx]!;
  const next = ordered[idx + 1];
  if (!next) { console.log(`FOLIO ${folio} ${page.pageKey}: no next page — SKIP`); skipped++; continue; }
  // Re-fetch CURRENT text (a chained page may already have been edited this run).
  const pageText = (await db.select().from(pages).where(eq(pages.id, page.id)))[0]!.readingFieldText ?? '';
  const nextText = (await db.select().from(pages).where(eq(pages.id, next.id)))[0]!.readingFieldText ?? '';
  const block = trailingHeadingBlock(pageText);
  if (!block.length) { console.log(`FOLIO ${folio} ${page.pageKey}: no trailing heading block — SKIP (manual)`); skipped++; continue; }

  // cut block off page, prepend to next (preserve order of stacked headings)
  const lines = pageText.replace(/\s+$/, '').split('\n');
  // remove the trailing block lines (match from the end, skipping blanks)
  let removed = 0; const keep: string[] = [...lines];
  for (let i = keep.length - 1; i >= 0 && removed < block.length; i--) {
    const t = keep[i]!.trim();
    if (t === '') { keep.splice(i, 1); continue; }
    if (isHeading(t)) { keep.splice(i, 1); removed++; } else break;
  }
  const newPage = keep.join('\n').replace(/\s+$/, '');
  const newNext = block.join('\n') + '\n\n' + nextText;

  await db.update(pages).set({ readingFieldText: newPage }).where(eq(pages.id, page.id));
  await db.update(pages).set({ readingFieldText: newNext }).where(eq(pages.id, next.id));
  console.log(`FOLIO ${folio}: moved ${JSON.stringify(block)}  ${page.pageKey} → ${next.pageKey}`);
  moved++;

  // pin only when the approved blueprint is the full-page field but the row isn't PURE_TEXT
  for (const pg of [page, next]) {
    const rowLayout = (pg as any).layoutTemplate;
    if (rowLayout === 'LAYOUT_D_PURE_TEXT') continue;
    if (await approvedIsFullPageField(pg.id)) {
      await db.update(pages).set({ layoutTemplate: 'LAYOUT_D_PURE_TEXT' } as Record<string, unknown>).where(eq(pages.id, pg.id));
      console.log(`        pin ${pg.pageKey}: ${rowLayout} → LAYOUT_D_PURE_TEXT (approved = full-page field)`);
      pinned++;
    } else {
      console.log(`        keep ${pg.pageKey}: ${rowLayout} (approved blueprint reproduces from its own row)`);
    }
  }
}
console.log(`\nDONE: ${moved} moved, ${pinned} pinned to PURE_TEXT, ${skipped} skipped.`);
process.exit(0);
