/**
 * Bake-off candidate A: Puppeteer + Paged.js
 *
 * Renders the 30-page fixture into a single multi-page PDF using a real
 * Chromium engine + Paged.js CSS Paged Media polyfill.
 *
 * Exposes `renderAll(...)` so compare.ts can invoke it and measure.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const FIXTURE_DIR = path.resolve(__dirname, '../fixture');
const OUTPUT_DIR = path.resolve(__dirname, '../output');
const PAGEDJS_POLYFILL = path.join(REPO_ROOT, 'node_modules/pagedjs/dist/paged.polyfill.min.js');

const PAGE_W_IN = 8.625;
const PAGE_H_IN = 11.25;

interface Manifest {
  manifest_id: string;
  page_number: number;
  chapter_number: number;
  chapter_name: string;
  entry_name: string;
  scientific_name: string | null;
  layout_template: string;
  is_danger_page: boolean;
  body_text: {
    title: string;
    subtitle: string;
    intro: string;
    sections: Array<{ header: string; body: string }>;
  };
  illustration: { subject: string; annotations: string[] };
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layoutClass(layout: string): string {
  return 'layout-' + layout.toLowerCase().replace(/_/g, '-');
}

function pageSection(m: Manifest, imgDataUri: string): string {
  const sectionsHtml = m.body_text.sections
    .map((s) => `<section class="section"><h3>${esc(s.header)}</h3><p>${esc(s.body)}</p></section>`)
    .join('');

  const annotationsHtml = m.illustration.annotations
    .map((a) => `<span>${esc(a)}</span>`)
    .join('');

  return `<article class="book-page ${layoutClass(m.layout_template)} ${m.is_danger_page ? 'is-danger' : ''}" data-page-id="${m.manifest_id}">
    <header class="entry-header">
      <h1 class="entry-title">${esc(m.body_text.title)}</h1>
      <p class="scientific-name">${esc(m.body_text.subtitle)}</p>
    </header>
    <figure class="illustration">
      <img src="${imgDataUri}" alt="${esc(m.entry_name)}">
      <div class="annotations">${annotationsHtml}</div>
    </figure>
    <p class="intro">${esc(m.body_text.intro)}</p>
    <div class="sections">${sectionsHtml}</div>
  </article>`;
}

function buildHtml(manifests: Manifest[], imgDataUri: string, polyfillJs: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Bake-off — Puppeteer + Paged.js</title>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Playfair+Display:wght@700;900&display=swap" rel="stylesheet">
<style>
  @page {
    size: ${PAGE_W_IN}in ${PAGE_H_IN}in;
    margin: 1in 1in 1in 1.25in;
    background: #F5EDD6;
    @bottom-center { content: "· " counter(page) " ·"; font-family: 'EB Garamond', serif; font-size: 9pt; color: #2C1A0E; }
    @top-left {
      content: string(running-chapter);
      font-family: 'EB Garamond', serif; font-variant: small-caps;
      font-size: 8.5pt; color: #6B4C2A; letter-spacing: 0.08em;
    }
  }
  html, body { background: #F5EDD6; margin: 0; padding: 0; }
  body {
    font-family: 'EB Garamond', serif; color: #2C1A0E; font-size: 11pt; line-height: 16pt;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .book-page { page-break-after: always; string-set: running-chapter "CHAPTER 5 — FUNGI & MUSHROOMS"; }
  .book-page:last-child { page-break-after: auto; }
  .entry-title {
    font-family: 'Playfair Display', serif; font-weight: 700; font-size: 24pt;
    text-transform: uppercase; letter-spacing: 0.02em; margin: 0 0 4pt 0;
  }
  .scientific-name {
    font-family: 'EB Garamond', serif; font-style: italic; font-size: 13pt;
    color: #6B4C2A; margin: 0 0 14pt 0;
  }
  .illustration img {
    -webkit-mask-image: radial-gradient(ellipse at center, black 60%, transparent 100%);
            mask-image: radial-gradient(ellipse at center, black 60%, transparent 100%);
  }
  .annotations {
    font-family: 'EB Garamond', serif; font-style: italic; font-size: 7.5pt;
    color: #6B4C2A; line-height: 11pt;
  }
  .annotations span { display: block; }
  .intro {
    font-family: 'EB Garamond', serif; font-style: italic; font-size: 12pt;
    line-height: 17pt; margin: 0 0 12pt 0;
  }
  .section { margin-bottom: 10pt; }
  .section h3 {
    font-family: 'EB Garamond', serif; font-variant: small-caps; font-weight: 600;
    font-size: 11pt; letter-spacing: 0.08em; margin: 0 0 2pt 0;
  }
  .section p { margin: 0; text-align: justify; hyphens: auto; }

  /* Layout 1 — standard: image upper-left, text wraps around */
  .layout-layout-1-standard .illustration {
    float: left; width: 45%; margin: 0 18pt 8pt 0;
    shape-outside: padding-box;
  }
  .layout-layout-1-standard .illustration img { width: 100%; height: auto; display: block; }

  /* Layout 2 — text heavy: tiny illustration top-left */
  .layout-layout-2-text-heavy .illustration {
    float: left; width: 22%; margin: 0 14pt 8pt 0;
  }
  .layout-layout-2-text-heavy .illustration img { width: 100%; height: auto; display: block; }

  /* Layout 3 — illustration dominant: large image right, single column text */
  .layout-layout-3-illustration-dominant .illustration {
    float: right; width: 60%; margin: 0 0 8pt 18pt;
  }
  .layout-layout-3-illustration-dominant .illustration img { width: 100%; height: auto; display: block; }

  /* Layout 4 — danger: red border, two-up images */
  .layout-layout-4-danger-warning {
    border-left: 4pt solid #8B2020; padding-left: 10pt;
  }
  .layout-layout-4-danger-warning .entry-title { color: #8B2020; }
  .layout-layout-4-danger-warning .illustration {
    float: left; width: 45%; margin: 0 18pt 8pt 0;
  }
  .layout-layout-4-danger-warning .illustration img { width: 100%; height: auto; display: block; }
  .layout-layout-4-danger-warning .intro::before {
    content: "⚠ TOXIC — DO NOT EAT  ";
    font-weight: 700; color: #8B2020; font-style: normal;
  }

  /* Layout 5 — chapter opener: large landscape illustration top half */
  .layout-layout-5-chapter-opener .illustration {
    display: block; width: 100%; margin: 0 0 24pt 0;
  }
  .layout-layout-5-chapter-opener .illustration img {
    width: 100%; height: 4in; object-fit: cover; display: block;
  }
  .layout-layout-5-chapter-opener .entry-title { font-size: 42pt; text-align: center; margin-top: 24pt; }
  .layout-layout-5-chapter-opener .scientific-name { text-align: center; }

  /* Layout 7 — scattered vignettes: three small floating images */
  .layout-layout-7-scattered-vignettes .illustration {
    float: left; width: 30%; margin: 0 14pt 8pt 0;
  }
  .layout-layout-7-scattered-vignettes .illustration img { width: 100%; height: auto; display: block; }

  /* Layout 8 — margin illustration: tall narrow image on right */
  .layout-layout-8-margin-illustration .illustration {
    float: right; width: 30%; margin: 0 0 8pt 18pt;
  }
  .layout-layout-8-margin-illustration .illustration img {
    width: 100%; height: 7in; object-fit: cover; display: block;
  }

  /* Layout 9 — diagnostic diagram */
  .layout-layout-9-diagnostic-diagram .illustration {
    display: block; width: 100%; margin: 0 0 14pt 0;
  }
  .layout-layout-9-diagnostic-diagram .illustration img {
    width: 100%; height: 3in; object-fit: cover; display: block;
    outline: 1pt dashed #6B4C2A; outline-offset: -4pt;
  }
</style>
</head><body>
${manifests.map((m) => pageSection(m, imgDataUri)).join('\n')}
<script>${polyfillJs}</script>
</body></html>`;
}

export interface RenderResult {
  pdfPath: string;
  sizeBytes: number;
  renderMs: number;
  peakHeapMB: number;
  totalPages: number;
}

export async function renderAll(manifests: Manifest[]): Promise<RenderResult> {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const polyfillJs = await readFile(PAGEDJS_POLYFILL, 'utf8');
  const placeholderBuf = await readFile(path.join(FIXTURE_DIR, 'placeholder.png'));
  const imgDataUri = `data:image/png;base64,${placeholderBuf.toString('base64')}`;
  const html = buildHtml(manifests, imgDataUri, polyfillJs);

  const chromiumPath = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium';

  // Sample memory periodically so we can report peak heap.
  let peakHeap = 0;
  const memInterval = setInterval(() => {
    const m = process.memoryUsage().heapUsed;
    if (m > peakHeap) peakHeap = m;
  }, 100);

  const t0 = Date.now();
  const browser = await puppeteer.launch({
    executablePath: chromiumPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });

  let outPath = '';
  let sizeBytes = 0;
  let totalPages = 0;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60_000 });

    await page.waitForFunction(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => Boolean((window as any).PagedPolyfill?.pages?.length) || document.querySelectorAll('.pagedjs_page').length > 0,
      { timeout: 60_000 },
    );

    totalPages = await page.evaluate(() => document.querySelectorAll('.pagedjs_page').length);

    outPath = path.join(OUTPUT_DIR, 'puppeteer.pdf');
    await page.pdf({
      path: outPath,
      width: `${PAGE_W_IN}in`,
      height: `${PAGE_H_IN}in`,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    const buf = await readFile(outPath);
    sizeBytes = buf.byteLength;
  } finally {
    await browser.close();
    clearInterval(memInterval);
  }

  return {
    pdfPath: outPath,
    sizeBytes,
    renderMs: Date.now() - t0,
    peakHeapMB: peakHeap / 1024 / 1024,
    totalPages,
  };
}

// Standalone runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const pagesJson = await readFile(path.join(FIXTURE_DIR, 'pages.json'), 'utf8');
  const manifests = JSON.parse(pagesJson) as Manifest[];
  const r = await renderAll(manifests);
  // eslint-disable-next-line no-console
  console.log(
    `✓ Puppeteer + Paged.js — ${r.totalPages} pages, ${(r.sizeBytes / 1024 / 1024).toFixed(2)} MB, ${r.renderMs}ms, peak heap ${r.peakHeapMB.toFixed(1)} MB`,
  );
  // eslint-disable-next-line no-console
  console.log(`  → ${r.pdfPath}`);
}

export type { Manifest };
