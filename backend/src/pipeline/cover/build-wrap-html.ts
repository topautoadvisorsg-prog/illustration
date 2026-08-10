/**
 * FULL-WRAP COVER — built as vector, not generated.
 *
 * The whole wrap is typography, flat colour fields and flat vector symbols,
 * laid out against the real KDP geometry and rendered through the same Chromium
 * the interior uses. Nothing here is an AI image.
 *
 * That is a deliberate production choice, not a shortcut. A generated raster
 * cover at this trim tops out around 132 ppi across the wrap, which is under
 * half of print resolution; and no image model reliably sets a 140-character
 * subtitle containing an en-dash and an apostrophe. Vector gives exact wording,
 * resolution-independent edges, and a cover that can be re-laid-out later
 * without regenerating anything.
 *
 * Geometry comes from kdp-geometry.ts. Positions are expressed in INCHES so the
 * layout is readable against the spec, and the renderer scales to 300dpi.
 */
import type { WrapGeometry } from './kdp-geometry.js';

export interface WrapCopy {
  title: string[];
  subtitle: string;
  /** Pulled out of the subtitle for hierarchy. Must appear in it verbatim. */
  subtitleEmphasis: string;
  author: string;
  backHeadline: string;
  backBody: string[];
  backGroups: { label: string; text: string }[];
  backCloser: string;
}

const PALETTE = {
  /** Deep saturated cobalt. The field the whole wrap sits on. */
  cobalt: '#12307E',
  cobaltDeep: '#0D2460',
  /** Signal orange. */
  orange: '#F2621F',
  cream: '#FBF3E4',
  creamDim: 'rgba(251,243,228,0.72)',
};

/**
 * Flat symbols from a boy's actual life, not preschool icons.
 *
 * Each is a plain path on a 24x24 grid, drawn with heavy strokes so it holds at
 * thumbnail size. They are scattered around the title rather than tiled: the
 * brief asks for supporting texture, not clutter.
 */
const SYMBOLS: Record<string, string> = {
  deodorant:
    '<rect x="8" y="7" width="8" height="14" rx="1.5"/><rect x="10" y="3" width="4" height="4" rx="1"/>',
  razor:
    '<rect x="6" y="4" width="12" height="4" rx="1"/><path d="M12 8v12" stroke-width="2.6" fill="none"/>',
  sneaker:
    '<path d="M3 16c3 0 5-1 7-3l3 3h6a2 2 0 0 1 2 2v2H3z"/><path d="M3 19h18" stroke-width="1.6" fill="none"/>',
  waveform:
    '<path d="M2 12h3l2-6 3 12 3-9 2 5 2-3h5" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  phone:
    '<rect x="7" y="2" width="10" height="20" rx="2.5"/><rect x="10" y="4.6" width="4" height="1" rx="0.5" fill="#12307E"/>',
  speech:
    '<path d="M3 5h18v11H9l-6 5z"/>',
  bolt: '<path d="M13 2 5 13h5l-1 9 8-11h-5z"/>',
  mirror:
    '<ellipse cx="12" cy="9" rx="6" ry="7"/><path d="M12 16v6M9 22h6" fill="none" stroke-width="2.4" stroke-linecap="round"/>',
  spot: '<circle cx="12" cy="12" r="4"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="17" r="2.4"/>',
};

interface Placed {
  key: keyof typeof SYMBOLS | string;
  /** Inches from the FRONT panel's left/top. */
  xIn: number;
  yIn: number;
  sizeIn: number;
  rotate: number;
  colour: string;
  opacity?: number;
}

/**
 * Symbol placement on the front.
 *
 * Kept off the title block on purpose: the title has to own the middle of the
 * cover at thumbnail size, and anything overlapping it costs legibility, which
 * is the one thing this cover cannot trade away.
 */
const FRONT_SYMBOLS: Placed[] = [
  // Top strip, above the orange band.
  { key: 'bolt', xIn: 0.42, yIn: 0.36, sizeIn: 0.52, rotate: -12, colour: PALETTE.orange },
  { key: 'waveform', xIn: 1.62, yIn: 0.42, sizeIn: 0.78, rotate: 0, colour: PALETTE.cream, opacity: 0.8 },
  { key: 'deodorant', xIn: 3.15, yIn: 0.3, sizeIn: 0.56, rotate: 10, colour: PALETTE.cream, opacity: 0.75 },
  { key: 'speech', xIn: 4.28, yIn: 0.4, sizeIn: 0.62, rotate: -6, colour: PALETTE.orange },
  // Bottom strip, below the subtitle and clear of the author line.
  { key: 'razor', xIn: 0.38, yIn: 6.86, sizeIn: 0.58, rotate: -18, colour: PALETTE.cream, opacity: 0.7 },
  { key: 'spot', xIn: 1.58, yIn: 7.0, sizeIn: 0.5, rotate: 0, colour: PALETTE.orange, opacity: 0.9 },
  { key: 'sneaker', xIn: 2.62, yIn: 6.86, sizeIn: 0.8, rotate: 0, colour: PALETTE.cream, opacity: 0.8 },
  { key: 'phone', xIn: 4.02, yIn: 6.76, sizeIn: 0.6, rotate: 8, colour: PALETTE.cream, opacity: 0.8 },
  { key: 'mirror', xIn: 4.86, yIn: 6.94, sizeIn: 0.54, rotate: 0, colour: PALETTE.cream, opacity: 0.55 },
];

