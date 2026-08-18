/**
 * COVER GEOMETRY — one authoritative description of a wrap, in every space that
 * matters.
 *
 * Everything here derives from `computeCoverDimensions`, which stays the single
 * source for the physical wrap (it carries the Amazon citations). This module
 * adds what that function deliberately does not: WHERE the panels, folds and
 * safe areas sit, and how those positions map into the image model's canvas
 * after the compositor's centre-crop.
 *
 * ─── WHY THREE SPACES ─────────────────────────────────────────────────────────
 *
 * A cover exists in three coordinate systems at once and they are not
 * proportional to each other:
 *
 *   PRINT INCHES   the physical wrap. What KDP trims.
 *   PRINT PIXELS   the 300-DPI canvas `composeCoverPrint` builds.
 *   MODEL PIXELS   the image model's canvas, which is a DIFFERENT ASPECT RATIO.
 *
 * `composeCoverPrint` fits art onto the wrap with `fit: 'cover'`: it scales
 * until the art covers the canvas and centre-crops the overflow. So a position
 * on the printed wrap is NOT the same fraction of the generated image. Work that
 * mapping backwards or every zone you describe to the model lands somewhere else
 * on the printed book.
 *
 * This is not hypothetical. The spine of NO ONE TOLD ME THAT is 3.0% of the
 * model's canvas. Told only "spine width 0.385 inches" in prose, the model
 * painted a spine roughly seven times too wide, because nothing in a text prompt
 * converts an inch into a fraction of a canvas.
 */
import type { ProjectConfig } from '@wildlands/shared';
import { computeCoverDimensions, COVER_BLEED_IN, type CoverDimensions } from '../stage-6-layout/render-html.js';

/**
 * KDP wants readable copy at least this far INSIDE the trim line. KDP's stated
 * minimum is 0.125in; 0.25in is the recommended figure.
 * Source: https://kdp.amazon.com/en_US/help/topic/G201953020
 *
 * ─── WHY THIS IS 0.40 AND NOT KDP'S 0.25 ──────────────────────────────────
 * The blueprint drew the safe box at 0.25in, but `dirt-rich-cover-pdf.ts`
 * VERIFIES the finished wrap against 0.375in. The model was therefore told a
 * looser bound than the checker enforces, and copy that satisfied the drawn
 * box still failed the check.
 *
 * It is worse than an inconsistency, because the model does not honour the
 * drawn box exactly — it sets type to its own sense of margin and drifts
 * outward. `composeCoverPrint` then centre-crops ~9-11% of the canvas width,
 * and that drift is what gets eaten: DIRT RICH back copy was painted 0.753in
 * clear and arrived 0.187in from the cut. Telling the model to try harder does
 * not fix it; the box has to stop earlier than the boundary does, so that the
 * drift still lands inside.
 *
 * 0.40in is taken from the cover that came out right — NO ONE TOLD ME THAT
 * holds type at 8.5% of its canvas. On DIRT RICH's wider wrap 0.40in lands on
 * the same 8.5%, so both books now protect type equally. Raising this only
 * ever moves type further from the cut, so it cannot make an existing cover
 * less safe.
 */
export const SAFE_INSIDE_TRIM_IN = 0.4;

/** KDP allows 0.0625in of fold variance either side of each spine fold. */
export const SPINE_FOLD_VARIANCE_IN = 0.0625;

/** The model canvas the cover is generated on. gpt-image-2's landscape shape. */
export const MODEL_CANVAS = { widthPx: 1536, heightPx: 1024 } as const;

/** 300 DPI, per KDP's submission guidelines. */
export const PRINT_DPI = 300;

/** An axis-aligned rectangle. Units depend on which space it belongs to. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CoverZones<T = Rect> {
  /** The whole wrap including bleed. */
  wrap: T;
  /** Inside the bleed: what actually survives the trim. */
  trim: T;
  /** Inside the trim by SAFE_INSIDE_TRIM_IN: where type is allowed. */
  safe: T;
  backPanel: T;
  backSafe: T;
  spine: T;
  /** Spine inset by the fold variance: where spine type may sit. */
  spineSafe: T;
  frontPanel: T;
  frontSafe: T;
}

export interface CoverGeometry {
  /** The physical wrap, straight from the canonical engine. */
  dims: CoverDimensions;
  pageCount: number;
  paperStock: 'white' | 'cream';
  trimIn: { widthIn: number; heightIn: number };
  bleedIn: number;

  /** Zones in physical inches, origin at the wrap's top-left. */
  inches: CoverZones;
  /** The same zones on the 300-DPI print canvas. */
  printPx: CoverZones;
  /** The same zones mapped into the model's canvas, through the crop. */
  modelPx: CoverZones;

  printCanvas: { widthPx: number; heightPx: number; dpi: number };
  modelCanvas: { widthPx: number; heightPx: number };

  /**
   * What `composeCoverPrint`'s `fit: 'cover'` does to the generated image.
   *
   * `scale` is applied to the model canvas; `cropPerSide*` is then removed from
   * each side. `survivingModelRect` is the part of the generated image that
   * actually reaches the printed wrap.
   */
  crop: {
    scale: number;
    cropPerSidePrintPxX: number;
    cropPerSidePrintPxY: number;
    cropPerSideModelPxX: number;
    cropPerSideModelPxY: number;
    survivingModelRect: Rect;
    survivingWidthPct: number;
    survivingHeightPct: number;
  };
}

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

/** Shrink a rect inwards by `inset` on every side. Never past zero. */
const inset = (r: Rect, i: number): Rect =>
  rect(r.x + i, r.y + i, Math.max(0, r.w - i * 2), Math.max(0, r.h - i * 2));

