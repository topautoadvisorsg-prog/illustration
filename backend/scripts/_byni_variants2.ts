/**
 * BEFORE YOU NEED IT — measure candidate fixes for p60 and p41 before choosing.
 *
 * Renders each candidate through the real layout system and reports what it
 * costs: the hole it closes, the holes it opens, where the figures land, whether
 * the page count moves. Choosing by argument rather than by measurement is what
 * produced the illustration set that had to be thrown away.
 *
 *   yarn tsx scripts/_byni_variants2.ts
 *
 * WRITES NOTHING. Local and free.
 */
import { readFileSync } from 'node:fs';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { buildPageModel, type ModelPage } from '../src/pipeline/page-qa/page-model.js';
import { MANUSCRIPT, RENDER_INPUT, CONFIG } from './before-you-need-it-config.js';

const BASE = readFileSync(MANUSCRIPT, 'utf8');
const FIG = '![](ch06-three-openings){58%}';
const REASSURE = 'Girls who don';

/** Move the three-openings figure from after the anchor to after the reassurance. */
function figureLater(md: string, width = 58): string {
  const cut = md.replace(`\n\n${FIG}`, '');
  if (cut === md) throw new Error('figure line not found');
  const lines = cut.split('\n');
  const i = lines.findIndex((l) => l.startsWith(REASSURE));
  if (i < 0) throw new Error('reassurance paragraph not found');
  lines.splice(i + 1, 0, '', `![](ch06-three-openings){${width}%}`);
  return lines.join('\n');
}
const resize = (md: string, pct: number): string => md.replace(FIG, `![](ch06-three-openings){${pct}%}`);

const empty = (p: ModelPage, top: number, bot: number): number => {
  const t = p.textBox ? p.textBox.y0 : Infinity;
  const a = p.images.length ? Math.min(...p.images.map((b) => b.y0)) : Infinity;
  const l = Math.min(t, a);
  return Number.isFinite(l) ? Math.max(0, (l - bot) / (top - bot)) : 1;
};

type OV = Record<string, Record<string, unknown>>;
interface V { name: string; md?: string; ov?: OV }

const V: V[] = [
  { name: 'as-built (rev-19 today)' },
  { name: 'p60-A  figure moved after the reassurance paragraph', md: figureLater(BASE) },
  { name: 'p60-B  figure shrunk 58% -> 50%, anchor unchanged', md: resize(BASE, 50) },
  { name: 'p41-C  page break before "The fuss is worse than the change"',
    ov: { e0ec40b5: { breakBefore: 'page', note: 'test' } } },
  { name: 'p41-D  keepWithNext on "That part isn\u2019t yours to fix"',
    ov: { e703dd69: { keepWithNext: true, note: 'test' } } },
  { name: 'p41-E  page break before "And most of what makes this miserable"',
    ov: { ef8ab5af: { breakBefore: 'page', note: 'test' } } },
  { name: 'p41-F  keepWithNext on "And most of what makes this miserable"',
    ov: { ef8ab5af: { keepWithNext: true, note: 'test' } } },
  { name: 'BOTH   p60-A + p41-C', md: figureLater(BASE),
    ov: { e0ec40b5: { breakBefore: 'page', note: 'test' } } },
];

for (const v of V) {
  const cfg = v.ov
    ? { ...CONFIG, layoutOverrides: { ...(CONFIG as unknown as { layoutOverrides: OV }).layoutOverrides, ...v.ov } }
    : CONFIG;
  const r = await renderTypesetBook({ ...RENDER_INPUT, config: cfg, markdown: v.md ?? BASE });
  const m = await buildPageModel(r.pdf);
  const { textBlockTopPt: T, textBlockBottomPt: B } = m.norms;
  const art = m.pages.filter((p) => p.images.length).map((p) => p.n);
  // A hole on an ordinary body page: no art, more than a closing beat's worth of
  // text, and a foot that stops more than a quarter of the block short.
  const holes = m.pages
    .filter((p) => !p.images.length && p.body.length > 6 && empty(p, T, B) > 0.25 && !/^Chapter \d/.test(p.headings[0]?.text ?? ''))
    .map((p) => `p${p.n} ${(empty(p, T, B) * 100).toFixed(0)}%`);
  const leaves = m.pages
    .filter((p) => p.body.length > 0 && p.body.length <= 4 && !p.images.length)
    .map((p) => `p${p.n} ${p.body.length}L ${(empty(p, T, B) * 100).toFixed(0)}%`);
  console.log(`\n── ${v.name}`);
  console.log(`   ${r.report.totalPages}pp  blanks ${r.report.blankPages.length}  v-of ${r.report.verticalOverflowPages.length}  h-of ${r.report.horizontalOverflow.length}`);
  console.log(`   figures land on ${art.map((n) => `p${n}`).join(' ')}`);
  console.log(`   body-page holes >25%: ${holes.length ? holes.join(', ') : 'none'}`);
  console.log(`   <=4-line leaves:      ${leaves.length ? leaves.join(', ') : 'none'}`);
  // The two detectors above leave a blind spot between "<=4-line leaf" and
  // ">6-line hole": a 5-line page shows in neither. Print the pages under test.
  for (const n of [40, 41, 42]) {
    const p = m.pages[n - 1];
    if (p) console.log(`   p${n}: ${String(p.body.length).padStart(2)} lines, ${(empty(p, T, B) * 100).toFixed(0)}% empty`);
  }
}
process.exit(0);
