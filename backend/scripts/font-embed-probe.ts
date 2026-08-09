/**
 * FONT EMBEDDING PROBE — does Chromium embed a TTF-backed webfont?
 *
 * The interior PDF contains no embedded font program: every face comes out as
 * Type3 glyph-drawing procedures, which print RIPs commonly reject. The known
 * cause is that Chromium embeds proper Type0 CID subsets for SYSTEM-installed
 * fonts but converts `@font-face` web fonts to Type3.
 *
 * That conclusion came from a test comparing a WOFF2 data URI against system
 * fonts. It never tested a webfont backed by a plain TTF. If Chromium handles
 * those properly, the fix is regenerating the vendored assets — no font
 * installation, no image change, no fontconfig probing at render time. Worth
 * ten minutes before rebuilding the container.
 *
 *   yarn workspace @wildlands/backend qa:fontprobe
 *
 * Prints the font dictionaries Chromium actually wrote, read from the PDF
 * object graph (raw-byte /BaseFont grep and pdf.js family names both give the
 * wrong answer here).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
loadDotenv({ path: path.join(ROOT, '.env') });
loadDotenv({ path: path.join(ROOT, '.env.development.local'), override: true });
const FONT_DIR = path.join(ROOT, 'backend/assets/fonts');

const { resolveChromiumPath } = await import('../src/pipeline/stage-6-layout/render-pdf.js');
const { PDFDocument, PDFName, PDFDict } = await import('pdf-lib');
type Dict = InstanceType<typeof PDFDict>;

/** First upright 400-weight woff2 data URI in a vendored family stylesheet. */
async function firstWoff2(family: string): Promise<Buffer> {
  const css = await readFile(path.join(FONT_DIR, `${family}.css`), 'utf8');
  const block = css
    .split('@font-face')
    .find((b) => /font-style:normal/.test(b) && /font-weight:400/.test(b));
  const b64 = block && /base64,([A-Za-z0-9+/=]+)\)/.exec(block)?.[1];
  if (!b64) throw new Error(`no upright 400 face found in ${family}.css`);
  return Buffer.from(b64, 'base64');
}

const SAMPLE = 'Handgloves 0123 &mdash; the quick brown fox jumps over the lazy dog.';

function doc(fontCss: string, family: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss}
body { font-family: '${family}', serif; font-size: 18pt; margin: 1in; }
</style></head><body><p>${SAMPLE}</p></body></html>`;
}

async function fontsIn(pdf: Buffer): Promise<string[]> {
  const parsed = await PDFDocument.load(pdf, { updateMetadata: false });
  const out = new Map<string, boolean>();
  const seen = new Set<unknown>();
  const visit = (res: Dict | undefined, depth = 0): void => {
    if (!res || depth > 6) return;
    const fd = res.lookupMaybe(PDFName.of('Font'), PDFDict);
    if (fd) {
      for (const [, ref] of fd.entries()) {
        const f = parsed.context.lookup(ref) as Dict;
        if (!f?.get) continue;
        const base = String(f.get(PDFName.of('BaseFont')) ?? '(no BaseFont)').replace(/^\//, '');
        const subtype = String(f.get(PDFName.of('Subtype')) ?? '?').replace(/^\//, '');
        let desc = f.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
        if (!desc) {
          const kids = f.get(PDFName.of('DescendantFonts'));
          const arr = kids ? (parsed.context.lookup(kids) as { get?: (i: number) => unknown }) : null;
          const kid = arr?.get ? (parsed.context.lookup(arr.get(0) as never) as Dict) : null;
          desc = kid?.lookupMaybe?.(PDFName.of('FontDescriptor'), PDFDict) ?? undefined;
        }
        const embedded = !!desc && ['FontFile', 'FontFile2', 'FontFile3'].some((k) => desc!.get(PDFName.of(k)));
        out.set(`${subtype}:${base}`, embedded);
      }
    }
    const xo = res.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (xo) {
      for (const [, ref] of xo.entries()) {
        if (seen.has(ref)) continue;
        seen.add(ref);
        const x = parsed.context.lookup(ref) as Dict;
        visit(x?.lookupMaybe?.(PDFName.of('Resources'), PDFDict), depth + 1);
      }
    }
  };
  for (const p of parsed.getPages()) visit(p.node.Resources());
  return [...out].map(([k, e]) => `${k} embedded=${e}`);
}

const woff2 = await firstWoff2('archivo');
const { decompress } = await import('wawoff2');
const ttf = Buffer.from(await decompress(woff2));
console.log(`archivo upright 400: woff2 ${woff2.length}B -> ttf ${ttf.length}B\n`);

const CASES: { name: string; css: string; family: string }[] = [
  {
    name: 'A  data-URI @font-face, TTF payload',
    css: `@font-face{font-family:'ProbeTTF';font-style:normal;font-weight:400;src:url(data:font/ttf;base64,${ttf.toString('base64')}) format('truetype');}`,
    family: 'ProbeTTF',
  },
  {
    name: 'B  data-URI @font-face, WOFF2 payload (what we ship)',
    css: `@font-face{font-family:'ProbeWOFF2';font-style:normal;font-weight:400;src:url(data:font/woff2;base64,${woff2.toString('base64')}) format('woff2');}`,
    family: 'ProbeWOFF2',
  },
  { name: 'C  system-installed font (control)', css: '', family: 'Georgia' },
];

const { default: puppeteer } = await import('puppeteer-core');
const browser = await puppeteer.launch({
  executablePath: resolveChromiumPath()!,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
});
try {
  for (const c of CASES) {
    const page = await browser.newPage();
    await page.setContent(doc(c.css, c.family), { waitUntil: 'domcontentloaded' });
    await page.evaluateHandle('document.fonts.ready');
    const pdf = Buffer.from(await page.pdf({ width: '6in', height: '3in', printBackground: true }));
    console.log(c.name);
    for (const f of await fontsIn(pdf)) console.log(`    ${f}`);
    console.log();
    await page.close();
  }
} finally {
  await browser.close();
}
process.exit(0);
