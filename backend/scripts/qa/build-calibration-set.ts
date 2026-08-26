/**
 * build-calibration-set — the labelled pages the vision profile is tuned against.
 *
 *   tsx scripts/qa/build-calibration-set.ts --out DIR
 *
 * WHY THIS EXISTS. The page-layout profile was tuned against a real commercial
 * book, four times, and oscillated between excusing a half-erased page and
 * condemning pages with an ordinary bottom margin. Tuning against production is
 * how that happens: there is no ground truth, so every change looks like an
 * improvement on whichever page you last looked at.
 *
 * So: a repository-owned book, rendered, with defects introduced ON PURPOSE and
 * a label file kept OUTSIDE the prompt.
 *
 * KNOWN-GOOD samples are real rendered pages of the calibration book.
 * KNOWN-BAD samples are those same pages with ONE controlled defect each, so a
 * miss can be attributed to something specific.
 *
 * TUNING and HOLDOUT are split deterministically. The holdout is never looked at
 * while the prompt is being changed; it is the only defence against a prompt
 * that has memorised the examples it was shown.
 *
 * Free: renders locally, no model calls.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ProjectConfigSchema } from '@wildlands/shared';
import { renderTypesetBook } from '../../src/pipeline/typeset/render-typeset.js';
import { TRADE_NONFICTION_GUIDE_TYPESET_V2 } from '../../src/pipeline/typeset/layout-standards/trade-nonfiction-guide-v2.js';
import { buildPageModel } from '../../src/pipeline/page-qa/page-model.js';
import { classifyPages } from '../../src/pipeline/page-qa/page-roles.js';
import { rasterizePages } from '../../src/pipeline/page-qa/raster.js';
import type { PageRole } from '../../src/pipeline/page-qa/page-roles.js';

const argv = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return undefined;
  if (hit.includes('=')) return hit.slice(hit.indexOf('=') + 1);
  const next = argv[argv.indexOf(hit) + 1];
  return next && !next.startsWith('--') ? next : '';
};
const OUT = flag('out') ?? '.page-qa/calibration';

/**
 * A calibration book: deliberately dull, deliberately long enough to produce
 * real BODY pages, which the nine-page fixture book does not.
 */
function manuscript(): string {
  const para = (i: number): string =>
    [
      `Paragraph ${i} exists to occupy a measure of running text so that pagination`,
      `has something to do. It says nothing worth remembering and it describes`,
      `nothing that is real. A calibration fixture which reads well invites editing,`,
      `and an edited fixture quietly stops being a fixture at all. The sentences`,
      `here continue for long enough to wrap several times over, because a single`,
      `short line would not exercise a text block in any useful way. Filler number`,
      `${i} carries on a little further so that the paragraph occupies a believable`,
      `share of the measure, and so that consecutive paragraphs differ from each`,
      `other rather than collapsing into one repeated block of identical text.`,
    ].join('\n');

  const chapter = (n: number, title: string, paras: number, sub?: string): string => {
    const out = [`## Chapter ${n}: ${title}`, ''];
    for (let i = 1; i <= paras; i += 1) {
      if (sub && i === Math.ceil(paras / 2)) out.push(`### ${sub}`, '');
      out.push(para(i), '');
    }
    return out.join('\n');
  };

  return [
    '# THE CALIBRATION VOLUME',
    '',
    '### A Synthetic Book for Tuning Page QA',
    '',
    '## About This Volume',
    '',
    para(0),
    '',
    '# PART ONE — RUNNING TEXT',
    '',
    chapter(1, 'Ordinary Pages', 26, 'A Subheading Partway Through'),
    chapter(2, 'More Ordinary Pages', 26, 'Is This Normal?'),
    '# PART TWO — STRUCTURE',
    '',
    chapter(3, 'Pages With Furniture', 24, 'Another Subheading'),
    '# BACK MATTER',
    '',
    '## Sources',
    '',
    '1. The Calibration Standards Board. *Nothing Real.* Synthetic Press, 2026.',
    '2. A second entry, so the list has more than one.',
    '',
  ].join('\n');
}

