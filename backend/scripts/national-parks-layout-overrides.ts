/**
 * Local layout exceptions for 7 NATIONAL PARKS, keyed by stable block id.
 *
 * The rule this file follows is the platform's own:
 *
 *     systemic defect -> fix the layout standard
 *     isolated defect -> local override
 *     manuscript      -> frozen, always
 *
 * A page-by-page read of the printed proof found five one-line widows and two
 * headings sitting above a single line. Both classes were first attempted as
 * systemic rules and both were reverted: binding every heading to two paragraphs
 * fixed the two headings, added two pages, and reshuffled breaks elsewhere in
 * the book. Two headings out of roughly a hundred is not a systemic defect. It
 * is seven exceptions, and this is where exceptions live.
 *
 * WHY THESE TWO CONTROLS
 *   keepTogether on a widowed paragraph moves the WHOLE paragraph over rather
 *   than leaving its last line alone at the top of a page. Paged.js honours
 *   break-inside; it ignores the `widows` property entirely, which is why the
 *   standard already declaring `widows: 2` changed nothing.
 *
 *   breakBefore: page on a heading unit moves the heading and its text to the
 *   next page rather than leaving the heading with one line beneath it. The
 *   heading and its first paragraph are already one indivisible unit, so there
 *   is nothing left for keepTogether to do.
 *
 *   npx tsx scripts/national-parks-layout-overrides.ts --dry-run
 *   npx tsx scripts/national-parks-layout-overrides.ts
 */
import type { LayoutOverride } from '@wildlands/shared';

await import('../src/env.js');
const DRY = process.argv.includes('--dry-run');

const { P } = await import('./_project.js');
const { ProjectConfigSchema } = await import('@wildlands/shared');
const { getProject, updateProjectConfig } = await import('../src/db/repositories/projects.repo.js');

/**
 * Block ids come from `report.pageBlocks` on the build being corrected, never
 * from a page number typed in by hand — pagination has already moved four times
 * on this book and a page-keyed exception would silently re-point at unrelated
 * text.
 */
const OVERRIDES: Record<string, LayoutOverride> = {
  // ── Five one-line widows: the paragraph moves whole ──────────────────────
  /**
   * NOT FORCED, and deliberately so.
   *
   * "Selection runs about one in five" is a single sentence that already fits on
   * one line. It was never a widow — it is a WHOLE short paragraph that happened
   * to land alone at the top of a page, which looks the same to a reader and is
   * a different thing to a typesetter. keepTogether has nothing to hold.
   *
   * The control that does work is `break-before: avoid`, and it was measured:
   * it fixes the page and costs TWO more pages and a sixth parity blank, because
   * forcing the break earlier cascades. Trading two blank leaves for one tidy
   * page top is not an improvement to the book, so it stays as it is and is
   * reported rather than hidden.
   */
  '7f4b3917': { keepTogether: true, note: 'p75: whole one-line paragraph alone at a page top. Left as-is; break-before:avoid costs 2 pages and a 6th blank.' },
  bf8a8ea6: { keepTogether: true, note: 'p77 widow: tail "Grove plus Glacier Point Road properly." was alone at the page top.' },
  '4f665a70': { keepTogether: true, note: 'p87 widow: paragraph tail alone at the page top.' },
  '8f99ddd3': { keepTogether: true, note: 'p92 widow: "hour out and served by the national carriers." was alone at the page top.' },
  '7f9b5d43': { keepTogether: true, note: 'p94 widow: paragraph tail alone at the page top.' },
  // ── Two headings left above a single line ────────────────────────────────
  '19d231ec': {
    breakBefore: 'page',
    note: 'p58: "Below the rim: who should, who shouldn\'t, and which trail" sat above one line.',
  },
  f5a79310: {
    breakBefore: 'page',
    note: 'p64: "Wildlife and what to look for" sat above one line.',
  },
};

const project = await getProject(P);
if (!project) throw new Error(`project ${P} not found`);
const config = ProjectConfigSchema.parse(project.config);

const before = Object.keys(config.layoutOverrides ?? {}).length;
const next = { ...config, layoutOverrides: { ...(config.layoutOverrides ?? {}), ...OVERRIDES } };

console.log(`project   : ${P}`);
console.log(`overrides : ${before} -> ${Object.keys(next.layoutOverrides).length}\n`);
for (const [id, o] of Object.entries(OVERRIDES)) {
  const what = o.keepTogether ? 'keepTogether' : o.breakBefore ? `breakBefore:${o.breakBefore}` : '?';
  console.log(`  ${id}  ${what.padEnd(18)} ${o.note ?? ''}`);
}

if (DRY) {
  console.log('\nDRY RUN — nothing written.');
  process.exit(0);
}
await updateProjectConfig(P, ProjectConfigSchema.parse(next));
console.log('\nwritten. Rebuild the interior, then check that nothing new was pushed out of place.');
process.exit(0);
