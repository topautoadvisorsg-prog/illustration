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
 *     [ banner ribbon:  Chapter <Number> ]
 *          TITLE LINE 1
 *          TITLE LINE 2
 *
 * The chapter label lives in a decorative banner at the TOP and never between
 * the title lines. The title sits below it, two lines, and the illustration
 * runs full bleed behind the whole opener area. The split is DECLARED per book in
 * TITLE_SPLITS below and never left to automatic wrapping, because a wrap that
 * reflows on a longer title silently changes the hierarchy and the series stops
 * looking like one series.
 *
 * Only the chapter number, the title wording and the artwork change between
 * books. Type, weights, capitalisation, tracking, rules, spacing, colour and
 * placement are locked here.
 *
 * Usage: tsx scripts/trinkadoos-opener.ts [bookNumber] [artworkPath]
 *        artworkPath omitted -> placeholder field, for judging type only.
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
const CHAPTER_WORD = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/**
 * The declared split for every title. Two lines, always.
 *
 * Each break falls at a grammatical joint so the line reads as a phrase rather
 * than a truncation. Book 1's is the owner-specified one; the rest are proposed
 * and not yet approved — nothing renders them until they are.
 */
export const TITLE_SPLITS: Record<number, [string, string]> = {
  1: ['The Lantern Tree', 'Went Dark'],
  2: ['The Baby Dragon', 'of Cloudstone'],
  3: ['The Forest That', 'Lost Its Colors'],
  4: ['The Moon Fox', 'Who Lost His Way'],
  5: ['The Valley of', 'Giant Flowers'],
  6: ['The Bridge That Forgot', 'How to Build Itself'],
  7: ['The Firefly Festival', 'That Lost Its Spark'],
  8: ['The Creature Who', "Didn't Want to Be Seen"],
  9: ['The Door Beneath', 'The Glowing Waterfall'],
  10: ['The City Beneath', 'The Giant Leaf'],
};

/** Locked measurements. Inches unless stated. */
export const OPENER = {
  /** Widest the title may run. Leaves generous air inside the 8.5 in trim. */
  measureIn: 6.5,
  /** Vertical centre of the BANNER, as a fraction of trim height. */
  bannerCentreY: 0.105,
  bannerWIn: 3.6,
  bannerHIn: 0.62,
  /** Vertical centre of the two-line title block. */
  titleCentreY: 0.25,
  /** Both title lines share one size: the largest in this range that fits BOTH. */
  titlePtRange: [30, 44] as const,
  titleTracking: 0.055,
  chapterPt: 13,
  chapterTracking: 0.22,
  /** Line gap inside the two-line title block. */
  titleLeading: 1.14,
  ink: '#F9F2E2',
  bannerFill: '#F3E6CB',
  bannerEdge: '#B0854A',
  bannerInk: '#4A2E14',
  scrim: 'rgba(28, 20, 10, 0.34)',
} as const;

/**
 * The finished artwork, embedded rather than linked.
 *
 * `page.setContent` gives the document no base URL, so a relative src silently
 * resolves to nothing and the page renders with a blank field -- which looks
 * like a design decision rather than a missing file. Inlining it fails loudly
 * instead, at read time.
 */
function artLayer(artPath?: string): string {
  if (!artPath) {
    return `<div class="art art-placeholder"></div>`;
  }
  const ext = artPath.toLowerCase().endsWith('.jpg') || artPath.toLowerCase().endsWith('.jpeg') ? 'jpeg' : 'png';
  const data = readFileSync(artPath).toString('base64');
  return `<div class="art" style="background-image:url(data:image/${ext};base64,${data})"></div>`;
}

function buildHtml(book: number, polyfill: string, artPath?: string): string {
  const [line1, line2] = TITLE_SPLITS[book]!;
  const chapter = `Chapter ${CHAPTER_WORD[book]}`;
  const font = readFileSync(FONT).toString('base64');
  const { pageWidthIn: W, pageHeightIn: H } = GEOMETRY;
  const O = OPENER;
  const art = artLayer(artPath);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "TrinkTitle"; src: url(data:font/ttf;base64,${font}) format("truetype"); font-weight: 400; }
