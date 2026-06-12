/**
 * Cover Print-Prep — compose the AI cover-wrap art into a 300-DPI print PDF.
 *
 * Why this exists: the cover PDF used to be produced by Chromium `page.pdf()`,
 * which rasterises at ~96 CSS-DPI and downsamples the wrap art to ~100 DPI — far
 * below print quality for the highest-stakes asset. This composes the cover
 * deterministically with sharp + pdf-lib (the same toolchain the interior
 * print-prep uses): Lanczos-upscale the wrap art onto the 300-DPI full-wrap
 * canvas, stamp the engine-reserved barcode box, and embed the PNG into a PDF at
 * the exact physical wrap size with NO JPEG and NO downscale.
 *
 * Composition is unchanged from buildCoverHtml's art path: the AI bakes ALL
 * cover typography (title / subtitle / author / spine / back copy) INTO the wrap
 * illustration; the only engine-stamped element is the barcode reserve box, kept
 * here at the same geometry (back panel, 2 × 1.2 in).
 */

import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import type { ProjectConfig } from '@wildlands/shared';
import { SPACING } from '../publishing-standard/index.js';
import type { CoverDimensions } from '../stage-6-layout/render-html.js';

export interface CoverComposeResult {
  pngBuffer: Buffer;
  pdfBuffer: Buffer;
  /** Final composed pixel dimensions (the 300-DPI full-wrap canvas). */
  widthPx: number;
  heightPx: number;
  dpi: number;
  /** Native pixel size of the AI wrap art before upscale (for reporting). */
  artNativeWidthPx: number;
  artNativeHeightPx: number;
}

// Barcode reserve geometry — mirrors buildCoverHtml exactly:
//   .back  { width: trim.width + bleed; padding: bleed + 0.4in; }
//   .barcode { width: 2in; height: 1.2in; align-self: flex-end; }  (top-right of back panel)
const BARCODE_W_IN = 2;
const BARCODE_H_IN = 1.2;
const PANEL_PAD_EXTRA_IN = 0.4;

/**
 * Deterministic cover composition. Testable on a fixture buffer: no DB, no
 * storage, no network. `dims` is the resolved full-wrap geometry
 * (computeCoverDimensions), so the print file and the validation always share
 * one wrap size.
 */
export async function composeCoverPrint(
  coverArtPng: Buffer,
  config: ProjectConfig,
  dims: CoverDimensions,
): Promise<CoverComposeResult> {
  const dpi = SPACING.printDpi;
  const canvasW = Math.round(dims.fullWidthIn * dpi);
  const canvasH = Math.round(dims.fullHeightIn * dpi);

  const native = await sharp(coverArtPng).metadata();

  // 1. Lanczos upscale to fill the full-wrap canvas. fit:'cover' + centre
  //    reproduces the previous CSS `background-size: cover; background-position:
  //    center`, so the framing/crop of the art is unchanged — only the
  //    resolution improves.
  const art = await sharp(coverArtPng)
    .resize({ width: canvasW, height: canvasH, fit: 'cover', position: 'centre', kernel: 'lanczos3' })
    .toBuffer();

  // 2. Engine-reserved barcode box on the back (left) panel, top-right, matching
  //    buildCoverHtml's geometry computed from the same dims + constants.
  const bleed = config.trimSize.bleedIn;
  const backWidthIn = config.trimSize.widthIn + bleed;
  const padIn = bleed + PANEL_PAD_EXTRA_IN;
  const boxLeftIn = backWidthIn - padIn - BARCODE_W_IN;
  const boxTopIn = padIn;
  const L = Math.round(boxLeftIn * dpi);
  const T = Math.round(boxTopIn * dpi);
  const W = Math.round(BARCODE_W_IN * dpi);
  const H = Math.round(BARCODE_H_IN * dpi);
  const stroke = Math.max(1, Math.round(dpi / 300));
  const fontPx = Math.round((8 / 72) * dpi); // 8pt label, as in buildCoverHtml
  const barcodeSvg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}">` +
    `<rect x="${L}" y="${T}" width="${W}" height="${H}" fill="#ffffff" stroke="#999999" stroke-width="${stroke}"/>` +
    `<text x="${L + W / 2}" y="${T + H / 2}" text-anchor="middle" dominant-baseline="middle" ` +
    `font-family="sans-serif" font-size="${fontPx}" fill="#555555">ISBN barcode area</text>` +
    `</svg>`;
  const overlay = await sharp(Buffer.from(barcodeSvg)).png().toBuffer();

  const pngBuffer = await sharp(art)
    .composite([{ input: overlay, left: 0, top: 0 }])
    .withMetadata({ density: dpi })
    .png()
    .toBuffer();

  // 3. Embed the composed PNG into a single-page PDF at the exact physical wrap
  //    size (points = inches × 72). pdf-lib embedPng is lossless — no JPEG,
  //    no recompression, no downscale.
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([dims.fullWidthIn * 72, dims.fullHeightIn * 72]);
  const img = await pdf.embedPng(pngBuffer);
  page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  const pdfBuffer = Buffer.from(await pdf.save());

  const outMeta = await sharp(pngBuffer).metadata();
  return {
    pngBuffer,
    pdfBuffer,
    widthPx: outMeta.width ?? canvasW,
    heightPx: outMeta.height ?? canvasH,
    dpi,
    artNativeWidthPx: native.width ?? 0,
    artNativeHeightPx: native.height ?? 0,
  };
}
