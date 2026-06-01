/**
 * Stage 6 — Paged.js -> PDF render (Puppeteer + Chromium).
 *
 * What it does: paginates the page HTML into a print-ready PDF at the exact page
 * size. Engine is locked to Puppeteer + Paged.js (ADR-003a).
 *
 * Chromium requirement: puppeteer-core does NOT bundle a browser. Provide one via
 * CHROMIUM_PATH or PUPPETEER_EXECUTABLE_PATH, or install a system Chromium. On
 * Railway this means adding chromium to the build (nixpacks/apt) — tracked as
 * infra work. `isChromiumAvailable()` lets callers degrade to analysis-only.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { PageGeometry } from './page-geometry.js';

const require = createRequire(import.meta.url);

const COMMON_CHROMIUM_PATHS = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
];

/** Resolve a Chromium executable path, or null if none is available. */
export function resolveChromiumPath(): string | null {
  const fromEnv = process.env.CHROMIUM_PATH ?? process.env.PUPPETEER_EXECUTABLE_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const p of COMMON_CHROMIUM_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function isChromiumAvailable(): boolean {
  return resolveChromiumPath() !== null;
}

/** Load the Paged.js polyfill source from node_modules. */
export async function loadPagedPolyfill(): Promise<string> {
  const polyfillPath = require.resolve('pagedjs/dist/paged.polyfill.min.js');
  return readFile(polyfillPath, 'utf8');
}

export interface RenderPdfResult {
  buffer: Buffer;
  totalPages: number;
}

/**
 * Render a complete HTML document (which must already include the Paged.js
 * polyfill) into a PDF buffer at the given page geometry.
 */
export async function renderHtmlToPdf(html: string, geometry: PageGeometry): Promise<RenderPdfResult> {
  const executablePath = resolveChromiumPath();
  if (!executablePath) {
    throw new Error(
      'No Chromium executable found. Set CHROMIUM_PATH (or PUPPETEER_EXECUTABLE_PATH) or install a system Chromium.',
    );
  }

  // Lazy import so the module loads even where puppeteer/chromium is absent.
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30_000 });
    // These callbacks run inside the browser; reference DOM via globalThis to
    // avoid pulling the DOM lib into the Node TS build.
    await page.waitForFunction(
      () => {
        const w = globalThis as unknown as { PagedPolyfill?: { pages?: unknown[] }; document: { querySelectorAll: (s: string) => { length: number } } };
        return Boolean(w.PagedPolyfill?.pages?.length) || w.document.querySelectorAll('.pagedjs_page').length > 0;
      },
      { timeout: 30_000 },
    );
    const totalPages = await page.evaluate(() => {
      const w = globalThis as unknown as { document: { querySelectorAll: (s: string) => { length: number } } };
      return w.document.querySelectorAll('.pagedjs_page').length;
    });
    const pdf = await page.pdf({
      width: `${geometry.pageWidthIn}in`,
      height: `${geometry.pageHeightIn}in`,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    return { buffer: Buffer.from(pdf), totalPages };
  } finally {
    await browser.close();
  }
}

export const __internal = { COMMON_CHROMIUM_PATHS, polyfillName: path.basename('paged.polyfill.min.js') };
