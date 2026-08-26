/**
 * RENDER PAGES OF A FINISHED PDF SO A HUMAN CAN LOOK AT THEM.
 *
 * Every other check in this toolkit reads a PDF as data — text runs, coordinates,
 * font dictionaries. That catches a great deal and it cannot catch what a page
 * LOOKS like: a stranded line, a gap that reads as a mistake, a running head with
 * a stray character in it. Those are found by looking, and until now there was no
 * way to look at an interior page without opening it by hand.
 *
 * pdfjs-dist can rasterise in Node, but only through the `canvas` package, whose
 * native binding is not built in this environment. Chromium is, and the typeset
 * renderer already depends on it — so pdf.js is run IN Chromium, drawing to a
 * real canvas, and the result is screenshotted.
 *
 *   npx tsx scripts/pdf-page-proof.ts <pdf> <pages> <out.png> [scale]
 *
 *   pages  comma-separated, 1-based, in the order you want them laid out
 *   scale  1.0 is 72dpi; 1.15 fits four 6x9 pages side by side legibly
 *   cols   wrap into a grid this many pages wide, for a whole-book sweep
 */
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';

const [PDF, PAGES, OUT, SCALE, COLS] = process.argv.slice(2);
if (!PDF || !PAGES || !OUT) {
  throw new Error('usage: pdf-page-proof.ts <pdf> <pages> <out.png> [scale] [cols]');
}

const require = createRequire(import.meta.url);
const pdfjsDir = path.dirname(require.resolve('pdfjs-dist/legacy/build/pdf.js'));

/**
 * Everything is staged into one directory and loaded over file://, because
 * pdf.js fetches its worker and the document by URL and a page loaded from
 * elsewhere cannot reach them.
 */
const dir = mkdtempSync(path.join(tmpdir(), 'pdf-proof-'));
try {
  copyFileSync(path.join(pdfjsDir, 'pdf.js'), path.join(dir, 'pdf.js'));
  copyFileSync(path.join(pdfjsDir, 'pdf.worker.js'), path.join(dir, 'pdf.worker.js'));
  copyFileSync(PDF, path.join(dir, 'doc.pdf'));
  writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#444;font:13px/1.4 system-ui,sans-serif}
      .row{display:flex;flex-wrap:wrap;gap:10px;padding:10px;align-items:flex-start}
      figure{margin:0}figcaption{color:#fff;padding:4px 2px}
      canvas{background:#fff;box-shadow:0 0 0 1px #000;display:block}
    </style><div class="row" id="out"></div>
    <script src="pdf.js"></script><script>
      pdfjsLib.GlobalWorkerOptions.workerSrc='pdf.worker.js';
      const q=new URLSearchParams(location.search);
      const pages=(q.get('pages')||'1').split(',').map(Number);
      const scale=Number(q.get('scale')||1.5);
      // A whole-book sweep needs a GRID, not one long row: a hundred pages in a
      // single row is unreadable at any scale that fits a screenshot. The cols
      // parameter caps the row width so the sheet wraps.
      // No backticks in here: this whole block lives inside a template literal.
      const cols=Number(q.get('cols')||0);
      if(cols>0){
        const px=Math.ceil(6*72*scale);
        document.getElementById('out').style.maxWidth=(cols*(px+10)+10)+'px';
      }
      window.ready=false;
      (async()=>{
        const doc=await pdfjsLib.getDocument('doc.pdf').promise;
        const out=document.getElementById('out');
        for(const n of pages){
          const page=await doc.getPage(n);
          const vp=page.getViewport({scale});
          const fig=document.createElement('figure');
          const cap=document.createElement('figcaption');
          cap.textContent='page '+n;
          const c=document.createElement('canvas');
          c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);
          fig.append(cap,c);out.append(fig);
          await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
        }
        window.ready=true;
      })();
    </script>`,
  );

  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--allow-file-access-from-files'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 2400, height: 1600, deviceScaleFactor: 1 });
    const url = `file:///${dir.replace(/\\/g, '/')}/index.html?pages=${PAGES}&scale=${SCALE ?? 1.5}`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 180000 });
    await page.waitForFunction('window.ready === true', { timeout: 180000 });
    await (await page.$('#out'))!.screenshot({ path: OUT });
  } finally {
    await browser.close();
  }
  console.log(`pages ${PAGES} of ${path.basename(PDF)} -> ${OUT}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(0);
