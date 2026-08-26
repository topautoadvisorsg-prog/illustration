/**
 * PAGE RASTERISATION — turn a finished PDF into pictures a person can judge.
 *
 * SAME TECHNIQUE AS `scripts/pdf-page-proof.ts`, PROMOTED. pdfjs-dist can
 * rasterise in Node only through the `canvas` package, whose native binding is
 * not built in this environment. Chromium is, and the typeset renderer already
 * depends on it, so pdf.js runs INSIDE Chromium against a real canvas and the
 * result is read back out.
 *
 * What that script could not do is hand back ONE IMAGE PER PAGE. It screenshots
 * a composite element, which is right for a human sweep and wrong for feeding a
 * page to a model or cropping a region out of it. This returns per-page buffers;
 * the sheets are composed from them afterwards.
 *
 * DETERMINISTIC. Same PDF and same scale produce the same bytes, which is what
 * makes the vision cache worth having.
 *
 * No OCR anywhere. This is for looking, not for reading text back off a picture
 * we already hold structurally.
 */
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

export interface RasterOptions {
  /** 1.0 is 72dpi. 2.0 gives 144dpi, which is enough to judge typography. */
  scale?: number;
  /** Chromium executable. Falls back to CHROMIUM_PATH then a default install. */
  chromiumPath?: string;
}

export interface RasterResult {
  /** 1-based page number -> PNG bytes. */
  pages: Map<number, Buffer>;
  scale: number;
  widthPx: number;
  heightPx: number;
}

/**
 * Render the requested pages.
 *
 * Pages are drawn in ONE browser session, in batches, because launching
 * Chromium per page would dominate the cost of a 170-page book.
 */
export async function rasterizePages(
  pdfBytes: Buffer,
  pageNumbers: number[],
  opts: RasterOptions = {},
): Promise<RasterResult> {
  const scale = opts.scale ?? 2;
  const executablePath =
    opts.chromiumPath ?? process.env.CHROMIUM_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

  const require = createRequire(import.meta.url);
  const pdfjsDir = path.dirname(require.resolve('pdfjs-dist/legacy/build/pdf.js'));
  const dir = mkdtempSync(path.join(tmpdir(), 'page-raster-'));

  try {
    copyFileSync(path.join(pdfjsDir, 'pdf.js'), path.join(dir, 'pdf.js'));
    copyFileSync(path.join(pdfjsDir, 'pdf.worker.js'), path.join(dir, 'pdf.worker.js'));
    writeFileSync(path.join(dir, 'doc.pdf'), pdfBytes);
    writeFileSync(path.join(dir, 'index.html'), HTML);

    const { default: puppeteer } = await import('puppeteer-core');
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--allow-file-access-from-files'],
    });

    const pages = new Map<number, Buffer>();
    let widthPx = 0;
    let heightPx = 0;

    try {
      const tab = await browser.newPage();
      await tab.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 });
      await tab.goto(`file:///${dir.replace(/\\/g, '/')}/index.html`, {
        waitUntil: 'networkidle0',
        timeout: 180_000,
      });
      await tab.waitForFunction('window.pdfReady === true', { timeout: 180_000 });

      for (const n of pageNumbers) {
        const dataUrl = (await tab.evaluate(
          `window.renderPage(${n}, ${scale})`,
        )) as string;
        const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        const buf = Buffer.from(b64, 'base64');
        pages.set(n, buf);
        if (!widthPx) {
          const dims = (await tab.evaluate('window.lastSize')) as { w: number; h: number };
          widthPx = dims.w;
          heightPx = dims.h;
        }
      }
    } finally {
      await browser.close();
    }

    return { pages, scale, widthPx, heightPx };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The page loaded over file://, because pdf.js fetches its worker and the
 * document by URL and a page loaded from elsewhere cannot reach them.
 *
 * No backticks inside: this whole block is a template literal.
 */
const HTML = `<!doctype html><meta charset="utf-8">
<style>body{margin:0;background:#fff}canvas{display:block}</style>
<canvas id="c"></canvas>
<script src="pdf.js"></script>
<script>
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.js';
  window.pdfReady = false;
  window.lastSize = { w: 0, h: 0 };
  let doc = null;
  (async () => {
    doc = await pdfjsLib.getDocument('doc.pdf').promise;
    window.pdfReady = true;
  })();
  window.renderPage = async (n, scale) => {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale });
    const c = document.getElementById('c');
    c.width = Math.ceil(vp.width);
    c.height = Math.ceil(vp.height);
    window.lastSize = { w: c.width, h: c.height };
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return c.toDataURL('image/png');
  };
</script>`;
