/**
 * STAMP ILLUSTRATIONS ONTO A FINISHED INTERIOR PDF.
 *
 * ─── WHY STAMPING AND NOT LAYOUT ──────────────────────────────────────────
 * An `<img>` in the typeset HTML is content: Paged.js flows it, and the moment
 * it flows, line breaks and page breaks can move. This book's 159 pages, its
 * ten parity blanks and its every line box were accepted against a measured
 * baseline, and an illustration is not allowed to spend any of that.
 *
 * So typesetting finishes first and produces the canonical PDF. Only then is
 * the artwork drawn on top, at fixed coordinates, as an additional image object.
 * Text, fonts, wrapping, running heads, folios, margins, page count and page
 * geometry are untouched by construction rather than by inspection: nothing in
 * this file can alter a content stream that already exists, and the text stays
 * vector and searchable because it is never re-rendered.
 *
 * ─── WHY THE PAGE IS RESOLVED, NOT STORED ─────────────────────────────────
 * An illustration is anchored to the STABLE BLOCK ID of the last block on the
 * page it decorates, and its page is looked up on every build. Pagination moved
 * four times during this book's QA. A stored page number would still point at
 * whatever now happens to sit there, which is how artwork silently lands on the
 * wrong chapter. If a block cannot be resolved, the illustration is reported as
 * ORPHANED and nothing is drawn — never stamped at a guessed location.
 */
import { PDFDocument } from 'pdf-lib';

import type { PageIllustration } from '@wildlands/shared';

import type { TypesetBlockProbe } from './render-typeset.js';
import type { TypesetMargins } from './typeset-book.js';

const PT_PER_IN = 72;

export interface StampInput {
  /** The canonical interior, exactly as typesetting produced it. */
  pdf: Buffer;
  /** blockId -> illustration. */
  illustrations: Record<string, PageIllustration>;
  /** Asset bytes by storage path, already fetched by the caller. */
  assets: Map<string, Buffer>;
  /** Line-box probe from the same render. The page resolver and region source. */
  probe: TypesetBlockProbe[];
  /** Page geometry, so the safe region matches what the renderer used. */
  trim: { widthIn: number; heightIn: number };
  margins: TypesetMargins;
  /** Gap between the last line of type and the top of the art. */
  artGapIn?: number;
}

export interface StampedIllustration {
  blockId: string;
  page: number;
  /** Printed placement, in inches, measured from the page's bottom-left. */
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
  /** Generated pixels over printed size. The only honest resolution figure. */
  nativePpi: number;
}

export interface StampResult {
  pdf: Buffer;
  stamped: StampedIllustration[];
  /** Anchors that no longer exist in the render, or whose asset is missing. */
  orphaned: { blockId: string; reason: string }[];
}

/**
 * Draw each approved illustration onto the page its anchor block landed on.
 * Returns a new PDF; the input buffer is not modified.
 */