/** Inset only horizontally — used for the spine, whose height is the full wrap. */
const insetX = (r: Rect, i: number): Rect =>
  rect(r.x + i, r.y, Math.max(0, r.w - i * 2), r.h);

function mapZones(zones: CoverZones, fn: (r: Rect) => Rect): CoverZones {
  return {
    wrap: fn(zones.wrap),
    trim: fn(zones.trim),
    safe: fn(zones.safe),
    backPanel: fn(zones.backPanel),
    backSafe: fn(zones.backSafe),
    spine: fn(zones.spine),
    spineSafe: fn(zones.spineSafe),
    frontPanel: fn(zones.frontPanel),
    frontSafe: fn(zones.frontSafe),
  };
}

/**
 * Resolve every zone of a wrap.
 *
 * `pageCount` sizes the spine, so it must be the FINAL interior page count. The
 * caller gets it from the track-aware resolver, never by guessing.
 */
export function resolveCoverGeometry(
  config: ProjectConfig,
  pageCount: number,
  modelCanvas: { widthPx: number; heightPx: number } = MODEL_CANVAS,
): CoverGeometry {
  const dims = computeCoverDimensions(config, pageCount);
  const bleed = COVER_BLEED_IN;
  const trimW = config.trimSize.widthIn;
  const trimH = config.trimSize.heightIn;

  // Panels, left to right: back cover, spine, front cover. The wrap reads
  // back-to-front because it is printed flat and folded around the block.
  const backX = bleed;
  const spineX = bleed + trimW;
  const frontX = bleed + trimW + dims.spineIn;

  const wrap = rect(0, 0, dims.fullWidthIn, dims.fullHeightIn);
  const trim = rect(bleed, bleed, dims.fullWidthIn - bleed * 2, dims.fullHeightIn - bleed * 2);
  const backPanel = rect(backX, bleed, trimW, trimH);
  const spine = rect(spineX, 0, dims.spineIn, dims.fullHeightIn);
  const frontPanel = rect(frontX, bleed, trimW, trimH);

  const inches: CoverZones = {
    wrap,
    trim,
    safe: inset(trim, SAFE_INSIDE_TRIM_IN),
    backPanel,
    backSafe: inset(backPanel, SAFE_INSIDE_TRIM_IN),
    spine,
    // Spine type must clear the fold variance on both sides. On a narrow spine
    // this can legitimately collapse to nothing, which the preflight reports
    // rather than silently drawing a zero-width box.
    spineSafe: insetX(spine, SPINE_FOLD_VARIANCE_IN),
    frontPanel,
    frontSafe: inset(frontPanel, SAFE_INSIDE_TRIM_IN),
  };

  const printCanvasW = Math.round(dims.fullWidthIn * PRINT_DPI);
  const printCanvasH = Math.round(dims.fullHeightIn * PRINT_DPI);
  const printPx = mapZones(inches, (r) =>
    rect(r.x * PRINT_DPI, r.y * PRINT_DPI, r.w * PRINT_DPI, r.h * PRINT_DPI),
  );

  // The compositor's transform, inverted. `fit: 'cover'` scales by the LARGER
  // ratio so the art covers both axes, then centre-crops whatever overflows.
  const scale = Math.max(printCanvasW / modelCanvas.widthPx, printCanvasH / modelCanvas.heightPx);
  const cropPerSidePrintPxX = (modelCanvas.widthPx * scale - printCanvasW) / 2;
  const cropPerSidePrintPxY = (modelCanvas.heightPx * scale - printCanvasH) / 2;
  const cropPerSideModelPxX = cropPerSidePrintPxX / scale;
  const cropPerSideModelPxY = cropPerSidePrintPxY / scale;

  const toModel = (r: Rect): Rect =>
    rect(
      (r.x * PRINT_DPI + cropPerSidePrintPxX) / scale,
      (r.y * PRINT_DPI + cropPerSidePrintPxY) / scale,
      (r.w * PRINT_DPI) / scale,
      (r.h * PRINT_DPI) / scale,
    );

  const survivingModelRect = rect(
    cropPerSideModelPxX,
    cropPerSideModelPxY,
    modelCanvas.widthPx - cropPerSideModelPxX * 2,
    modelCanvas.heightPx - cropPerSideModelPxY * 2,
  );

  return {
    dims,
    pageCount,
    paperStock: config.paperStock ?? 'white',
    trimIn: { widthIn: trimW, heightIn: trimH },
    bleedIn: bleed,
    inches,
    printPx,
    modelPx: mapZones(inches, toModel),
    printCanvas: { widthPx: printCanvasW, heightPx: printCanvasH, dpi: PRINT_DPI },
    modelCanvas: { widthPx: modelCanvas.widthPx, heightPx: modelCanvas.heightPx },
    crop: {
      scale,
      cropPerSidePrintPxX,
      cropPerSidePrintPxY,
      cropPerSideModelPxX,
      cropPerSideModelPxY,
      survivingModelRect,
      survivingWidthPct: (survivingModelRect.w / modelCanvas.widthPx) * 100,
      survivingHeightPct: (survivingModelRect.h / modelCanvas.heightPx) * 100,
    },
  };
}

/** A rect as percentages of the model canvas, which is how a prompt must speak. */
export function asModelPct(
  r: Rect,
  modelCanvas: { widthPx: number; heightPx: number },
): { leftPct: number; topPct: number; widthPct: number; heightPct: number } {
  return {
    leftPct: (r.x / modelCanvas.widthPx) * 100,
    topPct: (r.y / modelCanvas.heightPx) * 100,
    widthPct: (r.w / modelCanvas.widthPx) * 100,
    heightPct: (r.h / modelCanvas.heightPx) * 100,
  };
}
