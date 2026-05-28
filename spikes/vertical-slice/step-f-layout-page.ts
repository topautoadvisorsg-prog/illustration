/**
 * Spike 2 Step F — Layout one page → print-ready PDF
 *
 * Renders a single page manifest into an 8.625×11.25-inch (8.5×11 + bleed) PDF
 * using Puppeteer (headless Chromium) + Paged.js (CSS Paged Media polyfill).
 *
 * This step needs NO external API keys. It uses the system chromium binary
 * (env var CHROMIUM_PATH if set, falls back to /usr/bin/chromium).
 *
 * If a real upscaled image is not yet available (Steps C+D not run because
 * keys are missing), Step F falls back to a placeholder colored rectangle
 * so the layout/typography work can be validated independently.
 */

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import type { PageManifest } from './step-a-load-manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR = path.resolve(__dirname, '../output/vertical-slice');
const PAGEDJS_POLYFILL = path.join(REPO_ROOT, 'node_modules/pagedjs/dist/paged.polyfill.min.js');

// Page dimensions: 8.5×11 trim + 0.125 outer/0.25 top+bottom bleed (per KDP).
const PAGE_WIDTH_IN = 8.625;
const PAGE_HEIGHT_IN = 11.25;

export interface LayoutResult {
  pdfPath: string;
  sizeBytes: number;
  usedPlaceholderImage: boolean;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the image to embed in the page.
 * Order of preference:
 *   1. upscaled (Step D output)
 *   2. generated (Step C output)
 *   3. synthetic placeholder (parchment-colored rectangle)
 */
async function resolveImage(pageId: string): Promise<{ dataUri: string; placeholder: boolean }> {
  const upscaled = path.join(OUTPUT_DIR, `${pageId}_upscaled.png`);
  const generated = path.join(OUTPUT_DIR, `${pageId}_generated.png`);

  if (await fileExists(upscaled)) {
    const buf = await readFile(upscaled);
    return { dataUri: `data:image/png;base64,${buf.toString('base64')}`, placeholder: false };
  }
  if (await fileExists(generated)) {
    const buf = await readFile(generated);
    return { dataUri: `data:image/png;base64,${buf.toString('base64')}`, placeholder: false };
  }

  // Synthetic placeholder — warm parchment-toned rectangle with a subtle dashed
  // outline so it's obvious in the PDF that no real illustration was provided.
  const placeholderBuf = await sharp({
    create: {
      width: 2048,
      height: 1536,
      channels: 3,
      background: { r: 232, g: 217, b: 176 }, // #E8D9B0 parchment_shadow
    },
  })
    .png()
    .toBuffer();
  return { dataUri: `data:image/png;base64,${placeholderBuf.toString('base64')}`, placeholder: true };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Builds the HTML doc that Paged.js will paginate. */
function buildHtml(manifest: PageManifest, imageDataUri: string, polyfillJs: string, placeholder: boolean): string {
  const sectionsHtml = manifest.body_text.sections
    .map(
      (s) => `
      <section class="section">
        <h3 class="section-header">${escapeHtml(s.header)}</h3>
        <p class="section-body">${escapeHtml(s.body)}</p>
      </section>`,
    )
    .join('\n');

  const annotationsHtml =
    manifest.illustration.annotations.length > 0
      ? `<div class="annotations">${manifest.illustration.annotations
          .map((a) => `<span>${escapeHtml(a)}</span>`)
          .join('')}</div>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(manifest.body_text.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Playfair+Display:wght@700;900&display=swap" rel="stylesheet">
<style>
  @page {
    size: ${PAGE_WIDTH_IN}in ${PAGE_HEIGHT_IN}in;
    margin: 1in 1in 1in 1.25in; /* top right bottom gutter */
    background: #F5EDD6;
    @bottom-center {
      content: "· " counter(page) " ·";
      font-family: 'EB Garamond', serif;
      font-size: 9pt;
      color: #2C1A0E;
    }
    @top-left {
      content: "CHAPTER " "${manifest.chapter_number}" " — " "${escapeHtml(manifest.chapter_name).toUpperCase()}";
      font-family: 'EB Garamond', serif;
      font-variant: small-caps;
      font-size: 8.5pt;
      color: #6B4C2A;
      letter-spacing: 0.08em;
    }
  }
  html, body { background: #F5EDD6; margin: 0; padding: 0; }
  body {
    font-family: 'EB Garamond', serif;
    color: #2C1A0E;
    font-size: 11pt;
    line-height: 16pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .entry-title {
    font-family: 'Playfair Display', serif;
    font-weight: 700;
    font-size: 24pt;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    margin: 0 0 4pt 0;
    color: #2C1A0E;
  }
  .scientific-name {
    font-family: 'EB Garamond', serif;
    font-style: italic;
    font-size: 13pt;
    color: #6B4C2A;
    margin: 0 0 18pt 0;
  }
  .illustration-wrap {
    float: left;
    width: 48%;
    margin: 0 18pt 12pt 0;
    position: relative;
    page-break-inside: avoid;
    shape-outside: padding-box;
  }
  .illustration-wrap img {
    width: 100%;
    height: auto;
    display: block;
    /* Soft fade into parchment — simulates the spec's "no hard borders" rule. */
    -webkit-mask-image: radial-gradient(ellipse at center, black 60%, transparent 100%);
            mask-image: radial-gradient(ellipse at center, black 60%, transparent 100%);
    ${placeholder ? 'outline: 1px dashed #B87333; outline-offset: -4px;' : ''}
  }
  ${placeholder ? `.placeholder-tag {
    position: absolute; top: 8pt; left: 8pt;
    font-family: 'EB Garamond', serif;
    font-style: italic;
    font-size: 8pt;
    color: #8B2020;
    background: rgba(245,237,214,0.85);
    padding: 2pt 6pt;
  }` : ''}
  .annotations {
    margin-top: 6pt;
    font-family: 'EB Garamond', serif;
    font-style: italic;
    font-size: 7.5pt;
    color: #6B4C2A;
    line-height: 11pt;
  }
  .annotations span { display: block; }
  .intro {
    font-family: 'EB Garamond', serif;
    font-style: italic;
    font-size: 12pt;
    line-height: 17pt;
    margin: 0 0 12pt 0;
  }
  .section { margin-bottom: 10pt; }
  .section-header {
    font-family: 'EB Garamond', serif;
    font-variant: small-caps;
    font-weight: 600;
    font-size: 11pt;
    letter-spacing: 0.08em;
    margin: 0 0 2pt 0;
    color: #2C1A0E;
  }
  .section-body { margin: 0; text-align: justify; hyphens: auto; }
  /* Decorative border strips per spec — thin top + bottom rules. */
  .body-region { position: relative; }
</style>
</head>
<body>
  <h1 class="entry-title">${escapeHtml(manifest.body_text.title)}</h1>
  <p class="scientific-name">${escapeHtml(manifest.body_text.subtitle)}</p>

  <figure class="illustration-wrap">
    <img src="${imageDataUri}" alt="${escapeHtml(manifest.entry_name)}">
    ${placeholder ? '<div class="placeholder-tag">PLACEHOLDER — no real image yet</div>' : ''}
    ${annotationsHtml}
  </figure>

  <p class="intro">${escapeHtml(manifest.body_text.intro)}</p>

  ${sectionsHtml}

  <script>${polyfillJs}</script>
</body>
</html>`;
}

export async function stepF_layoutPage(manifest: PageManifest): Promise<LayoutResult> {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const polyfillJs = await readFile(PAGEDJS_POLYFILL, 'utf8');
  const { dataUri, placeholder } = await resolveImage(manifest.manifest_id);
  const html = buildHtml(manifest, dataUri, polyfillJs, placeholder);

  const chromiumPath = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium';

  const browser = await puppeteer.launch({
    executablePath: chromiumPath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30_000 });

    // Wait for Paged.js to finish paginating.
    await page.waitForFunction(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => Boolean((window as any).PagedPolyfill?.pages?.length) || document.querySelectorAll('.pagedjs_page').length > 0,
      { timeout: 30_000 },
    );

    const outPath = path.join(OUTPUT_DIR, `${manifest.manifest_id}.pdf`);
    await page.pdf({
      path: outPath,
      width: `${PAGE_WIDTH_IN}in`,
      height: `${PAGE_HEIGHT_IN}in`,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    const stat = await readFile(outPath).then((b) => b.byteLength);
    return { pdfPath: outPath, sizeBytes: stat, usedPlaceholderImage: placeholder };
  } finally {
    await browser.close();
  }
}

// Standalone runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const { stepA_loadManifest } = await import('./step-a-load-manifest.js');
  try {
    const manifest = await stepA_loadManifest();
    const r = await stepF_layoutPage(manifest);
    // eslint-disable-next-line no-console
    console.log(`✓ Step F — wrote ${r.pdfPath} (${(r.sizeBytes / 1024).toFixed(1)} KB)${r.usedPlaceholderImage ? ' [PLACEHOLDER IMAGE]' : ''}`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`✗ Step F — ${(e as Error).message}`);
    process.exit(1);
  }
}