/**
 * The same symbol language on the back, quieter.
 *
 * Without these the back is a text panel and the wrap stops being one object at
 * the spine. They sit low and dim so they never compete with the sales copy,
 * and they run through the region where KDP may drop its barcode - that is
 * background, and background is allowed there.
 */
const BACK_SYMBOLS: Placed[] = [
  { key: 'waveform', xIn: 0.42, yIn: 7.42, sizeIn: 0.62, rotate: 0, colour: PALETTE.cream, opacity: 0.3 },
  { key: 'bolt', xIn: 1.48, yIn: 7.5, sizeIn: 0.46, rotate: -12, colour: PALETTE.orange, opacity: 0.55 },
  { key: 'deodorant', xIn: 2.42, yIn: 7.44, sizeIn: 0.5, rotate: 8, colour: PALETTE.cream, opacity: 0.28 },
  { key: 'sneaker', xIn: 3.36, yIn: 7.52, sizeIn: 0.66, rotate: 0, colour: PALETTE.cream, opacity: 0.26 },
  { key: 'phone', xIn: 4.55, yIn: 7.4, sizeIn: 0.52, rotate: -6, colour: PALETTE.cream, opacity: 0.28 },
];

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Set the subtitle in two weights WITHOUT changing a word of it.
 *
 * At Amazon thumbnail size a single small subtitle is grey mush, so the buyer
 * sees the title and learns nothing about what the book IS. Splitting at the
 * em-dash lets the leading clause carry real size - it is the part that says
 * puberty guide, for boys 9-14 - while the long list of topics stays small.
 * Every word survives, in its original order; only the type size changes, which
 * is the hierarchy freedom the brief allows.
 */
function subtitleHtml(subtitle: string, emphasis: string): string {
  const split = subtitle.indexOf(' — ');
  const lead = split > 0 ? subtitle.slice(0, split) : subtitle;
  const rest = split > 0 ? subtitle.slice(split) : '';
  const withEmphasis = (t: string): string => {
    const i = t.indexOf(emphasis);
    if (i < 0) return esc(t);
    return esc(t.slice(0, i)) + `<span class="sub-em">${esc(emphasis)}</span>` + esc(t.slice(i + emphasis.length));
  };
  return `<div class="sub-lead">${withEmphasis(lead)}</div>` + (rest ? `<div class="sub-rest">${esc(rest)}</div>` : '');
}

function symbolSvg(p: Placed): string {
  const body = SYMBOLS[p.key];
  if (!body) return '';
  return (
    `<div class="sym" style="left:${p.xIn}in;top:${p.yIn}in;width:${p.sizeIn}in;height:${p.sizeIn}in;` +
    `transform:rotate(${p.rotate}deg);opacity:${p.opacity ?? 1}">` +
    `<svg viewBox="0 0 24 24" fill="${p.colour}" stroke="${p.colour}" stroke-width="0">${body}</svg></div>`
  );
}

export function buildWrapHtml(g: WrapGeometry, copy: WrapCopy, fontCss: string): string {
  const inch = (n: number): string => `${n}in`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${inch(g.wrapWidthIn)}; height: ${inch(g.wrapHeightIn)}; }
body { position: relative; background: ${PALETTE.cobalt}; overflow: hidden;
  -webkit-font-smoothing: antialiased; }

.panel { position: absolute; top: 0; height: ${inch(g.wrapHeightIn)}; }
/* The cobalt runs edge to edge across the whole wrap, so back, spine and front
   read as one object rather than three rectangles that happen to touch. */
.back  { left: 0; width: ${inch(g.spine.xIn)}; background: ${PALETTE.cobalt}; }
.spine { left: ${inch(g.spine.xIn)}; width: ${inch(g.spine.widthIn)}; background: ${PALETTE.cobalt}; }
.front { left: ${inch(g.front.xIn)}; width: ${inch(g.wrapWidthIn - g.front.xIn)}; background: ${PALETTE.cobalt}; }

/* A single orange band crosses the spine onto both panels: the cheapest way to
   make a wrap look designed rather than assembled. */
.band { position: absolute; left: 0; width: ${inch(g.wrapWidthIn)}; height: .12in;
  background: ${PALETTE.orange}; top: 1.12in; }

/* Content layers sit OVER the colour fields and must not repaint them,
   otherwise the band that ties the wrap together is hidden on the front. */
.content { background: transparent !important; }

.sym { position: absolute; }
.sym svg { width: 100%; height: 100%; display: block; }

/* ── FRONT ─────────────────────────────────────────────────────────────── */
.front-inner { position: absolute; left: ${inch(g.frontSafe.xIn - g.front.xIn)};
  top: ${inch(g.frontSafe.yIn)}; width: ${inch(g.frontSafe.widthIn)}; height: ${inch(g.frontSafe.heightIn)}; }
