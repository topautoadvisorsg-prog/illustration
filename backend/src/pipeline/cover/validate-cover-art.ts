/**
 * POST-GENERATION VALIDATION — does the artwork that came back actually print?
 *
 * The preflight checks the REQUEST. This checks the RESPONSE, and they are
 * different questions. The first generation of NO ONE TOLD ME THAT passed every
 * preflight check and still came back with the back-cover paragraphs 0.109in
 * past the trim line, which slices a character off every line on press. Nothing
 * in the platform looked, so it was found by hand.
 *
 * ─── WHAT THIS CAN AND CANNOT SEE ─────────────────────────────────────────────
 *
 * It finds TYPE-COLOURED ink near the edges. Type on this class of cover is set
 * in the palette's light tone or its accent, against a saturated field, so
 * "light or accent-coloured pixels" is a good proxy for "letters". It is a
 * proxy, not OCR:
 *
 *   • a pale ILLUSTRATION element that legitimately bleeds off the edge will be
 *     reported too. Artwork is allowed past the trim; that hit is a false alarm
 *     and a human resolves it by looking.
 *   • text set in a dark tone on a light field would be missed entirely.
 *
 * So a FAIL means "look at this edge", not "the model failed". It is still worth
 * far more than the nothing that was there before, because the failure it does
 * catch is invisible on screen and expensive on paper.
 *
 * Geometry comes from the same CoverGeometry the blueprint is drawn from. There
 * is no second set of percentages here by design.
 */
import sharp from 'sharp';
import type { CoverSpec } from './cover-spec.js';
import type { Rect } from './cover-geometry.js';

export type ArtCheckStatus = 'PASS' | 'WARNING' | 'FAIL';

export interface ArtCheck {
  key: string;
  label: string;
  status: ArtCheckStatus;
  detail: string;
}

export interface CoverArtValidation {
  status: ArtCheckStatus;
  checks: ArtCheck[];
  /** Leftmost/rightmost type-like ink found, in model pixels. */
  inkExtent: { minX: number; maxX: number; minY: number; maxY: number } | null;
}

/** Model px -> inches on the printed wrap. */
const toIn = (px: number, spec: CoverSpec): number => (px * spec.geometry.crop.scale) / spec.geometry.printCanvas.dpi;

/**
 * A region of copy to check, scoped to ONE panel.
 *
 * The x range matters as much as the y range. A band that scans the full width
 * finds the leftmost light pixel anywhere on the wrap, so a check named "front
 * title" reported the back cover's cream pennant and failed for the wrong panel.
 */
export interface Band {
  name: string;
  y0: number;
  y1: number;
  /** Which panel this copy lives on. Bounds the horizontal scan. */
  panel: 'back' | 'front';
}

