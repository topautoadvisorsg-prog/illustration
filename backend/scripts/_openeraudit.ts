import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { P } from './_project.js';
const CUTOFF = new Date(process.argv[2] ?? '2026-06-22T00:00:00Z').getTime();
const db = getDb();
const ordered = await listPaginatedPagesForProject(P);
const folioOf = new Map<string, number | null>();
ordered.forEach((p) => folioOf.set(p.pageKey, p.plannedPageNumber ?? null));
function pattern(ip: string): string {
  if (/^a SUBTLE full-page/i.test(ip)) return 'PURE_TEXT_FIELD';
  if (/^full-page image-priority/i.test(ip)) return 'OPENER_OVERRIDE';
  if (/ENTIRE page is ONE full-bleed/i.test(ip)) return 'FULL_BLEED';
  if (/corner accent/i.test(ip)) return 'CORNER';
  if (/right-side image-priority/i.test(ip)) return 'IMAGE_RIGHT';
  if (/left-side image-priority/i.test(ip)) return 'IMAGE_LEFT';
  if (/upper image-priority/i.test(ip)) return 'IMAGE_TOP';
  if (/anchored across the BOTTOM/i.test(ip)) return 'OPENER_SCENE_FIX';
  if (/TWO REQUIRED illustration anchors/i.test(ip)) return 'FRAMED_BANDS';
  return ip.slice(0, 22);
}
function geom(s: any): string { const g = s?.readingFieldGeometry ?? s?.readingField ?? {}; return g?.sizeIn ? `${g.sizeIn.w}x${g.sizeIn.h}` : '?'; }
const openers = await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageRole, 'opener')));
const rows: { folio: number; line: string }[] = [];
for (const pg of openers) {
  const vers = (await db.select().from(wholePageRenders).where(eq(wholePageRenders.pageId, pg.id)).orderBy(wholePageRenders.version)) as Record<string, unknown>[];
  if (!vers.length) continue;
  const current = vers.find((v) => v.active) ?? vers[vers.length - 1]!;
  const baseCands = vers.filter((v) => new Date(v.createdAt as string).getTime() < CUTOFF);
  const baseline = baseCands.length ? baseCands[baseCands.length - 1]! : undefined;
  const rerendered = new Date(current.createdAt as string).getTime() >= CUTOFF;
  const curS = (current.specJson ?? {}) as any; const curPat = pattern(curS?.composition?.imagePlacement ?? ''); const curGeom = geom(curS);
  const folio = (folioOf.get(pg.pageKey) as number) ?? 0;
  if (!baseline) { rows.push({ folio, line: `f${folio}\t${pg.pageKey}\tNO-BASELINE\tcur v${current.version} ${curPat} ${curGeom}` }); continue; }
  const baseS = (baseline.specJson ?? {}) as any; const basePat = pattern(baseS?.composition?.imagePlacement ?? ''); const baseGeom = geom(baseS);
  const drift = rerendered && (basePat !== curPat || baseGeom !== curGeom);
  const tag = !rerendered ? 'UNTOUCHED' : drift ? 'DRIFTED' : 'RERENDERED-MATCH';
  rows.push({ folio, line: `f${folio}\t${pg.pageKey}\t[${tag}]\tappr v${baseline.version}:${basePat} ${baseGeom}  ->  cur v${current.version}:${curPat} ${curGeom}` });
}
rows.sort((a, b) => a.folio - b.folio);
for (const r of rows) console.log(r.line);
process.exit(0);
