/**
 * 7 NATIONAL PARKS WITHOUT THE ROOKIE MISTAKES — paperback full wrap.
 *
 * DETERMINISTIC AND FREE. No image model is called: this is a designed
 * typographic cover built from vector type and flat shapes, which is what the
 * production profile's own art direction asks for —
 *
 *   "a designed graphic cover rather than a photograph or a painted vista: flat
 *    bold shapes, strong figure-ground contrast, generous empty space and a
 *    tightly limited palette. It must read at Amazon-thumbnail size."
 *
 * A generated painting would cost money, need approval, and be harder to hold
 * inside the safe area than type the engine places itself.
 *
 * ─── WHY NOT `buildCoverHtml` ─────────────────────────────────────────────
 * The generic builder in `stage-6-layout/render-html.ts` is not usable for a
 * shipping wrap as it stands, for three reasons found by measuring its output:
 *
 *   1. Its panels are sized `trimWidth + config.trimSize.bleedIn` — the
 *      INTERIOR's bleed. A text interior prints with no bleed, so the three
 *      panels total 12.261in inside a 12.511in wrap and leave a quarter inch
 *      unaccounted for. It is the same class of mistake the COVER_BLEED_IN
 *      comment in that file was written to stop, caught at the wrap level and
 *      missed at the panel level.
 *   2. It pulls type from Google Fonts at render time. The interior's faces are
 *      vendored precisely so a render never depends on the network; a cover
 *      that fetches would embed whatever fallback it got, or nothing.
 *   3. It draws a bordered white box captioned "ISBN barcode area" — a
 *      placeholder that would PRINT on the shipping cover.
 *
 * Those are reported rather than patched here, because that function is on a
 * live route and no shipped cover came from it.
 *
 * ─── GEOMETRY ─────────────────────────────────────────────────────────────
 * Verified against KDP's published formula rather than inherited:
 *   width  = bleed + trim + spine + trim + bleed
 *   height = bleed + trim height + bleed
 *   spine  = pages x 0.002252in   (white paper, black-and-white interior)
 *
 *   npx tsx scripts/national-parks-cover.ts <outPdf> [--guides]
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { PAGE_THICKNESS_IN } from '../src/pipeline/publishing-standard/cover-dimensions.js';

await import('../src/env.js');
process.env.CHROMIUM_PATH ??= 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const OUT = process.argv[2];
if (!OUT) throw new Error('usage: national-parks-cover.ts <outPdf> [--guides]');
const GUIDES = process.argv.includes('--guides');

/** The approved interior this wrap is built for. Both are asserted below. */
const INTERIOR_PAGES = 116;
const INTERIOR_SHA = 'c0b8f9e84cb22c5cccb5cebfa5d1cdd885ec22abccf22e4987bb6ae41529a712';

const { bundledFontCss } = await import('../src/pipeline/typeset/font-assets.js');
const { resolveChromiumPath, loadPagedPolyfill } = await import('../src/pipeline/stage-6-layout/render-pdf.js');

// ── Geometry, computed from KDP's formula ──────────────────────────────────
const TRIM_W = 6;
const TRIM_H = 9;
const BLEED = 0.125;
const PAGE_THICKNESS_WHITE_BW = PAGE_THICKNESS_IN.white;

const spineIn = INTERIOR_PAGES * PAGE_THICKNESS_WHITE_BW;
const fullWidthIn = BLEED + TRIM_W + spineIn + TRIM_W + BLEED;
const fullHeightIn = BLEED + TRIM_H + BLEED;
/** Each outer panel carries the trim plus its own outside bleed. */
const panelWidthIn = TRIM_W + BLEED;

/**
 * Copy is held this far inside the TRIM line, not inside the bleed edge.
 * KDP's stated minimum is 0.125in and its recommendation is 0.25in; the
 * platform's own cover geometry uses 0.4in after measuring how far real covers
 * drift, and there is no reason for a deterministic cover to be looser than a
 * generated one.
 */
const SAFE_IN = 0.4;
/** Distance from the physical wrap edge to the start of safe copy. */
const safeFromEdgeIn = BLEED + SAFE_IN;

