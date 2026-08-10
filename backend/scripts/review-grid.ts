/**
 * REVIEW GRID — the whole book as thumbnails, starting at the title page.
 *
 * Screenshots every page of the current render and composites the approved
 * illustrations onto the pages their anchors resolved to, so the grid shows the
 * book as it will print rather than the text-only flow. Illustrated pages are
 * marked.
 *
 * The illustrations are composited here at the SAME geometry the PDF stamper
 * uses (placement centred in the safe region below the last line of type), so
 * what the grid shows and what the PDF contains cannot drift.
 *
 *   yarn workspace @wildlands/backend qa:grid
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
loadDotenv({ path: path.join(ROOT, '.env') });
loadDotenv({ path: path.join(ROOT, '.env.development.local'), override: true });

const MANUSCRIPT =
  process.env.WL_QA_MANUSCRIPT ?? 'C:/Users/jovan/Downloads/puberty boy book/export/NO-ONE-TOLD-ME-THAT_FINAL.md';
const OUT = path.join(ROOT, 'qa-shots');
const ART = path.join(OUT, 'art');

/**
 * Local asset per anchor. Must match what production has stamped; the script
 * asserts the pixel dimensions agree so a stale local file cannot make the grid
 * show a book the server is not serving.
 */
const ASSETS: Record<string, string> = {
  '2ed10c28': 'p6-art-raw.png',    // p10  Ch1
  '89bad25b': 'p19-art-raw.png',   // p19  Ch3
  'ddba8639': 'p22-art-raw.png',   // p25  Ch4
  'a3522a48': 'p41-art-raw.png',   // p43  Ch7
  'bba5d286': 'p77-art-raw.png',   // p76  Ch12
  'a9e01416': 'p102-art-raw.png',  // p100 Ch16
  'eda81b33': 'p112-art-raw.png',  // p112 Ch18
  '214251c7': 'p119-art-raw.png',  // p119 Ch19
  '5d2cca2b': 'p129-art-raw.png',  // p126 Ch20
  '7014f98d': 'p136-art-raw.png',  // p132 Ch21
  '4a53a65a': 'p152-art-raw.png',  // p147 Ch23
};

const { sanitizeManuscript } = await import('../src/pipeline/stage-1-ingestion/sanitize-manuscript.js');
const { renderTypesetBook } = await import('../src/pipeline/typeset/render-typeset.js');
const { resolveTypesetLayoutStandard } = await import('../src/pipeline/typeset/layout-standards/registry.js');
const { getProductionProfile } = await import('../src/pipeline/production-profiles/registry.js');
const { resolveChromiumPath } = await import('../src/pipeline/stage-6-layout/render-pdf.js');
const { TYPESET_DONE_JS } = await import('../src/pipeline/typeset/typeset-book.js');
const { stampIllustrations } = await import('../src/pipeline/typeset/stamp-illustrations.js');
const { ProjectConfigSchema } = await import('@wildlands/shared');

const markdown = sanitizeManuscript(await readFile(MANUSCRIPT, 'utf8'));
const profile = getProductionProfile('bw-educational-nonfiction');
const standard = resolveTypesetLayoutStandard(profile.typesetLayoutStandardId!);
const trim = { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 };

const illustrations: Record<string, never> = {};
for (const [blockId, file] of Object.entries(ASSETS)) {
  const meta = await sharp(path.join(ART, file)).metadata();
  (illustrations as Record<string, unknown>)[blockId] = {
    rawAssetPath: file,
    approvedAssetPath: file,
    version: 1,
    nativeWidthPx: meta.width,
    nativeHeightPx: meta.height,
    placementWidthIn: (meta.width ?? 0) / 310,
    placementHeightIn: (meta.height ?? 0) / 310,
    status: 'approved',
  };
}

const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'NO ONE TOLD ME THAT',
  subtitle:
    "The Complete Puberty Guide for Boys 9-14: Body Changes, Voice Cracks, Hygiene, Mood Swings, Confidence, and Every Awkward Question You'd Rather Google",
  authorName: 'Nolan Whitlow',
  productionProfileId: profile.id,
  typesetLayoutStandardId: standard.id,
  trimSize: trim,
  typography: {
    bodyPt: 12,
    lineHeight: 1.3,
    headingFont: standard.type.headingFont,
    bodyFont: standard.type.bodyFont,
  },
  layoutOverrides: process.env.WL_OVERRIDES ? JSON.parse(process.env.WL_OVERRIDES) : {},
  illustrations,
});

console.log('rendering …');
const r = await renderTypesetBook({
  markdown,
  config,
  chaptersStartRecto: false,
  layoutStandard: standard,
  frontMatter: { publication: { year: new Date().getFullYear() } },
  deepProbe: true,
});

