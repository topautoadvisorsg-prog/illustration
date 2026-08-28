/**
 * WHERE EVERY NOBODY WARNED ME PANEL LANDS, AND HOW MUCH OF ITS PAGE IT FILLS.
 *
 * A panel that appears on two pages is split. A panel alone on a page is judged
 * by how much of the text block it occupies, because that is what decides
 * whether the page reads as composed or as a box with a hole under it.
 *
 *   npx tsx scripts/national-parks-panel-audit.ts
 */
await import('../src/env.js');
process.env.CHROMIUM_PATH ??= 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const PID = '92c4ab36-4956-4435-b656-d2679fbc73d9';
const { ProjectConfigSchema } = await import('@wildlands/shared');
const { getProject } = await import('../src/db/repositories/projects.repo.js');
const { buildTypesetInterior } = await import('../src/pipeline/typeset/build-typeset-interior.js');

const project = await getProject(PID);
const config = ProjectConfigSchema.parse(project!.config);
const r = await buildTypesetInterior(PID, config, { chaptersStartRecto: true, reviewGuides: false });
if (!r.probe) throw new Error('no probe in this build');

const PX = 96;
const H = config.trimSize.heightIn;
const m = r.report.marginsIn;
/** The painted text block: what a page has to give. */
const textBlockIn = H - m.topIn - m.bottomIn;

const byBlock = new Map<string, typeof r.probe>();
for (const b of r.probe) {
  if (!b.kind.includes('alert-panel')) continue;
  const list = byBlock.get(b.blockId) ?? [];
  list.push(b);
  byBlock.set(b.blockId, list);
}

console.log(`page ${config.trimSize.widthIn} x ${H}in   text block ${textBlockIn.toFixed(2)}in   pages ${r.pageCount}\n`);
console.log('  block     pages        panel height   share of text block   other blocks on that page');
console.log('  ' + '-'.repeat(88));

const rows: { blockId: string; pages: number[]; heightIn: number; share: number; alone: boolean }[] = [];
for (const [blockId, frags] of byBlock) {
  const pages = [...new Set(frags.map((f) => f.page).filter((p): p is number => p !== null))].sort((a, b) => a - b);
  /**
   * Height is summed PER FRAGMENT, never taken as max(bottom) - min(top).
   * A split panel has its first fragment low on one page and its second high on
   * the next, so that subtraction spans the page break and reports very nearly
   * the whole text block no matter how short the panel really is.
   */
  const heightIn = frags.reduce((sum, f) => sum + (f.bottomPx - (f.lines[0]?.[0] ?? f.bottomPx)), 0) / PX;
  const perPage = frags
    .map((f) => `p${f.page}:${((f.bottomPx - (f.lines[0]?.[0] ?? f.bottomPx)) / PX).toFixed(2)}in`)
    .join(' + ');
  const share = heightIn / textBlockIn;
  const others = r.probe.filter((b) => pages.includes(b.page ?? -1) && b.blockId !== blockId).length;
  rows.push({ blockId, pages, heightIn, share, alone: others === 0 });
  const flag = pages.length > 1 ? '  SPLIT' : others === 0 ? '  alone on the page' : '';
  console.log(
    `  ${blockId}  ${pages.join(',').padEnd(11)}  ${heightIn.toFixed(2)}in`.padEnd(46) +
    `${(share * 100).toFixed(0)}%`.padStart(6) + `                ${others}${flag}`,
  );
  if (frags.length > 1) console.log(`              fragments: ${perPage}`);
}
const split = rows.filter((x) => x.pages.length > 1);
console.log(`\n${rows.length} panel(s). ${split.length} split: ${split.map((x) => `${x.blockId} (pp${x.pages.join('-')})`).join(', ') || 'none'}`);
process.exit(0);
