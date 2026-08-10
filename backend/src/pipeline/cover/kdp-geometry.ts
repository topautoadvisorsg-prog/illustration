/**
 * KDP PAPERBACK WRAP GEOMETRY — computed from Amazon's published figures.
 *
 * Every constant here is quoted from KDP's own help pages, with the source
 * against each one, because a spine that is wrong by a few hundredths of an
 * inch prints with the front cover art creeping around the fold and there is no
 * way to tell from looking at the file. This is not a place for a remembered
 * formula.
 *
 *   Spine width, black ink   white paper: pages x 0.002252in
 *                            cream paper: pages x 0.0025in
 *   Bleed                    0.125in on top, bottom and outside edges
 *   Cover width              bleed + back + spine + front + bleed
 *   Cover height             bleed + trim height + bleed
 *   Text safe area           at least 0.125in inside the trim lines
 *   Spine text safe area     at least 0.0625in either side of the spine
 *   Spine fold variance      allow 0.0625in either side of each fold line
 *   Spine text eligibility   at least 79 pages
 *   Minimum type size        7pt
 *   Barcode                  KDP places its own on the back cover when you do
 *                            not supply one. It is NOT part of the artwork.
 *   Resolution               at least 300 DPI
 *
 * Sources:
 *   https://kdp.amazon.com/en_US/help/topic/G201953020   (cover, spine, safety)
 *   https://kdp.amazon.com/en_US/help/topic/G201857950   (submission, 300 DPI)
 *   https://kdp.amazon.com/help?topicId=G5HDYGP4BXLX4RUW (barcode)
 */

/** Per-page thickness for black-ink interiors, in inches. */
export const PAPER_THICKNESS_IN = {
  white: 0.002252,
  cream: 0.0025,
} as const;

export type PaperStock = keyof typeof PAPER_THICKNESS_IN;

export const BLEED_IN = 0.125;
export const SAFE_INSET_IN = 0.125;
export const SPINE_TEXT_SAFE_IN = 0.0625;
export const SPINE_FOLD_VARIANCE_IN = 0.0625;
export const SPINE_TEXT_MIN_PAGES = 79;
export const MIN_TYPE_PT = 7;
export const BARCODE_IN = { width: 2, height: 1.2 };
export const BARCODE_MIN_IN = { width: 1.4, height: 0.8 };
export const BARCODE_CLEARANCE_IN = 0.25;
export const MIN_DPI = 300;

export interface WrapInput {
  trimWidthIn: number;
  trimHeightIn: number;
  pageCount: number;
  paper: PaperStock;
  /** Export resolution. Never below MIN_DPI. */
  dpi?: number;
}

export interface Rect {
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
}

export interface WrapGeometry {
  paper: PaperStock;
  pageCount: number;
  dpi: number;
  spineWidthIn: number;
  wrapWidthIn: number;
  wrapHeightIn: number;
  wrapWidthPx: number;
  wrapHeightPx: number;
  /** Panels in wrap coordinates, origin at the top-left of the bleed. */
  back: Rect;
  spine: Rect;
  front: Rect;
  /** Trim box: the wrap minus bleed. What actually survives cutting. */
  trim: Rect;
  /** Nothing important outside these. */
  backSafe: Rect;
  frontSafe: Rect;
  /** The strip on the spine that type may occupy. */
  spineTextSafe: Rect;
  /**
   * Where KDP is likely to drop its own barcode on the back cover.
   *
   * ADVISORY ONLY, and never a design element. We do not draw a barcode, do not
   * reserve a white rectangle, and never mention it to an image model: the back
   * cover is designed as one continuous finished piece and the artwork runs
   * straight through this area. The single practical rule is that no important
   * READABLE COPY should sit here, because Amazon may cover it. Background,
   * texture and colour underneath are fine.
   */
  barcodeAdvisory: Rect;
  /** True when this page count is allowed spine text at all. */
  spineTextAllowed: boolean;
  /** Usable spine height for type, in points. */
  spineTextCapacityPt: number;
  notes: string[];
}

/** Inches to whole pixels at the given resolution, rounded up. */
const px = (inches: number, dpi: number): number => Math.ceil(inches * dpi);