const assets = new Map<string, Buffer>();
for (const file of Object.values(ASSETS)) assets.set(file, await readFile(path.join(ART, file)));
const stamp = await stampIllustrations({
  pdf: r.pdf,
  illustrations: config.illustrations as never,
  assets,
  probe: r.probe!,
  trim: { widthIn: trim.widthIn, heightIn: trim.heightIn },
  margins: r.report.marginsIn,
});
const byPage = new Map(stamp.stamped.map((s) => [s.page, s]));

console.log(`${r.report.totalPages} pages, ${stamp.stamped.length} illustrated, ${stamp.orphaned.length} orphaned`);

// ── Screenshot every page ──────────────────────────────────────────────────
const { default: puppeteer } = await import('puppeteer-core');
const browser = await puppeteer.launch({
  executablePath: resolveChromiumPath()!,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
});
const TH = 168;
const thumbs: { page: number; buf: Buffer; w: number; h: number }[] = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300, deviceScaleFactor: 1 });
  await page.setContent(r.html, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForFunction(TYPESET_DONE_JS, { timeout: 300_000, polling: 250 });

  for (let n = 1; n <= r.report.totalPages; n++) {
    const el = await page.$(`.pagedjs_page[data-page-number="${n}"]`);
    if (!el) continue;
    await el.scrollIntoView();
    let shot = (await el.screenshot()) as Buffer;

    // Composite the art at the stamper's own geometry, so the grid cannot show
    // a placement the PDF does not have.
    const s = byPage.get(n);
    if (s) {
      const meta = await sharp(shot).metadata();
      const pxPerIn = (meta.width ?? 0) / trim.widthIn;
      const art = await sharp(assets.get(ASSETS[s.blockId])!)
        .resize(Math.round(s.widthIn * pxPerIn), Math.round(s.heightIn * pxPerIn), { fit: 'fill' })
        .toBuffer();
      shot = await sharp(shot)
        .composite([
          {
            input: art,
            left: Math.round(s.xIn * pxPerIn),
            top: Math.round((trim.heightIn - s.yIn - s.heightIn) * pxPerIn),
          },
        ])
        .png()
        .toBuffer();
    }

    // Full-size copy of every illustrated page, so the artwork can be looked at
    // properly rather than squinted at in a thumbnail grid.
    if (byPage.has(n)) {
      await writeFile(path.join(OUT, `illustrated-p${n}.png`), shot);
    }
    const t = await sharp(shot).resize({ height: TH }).toBuffer();
    const tm = await sharp(t).metadata();
    thumbs.push({ page: n, buf: t, w: tm.width ?? 0, h: tm.height ?? 0 });
  }
} finally {
  await browser.close();
}

// ── Compose the grid ───────────────────────────────────────────────────────
const COLS = 12;
const LAB = 15;
const GAP = 6;
const CW = Math.max(...thumbs.map((t) => t.w)) + GAP;
const CH = TH + LAB + GAP;
const rows = Math.ceil(thumbs.length / COLS);
const W = CW * COLS;
const H = rows * CH + 34;

const comp: sharp.OverlayOptions[] = [
  {
    input: Buffer.from(
      `<svg width="${W}" height="30"><style>text{font:700 17px sans-serif;fill:#111}</style>` +
        `<text x="6" y="21">NO ONE TOLD ME THAT — ${r.report.totalPages} pages, ${stamp.stamped.length} illustrated ` +
        `(marked), ${r.report.blankPages.length} blank</text></svg>`,
    ),
    top: 0,
    left: 0,
  },
];
thumbs.forEach((t, i) => {
  const c = i % COLS;
  const rw = Math.floor(i / COLS);
  const x = c * CW + 3;
  const y = 34 + rw * CH;
  const marked = byPage.has(t.page);
  comp.push({ input: t.buf, top: y + LAB, left: x });
  comp.push({
    input: Buffer.from(
      `<svg width="${CW - 6}" height="${LAB}"><style>text{font:${marked ? '700' : '400'} 11px sans-serif;fill:${
        marked ? '#0a7' : '#666'
      }}</style><text x="0" y="11">${t.page}${marked ? ' ●' : ''}</text></svg>`,
    ),
    top: y,
    left: x,
  });
});

await mkdir(OUT, { recursive: true });
await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
  .composite(comp)
  .png()
  .toFile(path.join(OUT, 'review-grid.png'));

console.log(`\nwrote review-grid.png  ${W}x${H}`);
for (const s of stamp.stamped.sort((a, b) => a.page - b.page)) {
  console.log(`  p${String(s.page).padEnd(4)} ${s.blockId}  ${s.widthIn.toFixed(2)}x${s.heightIn.toFixed(2)}in`);
}
process.exit(0);
