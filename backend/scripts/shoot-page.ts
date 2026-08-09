/**
 * SHOOT A PAGE — render the book and screenshot specific pages.
 *
 * Diagnostic only. The operator reviews the book in the console; this exists so
 * a layout treatment is never PROPOSED sight-unseen, and so a decision can be
 * argued from the rendered page rather than from a fill percentage.
 *
 *   tsx scripts/shoot-page.ts 152 136
 *   WL_OVERRIDES='{"9e6fa28b":{"variant":"closing-beat"}}' tsx scripts/shoot-page.ts 152
 *
 * Mirrors typeset-fingerprint.ts: same manuscript, same profile, same standard,
 * so what it shows is what the console shows.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
loadDotenv({ path: path.join(ROOT, '.env') });
loadDotenv({ path: path.join(ROOT, '.env.development.local'), override: true });

const MANUSCRIPT =
  process.env.WL_QA_MANUSCRIPT ?? 'C:/Users/jovan/Downloads/puberty boy book/export/NO-ONE-TOLD-ME-THAT_FINAL.md';

/** Shots are throwaway evidence for one decision, so they stay out of the tree. */
const SHOTS = path.join(ROOT, 'qa-shots');

const pages = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n) && n > 0);
if (pages.length === 0) {
  console.error('usage: tsx scripts/shoot-page.ts <page> [<page> ...]');
  process.exit(1);
}

const { sanitizeManuscript } = await import('../src/pipeline/stage-1-ingestion/sanitize-manuscript.js');
const { buildTypesetHtml, parseTypesetSections, typesetMarginsForTrim, TYPESET_DONE_JS } = await import(
  '../src/pipeline/typeset/typeset-book.js'
);
const { resolveTypesetLayoutStandard } = await import('../src/pipeline/typeset/layout-standards/registry.js');
const { getProductionProfile } = await import('../src/pipeline/production-profiles/registry.js');
const { resolveChromiumPath, loadPagedPolyfill } = await import('../src/pipeline/stage-6-layout/render-pdf.js');
const { ProjectConfigSchema } = await import('@wildlands/shared');

const markdown = sanitizeManuscript(await readFile(MANUSCRIPT, 'utf8'));
const profile = getProductionProfile('bw-educational-nonfiction');
const standard = resolveTypesetLayoutStandard(profile.typesetLayoutStandardId!);

const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'NO ONE TOLD ME THAT',
  authorName: 'Nolan Whitlow',
  productionProfileId: profile.id,
  typesetLayoutStandardId: standard.id,
  trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
  typography: {
    bodyPt: 12,
    lineHeight: 1.3,
    headingFont: standard.type.headingFont,
    bodyFont: standard.type.bodyFont,
  },
  layoutOverrides: process.env.WL_OVERRIDES ? JSON.parse(process.env.WL_OVERRIDES) : {},
});

const html = buildTypesetHtml({
  sections: parseTypesetSections(markdown),
  config,
  margins: typesetMarginsForTrim(config.trimSize),
  polyfillJs: await loadPagedPolyfill(),
  layoutStandard: standard,
  chaptersStartRecto: true,
});

await mkdir(SHOTS, { recursive: true });

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
  // 2x so the type is legible when the shot is reviewed, not just present.
  await page.setViewport({ width: 900, height: 1300, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForFunction(TYPESET_DONE_JS, { timeout: 300_000, polling: 250 });

  for (const n of pages) {
    const el = await page.$(`.pagedjs_page[data-page-number="${n}"]`);
    if (!el) {
      console.log(`page ${n}: not found`);
      continue;
    }
    await el.scrollIntoView();
    const out = path.join(SHOTS, `page-${n}.png`);
    await writeFile(out, (await el.screenshot()) as Buffer);
    console.log(`page ${n} -> ${out}`);
  }
} finally {
  await browser.close();
}
process.exit(0);