export async function validateCoverArt(
  art: Buffer,
  spec: CoverSpec,
  opts: { bands?: Band[] } = {},
): Promise<CoverArtValidation> {
  const g = spec.geometry;
  const { data, info } = await sharp(art).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const ch = info.channels;

  if (W !== g.modelCanvas.widthPx || H !== g.modelCanvas.heightPx) {
    return {
      status: 'FAIL',
      checks: [{
        key: 'canvas_size',
        label: 'Artwork canvas',
        status: 'FAIL',
        detail: `Artwork is ${W}x${H}; the geometry was resolved for ${g.modelCanvas.widthPx}x${g.modelCanvas.heightPx}. Every coordinate below would be wrong.`,
      }],
      inkExtent: null,
    };
  }

  // "Type-like" = clearly lighter than the field. Threshold is taken from the
  // artwork's own luminance distribution rather than a fixed number, so it works
  // on a dark cover or a light one.
  const lums: number[] = [];
  for (let y = 0; y < H; y += 3) {
    for (let x = 0; x < W; x += 3) {
      const i = (y * W + x) * ch;
      lums.push(0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!);
    }
  }
  lums.sort((a, b) => a - b);
  const p50 = lums[Math.floor(lums.length * 0.5)]!;
  const p97 = lums[Math.floor(lums.length * 0.97)]!;
  const inkThreshold = p50 + (p97 - p50) * 0.72;

  const isInk = (x: number, y: number): boolean => {
    const i = (y * W + x) * ch;
    return 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]! >= inkThreshold;
  };

  let minX = W, maxX = 0, minY = H, maxY = 0, found = false;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!isInk(x, y)) continue;
      found = true;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const checks: ArtCheck[] = [];
  const add = (key: string, label: string, status: ArtCheckStatus, detail: string) =>
    checks.push({ key, label, status, detail });

  if (!found) {
    add('ink_present', 'Type detected', 'WARNING', 'No type-like ink found. Either the cover carries no light type, or the threshold missed it.');
    return { status: 'WARNING', checks, inkExtent: null };
  }

  const trim = g.modelPx.trim;
  const safe = g.modelPx.safe;
  const surviving = g.crop.survivingModelRect;

  // Whole-image extent is ADVISORY ONLY.
  //
  // Light artwork is allowed — expected — to run past the trim and into the
  // cropped band; that is what bleed is. At this level a pale illustration edge
  // and a letter are the same pixels, so failing on the whole-image extent
  // reports the artwork doing its job. The panel-scoped bands below are where a
  // real verdict comes from.
  const note = (key: string, label: string, got: number, boundary: number, side: 'min' | 'max'): void => {
    const past = side === 'min' ? boundary - got : got - boundary;
    add(
      key, label, 'PASS',
      past <= 0
        ? `light content clear by ${toIn(Math.abs(past), spec).toFixed(3)}in`
        : `light content extends ${toIn(past, spec).toFixed(3)}in past this line (expected for bleeding artwork; see the band checks for copy)`,
    );
  };
  note('extent_crop_left', 'Light content vs crop (left)', minX, surviving.x, 'min');
  note('extent_crop_right', 'Light content vs crop (right)', maxX, surviving.x + surviving.w, 'max');
  note('extent_trim_top', 'Light content vs trim (top)', minY, trim.y, 'min');
  note('extent_trim_bottom', 'Light content vs trim (bottom)', maxY, trim.y + trim.h, 'max');

  // The spine must have come back empty when code is setting the type.
  if (spec.spineTypeSetBy === 'deterministic') {
    const s = g.modelPx.spine;
    let inkInSpine = 0;
    for (let y = 0; y < H; y++) {
      for (let x = Math.floor(s.x); x < Math.ceil(s.x + s.w); x++) if (isInk(x, y)) inkInSpine++;
    }
    const pctInk = (inkInSpine / (s.w * H)) * 100;
    add(
      'spine_empty',
      'Spine left empty for typesetting',
      pctInk < 0.5 ? 'PASS' : 'FAIL',
      `${pctInk.toFixed(2)}% of the true spine carries light ink${pctInk < 0.5 ? '' : ' — the model lettered it after being told not to'}`,
    );
  }

  // Per-band left margins, which is where the last failure actually was: one
  // band crossed the trim while the whole-image extent looked acceptable.
  for (const b of opts.bands ?? []) {
    // Scan only the panel this copy belongs to, and only inside its own trim.
    const panel = b.panel === 'back' ? g.modelPx.backPanel : g.modelPx.frontPanel;
    const panelSafe = b.panel === 'back' ? g.modelPx.backSafe : g.modelPx.frontSafe;
    const xFrom = Math.max(0, Math.floor(panel.x - 40));
    const xTo = Math.min(W, Math.ceil(panel.x + panel.w + 40));

    let bandMin = xTo, bandMax = xFrom;
    for (let y = b.y0; y < Math.min(b.y1, H); y++) {
      for (let x = xFrom; x < xTo; x++) if (isInk(x, y)) { if (x < bandMin) bandMin = x; break; }
      for (let x = xTo - 1; x >= xFrom; x--) if (isInk(x, y)) { if (x > bandMax) bandMax = x; break; }
    }
    if (bandMin >= xTo) continue;

    const leftPastTrim = panel.x - bandMin;
    const rightPastTrim = bandMax - (panel.x + panel.w);
    const worstTrim = Math.max(leftPastTrim, rightPastTrim);
    const leftPastSafe = panelSafe.x - bandMin;
    const rightPastSafe = bandMax - (panelSafe.x + panelSafe.w);
    const worstSafe = Math.max(leftPastSafe, rightPastSafe);

    add(
      `band_${b.name.replace(/\W+/g, '_')}`,
      `${b.panel} copy — ${b.name}`,
      worstTrim > 0 ? 'FAIL' : worstSafe > 0 ? 'WARNING' : 'PASS',
      worstTrim > 0
        ? `crosses the ${leftPastTrim >= rightPastTrim ? 'LEFT' : 'RIGHT'} trim by ${toIn(worstTrim, spec).toFixed(3)}in — this gets cut`
        : worstSafe > 0
          ? `inside trim, but ${toIn(worstSafe, spec).toFixed(3)}in outside the safe margin on the ${leftPastSafe >= rightPastSafe ? 'left' : 'right'}`
          : `clear: ${toIn(bandMin - panelSafe.x, spec).toFixed(3)}in / ${toIn(panelSafe.x + panelSafe.w - bandMax, spec).toFixed(3)}in inside safe`,
    );
  }

  const status: ArtCheckStatus = checks.some((c) => c.status === 'FAIL')
    ? 'FAIL'
    : checks.some((c) => c.status === 'WARNING')
      ? 'WARNING'
      : 'PASS';

  return { status, checks, inkExtent: { minX, maxX, minY, maxY } };
}

/** Convenience: the rect a caller most often wants to reason about. */
export const rectToIn = (r: Rect, spec: CoverSpec) => ({
  xIn: toIn(r.x, spec),
  yIn: toIn(r.y, spec),
  wIn: toIn(r.w, spec),
  hIn: toIn(r.h, spec),
});