.title { font-family: 'Archivo', sans-serif; font-weight: 600; color: ${PALETTE.cream};
  font-size: 78pt; line-height: .88; letter-spacing: -.02em; text-transform: uppercase;
  position: absolute; top: 1.52in; left: 0; width: 100%; }
/* nowrap per line: the operator specified the exact three-line break, and
   letting the browser rewrap it turned three lines into five that overran the
   panel and collided with the subtitle. */
.title > div { white-space: nowrap; }
.title .t3 { color: ${PALETTE.orange}; }
.subtitle { position: absolute; top: 4.88in; left: 0; width: 4.75in; }
/* The clause that tells the buyer what this is. Sized to survive a thumbnail. */
.sub-lead { font-family: 'Archivo', sans-serif; font-weight: 500; font-size: 21pt;
  line-height: 1.16; color: ${PALETTE.cream}; letter-spacing: -.005em; }
.sub-em { font-weight: 600; color: ${PALETTE.orange}; }
/* The topic list. Present and complete, but it does not fight the title. */
.sub-rest { font-family: 'EB Garamond', serif; font-size: 11.4pt; line-height: 1.32;
  color: ${PALETTE.creamDim}; margin-top: .12in; }
.author { position: absolute; bottom: 0; left: 0; font-family: 'Archivo', sans-serif;
  font-weight: 500; font-size: 15pt; letter-spacing: .22em; color: ${PALETTE.cream};
  text-transform: uppercase; }

/* ── SPINE ─────────────────────────────────────────────────────────────── */
.spine-text { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%) rotate(90deg);
  transform-origin: center; white-space: nowrap; font-family: 'Archivo', sans-serif;
  font-weight: 600; font-size: 13.5pt; letter-spacing: .06em; color: ${PALETTE.cream};
  text-transform: uppercase; }
.spine-text .dot { color: ${PALETTE.orange}; margin: 0 .5em; }
.spine-text .who { font-weight: 500; letter-spacing: .16em; }

/* ── BACK ──────────────────────────────────────────────────────────────── */
.back-inner { position: absolute; left: ${inch(g.backSafe.xIn)}; top: ${inch(g.backSafe.yIn)};
  width: ${inch(g.backSafe.widthIn)}; height: ${inch(g.backSafe.heightIn)}; }
.back-head { font-family: 'Archivo', sans-serif; font-weight: 600; font-size: 25pt;
  line-height: 1.1; color: ${PALETTE.cream}; letter-spacing: -.01em; margin-top: 1.34in; }
.back-body { font-family: 'EB Garamond', serif; font-size: 12pt; line-height: 1.44;
  color: ${PALETTE.creamDim}; margin-top: .3in; }
.back-body p + p { margin-top: .5em; }
.groups { margin-top: .34in; }
.grp { display: flex; gap: .16in; margin-bottom: .13in; align-items: baseline; }
.grp .lab { font-family: 'Archivo', sans-serif; font-weight: 600; font-size: 10pt;
  letter-spacing: .08em; color: ${PALETTE.orange}; text-transform: uppercase;
  flex: 0 0 1.28in; }
.grp .txt { font-family: 'EB Garamond', serif; font-size: 11pt; line-height: 1.3;
  color: ${PALETTE.creamDim}; flex: 1; }
.closer { position: absolute; bottom: 1.42in; left: 0; width: 3.1in;
  font-family: 'Archivo', sans-serif; font-weight: 500; font-size: 12pt; line-height: 1.32;
  color: ${PALETTE.cream}; }
</style></head><body>
<div class="panel back"></div>
<div class="panel spine"></div>
<div class="panel front"></div>
<div class="band"></div>

<div class="panel front content">
  ${FRONT_SYMBOLS.map(symbolSvg).join('')}
  <div class="front-inner">
    <div class="title">
      ${copy.title.map((l, i) => `<div class="t${i + 1}">${esc(l)}</div>`).join('')}
    </div>
    <div class="subtitle">${subtitleHtml(copy.subtitle, copy.subtitleEmphasis)}</div>
    <div class="author">${esc(copy.author)}</div>
  </div>
</div>

<div class="panel spine content">
  <div class="spine-text">${esc(copy.title.join(' '))}<span class="dot">&#9679;</span><span class="who">${esc(copy.author)}</span></div>
</div>

<div class="panel back content">
  ${BACK_SYMBOLS.map(symbolSvg).join('')}
</div>

<div class="back-inner">
  <div class="back-head">${esc(copy.backHeadline)}</div>
  <div class="back-body">${copy.backBody.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
  <div class="groups">
    ${copy.backGroups
      .map((gp) => `<div class="grp"><div class="lab">${esc(gp.label)}</div><div class="txt">${esc(gp.text)}</div></div>`)
      .join('')}
  </div>
  <div class="closer">${esc(copy.backCloser)}</div>
</div>
</body></html>`;
}

export { PALETTE };