const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'The Calibration Volume',
  authorName: 'The Calibration Standards Board',
  trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0.125 },
  paperStock: 'white',
});

console.log('\nBUILDING THE CALIBRATION SET');
console.log('─'.repeat(78));

const rendered = await renderTypesetBook({
  markdown: manuscript(),
  config,
  layoutStandard: TRADE_NONFICTION_GUIDE_TYPESET_V2,
  chaptersStartRecto: true,
});
const model = await buildPageModel(rendered.pdf);
const roles = classifyPages(model.pages, model.norms);
const roleOf = new Map(roles.map((r) => [r.page, r.role]));
console.log(`  rendered         ${model.pageCount} pages`);

const raster = await rasterizePages(rendered.pdf, model.pages.map((p) => p.n), { scale: 2 });
console.log(`  rasterised       ${raster.pages.size} at ${raster.widthPx}x${raster.heightPx}px`);

mkdirSync(path.join(OUT, 'samples'), { recursive: true });

export interface Sample {
  id: string;
  file: string;
  /** The truth, kept OUT of the prompt. */
  label: 'GOOD' | 'BAD';
  role: PageRole;
  /** For a bad sample, the single defect introduced. */
  defect?: string;
  /** Which severity a correct system should reach. */
  expect: 'CLEAN_OR_EXPECTED' | 'REVIEW_OR_WORSE' | 'HARD_FAIL';
  split: 'TUNING' | 'HOLDOUT';
  sourcePage: number;
}

const samples: Sample[] = [];
const W = raster.widthPx;
const H = raster.heightPx;

const write = async (id: string, png: Buffer, s: Omit<Sample, 'id' | 'file'>) => {
  const file = path.join('samples', `${id}.png`);
  writeFileSync(path.join(OUT, file), png);
  samples.push({ id, file, ...s });
};

/** Paint white over a band of the page, erasing whatever was there. */
const erase = async (png: Buffer, topFraction: number, heightFraction: number): Promise<Buffer> =>
  sharp(png)
    .composite([
      {
        input: {
          create: {
            width: W,
            height: Math.max(1, Math.round(H * heightFraction)),
            channels: 3,
            background: '#ffffff',
          },
        },
        top: Math.round(H * topFraction),
        left: 0,
      },
    ])
    .png()
    .toBuffer();

/** Draw an opaque block, to simulate a collision or a clipped object. */
const block = async (png: Buffer, topFraction: number, heightFraction: number): Promise<Buffer> =>
  sharp(png)
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Math.round(H * heightFraction)}">` +
            `<rect x="${Math.round(W * 0.08)}" y="0" width="${Math.round(W * 0.84)}" height="${Math.round(H * heightFraction * 0.8)}" fill="#222"/></svg>`,
        ),
        top: Math.round(H * topFraction),
        left: 0,
      },
    ])
    .png()
    .toBuffer();

// ── choose sources by role ──────────────────────────────────────────────────
const byRole = (r: PageRole): number[] => model.pages.filter((p) => roleOf.get(p.n) === r).map((p) => p.n);
const bodyPages = byRole('BODY');
const openerPages = byRole('CHAPTER_OPENER');
const endPages = byRole('CHAPTER_END');
const blankPages = byRole('PARITY_BLANK');

if (bodyPages.length < 6) {
  console.error(`  FAIL: only ${bodyPages.length} BODY pages; the calibration book is too short.`);
  process.exit(1);
}

const png = (n: number): Buffer => raster.pages.get(n)!;
const alternate = (i: number): 'TUNING' | 'HOLDOUT' => (i % 2 === 0 ? 'TUNING' : 'HOLDOUT');

