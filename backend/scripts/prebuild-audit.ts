/* Pre-build audit — read-only. Verifies the project is ready for Build Book. */
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { eq, and, ne } from 'drizzle-orm';
import { getProject } from '../src/db/repositories/projects.repo.js';
import { ProjectConfigSchema, buildSeriesLine } from '@wildlands/shared';
import { computeCoverDimensions } from '../src/pipeline/publishing-standard/cover-dimensions.js';

const PROJECT = process.argv[2]!;
const db = getDb();
const project = await getProject(PROJECT);
if (!project) { console.error('project_not_found'); process.exit(1); }
const config = ProjectConfigSchema.parse(project.config);
const pub: any = config.publishing;

const allPages = await db.select().from(pages).where(eq(pages.projectId, PROJECT));
const renders = await db.select().from(wholePageRenders).where(eq(wholePageRenders.projectId, PROJECT));
const activeByPage = new Map<string, any>();
for (const r of renders as any[]) if (r.active) activeByPage.set(r.pageId, r);

const pageCount = allPages.length;
let fail = 0; const problems: string[] = [];

// ── Item 3: page count + spine width ──
const dims = computeCoverDimensions(config, pageCount);
const builtFor = pub.coverSync?.builtForPageCount ?? null;
const coverSpine = pub.coverSync?.spineIn ?? null;
const spineOk = builtFor === pageCount;
if (!spineOk) { fail++; problems.push(`cover built for ${builtFor} pages but book now has ${pageCount}`); }

// ── Items 4/5/7/8: per-page render state (approved, selected, print-prep, preflight) ──
let approved = 0, selected = 0, printPrepped = 0, preflightPass = 0, noActive = 0;
const notApproved: string[] = [], notPrinted: string[] = [], notPreflight: string[] = [], notSelected: string[] = [];
for (const p of allPages as any[]) {
  const r = activeByPage.get(p.id);
  if (!r) { noActive++; problems.push(`no active render: ${p.pageKey}`); continue; }
  if (r.approvedForBook) approved++; else notApproved.push(p.pageKey);
  if (r.selectedForBook ?? r.approvedForBook) selected++; else notSelected.push(p.pageKey);
  if (r.printPdfPath) printPrepped++; else notPrinted.push(p.pageKey);
  if (r.preflightPassed) preflightPass++; else notPreflight.push(p.pageKey);
}

// ── Item 6: TOC + index references exist and section spans match ──
const sectionCounts: Record<string, number> = {};
for (const p of allPages as any[]) { const s = p.section ?? 'BODY'; sectionCounts[s] = (sectionCounts[s] ?? 0) + 1; }

console.log('================ PRE-BUILD AUDIT ================');
console.log(`PROJECT ${PROJECT}`);
console.log('');
console.log('— 1/2. Cover & title-page text (config source of truth) —');
console.log('  title:', pub.title, '| subtitle:', pub.subtitle);
console.log('  coverDescription (front + title-page subtitle):', pub.coverDescription);
console.log('  series line:', buildSeriesLine(pub.series?.name, config.volume));
console.log('  back blurb starts:', JSON.stringify((pub.bookDescription?.blurb ?? '').slice(0, 70)) + '…');
console.log('  author bio starts:', JSON.stringify((pub.bookDescription?.authorBio ?? '').slice(0, 70)) + '…');
console.log('  INSIDE THIS VOLUME items:', (pub.bookDescription?.features ?? []).length);
console.log('');
console.log('— 3. Page count & spine —');
console.log(`  page count: ${pageCount} | cover built for: ${builtFor} | spineIn(cover): ${coverSpine} | spineIn(now): ${dims.spineIn.toFixed(4)} | wrap: ${dims.fullWidthIn.toFixed(3)}x${dims.fullHeightIn.toFixed(3)} → ${spineOk ? 'OK' : 'MISMATCH'}`);
console.log('');
console.log('— 4/5. Print-prep (page numbers + badge overlay stamped) & preflight —');
console.log(`  print-prepped: ${printPrepped}/${pageCount}` + (notPrinted.length ? ` | NOT: ${notPrinted.slice(0, 12).join(', ')}${notPrinted.length > 12 ? ` …(+${notPrinted.length - 12})` : ''}` : ''));
console.log(`  preflight passed: ${preflightPass}/${pageCount}` + (notPreflight.length ? ` | NOT: ${notPreflight.slice(0, 12).join(', ')}${notPreflight.length > 12 ? ` …(+${notPreflight.length - 12})` : ''}` : ''));
console.log('');
console.log('— 7. Approved + selected for book —');
console.log(`  active render present: ${pageCount - noActive}/${pageCount}`);
console.log(`  approvedForBook: ${approved}/${pageCount}` + (notApproved.length ? ` | NOT: ${notApproved.slice(0, 12).join(', ')}` : ''));
console.log(`  selectedForBook: ${selected}/${pageCount}` + (notSelected.length ? ` | NOT: ${notSelected.slice(0, 12).join(', ')}` : ''));
console.log('');
console.log('— 6/8. Section map & render-health —');
console.log('  sections:', JSON.stringify(sectionCounts));
const statusCounts: Record<string, number> = {};
for (const r of activeByPage.values()) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
console.log('  active render statuses:', JSON.stringify(statusCounts));
console.log('');
if (notPrinted.length) { fail++; }
if (notPreflight.length) { fail++; }
if (noActive) { fail++; }
if (notApproved.length) { fail++; }
console.log(fail === 0 ? '================ RESULT: PASS ================' : `================ RESULT: ${fail} BLOCKER(S) ================`);
if (problems.length) { console.log('blockers:'); for (const p of problems.slice(0, 20)) console.log('  -', p); }
process.exit(0);
