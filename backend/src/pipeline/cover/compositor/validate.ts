/**
 * COVER VALIDATION.
 *
 * Every check returns the same shape so the report can be rendered for a human
 * and consumed by a machine without two code paths. A cover does not reach
 * READY while any check is FAIL.
 *
 * WARN exists for the things an operator should look at but which are not
 * automatically wrong: a heavy crop, a slightly soft raster on a book that has
 * already been signed off. FAIL is for output KDP will reject or a person will
 * have to reprint.
 */
import type { ArtworkPlan } from './artwork.js';
import type { CoverGeometry, Rect } from './geometry.js';
import { rectsIntersect } from './geometry.js';

export type CheckStatus = 'PASS' | 'WARN' | 'FAIL';

export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

/** A declared region of back-cover content, so the barcode check has something to test. */
export interface ContentBox {
  id: string;
  rect: Rect;
}

export interface SpineTextOutcome {
  requested: boolean;
  placed: boolean;
  /** Halo-aware clearance to the nearer fold, in inches. */
  measuredClearPerSideIn?: number;
  reason?: string;
}

export interface ValidateInput {
  geometry: CoverGeometry;
  artwork: ArtworkPlan;
  spineText: SpineTextOutcome;
  contentBoxes?: ContentBox[];
  /** Below this fraction of the minimum, a soft raster becomes a hard failure. */
  dpiFailFraction?: number;
  /** Crop deeper than this on any edge is worth a human look. */
  cropWarnIn?: number;
}