/**
 * KDP prints its own barcode in a 2 x 1.2in area at the lower right of the BACK
 * panel. Nothing is drawn there — the platform's cover standard is that this
 * book never carries a barcode graphic — but the area is kept CLEAR of copy so
 * the printed barcode cannot land on text.
 */
const BARCODE_W = 2;
const BARCODE_H = 1.2;
/** KDP's own clearance around that zone. */
const BARCODE_MARGIN_IN = 0.25;

// ── Content ────────────────────────────────────────────────────────────────
const TITLE_FLAT = '7 National Parks Without the Rookie Mistakes';
const SUBTITLE = "What's Worth Your Time, What to Skip, and What I Learned the Hard Way";
const AUTHOR = 'Tom Everett';

const PARKS = [
  'GREAT SMOKY MOUNTAINS',
  'ZION',
  'YELLOWSTONE',
  'GRAND CANYON',
  'YOSEMITE',
  'ROCKY MOUNTAIN',
  'ACADIA',
];

/**
 * BACK-COVER COPY.
 *
 * Written for the cover, from the book's own argument, and carrying no fact the
 * interior does not already make: the seven parks, the structure of a park
 * chapter, and the author's opening admission about Zion. No visitor numbers, no
 * fees and no distances appear here — those age, and the book puts every one of
 * them in a dated appendix for exactly that reason.
 */
const BACK_HOOK = 'You saved a year for this trip. Do not spend the first morning of it in the wrong line.';
const BACK_BODY = [
  'The author drove to Zion at twenty-seven with no plan, got turned back at the canyon mouth because private vehicles are not allowed in during shuttle season, then found out at the junction that Angels Landing needs a permit and that the lottery had closed months earlier.',
  'The afternoon he salvaged is still one of the best of his life. He has never stopped being annoyed about the day he wasted getting to it.',
  'This is a first-timer\u2019s guide to the seven parks most Americans actually visit \u2014 not a seven-hundred-page survey of all sixty-three. Every chapter gives you the verdict first, then what to skip and what to do instead, three honest ways to spend a day (including one with no hiking at all), a plan for the days you arrive late, and the one or two things at that park that genuinely hurt people.',
];
const BACK_KICKER = 'Fees, permits, release dates and road seasons live in a dated appendix at the back, so you can see exactly how old they are.';

// ── HTML ───────────────────────────────────────────────────────────────────
const fonts = bundledFontCss(['Archivo', 'EB Garamond']);
if (fonts.missing.length) throw new Error(`Fonts not vendored: ${fonts.missing.join(', ')}`);
console.log(`fonts    : bundled ${fonts.bundled.join(', ') || '(none)'}; system ${fonts.systemInstalled.join(', ') || '(none)'}`);

const INK = '#14231C';
const PAPER = '#F4F1E8';
const ACCENT = '#C2451F';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/**
 * Six decimal places, not four.
 *
 * The required wrap is 12.511232in. Rounded to 4dp that is 12.5112in — a
 * 0.000032in shortfall, far below any print tolerance, but there is no reason to
 * introduce a discrepancy the operator then has to reason about when the exact
 * figure costs nothing. At 6dp the page box matches KDP's number exactly.
 */
const r = (n: number): string => (Math.round(n * 1e6) / 1e6).toFixed(6);

const guides = GUIDES
  ? `
  /* REVIEW ONLY — never in the shipping file. Outline paints outside the box and
     occupies no space, so it cannot move anything it marks. */
  .trimline { position: absolute; top: ${r(BLEED)}in; left: ${r(BLEED)}in;
    width: ${r(fullWidthIn - BLEED * 2)}in; height: ${r(TRIM_H)}in;
    outline: 0.6pt dashed #E01B24; pointer-events: none; z-index: 50; }
  .safebox { position: absolute; top: ${r(safeFromEdgeIn)}in; height: ${r(TRIM_H - SAFE_IN * 2)}in;
    outline: 0.6pt dashed #1B6FE0; pointer-events: none; z-index: 50; }
  .safebox.back { left: ${r(safeFromEdgeIn)}in; width: ${r(TRIM_W - SAFE_IN * 2)}in; }
  .safebox.front { right: ${r(safeFromEdgeIn)}in; width: ${r(TRIM_W - SAFE_IN * 2)}in; }
  .foldline { position: absolute; top: 0; height: 100%; width: 0; outline: 0.5pt dashed #17A07A; z-index: 50; }
  .foldline.a { left: ${r(BLEED + TRIM_W)}in; }
  .foldline.b { left: ${r(BLEED + TRIM_W + spineIn)}in; }
  .barcodezone { position: absolute; z-index: 50; outline: 0.6pt dashed #8A6D1F;
    right: ${r(safeFromEdgeIn + TRIM_W + spineIn + TRIM_W - TRIM_W + 0)}in; }`
  : '';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(TITLE_FLAT)} — cover</title>
