/**
 * COVER GEOMETRY — one resolver, both bindings.
 *
 * Everything downstream of this file (the compositor, the operator CLIs, the
 * proofs, the validators) takes its dimensions from here. There is no second
 * formula path, and there is deliberately no way to hand in a spine width.
 *
 * The two bindings are different objects and are modelled separately:
 *
 *   PAPERBACK  The cover is the same size as the page. Geometry is arithmetic on
 *              the trim, using published factors from `kdp-spec.ts`.
 *
 *   HARDCOVER  The cover is a case. The board is LARGER than the trim, and
 *              Amazon publishes no formula for any of it, so every figure is
 *              read from the Cover Calculator and stored in `kdp-cover-specs.ts`.
 *
 * A hardcover wrap derived from trim arithmetic is short by more than half an
 * inch and KDP rejects it. That is not a hypothetical: it shipped in an operator
 * tool and was caught in review. Hence one resolver, and a regression test that
 * pins board > trim.
 */
import {
  HARDCOVER_RULES,
  PAPERBACK_RULES,
  SUPPORTED_TRIMS,
  UnverifiedKdpConfigurationError,
  pageCountLimit,
  resolvePaperbackSpine,
} from '../../publishing-standard/kdp-spec.js';
import type { KdpBinding, KdpInk, KdpPaper } from '../../publishing-standard/kdp-spec.js';
import { getKdpCoverDimensions } from '../../publishing-standard/kdp-cover-specs.js';
import type { KdpCoverDimensions, TrimSizeId } from '../../publishing-standard/kdp-cover-specs.js';

export interface Rect {
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
}

export const rect = (xIn: number, yIn: number, widthIn: number, heightIn: number): Rect => ({
  xIn,
  yIn,
  widthIn,
  heightIn,
});

export interface CoverGeometryRequest {
  binding: KdpBinding;
  ink: KdpInk;
  paper: KdpPaper;
  /** e.g. "6x9". Must be a trim Amazon lists for this binding. */
  trim: string;
  pageCount: number;
}

export interface CoverGeometry extends CoverGeometryRequest {
  trimWidthIn: number;
  trimHeightIn: number;

  /**
   * The visible panel. Equal to the trim on a paperback; the CASE BOARD on a
   * hardcover, which is larger.
   */
  panelWidthIn: number;
  panelHeightIn: number;
  /** True when the panel is the board rather than the trim. */
  panelIsBoard: boolean;

  /** Bleed on a paperback, case wrap on a hardcover. The outer margin either way. */
  outerMarginIn: number;

  spineIn: number;
  spineAuthority: string;
  spineSource: string;
  spineExplanation: string;

  fullWidthIn: number;
  fullHeightIn: number;
  wrapExplanation: string;

  backPanel: Rect;
  spinePanel: Rect;
  frontPanel: Rect;

  safeInsetIn: number;
  backSafe: Rect;
  frontSafe: Rect;
  spineSafe: Rect;

  foldLeftIn: number;
  foldRightIn: number;
  foldVarianceIn: number;
  hingeIn: number | null;

  barcodeSafe: Rect;

  /** null on hardcover: Amazon publishes no page minimum for hardcover spine text. */
  spineTextEligible: boolean | null;
  spineTextMinPages: number | null;
  spineTextClearancePerSideIn: number | null;

  minDpi: number;
  pageCountRange: { min: number; max: number; source: string } | null;
}

/**
 * Resolve every dimension for one cover.
 *
 * THROWS `UnverifiedKdpConfigurationError` rather than approximating. A
 * configuration we cannot serve from published or verified data is a
 * configuration we refuse.
 */