@page { size: ${W}in ${H}in; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
.page { position: relative; width: ${W}in; height: ${H}in; overflow: hidden;
        font-family: "TrinkTitle", Garamond, serif; }

/* The finished, text-free opener illustration, full bleed behind everything. */
.art { position: absolute; inset: 0; background-size: cover; background-position: center; }
.art-placeholder { background:
         radial-gradient(120% 70% at 50% 92%, #6E8A52 0%, #55703F 42%, rgba(85,112,63,0) 72%),
         linear-gradient(180deg, #9EC4DC 0%, #BBD8E6 34%, #D8E6D2 62%, #7E9A5E 100%); }

/* A soft wash across the opener text area only. It is what lets one ink colour
   stay legible over a bright daylight sky and a night forest alike, so the
   colour treatment can stay locked across the series. */
.wash { position: absolute; left: 0; right: 0; top: 0; height: 42%;
        background: linear-gradient(180deg, rgba(26,18,9,.42) 0%, rgba(26,18,9,.26) 52%, rgba(26,18,9,0) 100%); }

/* Banner: the chapter label lives here and only here. */
.banner { position: absolute; left: 50%; top: ${(O.bannerCentreY * 100).toFixed(2)}%;
          transform: translate(-50%, -50%); width: ${O.bannerWIn}in; height: ${O.bannerHIn}in; }
.banner svg { display: block; width: 100%; height: 100%; }
.banner .label { font-family: "TrinkTitle", Garamond, serif; font-size: ${O.chapterPt}pt;
                 letter-spacing: ${O.chapterTracking}em; fill: ${O.bannerInk}; }

/* Two-line title, below the banner. Both lines always share one size. */
.title { position: absolute; left: 50%; top: ${(O.titleCentreY * 100).toFixed(2)}%;
         transform: translate(-50%, -50%); width: ${O.measureIn}in;
         text-align: center; color: ${O.ink}; }
.t { margin: 0; white-space: nowrap; letter-spacing: ${O.titleTracking}em;
     line-height: ${O.titleLeading}; text-shadow: 0 0.014in 0.036in rgba(22,14,6,.62); }
</style></head><body>
<section class="page">
  ${art}
  <div class="wash"></div>

  <div class="banner">
    <svg viewBox="0 0 720 124" xmlns="http://www.w3.org/2000/svg">
      <!-- swallowtail ribbon: notched ends, soft parchment field, thin gold edge -->
      <path d="M0 18 L84 18 L64 62 L84 106 L0 106 Z" fill="${O.bannerEdge}" opacity=".72"/>
      <path d="M720 18 L636 18 L656 62 L636 106 L720 106 Z" fill="${O.bannerEdge}" opacity=".72"/>
      <rect x="62" y="6" width="596" height="112" rx="12" fill="${O.bannerFill}"/>
      <rect x="62" y="6" width="596" height="112" rx="12" fill="none"
            stroke="${O.bannerEdge}" stroke-width="3"/>
      <rect x="72" y="16" width="576" height="92" rx="8" fill="none"
            stroke="${O.bannerEdge}" stroke-width="1" opacity=".55"/>
      <text class="label" x="360" y="72" text-anchor="middle">${chapter}</text>
      <g fill="${O.bannerEdge}" opacity=".85">
        <path d="M126 62 l7-7 7 7 -7 7 z"/>
        <path d="M580 62 l7-7 7 7 -7 7 z"/>
      </g>
    </svg>
  </div>

  <div class="title">
    <p class="t" id="l1">${line1}</p>
    <p class="t" id="l2">${line2}</p>
  </div>
</section>
<script>
/* Deterministic fit: the largest whole point size in the approved range at
   which BOTH title lines clear the measure. Both lines always share it, so the
   hierarchy never drifts between a short title and a long one. */
(function () {
  var box = document.querySelector('.title');
  var l1 = document.getElementById('l1'), l2 = document.getElementById('l2');
  var max = box.clientWidth, chosen = ${O.titlePtRange[0]};
  for (var pt = ${O.titlePtRange[1]}; pt >= ${O.titlePtRange[0]}; pt--) {
    l1.style.fontSize = l2.style.fontSize = pt + 'pt';
    if (l1.scrollWidth <= max && l2.scrollWidth <= max) { chosen = pt; break; }
  }
  l1.style.fontSize = l2.style.fontSize = chosen + 'pt';
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

  const artPath = process.argv[3];
  const html = buildHtml(book, await loadPagedPolyfill(), artPath);
  const { buffer } = await renderHtmlToPdf(html, GEOMETRY);
  const suffix = artPath ? 'FINAL' : 'TYPE-PROOF_placeholder-art';
  const out = `${dir}/OPENER-${String(book).padStart(2, '0')}_${suffix}.pdf`;
  writeFileSync(out, buffer);

  console.log(`book ${book}  ${spec.title}`);
  console.log(`  split   : "${l1}" / Chapter ${CHAPTER_WORD[book]} / "${l2}"`);
  console.log(`  page    : ${GEOMETRY.pageWidthIn} x ${GEOMETRY.pageHeightIn} in  (trim ${TRIM.widthIn} x ${TRIM.heightIn})`);
  console.log(`  type    : EB Garamond (SIL OFL, vendored)`);
  console.log(`  proof   : ${out}`);
  console.log(`  artwork : ${artPath ?? 'PLACEHOLDER — supply the text-free Page 3 render as argv[3]'}`);
}

await main();
