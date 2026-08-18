/**
 * Place Figures 5.1 and 10.1 into DIRT RICH.
 *
 * The platform stamps artwork onto the finished interior, anchored to a STABLE
 * BLOCK ID rather than a page number — a page number is a rendering result and
 * moves on every repagination. Here the anchor is the marker paragraph itself
 * (`[FIGURE 5.1 — CHART] ...`), which is exactly where the figure belongs and
 * which will later be stripped.
 *
 * Stamping is a raster path: it records native pixels over printed inches and
 * calls that the honest ppi. So the vector source is rasterised HERE, once, at
 * true print resolution — never upscaled afterwards to fake a number.
 *
 *   yarn tsx scripts/dirt-rich-place-figures.ts            # dry run
 *   yarn tsx scripts/dirt-rich-place-figures.ts --write    # write config + assets
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { ProjectConfigSchema, type PageIllustration } from '@wildlands/shared';
import { resolveChromiumPath } from '../src/pipeline/stage-6-layout/render-pdf.js';
import { getProject, updateProjectConfig } from '../src/db/repositories/projects.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { TRADE_NONFICTION_GUIDE_TYPESET_V1 as STD } from '../src/pipeline/typeset/layout-standards/trade-nonfiction-guide-v1.js';

const PROJECT_ID = '55d7bce0-2f71-4f02-8131-e6c750c8506e';
const WRITE = process.argv.includes('--write');
const DIR = 'C:/Users/jovan/Downloads/dirt-rich-figures';

/** Printed size. Width is the full text block; height follows the 444x300 artboard. */
const PLACEMENT_W_IN = 4.625;
const PLACEMENT_H_IN = (300 / 444) * PLACEMENT_W_IN;
/** 300ppi is the floor for print. Rasterise AT it; never scale up to reach it. */
const TARGET_PPI = 300;

const FIGURES = [
  { marker: 'FIGURE 5.1', svg: `${DIR}/figure-5-1-cost-per-dozen.svg`, name: 'figure-5-1-cost-per-dozen.png' },
  { marker: 'FIGURE 10.1', svg: `${DIR}/figure-10-1-hours-per-week.svg`, name: 'figure-10-1-hours-per-week.png' },
];

const project = await getProject(PROJECT_ID);
if (!project) throw new Error('project not found in the dev database');
const config = ProjectConfigSchema.parse(project.config);
const md = (await getProjectStorage().readProjectFile(project.manuscriptPath!)).toString('utf8');

// ── find the anchor blocks ──────────────────────────────────────────────────
console.log('resolving anchors from a real render...');
const r = await renderTypesetBook({
  markdown: md,
  config,
  layoutStandard: STD,
  chaptersStartRecto: Boolean(config.typesetChaptersStartRecto),
  frontMatter: {},
});
const pageOf = (blockId: string): string =>
  Object.entries(r.report.pageBlocks).find(([, ids]) => (ids as string[]).includes(blockId))?.[0] ?? '?';

// ── rasterise at true resolution ────────────────────────────────────────────
const chromium = resolveChromiumPath();
if (!chromium) throw new Error('CHROMIUM_PATH is not set and no Chromium was found.');
const browser = await puppeteer.launch({ executablePath: chromium, args: ['--no-sandbox'] });

const storage = getProjectStorage();
const illustrations: Record<string, PageIllustration> = { ...(config.illustrations ?? {}) };

for (const fig of FIGURES) {
  const block = r.blocks.find((b) => b.preview.includes(fig.marker));
  if (!block) {
    console.log(`  ${fig.marker}: NO ANCHOR BLOCK FOUND — skipped`);
    continue;
  }

  // deviceScaleFactor turns the 444x300 CSS artboard into true 300ppi pixels.
  const scale = (PLACEMENT_W_IN * TARGET_PPI) / 444;
  const page = await browser.newPage();
  await page.setViewport({ width: 444, height: 300, deviceScaleFactor: scale });
  await page.goto(pathToFileURL(fig.svg).href, { waitUntil: 'networkidle0' });
  const png = Buffer.from(await page.screenshot({ type: 'png', omitBackground: true }));
  await page.close();

  const nativeWidthPx = Math.round(444 * scale);
  const nativeHeightPx = Math.round(300 * scale);
  const ppi = nativeWidthPx / PLACEMENT_W_IN;

  console.log(
    `  ${fig.marker}  block=${block.blockId} p${pageOf(block.blockId)}  ` +
      `${nativeWidthPx}x${nativeHeightPx}px -> ${PLACEMENT_W_IN.toFixed(3)}x${PLACEMENT_H_IN.toFixed(3)}in = ${Math.round(ppi)}ppi` +
      `${ppi >= 300 ? '' : '   *** BELOW 300ppi ***'}`,
  );
  if (ppi < 300) throw new Error(`${fig.marker} rasterised below 300ppi — refusing to place it.`);

  if (WRITE) {
    const stored = await storage.writeProjectFile(PROJECT_ID, ['illustrations', fig.name], png);
    illustrations[block.blockId] = {
      rawAssetPath: stored.relativePath,
      approvedAssetPath: stored.relativePath,
      version: 1,
      nativeWidthPx,
      nativeHeightPx,
      placementWidthIn: PLACEMENT_W_IN,
      placementHeightIn: PLACEMENT_H_IN,
      status: 'approved',
      subject: fig.marker,
      note: 'Vector figure drawn from the manuscript data; rasterised once at 300ppi.',
      createdAt: new Date().toISOString(),
    };
    console.log(`      stored ${stored.relativePath} (${png.length} bytes)`);
  }
}

await browser.close();

if (!WRITE) {
  console.log('\nDRY RUN — nothing written. Re-run with --write to place them.');
  process.exit(0);
}

await updateProjectConfig(PROJECT_ID, { ...config, illustrations });
console.log(`\nconfig updated: ${Object.keys(illustrations).length} illustration anchor(s) on the project.`);