export function computeWrapGeometry(input: WrapInput): WrapGeometry {
  const dpi = Math.max(input.dpi ?? MIN_DPI, MIN_DPI);
  const { trimWidthIn: tw, trimHeightIn: th, pageCount, paper } = input;

  const spineWidthIn = pageCount * PAPER_THICKNESS_IN[paper];
  const wrapWidthIn = BLEED_IN + tw + spineWidthIn + tw + BLEED_IN;
  const wrapHeightIn = BLEED_IN + th + BLEED_IN;

  const back: Rect = { xIn: BLEED_IN, yIn: BLEED_IN, widthIn: tw, heightIn: th };
  const spine: Rect = { xIn: BLEED_IN + tw, yIn: BLEED_IN, widthIn: spineWidthIn, heightIn: th };
  const front: Rect = { xIn: BLEED_IN + tw + spineWidthIn, yIn: BLEED_IN, widthIn: tw, heightIn: th };

  const inset = (r: Rect, by: number): Rect => ({
    xIn: r.xIn + by,
    yIn: r.yIn + by,
    widthIn: r.widthIn - by * 2,
    heightIn: r.heightIn - by * 2,
  });

  // The spine's own text strip: full height less the top/bottom safe inset,
  // narrowed by the required clearance on each side of the fold.
  const spineTextSafe: Rect = {
    xIn: spine.xIn + SPINE_TEXT_SAFE_IN,
    yIn: spine.yIn + SAFE_INSET_IN,
    widthIn: Math.max(spine.widthIn - SPINE_TEXT_SAFE_IN * 2, 0),
    heightIn: spine.heightIn - SAFE_INSET_IN * 2,
  };

  // Advisory region only: where KDP's own barcode tends to land. Nothing is
  // reserved and nothing is drawn here; it exists so a reviewer can check that
  // no essential copy has been placed under it.
  const barcodeAdvisory: Rect = {
    xIn: back.xIn + back.widthIn - BARCODE_CLEARANCE_IN - BARCODE_IN.width,
    yIn: back.yIn + back.heightIn - BARCODE_CLEARANCE_IN - BARCODE_IN.height,
    widthIn: BARCODE_IN.width,
    heightIn: BARCODE_IN.height,
  };

  const spineTextAllowed = pageCount >= SPINE_TEXT_MIN_PAGES;
  const spineTextCapacityPt = spineTextSafe.widthIn * 72;

  const notes: string[] = [];
  notes.push(
    spineTextAllowed
      ? `Spine text is allowed: ${pageCount} pages is above KDP's ${SPINE_TEXT_MIN_PAGES}-page threshold.`
      : `Spine text is NOT allowed: ${pageCount} pages is below KDP's ${SPINE_TEXT_MIN_PAGES}-page threshold.`,
  );
  if (spineTextAllowed) {
    notes.push(
      spineTextCapacityPt >= MIN_TYPE_PT * 1.5
        ? `Spine type has ${spineTextCapacityPt.toFixed(1)}pt of usable width, comfortably above the ${MIN_TYPE_PT}pt minimum.`
        : `Spine type has only ${spineTextCapacityPt.toFixed(1)}pt of usable width against a ${MIN_TYPE_PT}pt minimum. Tight; consider leaving the spine bare.`,
    );
  }
  notes.push(
    'Barcode: KDP adds its own to the back cover. Nothing is reserved for it and the artwork runs through that area; only keep important copy out of it.',
  );
  notes.push(
    `Fold lines can shift by up to ${SPINE_FOLD_VARIANCE_IN}in either way, so nothing that must stay on one panel may sit within that of a fold.`,
  );

  return {
    paper,
    pageCount,
    dpi,
    spineWidthIn,
    wrapWidthIn,
    wrapHeightIn,
    wrapWidthPx: px(wrapWidthIn, dpi),
    wrapHeightPx: px(wrapHeightIn, dpi),
    back,
    spine,
    front,
    trim: { xIn: BLEED_IN, yIn: BLEED_IN, widthIn: tw * 2 + spineWidthIn, heightIn: th },
    backSafe: inset(back, SAFE_INSET_IN),
    frontSafe: inset(front, SAFE_INSET_IN),
    spineTextSafe,
    barcodeAdvisory,
    spineTextAllowed,
    spineTextCapacityPt,
    notes,
  };
}