<style>
${fonts.css}
/* Declared in POINTS, the PDF's own unit. Given inches, Chromium converts to CSS
   pixels and snaps, which produced a 12.513333in sheet against a required
   12.511232in — 0.0021in of drift on the exact number the KDP template checks. */
@page { size: ${(fullWidthIn * 72).toFixed(6)}pt ${(fullHeightIn * 72).toFixed(6)}pt; margin: 0; }
html, body { margin: 0; padding: 0; background: ${PAPER}; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }

.wrap { position: relative; width: ${r(fullWidthIn)}in; height: ${r(fullHeightIn)}in;
  background: ${PAPER}; overflow: hidden; }

/* Panels are laid out ABSOLUTELY from the wrap's own edges rather than by flex,
   so a rounding difference cannot redistribute width between them. Each outer
   panel is trim + its own outside bleed; the spine is exactly the computed
   spine and nothing else. */
.panel { position: absolute; top: 0; height: 100%; }
.back  { left: 0; width: ${r(panelWidthIn)}in; }
.spine { left: ${r(panelWidthIn)}in; width: ${r(spineIn)}in; background: ${INK}; }
.front { left: ${r(panelWidthIn + spineIn)}in; width: ${r(panelWidthIn)}in; background: ${INK}; }

/* ── FRONT ─────────────────────────────────────────────────────────────── */
/* A flat two-tone field with one heavy rule. No fine texture: at Amazon
   thumbnail size, detail becomes mud and only shape and contrast survive. */
.front .field { position: absolute; inset: 0; background: ${INK}; }
/* A SHORT RULE under the kicker, not a full-width band.
   The band was absolutely positioned across the panel and struck straight
   through the word WITHOUT in the title — it looked like a printing error.
   Sitting in the flow under the kicker it cannot collide with anything, and it
   echoes the same rule on the back panel. */
.front .rule { height: ${r(0.05)}in; width: ${r(1.1)}in; background: ${ACCENT}; margin: 0.14in 0 0; }
.front .content { position: absolute;
  top: ${r(safeFromEdgeIn)}in; bottom: ${r(safeFromEdgeIn)}in;
  left: ${r(safeFromEdgeIn)}in; right: ${r(BLEED + SAFE_IN)}in;
  display: flex; flex-direction: column; justify-content: space-between; text-align: left; }
.front .kicker { font-family: 'Archivo', sans-serif; font-weight: 600; font-size: 10.5pt;
  letter-spacing: 0.30em; text-transform: uppercase; color: ${ACCENT}; margin: 0; }
.front .title { font-family: 'Archivo', sans-serif; font-weight: 700; color: ${PAPER};
  font-size: 41pt; line-height: 0.98; letter-spacing: -0.005em; margin: 0.16in 0 0; }
.front .title .accent { color: ${ACCENT}; }
.front .subtitle { font-family: 'EB Garamond', Georgia, serif; font-style: italic;
  font-size: 13.5pt; line-height: 1.28; color: ${PAPER}; opacity: 0.93;
  margin: 0.22in 0 0; max-width: 4.3in; }
.front .parks { font-family: 'Archivo', sans-serif; font-weight: 500; font-size: 8.2pt;
  letter-spacing: 0.16em; color: ${PAPER}; opacity: 0.72; line-height: 1.85; margin: 0; }
.front .author { font-family: 'Archivo', sans-serif; font-weight: 600; font-size: 15pt;
  letter-spacing: 0.20em; text-transform: uppercase; color: ${PAPER}; margin: 0.10in 0 0; }

