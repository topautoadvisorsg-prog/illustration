/**
 * THE TRINKADOOS — special opener title treatment.
 *
 * The one exception to "no text rendered into illustrations", and it is not
 * really an exception at all: the image model never spells this. The opener
 * ARTWORK is generated text-free like every other page, and this typography is
 * composited over it deterministically afterwards. That is what buys exact
 * spelling and identical structure across ten books, which an image model
 * cannot give at any price.
 *
 * THE STRUCTURE IS THE TEMPLATE. Every opener in the series is:
 *
 *     TITLE LINE 1
 *     — CHAPTER <NUMBER> —
 *     TITLE LINE 2
 *
 * One line above, the chapter label between, one line below. Never two above
 * and one below, never three title lines. The split is DECLARED per book in
 * TITLE_SPLITS below and never left to automatic wrapping, because a wrap that
 * reflows on a longer title silently changes the hierarchy and the series stops
 * looking like one series.
 *
 * Only the chapter number, the title wording and the artwork change between
 * books. Type, weights, capitalisation, tracking, rules, spacing, colour and
 * placement are locked here.
 *
 * Usage: tsx scripts/trinkadoos-opener.ts [bookNumber]      (default: 1)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderHtmlToPdf, loadPagedPolyfill, isChromiumAvailable } from '../src/pipeline/stage-6-layout/render-pdf.js';
import { GEOMETRY, OUT_DIR, TITLES, TRIM } from './trinkadoos-config.js';

/**
 * EB Garamond, vendored in this repo under the SIL Open Font Licence.
 *
 * Not the Georgia/Segoe UI from the interior proof — that was scaffolding, it
 * is licensed for embedding but not unambiguously for commercial print, and it
 * was never an approved design. This static TTF was derived deliberately for
 * this pipeline: Chromium emits Type3 glyph procedures for variable faces and
 * proper Type0 CID subsets for static ones, so the static build is the one that
 * embeds cleanly in a print PDF.
 */
const FONT = resolve('assets/fonts/ttf/eb-garamond-normal.ttf');

/** Roman numeral-free, spelled out, because it is read aloud to a four-year-old. */
const CHAPTER_WORD = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];

/**
 * The declared split for every title. Two lines, always.
 *
 * Each break falls at a grammatical joint so the line reads as a phrase rather
 * than a truncation. Book 1's is the owner-specified one; the rest are proposed
 * and not yet approved — nothing renders them until they are.
 */
export const TITLE_SPLITS: Record<number, [string, string]> = {
  1: ['THE LANTERN TREE', 'WENT DARK'],
  2: ['THE BABY DRAGON', 'OF CLOUDSTONE'],
  3: ['THE FOREST THAT', 'LOST ITS COLORS'],
  4: ['THE MOON FOX', 'WHO LOST HIS WAY'],
  5: ['THE VALLEY OF', 'GIANT FLOWERS'],
  6: ['THE BRIDGE THAT FORGOT', 'HOW TO BUILD ITSELF'],
  7: ['THE FIREFLY FESTIVAL', 'THAT LOST ITS SPARK'],
  8: ['THE CREATURE WHO', "DIDN'T WANT TO BE SEEN"],
  9: ['THE DOOR BENEATH', 'THE GLOWING WATERFALL'],
  10: ['THE CITY BENEATH', 'THE GIANT LEAF'],
};

/** Locked measurements. Inches unless stated. */
export const OPENER = {
  /** Widest the title may run. Leaves generous air inside the 8.5 in trim. */
  measureIn: 6.5,
  /** Vertical centre of the lockup, as a fraction of trim height. */
  centreY: 0.33,
  /** Both title lines share one size: the largest in this range that fits BOTH. */
  titlePtRange: [30, 44] as const,
  titleTracking: 0.055,
  chapterPt: 13,
  chapterTracking: 0.34,
  /** Hairline rules either side of the chapter label. */
  ruleIn: 0.85,
  gapTitleToRuleIn: 0.3,
  ink: '#F7EFDF',
  scrim: 'rgba(28, 20, 10, 0.34)',
} as const;

function buildHtml(book: number, polyfill: string): string {
  const [line1, line2] = TITLE_SPLITS[book]!;
  const chapter = `CHAPTER ${CHAPTER_WORD[book]}`;
  const font = readFileSync(FONT).toString('base64');
  const { pageWidthIn: W, pageHeightIn: H } = GEOMETRY;
  const O = OPENER;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "TrinkTitle"; src: url(data:font/ttf;base64,${font}) format("truetype"); font-weight: 400; }
