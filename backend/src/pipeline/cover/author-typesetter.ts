/**
 * AUTHOR NAME — set by code, onto finished cover artwork.
 *
 * ─── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * The spine already works this way, for a documented reason: asking an image
 * model to letter a narrow strip failed every attempt, so the platform asks for
 * an empty spine and typesets it afterwards.
 *
 * The author name has the same failure, for a different reason. The model has a
 * strong learned convention that a byline sits at the very bottom of a cover,
 * and it obeys that convention over any stated limit. Measured on DIRT RICH: the
 * prompt's type-safety block permits type to 95.9% of the canvas height, the art
 * direction demanded the name END by 86%, and four consecutive generations put it
 * at 90-96% — hard against the trim, the one place it must never be.
 *
 * A prompt that is followed most of the time is not a print-safety guarantee.
 * This module makes the placement arithmetic instead.
 *
 * It draws ONLY the author name, as vector text in an SVG overlay, at a height
 * expressed as a fraction of the canvas. Nothing else about the artwork is
 * touched.
 */
import sharp from 'sharp';

export interface AuthorPlacement {
  /** The name, exactly as it should print. */
  author: string;
  /**
   * Where the name's BASELINE sits, as a fraction of canvas height.
   * 0.86 keeps a full 14% of expendable artwork beneath it — the requirement
   * that four prompted attempts could not hold.
   */
  baselineFraction: number;
  /** Horizontal centre of the front panel, as a fraction of canvas width. */
  centreFraction: number;
  /** Cap height as a fraction of canvas height. */
  sizeFraction: number;
  /** Fill and halo. A halo keeps the name legible over busy photography. */
  fill: string;
  halo: string;
  fontFamily: string;
}

export const DEFAULT_AUTHOR_PLACEMENT: Omit<AuthorPlacement, 'author' | 'centreFraction'> = {
  baselineFraction: 0.86,
  sizeFraction: 0.052,
  fill: '#F5EFE0',
  halo: 'rgba(0,0,0,0.55)',
  fontFamily: 'Archivo, Helvetica, Arial, sans-serif',
};

export interface TypesetAuthorResult {
  png: Buffer;
  /** Where it actually landed, for assertion by callers and tests. */
  baselinePx: number;
  heightPx: number;
  /** Clear artwork beneath the baseline, as a fraction of canvas height. */
  clearanceFraction: number;
}

/**
 * Draw the author name onto cover artwork.
 *
 * The overlay is a full-canvas SVG so the coordinates are unambiguous: nothing
 * is offset, scaled or centred by a second system afterwards.
 */
export async function typesetAuthorOntoCover(
  artwork: Buffer,
  placement: AuthorPlacement,
): Promise<TypesetAuthorResult> {
  const meta = await sharp(artwork).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error('Cover artwork has no readable dimensions.');

  const baselinePx = Math.round(height * placement.baselineFraction);
  const fontPx = Math.round(height * placement.sizeFraction);
  const centrePx = Math.round(width * placement.centreFraction);
  const escaped = placement.author
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<text x="${centrePx}" y="${baselinePx}" text-anchor="middle" ` +
      `font-family="${placement.fontFamily}" font-size="${fontPx}" font-weight="700" ` +
      `letter-spacing="${(fontPx * 0.04).toFixed(2)}" ` +
      // Halo first, as a stroke under the fill, so the name holds over foliage.
      `stroke="${placement.halo}" stroke-width="${Math.max(2, fontPx * 0.14).toFixed(1)}" ` +
      `paint-order="stroke" fill="${placement.fill}">${escaped}</text></svg>`,
  );

  const png = await sharp(artwork)
    .composite([{ input: svg, top: 0, left: 0 }])
    .png()
    .toBuffer();

  return {
    png,
    baselinePx,
    heightPx: height,
    clearanceFraction: 1 - placement.baselineFraction,
  };
}
