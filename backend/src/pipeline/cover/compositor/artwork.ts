/**
 * ARTWORK FITTING — the compositor is not an image generator.
 *
 * This module takes artwork that has already been approved and places it into
 * authoritative geometry. It never regenerates, never redesigns, never invents
 * pixels, and never calls a model. Enhancement and upscaling are separate,
 * explicit operations that a human asks for by name.
 *
 * What it WILL do is scale and, in 'cover' mode, crop. Both are reported in
 * inches so an operator can see exactly what was taken off, rather than
 * discovering it on a printed proof.
 *
 * EFFECTIVE RESOLUTION, NOT METADATA. A JPEG's embedded DPI tag is a claim, not
 * a measurement, and it is routinely wrong. What matters is how many real source
 * pixels land on one printed inch once the art is placed at its final size:
 *
 *     effective PPI = renderDpi / scaleFactor
 *
 * If the art has to be scaled UP to fill the wrap (scaleFactor > 1) the
 * effective resolution drops below the render DPI, and that is the number the
 * print standard is judged against.
 */
import sharp from 'sharp';
import type { CoverGeometry } from './geometry.js';

/**
 * cover   fill the wrap, preserve aspect, crop the overflow. The production default.
 * contain fit inside the wrap, preserve aspect, leave margins. Rarely right for a wrap.
 * exact   stretch to the wrap, DISTORTING the art. Never a default; must be asked for.
 */
export type FitMode = 'cover' | 'contain' | 'exact';

export interface ArtworkPlan {
  mode: FitMode;
  renderDpi: number;
  sourceWidthPx: number;
  sourceHeightPx: number;
  targetWidthPx: number;
  targetHeightPx: number;
  placedWidthIn: number;
  placedHeightIn: number;
  /** How much one source pixel is enlarged. Above 1 means the art is being stretched to fit. */
  scaleFactorX: number;
  scaleFactorY: number;
  effectivePpiX: number;
  effectivePpiY: number;
  /** The binding constraint: the lower of the two axes. */
  effectivePpi: number;
  /** Inches of source removed on each edge. Zero unless mode is 'cover'. */
  cropIn: { leftIn: number; rightIn: number; topIn: number; bottomIn: number };
  /** True when the aspect ratio was not preserved. */
  distorted: boolean;
  sourceAspect: number;
  targetAspect: number;
}

export interface PlanArtworkOptions {
  mode?: FitMode;
  /** Pixels per inch the production raster is built at. Defaults to the binding's minimum. */
  renderDpi?: number;
}

export async function planArtwork(
  artwork: Buffer,
  geometry: CoverGeometry,
  opts: PlanArtworkOptions = {},
): Promise<ArtworkPlan> {
  const mode = opts.mode ?? 'cover';
  const renderDpi = opts.renderDpi ?? geometry.minDpi;

  const meta = await sharp(artwork).metadata();
  const sourceWidthPx = meta.width ?? 0;
  const sourceHeightPx = meta.height ?? 0;
  if (!sourceWidthPx || !sourceHeightPx) {
    throw new Error('Artwork could not be read: sharp reported no pixel dimensions.');
  }

  const targetWidthPx = Math.round(geometry.fullWidthIn * renderDpi);
  const targetHeightPx = Math.round(geometry.fullHeightIn * renderDpi);

  const sx = targetWidthPx / sourceWidthPx;
  const sy = targetHeightPx / sourceHeightPx;

  let scaleFactorX: number;
  let scaleFactorY: number;
  if (mode === 'exact') {
    scaleFactorX = sx;
    scaleFactorY = sy;
  } else {
    const s = mode === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
    scaleFactorX = s;
    scaleFactorY = s;
  }

  const scaledW = sourceWidthPx * scaleFactorX;
  const scaledH = sourceHeightPx * scaleFactorY;
  const overflowW = Math.max(0, scaledW - targetWidthPx);
  const overflowH = Math.max(0, scaledH - targetHeightPx);

  return {
    mode,
    renderDpi,
    sourceWidthPx,
    sourceHeightPx,
    targetWidthPx,
    targetHeightPx,
    placedWidthIn: geometry.fullWidthIn,
    placedHeightIn: geometry.fullHeightIn,
    scaleFactorX,
    scaleFactorY,
    effectivePpiX: renderDpi / scaleFactorX,
    effectivePpiY: renderDpi / scaleFactorY,
    effectivePpi: Math.min(renderDpi / scaleFactorX, renderDpi / scaleFactorY),
    cropIn: {
      leftIn: overflowW / 2 / renderDpi,
      rightIn: overflowW / 2 / renderDpi,
      topIn: overflowH / 2 / renderDpi,
      bottomIn: overflowH / 2 / renderDpi,
    },
    distorted: Math.abs(scaleFactorX - scaleFactorY) > 1e-9,
    sourceAspect: sourceWidthPx / sourceHeightPx,
    targetAspect: targetWidthPx / targetHeightPx,
  };
}

/**
 * Produce the placed raster at the plan's target size.
 *
 * lanczos3 for every resample, and exactly one resample: repeated resizes soften
 * detail with nothing to show for it.
 */
export async function renderArtwork(artwork: Buffer, plan: ArtworkPlan): Promise<Buffer> {
  const fit = plan.mode === 'exact' ? 'fill' : plan.mode === 'cover' ? 'cover' : 'contain';
  return sharp(artwork)
    .resize({
      width: plan.targetWidthPx,
      height: plan.targetHeightPx,
      fit,
      position: 'centre',
      kernel: 'lanczos3',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .toBuffer();
}