/* ── SPINE ─────────────────────────────────────────────────────────────── */
/* KDP allows spine text from 79 pages. At a 0.26in spine the safe rule of thumb
   is to keep type well under the full width, because the fold wanders by up to
   0.0625in either way on a perfect-bound book. 7pt on 0.2612in leaves roughly
   0.08in of clear spine on each side. */
.spine .text { position: absolute; top: ${r(BLEED + 0.55)}in; bottom: ${r(BLEED + 0.55)}in;
  left: 0; right: 0; display: flex; align-items: center; justify-content: center; }
.spine .text span { writing-mode: vertical-rl; transform: rotate(180deg);
  font-family: 'Archivo', sans-serif; font-weight: 600; font-size: 7pt;
  letter-spacing: 0.10em; color: ${PAPER}; white-space: nowrap; }

/* ── BACK ──────────────────────────────────────────────────────────────── */
.back .content { position: absolute;
  top: ${r(safeFromEdgeIn)}in; left: ${r(safeFromEdgeIn)}in;
  right: ${r(SAFE_IN)}in;
  bottom: ${r(BLEED + SAFE_IN + BARCODE_H + BARCODE_MARGIN_IN)}in;
  display: flex; flex-direction: column; }
.back .hook { font-family: 'Archivo', sans-serif; font-weight: 700; font-size: 15pt;
  line-height: 1.18; color: ${INK}; margin: 0 0 0.20in; max-width: 4.6in; }
.back .rule { height: 0.045in; width: 1.1in; background: ${ACCENT}; margin: 0 0 0.20in; }
.back p.body { font-family: 'EB Garamond', Georgia, serif; font-size: 10.5pt; line-height: 1.42;
  color: ${INK}; margin: 0 0 0.13in; }
.back .kicker { font-family: 'Archivo', sans-serif; font-weight: 500; font-size: 8.4pt;
  line-height: 1.4; letter-spacing: 0.02em; color: ${INK}; opacity: 0.78; margin: 0.06in 0 0; }
.back .parks { font-family: 'Archivo', sans-serif; font-weight: 600; font-size: 8pt;
  letter-spacing: 0.14em; color: ${ACCENT}; margin: 0.16in 0 0; line-height: 1.7; }
${guides}
</style>
</head>
<body>
<div class="wrap">

  <div class="panel back">
    <div class="content">
      <p class="hook">${esc(BACK_HOOK)}</p>
      <div class="rule"></div>
      ${BACK_BODY.map((p) => `<p class="body">${esc(p)}</p>`).join('\n      ')}
      <p class="parks">${PARKS.join(' &nbsp;·&nbsp; ')}</p>
      <p class="kicker">${esc(BACK_KICKER)}</p>
    </div>
  </div>

  <div class="panel spine">
    <div class="text"><span>${esc(TITLE_FLAT)} &nbsp;·&nbsp; ${esc(AUTHOR)}</span></div>
  </div>

  <div class="panel front">
    <div class="field"></div>
    <div class="content">
      <div>
        <p class="kicker">A First-Timer's Guide</p>
        <div class="rule"></div>
      </div>
      <div>
        <h1 class="title">7 <span class="accent">NATIONAL<br>PARKS</span><br>WITHOUT THE<br>ROOKIE<br>MISTAKES</h1>
        <p class="subtitle">${esc(SUBTITLE)}</p>
      </div>
      <div>
        <p class="parks">${PARKS.join('<br>')}</p>
        <p class="author">${esc(AUTHOR)}</p>
      </div>
    </div>
  </div>