export function validateCover(input: ValidateInput): Check[] {
  const { geometry: g, artwork: a, spineText } = input;
  const failFraction = input.dpiFailFraction ?? 0.8;
  const cropWarnIn = input.cropWarnIn ?? 0.5;
  const checks: Check[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string) =>
    checks.push({ id, label, status, detail });

  // ── page count against the published printable range ──────────────────────
  if (g.pageCountRange) {
    const { min, max, source } = g.pageCountRange;
    const ok = g.pageCount >= min && g.pageCount <= max;
    add(
      'page_count_range',
      'Page count printable',
      ok ? 'PASS' : 'FAIL',
      ok
        ? `${g.pageCount}pp is inside KDP's ${min}-${max} range for ${g.binding} ${g.ink} on ${g.paper}. Source: ${source}.`
        : `${g.pageCount}pp is OUTSIDE KDP's ${min}-${max} range for ${g.binding} ${g.ink} on ${g.paper}. KDP will refuse this book. Source: ${source}.`,
    );
  } else {
    add(
      'page_count_range',
      'Page count printable',
      'FAIL',
      `No published page-count range for ${g.binding} / ${g.ink} / ${g.paper}. Refusing rather than guessing.`,
    );
  }

  // ── effective resolution, measured not claimed ────────────────────────────
  const ppi = a.effectivePpi;
  const dpiStatus: CheckStatus = ppi >= g.minDpi ? 'PASS' : ppi >= g.minDpi * failFraction ? 'WARN' : 'FAIL';
  add(
    'effective_dpi',
    'Effective resolution',
    dpiStatus,
    `${a.sourceWidthPx} x ${a.sourceHeightPx}px placed at ${a.placedWidthIn.toFixed(3)} x ${a.placedHeightIn.toFixed(3)}in ` +
      `= ${ppi.toFixed(1)} effective PPI against a ${g.minDpi} minimum. ` +
      (dpiStatus === 'PASS'
        ? 'Measured from the placed size, not from a metadata tag.'
        : `The artwork is being scaled up by ${a.scaleFactorX.toFixed(3)}x. Supply higher-resolution art, or upscale it as a separate explicit step. This tool will not invent pixels.`),
  );

  // ── the art itself ────────────────────────────────────────────────────────
  add(
    'artwork_aspect',
    'Artwork not distorted',
    a.distorted ? 'FAIL' : 'PASS',
    a.distorted
      ? `Fit mode "${a.mode}" scaled the axes differently (${a.scaleFactorX.toFixed(4)} vs ${a.scaleFactorY.toFixed(4)}). Approved artwork must not be stretched.`
      : `Aspect preserved. Source ${a.sourceAspect.toFixed(4)}, wrap ${a.targetAspect.toFixed(4)}.`,
  );

  const maxCrop = Math.max(a.cropIn.leftIn, a.cropIn.rightIn, a.cropIn.topIn, a.cropIn.bottomIn);
  add(
    'artwork_crop',
    'Artwork crop',
    maxCrop > cropWarnIn ? 'WARN' : 'PASS',
    maxCrop === 0
      ? 'No crop: the artwork aspect matches the wrap.'
      : `Cropped ${a.cropIn.leftIn.toFixed(3)}in left, ${a.cropIn.rightIn.toFixed(3)}in right, ` +
        `${a.cropIn.topIn.toFixed(3)}in top, ${a.cropIn.bottomIn.toFixed(3)}in bottom` +
        (maxCrop > cropWarnIn ? '. That is deep enough to lose composition. Look at the proof.' : '.'),
  );

  // ── spine text ────────────────────────────────────────────────────────────
  if (!spineText.requested) {
    add('spine_text', 'Spine text', 'PASS', 'No spine text requested.');
  } else if (g.spineTextEligible === false) {
    add(
      'spine_text',
      'Spine text',
      'FAIL',
      `KDP prints spine text only on books with more than ${(g.spineTextMinPages ?? 80) - 1} pages; this is ${g.pageCount}.`,
    );
  } else if (!spineText.placed) {
    add(
      'spine_text',
      'Spine text',
      'FAIL',
      spineText.reason ?? 'Spine text could not be placed at any readable size.',
    );
  } else {
    const clear = spineText.measuredClearPerSideIn ?? 0;
    const required = g.spineTextClearancePerSideIn;
    const eligibilityNote =
      g.spineTextEligible === null
        ? ' KDP publishes no hardcover spine-text page minimum, so eligibility is not asserted here.'
        : '';
    if (required !== null && required !== undefined) {
      const ok = clear >= required;
      add(
        'spine_text',
        'Spine text',
        ok ? 'PASS' : 'FAIL',
        `Measured clearance ${clear.toFixed(4)}in per side against KDP's ${required}in minimum.` +
          (ok ? ' Measured off the drawn glyphs, halo included, not computed from a cap ratio.' : ' Too close to the fold.') +
          eligibilityNote,
      );
    } else {
      add(
        'spine_text',
        'Spine text',
        'PASS',
        `Placed with ${clear.toFixed(4)}in measured clearance per side.${eligibilityNote}`,
      );
    }
  }

  // ── barcode reserve ───────────────────────────────────────────────────────
  const boxes = input.contentBoxes ?? [];
  const clash = boxes.filter((b) => rectsIntersect(b.rect, g.barcodeSafe));
  if (boxes.length === 0) {
    add(
      'barcode_region',
      'Barcode reserve',
      'PASS',
      `Reserve is ${g.barcodeSafe.widthIn} x ${g.barcodeSafe.heightIn}in at ` +
        `x ${g.barcodeSafe.xIn.toFixed(4)}, y ${g.barcodeSafe.yIn.toFixed(4)}. ` +
        'No content boxes were declared, so nothing could be measured against it. It is drawn on the proof.',
    );
  } else {
    add(
      'barcode_region',
      'Barcode reserve',
      clash.length ? 'FAIL' : 'PASS',
      clash.length
        ? `${clash.length} content box(es) intersect the region KDP may cover with a barcode: ${clash.map((c) => c.id).join(', ')}.`
        : `All ${boxes.length} declared content boxes clear the barcode reserve.`,
    );
  }

  return checks;
}

export function worstStatus(checks: Check[]): CheckStatus {
  if (checks.some((c) => c.status === 'FAIL')) return 'FAIL';
  if (checks.some((c) => c.status === 'WARN')) return 'WARN';
  return 'PASS';
}