export function resolveCoverGeometry(req: CoverGeometryRequest): CoverGeometry {
  const { binding, ink, paper, trim, pageCount } = req;

  if (!Number.isInteger(pageCount) || pageCount <= 0) {
    throw new UnverifiedKdpConfigurationError(
      req,
      `Page count must be a positive whole number, got ${pageCount}.`,
      'Read it from the final interior PDF rather than supplying it.',
    );
  }
  if (!SUPPORTED_TRIMS[binding]?.includes(trim)) {
    throw new UnverifiedKdpConfigurationError(
      req,
      `KDP does not list ${trim}in among its ${binding} trim sizes.`,
      `Supported ${binding} trims: ${SUPPORTED_TRIMS[binding]?.join(', ')}.`,
    );
  }
  const [trimWidthIn, trimHeightIn] = trim.split('x').map(Number) as [number, number];
  if (!trimWidthIn || !trimHeightIn) {
    throw new UnverifiedKdpConfigurationError(req, `Trim "${trim}" is not parseable as WIDTHxHEIGHT.`, 'Use e.g. 6x9.');
  }

  let spineIn: number;
  let spineAuthority: string;
  let spineSource: string;
  let spineExplanation: string;
  let outerMarginIn: number;
  let safeInsetIn: number;
  let hingeIn: number | null = null;
  let hc: KdpCoverDimensions | null = null;

  if (binding === 'PAPERBACK') {
    const res = resolvePaperbackSpine({ ink, paper, trim, pageCount });
    spineIn = res.spineIn;
    spineAuthority = res.authority;
    spineSource = `${res.source.topic} (read ${res.source.retrieved})`;
    spineExplanation = res.explanation;
    outerMarginIn = PAPERBACK_RULES.bleedIn.value;
    safeInsetIn = PAPERBACK_RULES.safeFromOutsideEdgeIn.value;
  } else {
    hc = getKdpCoverDimensions({
      binding: 'HARDCOVER',
      coverType: 'CASE_LAMINATE',
      interiorType: ink,
      paperType: paper,
      trimSize: trim as TrimSizeId,
      pageCount,
    });
    spineIn = hc.spineIn;
    spineAuthority = 'OFFICIAL_CALCULATOR_FIXTURE';
    spineSource = hc.note;
    spineExplanation =
      hc.provenance === 'verified'
        ? `${spineIn}in read from the KDP Cover Calculator for this exact configuration`
        : `${spineIn}in interpolated between verified calculator readings`;
    // The reading wins over the published caseWrapIn (0.51in, "past the front
    // cover edge"), which measures something else and does not reconcile.
    outerMarginIn = hc.wrapIn;
    safeInsetIn = HARDCOVER_RULES.safeFromEdgeIn.value;
    hingeIn = hc.hingeIn;
  }

  const panelWidthIn = hc ? hc.frontWidthIn : trimWidthIn;
  const panelHeightIn = hc ? hc.frontHeightIn : trimHeightIn;
  const fullWidthIn = hc ? hc.fullWidthIn : trimWidthIn * 2 + spineIn + outerMarginIn * 2;
  const fullHeightIn = hc ? hc.fullHeightIn : trimHeightIn + outerMarginIn * 2;

  const r3 = (n: number) => Number(n.toFixed(6));
  const wrapExplanation = hc
    ? `width  = ${hc.wrapIn} + ${panelWidthIn} + ${r3(spineIn)} + ${panelWidthIn} + ${hc.wrapIn} = ${r3(fullWidthIn)}in\n` +
      `height = ${hc.wrapIn} + ${panelHeightIn} + ${hc.wrapIn} = ${r3(fullHeightIn)}in\n` +
      `board  = ${panelWidthIn} x ${panelHeightIn}in, LARGER than the ${trimWidthIn} x ${trimHeightIn}in trim\n` +
      `every figure read from the KDP Cover Calculator, none computed`
    : `width  = ${outerMarginIn} + ${trimWidthIn} + ${r3(spineIn)} + ${trimWidthIn} + ${outerMarginIn} = ${r3(fullWidthIn)}in\n` +
      `height = ${outerMarginIn} + ${trimHeightIn} + ${outerMarginIn} = ${r3(fullHeightIn)}in`;

  const foldLeftIn = outerMarginIn + panelWidthIn;
  const foldRightIn = foldLeftIn + spineIn;

  const backPanel = rect(outerMarginIn, outerMarginIn, panelWidthIn, panelHeightIn);
  const spinePanel = rect(foldLeftIn, 0, spineIn, fullHeightIn);
  const frontPanel = rect(foldRightIn, outerMarginIn, panelWidthIn, panelHeightIn);
  const inset = (p: Rect): Rect =>
    rect(p.xIn + safeInsetIn, p.yIn + safeInsetIn, p.widthIn - safeInsetIn * 2, p.heightIn - safeInsetIn * 2);

  const foldVarianceIn = hc
    ? Number(((spineIn - hc.spineSafeWidthIn) / 2).toFixed(6))
    : PAPERBACK_RULES.foldVarianceIn.value;
  const spineSafe = hc
    ? rect(
        foldLeftIn + (spineIn - hc.spineSafeWidthIn) / 2,
        (fullHeightIn - hc.spineSafeHeightIn) / 2,
        hc.spineSafeWidthIn,
        hc.spineSafeHeightIn,
      )
    : rect(foldLeftIn + foldVarianceIn, 0, Math.max(0, spineIn - foldVarianceIn * 2), fullHeightIn);

  // Amazon publishes a spine-text page minimum for PAPERBACK only. Asserting one
  // for hardcover would invent a rule, so hardcover reports null.
  const spineTextEligible: boolean | null =
    binding === 'PAPERBACK' ? pageCount >= PAPERBACK_RULES.spineTextMinPages.value : null;

  const bc = binding === 'PAPERBACK' ? PAPERBACK_RULES.barcodeReserve.value : HARDCOVER_RULES.barcode.value;
  const bcFromBottomIn = binding === 'HARDCOVER' ? HARDCOVER_RULES.barcode.value.fromBottomIn : 0.25;
  const bcFromSpineIn = binding === 'HARDCOVER' ? HARDCOVER_RULES.barcode.value.fromSpineHingeIn : 0.25;
  // Lower-RIGHT of the back panel, which is the spine side when the wrap is
  // viewed flat with the back on the left.
  const barcodeSafe = rect(
    backPanel.xIn + backPanel.widthIn - bcFromSpineIn - bc.widthIn,
    backPanel.yIn + backPanel.heightIn - bcFromBottomIn - bc.heightIn,
    bc.widthIn,
    bc.heightIn,
  );

  const limit = pageCountLimit(binding, ink, paper);

  return {
    ...req,
    trimWidthIn,
    trimHeightIn,
    panelWidthIn,
    panelHeightIn,
    panelIsBoard: hc !== null,
    outerMarginIn,
    spineIn,
    spineAuthority,
    spineSource,
    spineExplanation,
    fullWidthIn,
    fullHeightIn,
    wrapExplanation,
    backPanel,
    spinePanel,
    frontPanel,
    safeInsetIn,
    backSafe: inset(backPanel),
    frontSafe: inset(frontPanel),
    spineSafe,
    foldLeftIn,
    foldRightIn,
    foldVarianceIn,
    hingeIn,
    barcodeSafe,
    spineTextEligible,
    spineTextMinPages: binding === 'PAPERBACK' ? PAPERBACK_RULES.spineTextMinPages.value : null,
    spineTextClearancePerSideIn: binding === 'PAPERBACK' ? PAPERBACK_RULES.spineTextSafeIn.value : null,
    minDpi: binding === 'PAPERBACK' ? PAPERBACK_RULES.minDpi.value : HARDCOVER_RULES.minDpi.value,
    pageCountRange: limit ? { min: limit.min, max: limit.max, source: limit.source.topic } : null,
  };
}

/** Do two rectangles overlap at all? Used by the barcode-region check. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.xIn < b.xIn + b.widthIn &&
    b.xIn < a.xIn + a.widthIn &&
    a.yIn < b.yIn + b.heightIn &&
    b.yIn < a.yIn + a.heightIn
  );
}
