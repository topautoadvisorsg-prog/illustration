/**
 * BEFORE YOU NEED IT — does the safety hierarchy hold when the reader scales type?
 *
 * The whole argument for the ebook treatment is that it survives reflow. That is
 * a claim about rendering, so it is tested by rendering: the REAL content
 * document and the REAL stylesheet out of the packaged .epub, at the font sizes
 * a reader actually picks.
 *
 * Measures the two tiers' left border and inset at each size and asserts the
 * immediate tier stays visibly stronger, then shoots each size for a person.
 *
 *   yarn tsx scripts/_byni_epub_reflow.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { zipEntries, type ZipEntry } from './_zip.js';
import sharp from 'sharp';
import { resolveChromiumPath } from '../src/pipeline/stage-6-layout/render-pdf.js';
import { OUT_DIR, REV } from './before-you-need-it-config.js';

const EPUB = `${OUT_DIR}/kindle/BEFORE-YOU-NEED-IT_kindle_${REV.replace('-', '')}.epub`;
const OUT = `${OUT_DIR}/kindle/reflow`;
mkdirSync(OUT, { recursive: true });

const entries: ZipEntry[] = zipEntries(readFileSync(EPUB));
const read = (suffix: string): string =>
  entries.find((e) => e.entryName.endsWith(suffix))!.getData().toString('utf8');

const css = read('style.css');
/** The one document carrying BOTH tiers, so they are compared side by side. */
const doc = entries
  .filter((e) => /\.xhtml$/.test(e.entryName))
  .map((e) => e.getData().toString('utf8'))
  .find((t) => t.includes('safety-same-day') && t.includes('safety-immediate'));
if (!doc) {
  console.error('ABORT: no content document carries both tiers.');
  process.exit(2);
}
const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(doc)![1]!;

const chromium = resolveChromiumPath();
if (!chromium) throw new Error('No Chromium. Set CHROMIUM_PATH.');
const { default: puppeteer } = await import('puppeteer-core');
const browser = await puppeteer.launch({
  executablePath: chromium,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
});

const SIZES = [100, 150, 250];
let failures = 0;
try {
  for (const pct of SIZES) {
    const page = await browser.newPage();
    // A small phone at a large reader font is the worst case for reflow.
    await page.setViewport({ width: 375, height: 900, deviceScaleFactor: 2 });
    await page.setContent(
      `<html><head><style>html{font-size:${pct}%}${css}</style></head><body>${body}</body></html>`,
      { waitUntil: 'domcontentloaded' },
    );

    const m = (await page.evaluate(`(() => {
      const px = (el, p) => parseFloat(getComputedStyle(el).getPropertyValue(p));
      const sd = document.querySelector('.safety-same-day');
      const im = document.querySelector('.safety-immediate');
      const doc = document.documentElement;
      return {
        sdBorder: px(sd, 'border-left-width'),
        imBorder: px(im, 'border-left-width'),
        sdPad: px(sd, 'padding-left'),
        imPad: px(im, 'padding-left'),
        sdLabelCase: getComputedStyle(sd.querySelector('.safety-label')).textTransform,
        imLabelCase: getComputedStyle(im.querySelector('.safety-label')).textTransform,
        overflow: doc.scrollWidth - doc.clientWidth,
      };
    })()`)) as Record<string, number | string>;

    const stronger =
      (m.imBorder as number) > (m.sdBorder as number) && (m.imPad as number) > (m.sdPad as number);
    const scales = (m.sdBorder as number) > 0 && (m.imBorder as number) > 0;
    const noOverflow = (m.overflow as number) <= 0;
    const ok = stronger && scales && noOverflow;
    if (!ok) failures += 1;

    console.log(
      `  ${ok ? 'PASS' : 'FAIL'}  ${String(pct).padStart(3)}%  ` +
        `border ${(m.sdBorder as number).toFixed(1)} -> ${(m.imBorder as number).toFixed(1)}px  ` +
        `inset ${(m.sdPad as number).toFixed(1)} -> ${(m.imPad as number).toFixed(1)}px  ` +
        `label ${m.sdLabelCase} -> ${m.imLabelCase}  ` +
        `h-overflow ${m.overflow}px`,
    );

    const el = await page.$('body');
    const png = (await el!.screenshot({ type: 'png' })) as Buffer;
    await sharp(png).greyscale().png().toFile(`${OUT}/safety-${pct}pct.png`);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${failures === 0 ? 'hierarchy holds at every size tested' : `${failures} size(s) FAILED`}`);
console.log(`shots -> ${OUT}`);
process.exit(failures ? 1 : 0);
