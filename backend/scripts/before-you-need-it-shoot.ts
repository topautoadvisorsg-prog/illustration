/**
 * BEFORE YOU NEED IT — greyscale page proofs of the safety tiers.
 *
 * The requirement these prove is not a data check. It is that a reader can tell
 * a same-day block from routine guidance ON PAPER, without colour, at arm's
 * length. The interior prints black-on-white, and a girl may be reading a
 * photocopy, a library copy, or a phone photograph of a page — so the shots are
 * converted to GREYSCALE before review, deliberately discarding any colour that
 * might otherwise be doing the work.
 *
 * Same render path as the production proof: renderTypesetBook on @4, so what is
 * shot is what ships. Neighbouring pages are shot alongside each panel page so
 * page-boundary behaviour is visible rather than assumed.
 *
 *   yarn tsx scripts/before-you-need-it-shoot.ts [page ...]
 *
 * Local and free. No database, no network, no model calls.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { TYPESET_DONE_JS } from '../src/pipeline/typeset/typeset-book.js';
import { resolveChromiumPath } from '../src/pipeline/stage-6-layout/render-pdf.js';
import { REPEAT_TABLE_HEADERS_JS } from '../src/pipeline/typeset/render-typeset.js';
import { BOOK, OUT_DIR as PROD_DIR, RENDER_INPUT, readManuscript } from './before-you-need-it-config.js';

const OUT_DIR = `${PROD_DIR}/proofs`;

/**
 * Panel pages from the production render (71, 108, 166x2, 167, 168) plus the
 * page either side of each cluster, so a panel sitting hard against a page
 * boundary is visible instead of being taken on trust.
 */
const DEFAULT_PAGES = [70, 71, 97, 98, 99, 107, 108, 165, 166, 167, 168, 169];
const pages = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n) && n > 0);
const WANT = pages.length ? pages : DEFAULT_PAGES;

const { md, sha } = readManuscript();

mkdirSync(OUT_DIR, { recursive: true });


console.log('rendering on @4...');
const rendered = await renderTypesetBook({ markdown: md, ...RENDER_INPUT });
console.log(`  ${rendered.report.totalPages} pages`);

const chromium = resolveChromiumPath();
if (!chromium) throw new Error('No Chromium. Set CHROMIUM_PATH.');

const { default: puppeteer } = await import('puppeteer-core');
const browser = await puppeteer.launch({
  executablePath: chromium,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
});
const shot: string[] = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300, deviceScaleFactor: 2 });
  await page.setContent(rendered.html, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForFunction(TYPESET_DONE_JS, { timeout: 300_000, polling: 250 });
  /**
   * The SAME pass the renderer runs, from the same exported constant.
   *
   * The renderer places repeated table headers in its own page and returns the
   * pre-pagination HTML, so a shooter that re-renders that HTML would photograph
   * a book without them — proofs that quietly disagree with the PDF. One
   * definition, used in both places.
   */
  if (RENDER_INPUT.layoutStandard.tables?.repeatHeader) {
    await page.evaluate(REPEAT_TABLE_HEADERS_JS);
  }

  for (const n of WANT) {
    const el = await page.$(`.pagedjs_page[data-page-number="${n}"]`);
    if (!el) {
      console.log(`  page ${n}: not found`);
      continue;
    }
    await el.scrollIntoView();
    const png = (await el.screenshot()) as Buffer;
    const kind = await page.evaluate((num) => {
      const el2 = document.querySelector(`.pagedjs_page[data-page-number="${num}"]`);
      if (!el2) return '';
      const imm = !!el2.querySelector('.alert-panel--immediate');
      const day = [...el2.querySelectorAll('.alert-panel')].some(
        (a) => !a.classList.contains('alert-panel--immediate'),
      );
      return imm && day ? '-BOTH' : imm ? '-IMMEDIATE' : day ? '-SAMEDAY' : '';
    }, n);
    const hasPanel = kind !== '';
    const out = `${OUT_DIR}/p${String(n).padStart(3, '0')}${kind}-grey.png`;
    // Greyscale on purpose: whatever survives here survives a photocopy.
    await sharp(png).grayscale().toFile(out);
    shot.push(out);
    console.log(`  page ${n}${hasPanel ? `  [${kind.slice(1)}]` : ''} -> ${out}`);
  }
} finally {
  await browser.close();
}

writeFileSync(`${OUT_DIR}/manifest.json`, JSON.stringify({ sha, pages: WANT, files: shot }, null, 2));
console.log(`\n${shot.length} greyscale proofs -> ${OUT_DIR}`);
process.exit(0);
