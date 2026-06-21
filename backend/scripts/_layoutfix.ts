/* Per-page layout swap driven by the capacity table (no re-pagination).
 * For each OPENER page: measure body chars, compare to the painted-zone capacity
 * of its current layout; if it overflows, recommend the most-illustration layout
 * that still fits (25% corner ≤2052 chars, else pure text). Continuations are
 * already pure-text by role, so they're reported but not swapped.
 *
 *   dry  (default): _layoutfix.ts <CHxx | pageKey...>
 *   apply:          _layoutfix.ts --apply <pageKey...>
 *
 * apply forces the recommended layout via the SAME primitives as the force-layout
 * route (planPage + updatePagePlanning): it changes layoutTemplate + regenerates
 * the prompt ONLY. readingFieldText, page count, folios, spine are untouched.
 * Re-render the swapped pages afterwards with _batch (which rebuilds the blueprint). */
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';
import { getProject } from '../src/db/repositories/projects.repo.js';
import { updatePagePlanning, listManifests } from '../src/db/repositories/manifests.repo.js';
import { ProjectConfigSchema, PageManifestSchema } from '@wildlands/shared';
import { resolveGeometry } from '../src/pipeline/publishing-standard/index.js';
import { computePageGeometry } from '../src/pipeline/stage-6-layout/page-geometry.js';
import { directLayout } from '../src/pipeline/stage-6-layout/layout-director.js';
import { planPage } from '../src/pipeline/stage-2-planner/plan-pages.js';

import { P } from './_project.js';
const AVG = 0.45;
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
// --force: reduce a flagged opener to its target even if it technically "fits" its
// current layout (QA-driven: the page was identified as crowding the safe boundary).
const FORCE = args.includes('--force');
const sel = args.filter((a) => a !== '--apply' && a !== '--force');

const project = await getProject(P);
if (!project) throw new Error('no project');
const config = ProjectConfigSchema.parse(project.config);
const bodyPt = config.typography.bodyPt;
const lineHeight = config.typography.lineHeight;
const trim = resolveGeometry(config).trimSize;
const geometry = computePageGeometry(trim);
const canvasW = trim.widthIn + 2 * trim.bleedIn;
const canvasH = trim.heightIn + 2 * trim.bleedIn;
const db = getDb();

function strip(md: string): string {
  return md.replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').replace(/`(.*?)`/g, '$1').replace(/\[(.*?)\]\(.*?\)/g, '$1').trim();
}
function zoneCap(layout: string): number {
  const a = directLayout({ bodyMarkdown: 'x'.repeat(8000), layoutTemplate: layout as Parameters<typeof directLayout>[0]['layoutTemplate'], geometry, bodyPt, lineHeight, hasTitle: true, isEntryOpener: false });
  return a.textSafeZones.filter((z) => z.role === 'body').reduce((s, z) => {
    const wPt = (z.widthPct / 100) * canvasW * 72, hPt = (z.heightPct / 100) * canvasH * 72;
    return s + Math.max(1, Math.floor(wPt / (AVG * bodyPt))) * Math.max(0, Math.floor(hPt / (bodyPt * lineHeight)));
  }, 0);
}
// TEXT_DOMINANT (LAYOUT_2_TEXT_HEAVY repurposed): a small ~12% supporting vignette
// + ONE large centered reading field (no L-shape). The keep-an-illustration target.
const TEXTDOM = 'LAYOUT_2_TEXT_HEAVY', PURE = 'LAYOUT_D_PURE_TEXT';
const capTextDom = zoneCap(TEXTDOM), capPure = zoneCap(PURE);
// Conservative (operator: fit-first). Only keep the small illustration when the
// effective LOAD comfortably fits the centered field — derate to 80%. Anything
// denser goes full-page PURE_TEXT (text safety > illustration; no clipped print).
const TEXTDOM_SAFE = Math.round(capTextDom * 0.80);
const effCap = (lt: string | null): number => (lt === TEXTDOM ? TEXTDOM_SAFE : lt ? zoneCap(lt) : NaN);

// Select target pages.
let rows = await db.select().from(pages).where(eq(pages.projectId, P));
if (sel.length && /^CH\d+$/i.test(sel[0])) rows = rows.filter((r) => new RegExp('^' + sel[0] + '_', 'i').test(r.pageKey));
else if (sel.length) rows = rows.filter((r) => sel.includes(r.pageKey));
rows.sort((a, b) => (a.plannedPageNumber ?? 0) - (b.plannedPageNumber ?? 0));