export async function stampIllustrations(input: StampInput): Promise<StampResult> {
  const entries = Object.entries(input.illustrations);
  if (entries.length === 0) {
    return { pdf: input.pdf, stamped: [], orphaned: [] };
  }

  const artGapIn = input.artGapIn ?? 0.22;
  const stamped: StampedIllustration[] = [];
  const orphaned: { blockId: string; reason: string }[] = [];

  const doc = await PDFDocument.load(input.pdf, { updateMetadata: false });
  const pages = doc.getPages();

  // Paged.js lays pages out in CSS units, where 1in is exactly 96px, so the
  // page box the probe measured against is the trim size at 96dpi. Deterministic,
  // and not something to infer from the content that happens to be on a page.
  const pageHeightPx = input.trim.heightIn * 96;

  for (const [blockId, illustration] of entries) {
    if (illustration.status !== 'approved') {
      orphaned.push({ blockId, reason: 'not approved' });
      continue;
    }

    // Every fragment of the anchor block. A block split across a page break
    // appears more than once; the illustration belongs on the LAST page it
    // reaches, which is where the type actually ends.
    const fragments = input.probe.filter((b) => b.blockId === blockId && b.page !== null);
    if (fragments.length === 0) {
      orphaned.push({ blockId, reason: 'anchor block is not in this render' });
      continue;
    }
    const pageNumber = Math.max(...fragments.map((b) => b.page as number));
    const page = pages[pageNumber - 1];
    if (!page) {
      orphaned.push({ blockId, reason: `resolved to page ${pageNumber}, which the PDF does not have` });
      continue;
    }

    const asset = input.assets.get(illustration.approvedAssetPath);
    if (!asset) {
      orphaned.push({ blockId, reason: `asset ${illustration.approvedAssetPath} was not readable` });
      continue;
    }

    // The safe region is recomputed from where the type ACTUALLY ends on the
    // resolved page, not from anything stored at approval time. That is what
    // lets an illustration survive a page whose content shifted.
    const onPage = input.probe.filter((b) => b.page === pageNumber);
    const typeBottomPx = onPage.reduce((lowest, b) => Math.max(lowest, b.bottomPx), 0);
    const typeBottomIn = (typeBottomPx / pageHeightPx) * input.trim.heightIn;

    const regionTopIn = typeBottomIn + artGapIn;
    const regionBottomIn = input.trim.heightIn - input.margins.bottomIn;
    const regionLeftIn = input.margins.gutterIn;
    const regionRightIn = input.trim.widthIn - input.margins.outsideIn;
    const regionHIn = regionBottomIn - regionTopIn;
    const regionWIn = regionRightIn - regionLeftIn;

    const wIn = illustration.placementWidthIn;
    const hIn = illustration.placementHeightIn;
    if (wIn > regionWIn + 0.01 || hIn > regionHIn + 0.01) {
      orphaned.push({
        blockId,
        reason:
          `approved placement ${wIn.toFixed(2)}x${hIn.toFixed(2)}in no longer fits the safe region ` +
          `${regionWIn.toFixed(2)}x${regionHIn.toFixed(2)}in on p${pageNumber}`,
      });
      continue;
    }

    // Centred in the region, so the leftover stays as deliberate white rather
    // than the art drifting to one end of it.
    const xIn = regionLeftIn + (regionWIn - wIn) / 2;
    const topIn = regionTopIn + (regionHIn - hIn) / 2;

    /**
     * JPEG IS EMBEDDED AS JPEG, so a grey plate stays grey.
     *
     * `embedPng` expands a greyscale PNG to DeviceRGB. The pixels are still
     * neutral, but the page then declares a colour space in a book printed
     * black-and-white — and KDP prices an interior by what its pages declare,
     * not by whether the ink happens to be neutral. A single RGB image can move
     * a whole book onto colour pricing.
     *
     * `embedJpg` preserves DeviceGray for a single-component JPEG, so an
     * interior plate can be genuinely grey in the file. PNG is still accepted
     * for anything already approved that way.
     */
    const isJpeg = asset.length > 3 && asset[0] === 0xff && asset[1] === 0xd8 && asset[2] === 0xff;
    const image = isJpeg ? await doc.embedJpg(asset) : await doc.embedPng(asset);
    // PDF user space is bottom-left origin; the geometry above is top-down.
    const yIn = input.trim.heightIn - topIn - hIn;
    page.drawImage(image, {
      x: xIn * PT_PER_IN,
      y: yIn * PT_PER_IN,
      width: wIn * PT_PER_IN,
      height: hIn * PT_PER_IN,
    });

    stamped.push({
      blockId,
      page: pageNumber,
      xIn,
      yIn,
      widthIn: wIn,
      heightIn: hIn,
      nativePpi: illustration.nativeWidthPx / wIn,
    });
  }

  const out = Buffer.from(await doc.save({ useObjectStreams: false }));
  return { pdf: out, stamped, orphaned };
}
