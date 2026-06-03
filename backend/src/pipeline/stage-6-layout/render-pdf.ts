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
const DEFAULT_RENDER_TIMEOUT_MS = 120_000;

function renderTimeoutMs(): number {
  const raw = process.env.PDF_RENDER_TIMEOUT_MS;
  if (!raw) return DEFAULT_RENDER_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RENDER_TIMEOUT_MS;
}

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

/**
 * Locate the Paged.js polyfill on disk. pagedjs's package `exports` map does NOT
 * expose the dist subpath, so require.resolve('pagedjs/dist/...') throws
 * ERR_PACKAGE_PATH_NOT_EXPORTED. Resolve the package entry instead and walk up to
 * the package root to find the minified polyfill bundle.
 */
export function resolvePolyfillPath(): string {
  let dir = path.dirname(require.resolve('pagedjs'));
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, 'dist', 'paged.polyfill.min.js');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate pagedjs/dist/paged.polyfill.min.js in node_modules.');
}

/** Load the Paged.js polyfill source from node_modules. */
export async function loadPagedPolyfill(): Promise<string> {
  return readFile(resolvePolyfillPath(), 'utf8');
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
    const timeout = renderTimeoutMs();
    page.setDefaultTimeout(timeout);
    await page.setContent(html, { waitUntil: 'load', timeout });
    // These callbacks run inside the browser; reference DOM via globalThis to
    // avoid pulling the DOM lib into the Node TS build.
    // 1) Wait for Paged.js to START paginating (first page exists).
    await page.waitForFunction(
      () => {
        const w = globalThis as unknown as { PagedPolyfill?: { pages?: unknown[] }; document: { querySelectorAll: (s: string) => { length: number } } };
        return Boolean(w.PagedPolyfill?.pages?.length) || w.document.querySelectorAll('.pagedjs_page').length > 0;
      },
      { timeout },
    );
    // 2) Wait for Paged.js to FINISH. It paginates incrementally, so capturing the
    // PDF right after the first page appears truncates long content. Poll the page
    // count until it stops growing (stable across several polls) before rendering.
    await page.waitForFunction(
      () => {
        const w = globalThis as unknown as {
          document: { querySelectorAll: (s: string) => { length: number } };
          __pagedStable?: { count: number; streak: number };
        };
        const n = w.document.querySelectorAll('.pagedjs_page').length;
        const state = w.__pagedStable ?? { count: -1, streak: 0 };
        if (n === state.count && n > 0) state.streak += 1;
        else { state.count = n; state.streak = 0; }
        w.__pagedStable = state;
        return state.streak >= 4; // unchanged across 4 consecutive polls
      },
      { timeout, polling: 250 },
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