// Each subsection heading (## …) eats ~2 lines + spacing of vertical room that a
// raw char count misses — so a multi-heading page (e.g. fungi: Cap/Gills/Stem/
// Look-alikes) overflows even when its char count looks fine. Fold that into an
// effective LOAD. The corner's L-shaped text area (narrow column + lower block)
// is also less efficient than its rectangular cap, so a page over the corner's
// cap goes full-page PURE_TEXT (operator call: text-heavy → full page).
const HEAD_OVERHEAD = 180;

console.log(`caps: text-dominant(12% img)=${capTextDom} safe=${TEXTDOM_SAFE}  pure(0% img)=${capPure}  | bodyPt=${bodyPt}  headOverhead=${HEAD_OVERHEAD}\n`);
console.log('folio  pageKey                role          chars head load  curLayout(cap)            → target            note');
console.log('-'.repeat(116));

const toApply: { key: string; target: string }[] = [];
for (const r of rows) {
  const chars = strip(r.readingFieldText ?? '').length;
  if (chars === 0) continue;
  const headings = (r.readingFieldText ?? '').match(/^#{2,6}\s+/gm)?.length ?? 0;
  const paras = (r.readingFieldText ?? '').split(/\n\s*\n/).filter((s) => s.trim()).length;
  const labels = (r.readingFieldText ?? '').match(/\*\*[^*]+\*\*/g)?.length ?? 0;
  // Each paragraph break leaves a ragged partial line + blank line ≈ ~1.3 lines
  // (~120 chars) of vertical space a flat char count misses. THIS is why dense,
  // many-paragraph fungi pages overflow the corner while flowing prose fit.
  const PARA_OVERHEAD = 120;
  const load = chars + PARA_OVERHEAD * Math.max(0, paras - 1) + HEAD_OVERHEAD * headings;
  const cur = r.layoutTemplate ?? '(role-default)';
  const curCap = effCap(r.layoutTemplate);
  const isOpener = r.pageRole === 'opener';
  let target = '', note = '';
  if (r.pageRole === 'continuation') { note = 'continuation = pure-text by role'; }
  else if (!isOpener) { note = 'non-opener, skip'; }
  else if (!FORCE && !Number.isNaN(curCap) && curCap >= load) { note = 'fits — leave'; }
  else { target = load <= TEXTDOM_SAFE ? TEXTDOM : PURE; note = target === PURE ? '⚠ full-page text (drops illustration)' : 'small 12% vignette + centered text'; }
  const flag = target ? `→ ${target.replace('LAYOUT_', '')}` : '';
  console.log(`${String(r.plannedPageNumber).padEnd(6)} ${r.pageKey.padEnd(22)} ${(r.pageRole||'').padEnd(13)} ${String(chars).padEnd(5)} p${String(paras).padEnd(3)} ${String(load).padEnd(5)} ${cur.replace('LAYOUT_','').padEnd(24)} ${flag.padEnd(19)} ${note}`);
  if (target && target !== r.layoutTemplate) toApply.push({ key: r.pageKey, target });
}

console.log(`\n${toApply.length} page(s) need a swap.`);
if (APPLY && toApply.length) {
  const manifests = (await listManifests(P, 'PAGE')).map((m) => PageManifestSchema.safeParse(m.content)).filter((r) => r.success).map((r) => r.data);
  for (const { key, target } of toApply) {
    const manifest = manifests.find((m) => m.pageId === key);
    if (!manifest) { console.log('  no manifest, skip', key); continue; }
    const decision = planPage(manifest, config, { forcedLayoutTemplate: target as Parameters<typeof planPage>[2]['forcedLayoutTemplate'], reasonCode: 'capacity_layout_swap' });
    await updatePagePlanning(P, key, { layoutTemplate: decision.layoutTemplate, imagePrompt: decision.prompt, imagePromptSha256: decision.promptSha256 });
    console.log(`  applied ${key} → ${decision.layoutTemplate}`);
  }
  console.log('\nNow re-render these keys with _batch to rebuild blueprint + image.');
} else if (toApply.length) {
  console.log('DRY RUN — re-run with --apply <pageKey...> to commit specific pages.');
}
process.exit(0);
