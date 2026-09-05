/** Read-only: how much vertical room is free on the table's continuation page? */
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { TYPESET_DONE_JS } from '../src/pipeline/typeset/typeset-book.js';
import { resolveChromiumPath } from '../src/pipeline/stage-6-layout/render-pdf.js';
import { RENDER_INPUT, readManuscript } from './before-you-need-it-config.js';

const { md } = readManuscript();
const rendered = await renderTypesetBook({ markdown: md, ...RENDER_INPUT });

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
  await page.setViewport({ width: 900, height: 1300, deviceScaleFactor: 1 });
  await page.setContent(rendered.html, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForFunction(TYPESET_DONE_JS, { timeout: 300_000, polling: 250 });

  const out = await page.evaluate(() => {
    const res: Record<string, unknown> = {};
    const pages = [...document.querySelectorAll('.pagedjs_page')];
    const info = pages.map((pg) => {
      const n = Number(pg.getAttribute('data-page-number'));
      const tables = [...pg.querySelectorAll('table')];
      if (!tables.length) return null;
      const box = pg.querySelector('.pagedjs_page_content') as HTMLElement | null;
      const boxRect = box?.getBoundingClientRect();
      const t = tables[0]!;
      const tRect = t.getBoundingClientRect();
      const rows = [...t.querySelectorAll('tbody tr')];
      const rowHeights = rows.map((r) => r.getBoundingClientRect().height);
      const thead = t.querySelector('thead');
      return {
        page: n,
        hasThead: !!thead,
        theadHeight: thead ? thead.getBoundingClientRect().height : 0,
        rowCount: rows.length,
        medianRowPx: rowHeights.sort((a, b) => a - b)[Math.floor(rowHeights.length / 2)] ?? 0,
        contentBoxBottom: boxRect ? boxRect.bottom : null,
        tableBottom: tRect.bottom,
        slackPx: boxRect ? boxRect.bottom - tRect.bottom : null,
        splitFrom: t.hasAttribute('data-split-from'),
        splitTo: t.hasAttribute('data-split-to'),
      };
    }).filter(Boolean);
    res.tablePages = info;
    return res;
  });
  console.log(JSON.stringify(out, null, 2));
} finally {
  await browser.close();
}
process.exit(0);