@page { size: ${W}in ${H}in; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
.page { position: relative; width: ${W}in; height: ${H}in; overflow: hidden; }

/* ART PLACEHOLDER — stands in for the generated Page 3 opener illustration.
   The real artwork arrives text-free and this lockup composites over it. */
.art { position: absolute; inset: 0;
       background:
         radial-gradient(120% 70% at 50% 92%, #6E8A52 0%, #55703F 42%, rgba(85,112,63,0) 72%),
         linear-gradient(180deg, #9EC4DC 0%, #BBD8E6 34%, #D8E6D2 62%, #7E9A5E 100%); }

/* Soft feathered scrim, part of the locked treatment: it is what lets one ink
   colour stay legible over a bright daylight sky and a night forest alike. */
.scrim { position: absolute; left: 50%; top: ${(O.centreY * 100).toFixed(2)}%;
         transform: translate(-50%, -50%);
         width: ${O.measureIn + 1.6}in; height: 3.1in;
         background: radial-gradient(ellipse at center, ${O.scrim} 0%, rgba(28,20,10,0.18) 46%, rgba(28,20,10,0) 74%); }

.lockup { position: absolute; left: 50%; top: ${(O.centreY * 100).toFixed(2)}%;
          transform: translate(-50%, -50%);
          width: ${O.measureIn}in; text-align: center;
          font-family: "TrinkTitle", Garamond, serif; color: ${O.ink}; }
.t { margin: 0; white-space: nowrap; text-transform: uppercase;
     letter-spacing: ${O.titleTracking}em; line-height: 1.06;
     text-shadow: 0 0.012in 0.03in rgba(24,16,8,.55); }
.chapline { display: flex; align-items: center; justify-content: center; gap: .16in;
            margin: ${O.gapTitleToRuleIn}in 0; }
.rule { width: ${O.ruleIn}in; height: 1px; background: ${O.ink}; opacity: .55; }
.chap { font-size: ${O.chapterPt}pt; letter-spacing: ${O.chapterTracking}em;
        text-transform: uppercase; white-space: nowrap; text-indent: ${O.chapterTracking}em;
        text-shadow: 0 0.010in 0.024in rgba(24,16,8,.5); }
</style></head><body>
<section class="page">
  <div class="art"></div><div class="scrim"></div>
  <div class="lockup">
    <p class="t" id="l1">${line1}</p>
    <div class="chapline"><span class="rule"></span><span class="chap">${chapter}</span><span class="rule"></span></div>
    <p class="t" id="l2">${line2}</p>
  </div>
</section>
<script>
/* Deterministic fit: the largest whole point size in the approved range at
   which BOTH title lines clear the measure. Both lines always share it, so the
   hierarchy never drifts between a short title and a long one. Book 6 is the
   long one that sets the floor. */
(function () {
  var box = document.querySelector('.lockup');
  var l1 = document.getElementById('l1'), l2 = document.getElementById('l2');
  var max = box.clientWidth, chosen = ${O.titlePtRange[0]};
  for (var pt = ${O.titlePtRange[1]}; pt >= ${O.titlePtRange[0]}; pt--) {
    l1.style.fontSize = l2.style.fontSize = pt + 'pt';
    if (l1.scrollWidth <= max && l2.scrollWidth <= max) { chosen = pt; break; }
  }
  l1.style.fontSize = l2.style.fontSize = chosen + 'pt';
  document.title = 'fit:' + chosen;
})();
</script>
<script>${polyfill}</script>
</body></html>`;
}

async function main() {
  if (!isChromiumAvailable()) {
    console.error('ABORT: no Chromium. export CHROMIUM_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe"');
    process.exit(2);
  }
  const book = Number(process.argv[2] ?? 1);
  const spec = TITLES.find((t) => t.book === book);
  if (!spec) throw new Error(`no such book: ${book}`);
  const [l1, l2] = TITLE_SPLITS[book]!;

  const dir = `${OUT_DIR.replace('07-INTERIORS', '09-OPENERS')}`;
  mkdirSync(dir, { recursive: true });

  const html = buildHtml(book, await loadPagedPolyfill());
  const { buffer } = await renderHtmlToPdf(html, GEOMETRY);
  const out = `${dir}/OPENER-${String(book).padStart(2, '0')}_TYPE-PROOF_placeholder-art.pdf`;
  writeFileSync(out, buffer);

  console.log(`book ${book}  ${spec.title}`);
  console.log(`  split   : "${l1}" / CHAPTER ${CHAPTER_WORD[book]} / "${l2}"`);
  console.log(`  page    : ${GEOMETRY.pageWidthIn} x ${GEOMETRY.pageHeightIn} in  (trim ${TRIM.widthIn} x ${TRIM.heightIn})`);
  console.log(`  type    : EB Garamond (SIL OFL, vendored)`);
  console.log(`  proof   : ${out}`);
  console.log('  artwork : PLACEHOLDER — the real opener illustration is generated text-free and composited under this lockup');
}

await main();
