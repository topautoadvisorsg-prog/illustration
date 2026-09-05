/**
 * BEFORE YOU NEED IT — measure what flowed figures would cost, before art exists.
 *
 * Places PLACEHOLDER boxes at the exact teaching anchors, at the exact proposed
 * footprints, through the real layout system — the `![caption](asset){n%}` flow
 * path, not the stamper. Reports the page-count delta for each candidate alone
 * and for the recommended set together.
 *
 * Reads rev-18 and WRITES NOTHING. No art, no spend, no mutation.
 *
 *   yarn tsx scripts/_byni_figure_sim.ts
 */
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { MANUSCRIPT, OUT_DIR, RENDER_INPUT } from './before-you-need-it-config.js';

interface Cand {
  key: string;
  label: string;
  /** Text that ends the paragraph the figure belongs after. */
  after: string;
  widthPct: number;
  /** height / width */
  aspect: number;
  widthIn: number;
}

const CANDIDATES: Cand[] = [
  { key: 'ch03-bra-types', label: 'Bra types (Ch3)',
    after: 'sized small, medium and large like a T-shirt. You pull it on. Nobody measures anything.',
    widthPct: 62, aspect: 1.0, widthIn: 2.7 },
  { key: 'ch03-breast-bud', label: 'Breast bud (Ch3)',
    after: 'it very frequently turns up on one side weeks or months before the other.',
    widthPct: 58, aspect: 1.0, widthIn: 2.5 },
  { key: 'ch06-three-openings', label: 'Three openings (Ch6)',
    after: 'Three, all separate, each with its own job.',
    widthPct: 58, aspect: 1.0, widthIn: 2.5 },
  { key: 'ch06-menstrual-cycle', label: 'Menstrual cycle (Ch6)',
    after: 'passes out through the cervix and the vagina, over several days.',
    widthPct: 78, aspect: 1.0, widthIn: 3.4 },
  { key: 'ch09-tampon-angle', label: 'Tampon angle (Ch9)',
    after: 'There is no prize for persisting on a bad day.',
    widthPct: 62, aspect: 1.0, widthIn: 2.7 },
];

const md = readFileSync(MANUSCRIPT, 'utf8');

/** A grey placeholder at the candidate's aspect, so the box reserves real height. */
async function placeholder(c: Cand): Promise<string> {
  const w = 900;
  const h = Math.round(w * c.aspect);
  const png = await sharp({ create: { width: w, height: h, channels: 3, background: '#d8d8d8' } })
    .composite([{
      input: Buffer.from(
        `<svg width="${w}" height="${h}"><rect x="4" y="4" width="${w - 8}" height="${h - 8}" fill="none" stroke="#555" stroke-width="6" stroke-dasharray="24 16"/></svg>`,
      ),
      top: 0, left: 0,
    }])
    .png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

function inject(markdown: string, cands: Cand[]): string {
  let out = markdown;
  for (const c of cands) {
    const i = out.indexOf(c.after);
    if (i < 0) throw new Error(`anchor not found for ${c.key}`);
    const end = i + c.after.length;
    out = `${out.slice(0, end)}\n\n![](${c.key}){${c.widthPct}%}${out.slice(end)}`;
  }
  return out;
}

const images: Record<string, string> = {};
for (const c of CANDIDATES) {
  const png = readFileSync(`${OUT_DIR}/figures/${c.key}.png`);
  images[c.key] = `data:image/png;base64,${png.toString('base64')}`;
}

console.log('rev-18 read-only. Nothing is written.\n');

const base = await renderTypesetBook({ ...RENDER_INPUT, markdown: md });
const BASE = base.report.totalPages;
const baseStarts = new Map(base.report.sectionStarts.map((s) => [s.title, s.page]));
console.log(`baseline: ${BASE} pages, ${base.report.blankPages.length} blanks\n`);

/**
 * Figures appear in the DOM in manuscript order, so the Nth <figure> block is
 * the Nth injected candidate. Matching on the data URI does not work: every PNG
 * URI shares an opening prefix, and the renderer rewrites the attribute.
 */
const figurePages = (r: Awaited<ReturnType<typeof renderTypesetBook>>): number[] => {
  const ids = [...r.html.matchAll(/<figure[^>]*data-block-id="([^"]+)"/g)].map((m) => m[1]!);
  const alt = [...r.html.matchAll(/data-block-id="([^"]+)"[^>]*>\s*<img/g)].map((m) => m[1]!);
  const use = ids.length ? ids : alt;
  return use.map((id) => {
    for (const [page, list] of Object.entries(r.report.pageBlocks)) if (list.includes(id)) return Number(page);
    return -1;
  });
};

async function run(cands: Cand[], title: string) {
  const r = await renderTypesetBook({ ...RENDER_INPUT, markdown: inject(md, cands), images });
  const rep = r.report;
  const moved = base.report.sectionStarts
    .map((s) => ({ t: s.title, was: s.page, now: rep.sectionStarts.find((x) => x.title === s.title)?.page }))
    .filter((x) => x.now !== undefined && x.now !== x.was);
  console.log(`── ${title}`);
  console.log(`   pages ${BASE} -> ${rep.totalPages}  (delta ${rep.totalPages - BASE >= 0 ? '+' : ''}${rep.totalPages - BASE})`);
  console.log(`   blanks ${rep.blankPages.length}   v-overflow ${rep.verticalOverflowPages.length}   h-overflow ${rep.horizontalOverflow.length}`);
  const pages = figurePages(r);
  const ordered = CANDIDATES.filter((c) => cands.includes(c));
  ordered.forEach((c, i) => {
    const p = pages[i];
    console.log(`   ${c.label.padEnd(24)} figure lands p${p && p > 0 ? p : '?'}   ${c.widthIn}in wide`);
  });
  console.log(`   sections shifted: ${moved.length}${moved.length ? ` (first: ${moved[0]!.t} p${moved[0]!.was} -> p${moved[0]!.now})` : ''}`);
  void baseStarts;
  return rep.totalPages;
}

for (const c of CANDIDATES) await run([c], `${c.label} ALONE`);
console.log('');
await run(CANDIDATES, 'ALL FIVE — the approved set');
process.exit(0);
