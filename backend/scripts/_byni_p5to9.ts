/**
 * BEFORE YOU NEED IT — what is actually on a run of pages, block by block.
 *
 * Diagnostic only, local and free. Prints every block on the requested pages
 * with its id, its first words and its measured line count, plus the slack left
 * at the foot of each page, so a repair is chosen from geometry rather than
 * from a guess.
 *
 * The foot of the text block is taken from the BOOK — the deepest any line box
 * reaches across the whole render — rather than from an assumed pixel-per-inch,
 * so the slack figure cannot be wrong about the unit.
 *
 *   yarn tsx scripts/_byni_p5to9.ts [--from=4] [--to=10] [--pdf=out.pdf]
 */
import { writeFileSync } from 'node:fs';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { RENDER_INPUT, readManuscript } from './before-you-need-it-config.js';

const arg = (k: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);

const FROM = Number(arg('from') ?? 4);
const TO = Number(arg('to') ?? 10);
const OUT = arg('pdf');

const { md } = readManuscript();
const render = await renderTypesetBook({ ...RENDER_INPUT, markdown: md, deepProbe: true });
if (OUT) writeFileSync(OUT, render.pdf);

const r = render.report;
console.log(`${r.totalPages} pages, ${r.blankPages.length} blanks, ${r.verticalOverflowPages.length} v-overflow\n`);

const probe = render.probe ?? [];
/** The deepest any line box reaches, which is the foot of the text block. */
const FOOT = Math.max(...probe.filter((b) => b.lines.length).map((b) => b.bottomPx));
/** The highest any line box starts, which is the head of the text block. */
const HEAD = Math.min(...probe.flatMap((b) => b.lines.map((l) => l[0])));
const LEADING = 16 * (96 / 72); // 12pt on 16pt leading, in CSS px
console.log(`text block ${HEAD.toFixed(1)}..${FOOT.toFixed(1)}px, leading ${LEADING.toFixed(2)}px\n`);

const first = (id: string): string => {
  const i = render.html.indexOf(`data-block-id="${id}"`);
  if (i < 0) return '(not in html)';
  const gt = render.html.indexOf('>', i);
  return render.html
    .slice(gt + 1, gt + 400)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
};

for (let n = FROM; n <= TO; n += 1) {
  const on = probe.filter((b) => b.page === n && b.lines.length > 0);
  console.log(`── p${n} ${'─'.repeat(66)}`);
  for (const b of on) {
    console.log(
      `   ${b.blockId}${b.frag ? `#${b.frag}` : '  '}  ${String(b.lines.length).padStart(2)} line(s)  ` +
        `${b.kind.padEnd(16)} "${first(b.blockId)}"`,
    );
  }
  if (!on.length) {
    console.log('   (no blocks — blank page)');
    continue;
  }
  const lowest = Math.max(...on.map((b) => b.bottomPx));
  const slack = FOOT - lowest;
  console.log(
    `   lowest ink ${lowest.toFixed(1)}px → slack ${slack.toFixed(1)}px = ${(slack / LEADING).toFixed(2)} lines`,
  );
}
process.exit(0);
