/**
 * PDF merge primitives (Book Assembly). Pure — pdf-lib only, no DB/storage.
 * Separated so the merge + dimension-reading can be tested on fixture PDFs.
 */

import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import type { PageDimsPt } from './validate-assembly.js';

/** Read the first page's size (points) from a single-page print PDF. */
export async function readFirstPageDimsPt(pdf: Buffer): Promise<PageDimsPt> {
  const doc = await PDFDocument.load(pdf);
  const { width, height } = doc.getPage(0).getSize();
  return { widthPt: width, heightPt: height };
}

/** Merge an ordered list of single-page PDFs into one interior PDF. */
export async function mergeSinglePagePdfs(pdfs: Buffer[]): Promise<Buffer> {
  const out = await PDFDocument.create();
  for (const pdf of pdfs) {
    const src = await PDFDocument.load(pdf);
    const [copied] = await out.copyPages(src, [0]);
    out.addPage(copied);
  }
  return Buffer.from(await out.save());
}

export interface ReviewPdfPageInput {
  png: Buffer;
}

export interface ReviewPdfOptions {
  canvasIn: { w: number; h: number };
  dpi?: number;
  jpegQuality?: number;
}

/**
 * Build a lighter operator-review PDF from approved print PNGs. This is a
 * storage-limit fallback for complete proof review; the source page artifacts
 * remain the print-prepped outputs used by the production gate.
 */
export async function assembleReviewPdfFromPrintPngs(
  pages: ReviewPdfPageInput[],
  options: ReviewPdfOptions,
): Promise<Buffer> {
  const dpi = options.dpi ?? 144;
  const jpegQuality = options.jpegQuality ?? 84;
  const widthPx = Math.round(options.canvasIn.w * dpi);
  const heightPx = Math.round(options.canvasIn.h * dpi);
  const out = await PDFDocument.create();

  for (const pageInput of pages) {
    const jpeg = await sharp(pageInput.png)
      .resize(widthPx, heightPx, { fit: 'fill' })
      .jpeg({ quality: jpegQuality, mozjpeg: true })
      .toBuffer();
    const img = await out.embedJpg(jpeg);
    const page = out.addPage([options.canvasIn.w * 72, options.canvasIn.h * 72]);
    page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  }

  return Buffer.from(await out.save());
}
