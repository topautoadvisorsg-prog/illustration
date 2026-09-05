/**
 * BEFORE YOU NEED IT — try candidate overrides on p6 / p8 and SHOOT them.
 *
 * Diagnostic only, local and free. Renders the production book once per
 * candidate, reports what moved, and writes a greyscale PNG of each page so the
 * choice is made from the page rather than from a theory.
 *
 *   yarn tsx scripts/_byni_variants.ts
 */
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { ProjectConfigSchema } from '@wildlands/shared';
import type { LayoutOverride } from '@wildlands/shared';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { TYPESET_DONE_JS } from '../src/pipeline/typeset/typeset-book.js';
import { REPEAT_TABLE_HEADERS_JS } from '../src/pipeline/typeset/render-typeset.js';
import { resolveChromiumPath } from '../src/pipeline/stage-6-layout/render-pdf.js';
import { CONFIG, RENDER_INPUT, OUT_DIR, readManuscript } from './before-you-need-it-config.js';

const DIR = `${OUT_DIR}/variants`;
mkdirSync(DIR, { recursive: true });

/**
 * p7's stranded closing note, and the blocks on p6 that could make room for it.
 *
 * p6 ends with 45.5px of the text block unused; the note is 65.6px plus its own
 * top margin, so about 24px — a little over one line — has to come from
 * somewhere on p6. The question this answers is WHERE it can come from without
 * the page looking compressed.
 */
const NOTE = '5423448d';
const HEADER = '9be05f8d';
const FIRST = '264efcd4';
/** Every body paragraph on p6, in reading order. */
const P6_PARAS = ['264efcd4', '0cdf68ce', 'cfc7c686', '7b82fd25', 'dc436533', '9320eeca', 'ff5cad97', '073541bd'];

interface Candidate {
  id: string;
  label: string;
  extra: Record<string, LayoutOverride>;
  shoot: number[];
}

const flat = (ids: string[], o: LayoutOverride): Record<string, LayoutOverride> =>
  Object.fromEntries(ids.map((id) => [id, o]));

const CANDIDATES: Candidate[] = [
  { id: 'a-asis', label: 'as-is (control)', extra: {}, shoot: [113, 114] },
  {
    id: 'b-keepwithnext',
    label: 'bind the lead-in to the sentence it introduces',
    extra: { e1c2ca96: { keepWithNext: true } },
    shoot: [113, 114],
  },
];




const { md } = readManuscript();
const chromium = resolveChromiumPath();
if (!chromium) throw new Error('No Chromium. Set CHROMIUM_PATH.');
const { default: puppeteer } = await import('puppeteer-core');
const browser = await puppeteer.launch({
  executablePath: chromium,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
});

/** Content box, from the standard's own margins: 8.5in less 0.625in top and foot. */
const CONTENT_TOP = 0.625 * 96;
const CONTENT_BOTTOM = 8.5 * 96 - 0.625 * 96;

try {
  for (const c of CANDIDATES) {
    const config = ProjectConfigSchema.parse({
      ...CONFIG,
      layoutOverrides: { ...CONFIG.layoutOverrides, ...c.extra },
    });
    const render = await renderTypesetBook({ ...RENDER_INPUT, config, markdown: md, deepProbe: true });
    const r = render.report;
    const probe = render.probe ?? [];

    const where = (id: string) => probe.filter((b) => b.blockId === id).map((b) => b.page).join('/');
    const gapUnderHeading = (() => {
      const h = probe.find((b) => b.blockId === HEADER && b.lines.length);
      const f = probe.find((b) => b.blockId === FIRST && b.lines.length);
      if (!h || !f) return NaN;
      return Math.min(...f.lines.map((l) => l[0])) - h.bottomPx;
    })();
    const lineTop = (id: string) => {
      const b = probe.find((x) => x.blockId === id && x.lines.length);
      return b ? Math.min(...b.lines.map((l) => l[0])) : NaN;
    };
    const pct = (id: string) =>
      (((lineTop(id) - CONTENT_TOP) / (CONTENT_BOTTOM - CONTENT_TOP)) * 100).toFixed(1);

    console.log(`\n── ${c.id}  ${c.label}`);
    console.log(
      `   ${r.totalPages}pp, ${r.blankPages.length} blanks, ` +
        `${r.verticalOverflowPages.length} v-overflow, ${r.horizontalOverflow.length} h-overflow`,
    );
    console.log(`   lead-in on p${where('e1c2ca96')}, sentence on p${where('a652505d')}`);
    void gapUnderHeading;

    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1300, deviceScaleFactor: 2 });
    await page.setContent(render.html, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.evaluate(TYPESET_DONE_JS);
    await page.evaluate(REPEAT_TABLE_HEADERS_JS);
    await page.waitForSelector('.pagedjs_page[data-page-number="8"]', { timeout: 180_000 });
    for (const n of c.shoot) {
      const el = await page.$(`.pagedjs_page[data-page-number="${n}"]`);
      if (!el) {
        console.log(`   (p${n} not found)`);
        continue;
      }
      const png = (await el.screenshot({ type: 'png' })) as Buffer;
      const out = `${DIR}/${c.id}-p${String(n).padStart(3, '0')}.png`;
      await sharp(png).greyscale().png().toFile(out);
      console.log(`   shot -> ${out}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
process.exit(0);