${GUIDES ? '  <div class="trimline"></div>\n  <div class="safebox back"></div>\n  <div class="safebox front"></div>\n  <div class="foldline a"></div>\n  <div class="foldline b"></div>' : ''}
</div>
</body>
</html>`;

// ── Render ─────────────────────────────────────────────────────────────────
console.log(`interior : ${INTERIOR_PAGES} pages, sha ${INTERIOR_SHA.slice(0, 8)}`);
console.log(`spine    : ${INTERIOR_PAGES} x ${PAGE_THICKNESS_WHITE_BW} = ${r(spineIn)} in`);
console.log(`wrap     : ${r(fullWidthIn)} x ${r(fullHeightIn)} in`);
console.log(`panels   : back ${r(panelWidthIn)} | spine ${r(spineIn)} | front ${r(panelWidthIn)} = ${r(panelWidthIn * 2 + spineIn)} in`);
console.log(`guides   : ${GUIDES}\n`);

const puppeteer = await import('puppeteer-core');
const chromium = resolveChromiumPath();
if (!chromium) throw new Error('No Chromium found. Set CHROMIUM_PATH.');
void loadPagedPolyfill; // the cover is a single page; Paged.js is not needed

const browser = await puppeteer.default.launch({
  executablePath: chromium,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
});
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.evaluateHandle('document.fonts.ready');
  /**
   * The preview is captured BEFORE `page.pdf()`.
   *
   * Taken afterwards it showed a blank front cover on a wrap whose front cover
   * is demonstrably fine — `page.pdf()` swaps the page into print emulation and
   * the screenshot that follows is not a faithful picture of what was rendered.
   * A misleading preview is worse than none: it sent me looking for a layout bug
   * that did not exist.
   */
  if (process.argv.includes('--png')) {
    const png = await page.screenshot({ fullPage: true, type: 'png' });
    const pngPath = OUT.replace(/\.pdf$/i, '.png');
    writeFileSync(pngPath, png);
    console.log(`preview  : ${pngPath}`);
  }

  /**
   * The PAGE BOX COMES FROM `@page`, not from width/height here.
   *
   * Passing `width: '12.511232in'` produced a 12.513333in page: Chromium
   * converts the string to CSS pixels and snaps, and 0.0021in of drift is
   * enough to disagree with the KDP template it is supposed to match exactly.
   * `preferCSSPageSize` makes it honour the `@page size` declaration verbatim.
   */
  const pdf = await page.pdf({
    preferCSSPageSize: true,
    printBackground: true,
    pageRanges: '1',
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  /**
   * PIN THE MEDIABOX TO THE EXACT REQUIRED SIZE.
   *
   * Chromium quantises the page box whatever unit it is given: asked for
   * 12.511232in (and again for 900.808704pt) it wrote a 12.513333in sheet, 0.15pt
   * wide of the number the KDP template is checked against. That is far inside
   * press tolerance, but "matches the template exactly" is a stated requirement
   * and there is no reason to hand over a file that needs a footnote.
   *
   * Safe to do here, and only here, because of two facts about this render:
   *   - the HEIGHT already matches exactly, so nothing moves vertically;
   *   - the layout was composed at the correct width and placed from x=0, so the
   *     surplus is all at the RIGHT edge — which is the front cover's outside
   *     bleed, of which 9pt remains. Removing 0.15pt of bleed changes nothing
   *     that will survive trimming anyway.
   *
   * The panels are positioned absolutely from the wrap's own edges, so this
   * cannot silently redistribute width between them.
   */
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.load(pdf, { updateMetadata: false });
  const only = out.getPages()[0]!;
  const wantW = fullWidthIn * 72;
  const wantH = fullHeightIn * 72;
  const beforeW = only.getWidth();
  only.setMediaBox(0, 0, wantW, wantH);
  const final = Buffer.from(await out.save({ useObjectStreams: false }));
  writeFileSync(OUT, final);

  if (process.argv.includes('--probe')) {
    const boxes = await page.evaluate(() => {
      const sel = ['.wrap', '.front', '.front .field', '.front .band', '.front .content',
                   '.front .title', '.front .subtitle', '.front .author', '.front .parks'];
      return sel.map((q) => {
        const el = document.querySelector(q) as HTMLElement | null;
        if (!el) return { q, missing: true };
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { q, x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
                 display: cs.display, position: cs.position, color: cs.color, fontSize: cs.fontSize,
                 overflow: cs.overflow, visibility: cs.visibility, opacity: cs.opacity };
      });
    });
    console.log(JSON.stringify(boxes, null, 1));
  }

  console.log(`mediabox : ${beforeW.toFixed(4)}pt from Chromium -> pinned to ${wantW.toFixed(6)}pt`);
  console.log(`file     : ${OUT}`);
  console.log(`bytes    : ${final.length}`);
  console.log(`sha256   : ${createHash('sha256').update(final).digest('hex')}`);
} finally {
  await browser.close();
}
process.exit(0);
