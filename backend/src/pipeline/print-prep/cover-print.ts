/**
 * Cover Print-Prep — compose the AI cover-wrap art into a 300-DPI print PDF.
 *
 * Why this exists: the cover PDF used to be produced by Chromium `page.pdf()`,
 * which rasterises at ~96 CSS-DPI and downsamples the wrap art to ~100 DPI — far
 * below print quality for the highest-stakes asset. This composes the cover
 * deterministically with sharp + pdf-lib (the same toolchain the interior
 * print-prep uses): Lanczos-upscale the wrap art onto the 300-DPI full-wrap
 * canvas and embed the PNG into a PDF at the exact physical wrap size with NO
 * JPEG and NO downscale.
 *
 * The engine stamps NOTHING: the AI bakes ALL cover typography (title / subtitle
 * / author / spine / back copy) INTO the wrap illustration, and KDP/Amazon prints
 * the barcode itself on the back cover — so we never reserve a barcode box (that
 * placeholder used to land on the printed proof).
 */

import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import type { ProjectConfig } from '@wildlands/shared';
import { SPACING } from '../publishing-standard/index.js';
import type { CoverDimensions } from '../publishing-standard/cover-dimensions.js';

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

/**
 * Deterministic cover composition. Testable on a fixture buffer: no DB, no
 * storage, no network. `dims` is the resolved full-wrap geometry
 * (computeCoverDimensions), so the print file and the validation always share
 * one wrap size. `config` is accepted for signature stability (callers pass the
 * project config) but no longer read — the engine stamps nothing onto the art.
 */
export async function composeCoverPrint(
  coverArtPng: Buffer,
  _config: ProjectConfig,
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

  // 2. No engine overlay — the art is the whole cover. Amazon prints the barcode
  //    on the back cover itself, so we reserve nothing.
  const pngBuffer = await sharp(art)
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
