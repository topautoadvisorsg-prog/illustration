/**
 * SYSTEM-FONT PROBE — does removing `@font-face` change the book?
 *
 * Two things have to be true before the interior can be set from system fonts,
 * and neither is safe to assume:
 *
 *   1. EMBEDDING. Chromium turns any `@font-face` into Type3 glyph-drawing
 *      procedures, which print RIPs commonly reject, and writes proper Type0
 *      CID subsets only for fonts on the host's font path.
 *
 *   2. WEIGHT SELECTION. The vendored faces are VARIABLE fonts: one binary per
 *      family+style, with the `wght` axis pinned by the `@font-face` descriptor.
 *      Take the descriptor away and the axis has to be set by system font
 *      matching instead. If that lands on the wrong instance, the page still
 *      renders, still paginates plausibly, and is simply set in the wrong
 *      weight — a defect no page count or overflow check can see.
 *
 * So this measures the SAME strings both ways in the SAME browser and compares
 * advance widths to four decimals. Identical widths mean the line breaks cannot
 * move; a mismatch means switching to system fonts would repaginate the book.
 *
 * Runs inside the render image (fontconfig + chromium), not on the dev box:
 *
 *   docker run --rm -v "$PWD:/app" -w /app <image> node backend/scripts/font-system-probe.mjs
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const FONT_DIR = path.join(ROOT, 'backend/assets/fonts');

const CHROMIUM = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium';

/** A pangram plus the digits and punctuation the interior actually sets. */
const SAMPLE = 'Handgloves 0123456789 - the quick brown fox jumps over the lazy dog; "quoted," (parenthetical).';

const manifest = JSON.parse(await readFile(path.join(FONT_DIR, 'ttf/manifest.json'), 'utf8'));

/** Every (family, weight, style) the stylesheets serve, from the manifest. */
const COMBOS = manifest.flatMap((m) => m.weights.map((w) => ({ family: m.family, weight: w, style: m.style })));

function slug(family) {
  return family.toLowerCase().replace(/\s+/g, '-');
}

const cssByFamily = new Map();
for (const family of new Set(COMBOS.map((c) => c.family))) {
  cssByFamily.set(family, await readFile(path.join(FONT_DIR, `${slug(family)}.css`), 'utf8'));
}

function buildDoc(withFontFace) {
  const faces = withFontFace ? [...cssByFamily.values()].join('\n') : '';
  const spans = COMBOS.map(
    (c, i) =>
      `<span id="s${i}" style="font-family:'${c.family}';font-weight:${c.weight};font-style:${c.style}">${SAMPLE}</span>`,
  ).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${faces}
body { margin: 0; font-size: 12pt; }
span { display: inline-block; white-space: pre; }
</style></head><body>
${spans}
</body></html>`;
}

async function measure(page, withFontFace) {
  await page.setContent(buildDoc(withFontFace), { waitUntil: 'domcontentloaded' });
  await page.evaluateHandle('document.fonts.ready');
  return page.evaluate(
    (n) =>
      Array.from({ length: n }, (_, i) => {
        const el = document.getElementById(`s${i}`);
        return Number(el.getBoundingClientRect().width.toFixed(4));
      }),
    COMBOS.length,
  );
}

/** Font dictionaries Chromium actually wrote, read from the PDF object graph. */
async function fontsIn(pdf) {
  const { PDFDocument, PDFName, PDFDict } = await import('pdf-lib');
  const parsed = await PDFDocument.load(pdf, { updateMetadata: false });
  const out = new Map();
  for (const p of parsed.getPages()) {
    const res = p.node.Resources();
    const fd = res?.lookupMaybe(PDFName.of('Font'), PDFDict);
    if (!fd) continue;
    for (const [, ref] of fd.entries()) {
      const f = parsed.context.lookup(ref);
      if (!f?.get) continue;
      const base = String(f.get(PDFName.of('BaseFont')) ?? '(none)').replace(/^\//, '');
      const subtype = String(f.get(PDFName.of('Subtype')) ?? '?').replace(/^\//, '');
      let desc = f.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
      if (!desc) {
        const kids = f.get(PDFName.of('DescendantFonts'));
        const arr = kids ? parsed.context.lookup(kids) : null;
        const kid = arr?.get ? parsed.context.lookup(arr.get(0)) : null;
        desc = kid?.lookupMaybe?.(PDFName.of('FontDescriptor'), PDFDict) ?? undefined;
      }
      const embedded = !!desc && ['FontFile', 'FontFile2', 'FontFile3'].some((k) => desc.get(PDFName.of(k)));
      out.set(`${subtype}:${base}`, embedded);
    }
  }
  return [...out].map(([k, e]) => `${k} embedded=${e}`).sort();
}

const { default: puppeteer } = await import('puppeteer-core');
const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
});

let failures = 0;
try {
  const page = await browser.newPage();

  const webfont = await measure(page, true);
  const system = await measure(page, false);

  console.log('WIDTH PARITY  @font-face (today) vs system-installed\n');
  console.log(`  ${'face'.padEnd(34)} ${'webfont'.padStart(10)} ${'system'.padStart(10)}   verdict`);
  COMBOS.forEach((c, i) => {
    const same = webfont[i] === system[i];
    if (!same) failures++;
    const label = `${c.family} ${c.weight} ${c.style}`;
    console.log(
      `  ${label.padEnd(34)} ${String(webfont[i]).padStart(10)} ${String(system[i]).padStart(10)}   ${
        same ? 'match' : 'DIFFERS'
      }`,
    );
  });

  // Distinct weights must MEASURE distinctly. Identical widths across 400/500/
  // 600 would mean the axis was never applied and every weight collapsed onto
  // one instance — which looks like a clean pass on a parity check alone.
  console.log('\nWEIGHT SEPARATION  (system path) — a family+style whose weights all measure');
  console.log('equal has lost its variation axis, whatever the parity check says\n');
  const groups = new Map();
  COMBOS.forEach((c, i) => {
    const key = `${c.family} ${c.style}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ weight: c.weight, width: system[i] });
  });
  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    const distinct = new Set(rows.map((r) => r.width)).size;
    const collapsed = distinct === 1;
    if (collapsed) failures++;
    console.log(
      `  ${key.padEnd(34)} ${rows.map((r) => `${r.weight}=${r.width}`).join('  ')}   ${
        collapsed ? 'COLLAPSED' : `${distinct} distinct`
      }`,
    );
  }

  console.log('\nEMBEDDING  — Type0 with embedded=true is what a print RIP wants\n');
  for (const withFontFace of [true, false]) {
    await page.setContent(buildDoc(withFontFace), { waitUntil: 'domcontentloaded' });
    await page.evaluateHandle('document.fonts.ready');
    const pdf = Buffer.from(await page.pdf({ width: '11in', height: '8.5in', printBackground: true }));
    const fonts = await fontsIn(pdf);
    console.log(`  ${withFontFace ? '@font-face (today)' : 'system-installed'}`);
    for (const f of fonts) console.log(`      ${f}`);
    if (!withFontFace) {
      const bad = fonts.filter((f) => f.startsWith('Type3') || f.endsWith('embedded=false'));
      if (bad.length) {
        failures++;
        console.log(`      ^ ${bad.length} face(s) not embedded as a font program`);
      }
    }
    console.log();
  }

  await page.close();
} finally {
  await browser.close();
}

console.log(failures === 0 ? 'PASS — system fonts render identically and embed properly' : `FAIL — ${failures} problem(s)`);
process.exit(failures === 0 ? 0 : 1);
