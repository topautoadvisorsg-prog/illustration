/* Badge inventory audit — surveys badgeContext across every active render and
 * reports usage per badge value (region/hazard/source) with page keys, flags
 * unused catalog entries, and flags front/back-matter pages that carry badges. */
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import { REGION_BADGES, HAZARD_BADGES, SOURCE_BADGES } from '../src/pipeline/publishing-standard/standard.js';

const P = process.argv[2]!;
const db = getDb();
const allPages = await db.select().from(pages).where(eq(pages.projectId, P));
const meta = new Map<string, any>(allPages.map((p: any) => [p.id, p]));
const renders = await db.select().from(wholePageRenders).where(eq(wholePageRenders.projectId, P));
const active = (renders as any[]).filter((r) => r.active);

const region: Record<string, string[]> = {};
const hazard: Record<string, string[]> = {};
const source: Record<string, string[]> = {};
const fmbmBadged: string[] = [];
let noContext: string[] = [];

for (const r of active) {
  const pg = meta.get(r.pageId);
  const key = pg?.pageKey ?? r.pageId;
  const sec = pg?.section ?? 'BODY';
  const bc = (r.specJson as any)?.badgeContext;
  if (!bc) { noContext.push(key); continue; }
  if (bc.region) (region[bc.region] ??= []).push(key);
  for (const h of bc.hazard ?? []) (hazard[h] ??= []).push(key);
  if (bc.source) (source[bc.source] ??= []).push(key);
  const hasVisible = bc.region || bc.source || (bc.hazard ?? []).some((h: string) => h !== 'NONE');
  if (sec !== 'BODY' && hasVisible) fmbmBadged.push(`${key} [region=${bc.region ?? '-'} source=${bc.source ?? '-'} hazard=${JSON.stringify(bc.hazard ?? [])}]`);
}

function report(title: string, catalog: string[], used: Record<string, string[]>, listAll = false) {
  console.log(`\n=== ${title} ===`);
  for (const k of catalog) {
    const keys = used[k] ?? [];
    const sample = listAll ? keys.join(', ') : keys.slice(0, 8).join(', ') + (keys.length > 8 ? ` …(+${keys.length - 8})` : '');
    console.log(`  ${k.padEnd(22)} ${String(keys.length).padStart(4)} page(s)` + (keys.length ? `: ${sample}` : '  — UNUSED'));
  }
  const extra = Object.keys(used).filter((k) => !catalog.includes(k));
  if (extra.length) console.log(`  !! values NOT in catalog: ${extra.join(', ')}`);
}

console.log(`active renders surveyed: ${active.length}`);
report('REGION BADGES', Object.keys(REGION_BADGES), region);
report('HAZARD BADGES (list all pages — safety-critical)', Object.keys(HAZARD_BADGES).filter((h) => h !== 'NONE'), hazard, true);
report('SOURCE BADGES', Object.keys(SOURCE_BADGES), source);
console.log(`\n=== Front/Back-matter pages carrying badges (should usually be none) ===`);
console.log(fmbmBadged.length ? fmbmBadged.map((s) => '  ' + s).join('\n') : '  (none)');
console.log(`\n=== Active renders with NO badgeContext (${noContext.length}) ===`);
console.log('  ' + (noContext.slice(0, 30).join(', ') + (noContext.length > 30 ? ` …(+${noContext.length - 30})` : '')));
process.exit(0);
