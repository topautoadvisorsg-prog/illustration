/**
 * PDF merge primitives (Book Assembly). Pure — pdf-lib only, no DB/storage.
 * Separated so the merge + dimension-reading can be tested on fixture PDFs.
 */

import { PDFDocument } from 'pdf-lib';
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
