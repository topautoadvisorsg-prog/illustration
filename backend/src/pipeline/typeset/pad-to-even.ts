/**
 * Pad a finished interior to an even page count.
 *
 * Sheets are folded into signatures, so a print block is always an even number
 * of pages. KDP does not reject an odd interior — it rounds UP and prints the
 * extra leaf itself. The book then carries one more page than the spine was
 * calculated for, the cover is cut fractionally wrong, and nothing anywhere
 * reports a problem. `delivery-check.ts` has demanded an even block for a while;
 * nothing actually produced one, so the instruction was to go and pad by hand.
 *
 * This runs LAST, after typesetting and after stamping:
 *   - typesetting is finished, so adding a leaf cannot reflow a line, move a
 *     section, or invalidate the contents or the index;
 *   - stamping addresses pages by number, and the added leaf is beyond every
 *     existing page, so no artwork moves.
 *
 * The leaf is genuinely blank — no folio, no running head — which is what a
 * trailing blank in a printed book is.
 */
import { PDFDocument } from 'pdf-lib';

export interface PadResult {
  pdf: Buffer;
  /** Whether a leaf was actually added. */
  added: boolean;
  /** Page count AFTER padding. This is the number that must size the spine. */
  pageCount: number;
}

export async function padInteriorToEven(pdf: Buffer): Promise<PadResult> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const before = doc.getPageCount();
  if (before % 2 === 0) return { pdf, added: false, pageCount: before };

  /* Match the geometry of the page it follows rather than the trim size from
     config. The boxes are what a printer actually reads, and copying them keeps
     the padded leaf identical to the block it joins — including TrimBox, which
     the preflight checks and which a default-sized page would not carry. */
  const last = doc.getPage(before - 1);
  const media = last.getMediaBox();
  const page = doc.addPage([media.width, media.height]);
  page.setMediaBox(media.x, media.y, media.width, media.height);
  const crop = last.getCropBox();
  page.setCropBox(crop.x, crop.y, crop.width, crop.height);
  const bleed = last.getBleedBox();
  page.setBleedBox(bleed.x, bleed.y, bleed.width, bleed.height);
  const trim = last.getTrimBox();
  page.setTrimBox(trim.x, trim.y, trim.width, trim.height);

  const out = Buffer.from(await doc.save());
  return { pdf: out, added: true, pageCount: doc.getPageCount() };
}