// ── KNOWN-GOOD ──────────────────────────────────────────────────────────────
let gi = 0;
for (const n of bodyPages.slice(0, 6)) {
  await write(`good-body-${n}`, png(n), {
    label: 'GOOD',
    role: 'BODY',
    expect: 'CLEAN_OR_EXPECTED',
    split: alternate(gi++),
    sourcePage: n,
  });
}
for (const n of openerPages.slice(0, 3)) {
  await write(`good-opener-${n}`, png(n), {
    label: 'GOOD',
    role: 'CHAPTER_OPENER',
    expect: 'CLEAN_OR_EXPECTED',
    split: alternate(gi++),
    sourcePage: n,
  });
}
for (const n of endPages.slice(0, 3)) {
  await write(`good-chapterend-${n}`, png(n), {
    label: 'GOOD',
    role: 'CHAPTER_END',
    expect: 'CLEAN_OR_EXPECTED',
    split: alternate(gi++),
    sourcePage: n,
  });
}
for (const n of blankPages.slice(0, 2)) {
  await write(`good-blank-${n}`, png(n), {
    label: 'GOOD',
    role: 'PARITY_BLANK',
    expect: 'CLEAN_OR_EXPECTED',
    split: alternate(gi++),
    sourcePage: n,
  });
}

// ── KNOWN-BAD, one controlled defect each ───────────────────────────────────
let bi = 0;
const b = (i: number) => bodyPages[i % bodyPages.length]!;

// THE PERMANENT NEGATIVE CONTROL. This is the page that exposed the failure.
await write('bad-body-erased-45', await erase(png(b(0)), 0.5, 0.45), {
  label: 'BAD',
  role: 'BODY',
  defect: 'bottom 45% of a BODY page erased',
  expect: 'HARD_FAIL',
  split: 'TUNING',
  sourcePage: b(0),
});
// Its role contrast: identical pixels, legitimate context.
await write('good-chapterend-erased-45', await erase(png(b(0)), 0.5, 0.45), {
  label: 'GOOD',
  role: 'CHAPTER_END',
  defect: 'same pixels as bad-body-erased-45, but a chapter ending',
  expect: 'CLEAN_OR_EXPECTED',
  split: 'TUNING',
  sourcePage: b(0),
});

const bads: Array<[string, Promise<Buffer>, PageRole, string, Sample['expect']]> = [
  ['bad-body-erased-28', erase(png(b(1)), 0.66, 0.28), 'BODY', 'bottom 28% of a BODY page unexpectedly empty', 'REVIEW_OR_WORSE'],
  ['bad-body-middle-hole', erase(png(b(2)), 0.38, 0.26), 'BODY', 'a hole punched in the MIDDLE of a body page', 'REVIEW_OR_WORSE'],
  ['bad-body-erased-60', erase(png(b(3)), 0.35, 0.6), 'BODY', 'bottom 60% of a BODY page erased', 'HARD_FAIL'],
  ['bad-collision', block(png(b(4)), 0.45, 0.18), 'BODY', 'an opaque object drawn over the text', 'HARD_FAIL'],
  ['bad-clipped-top', block(png(b(5)), 0.02, 0.1), 'BODY', 'an object clipped at the head margin', 'HARD_FAIL'],
  ['bad-blank-with-furniture', Promise.resolve(png(b(0))), 'PARITY_BLANK', 'a fully set page declared a parity blank: furniture and text present', 'HARD_FAIL'],
];
for (const [id, work, role, defect, expect] of bads) {
  await write(id, await work, { label: 'BAD', role, defect, expect, split: alternate(bi++), sourcePage: 0 });
}

// ── labels, kept OUT of the prompt ──────────────────────────────────────────
writeFileSync(path.join(OUT, 'labels.json'), JSON.stringify({ samples }, null, 2));

const count = (l: string, s: string) => samples.filter((x) => x.label === l && x.split === s).length;
console.log(`  samples          ${samples.length}`);
console.log(`    GOOD           ${samples.filter((s) => s.label === 'GOOD').length}  (tuning ${count('GOOD', 'TUNING')}, holdout ${count('GOOD', 'HOLDOUT')})`);
console.log(`    BAD            ${samples.filter((s) => s.label === 'BAD').length}  (tuning ${count('BAD', 'TUNING')}, holdout ${count('BAD', 'HOLDOUT')})`);
console.log(`  labels.json      ${path.join(OUT, 'labels.json')}`);
console.log('  (labels live here, never in the prompt)\n');
