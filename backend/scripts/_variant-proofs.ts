/**
 * COMPARISON PROOFS — candidate treatments, rendered side by side.
 *
 * Renders the book with an EXTRA set of layout overrides on top of the
 * production ones and shoots named pages. Writes only into a variants folder;
 * the production candidate and the shared config are untouched, so nothing here
 * can be mistaken for the approved book.
 *
 *   tsx scripts/_variant-proofs.ts <label> '<overridesJson>' <page> [<page> ...]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { ProjectConfigSchema } from '@wildlands/shared';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { TYPESET_DONE_JS } from '../src/pipeline/typeset/typeset-book.js';
import { resolveChromiumPath, } from '../src/pipeline/stage-6-layout/render-pdf.js';
import { REPEAT_TABLE_HEADERS_JS } from '../src/pipeline/typeset/render-typeset.js';
import { CONFIG, OUT_DIR, RENDER_INPUT, readManuscript } from './before-you-need-it-config.js';

const label = process.argv[2]!;
const extra = JSON.parse(process.argv[3]!) as Record<string, unknown>;
const wanted = process.argv.slice(4).map(Number).filter((n) => Number.isFinite(n));

const DIR = `${OUT_DIR}/variants`;
mkdirSync(DIR, { recursive: true });

const { md } = readManuscript();
const config = ProjectConfigSchema.parse({
  ...CONFIG,
  layoutOverrides: { ...CONFIG.layoutOverrides, ...extra },
});

console.log(`variant "${label}" — extra overrides: ${Object.keys(extra).join(', ') || 'none'}`);
const rendered = await renderTypesetBook({ ...RENDER_INPUT, markdown: md, config });
const r = rendered.report;
console.log(
  `  ${r.totalPages} pages, ${r.blankPages.length} blanks, ` +
    `${r.verticalOverflowPages.length} vOverflow, ${r.horizontalOverflow.length} hOverflow`,
);
const orphaned = rendered.overrides.orphaned ?? [];
if (orphaned.length) console.log(`  WARNING orphaned overrides: ${orphaned.join(', ')}`);

const chromium = resolveChromiumPath();
if (!chromium) throw new Error('No Chromium. Set CHROMIUM_PATH.');
const { default: puppeteer } = await import('puppeteer-core');
const browser = await puppeteer.launch({
  executablePath: chromium,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300, deviceScaleFactor: 2 });
  await page.setContent(rendered.html, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForFunction(TYPESET_DONE_JS, { timeout: 300_000, polling: 250 });
  if (RENDER_INPUT.layoutStandard.tables?.repeatHeader) await page.evaluate(REPEAT_TABLE_HEADERS_JS);

  for (const n of wanted) {
    const el = await page.$(`.pagedjs_page[data-page-number="${n}"]`);
    if (!el) { console.log(`  page ${n}: not found`); continue; }
    await el.scrollIntoView();
    const out = `${DIR}/${label}-p${String(n).padStart(3, '0')}.png`;
    await sharp((await el.screenshot()) as Buffer).grayscale().toFile(out);
    console.log(`  page ${n} -> ${out}`);
  }
} finally {
  await browser.close();
}
writeFileSync(`${DIR}/${label}.json`, JSON.stringify({ label, extra, report: {
  totalPages: r.totalPages, blankPages: r.blankPages,
  vOverflow: r.verticalOverflowPages, hOverflow: r.horizontalOverflow,
} }, null, 2));
process.exit(0);
