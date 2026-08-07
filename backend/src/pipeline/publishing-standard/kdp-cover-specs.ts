/**
 * KDP cover dimensions — parameterized, sourced from Amazon's official
 * Cover Calculator, never from literals pasted into a build script.
 *
 * WHY THIS EXISTS
 * The first volume's cover scripts hardcoded `PAGE_COUNT = 275` and the wrap
 * dimensions that went with it. That is correct for exactly one book. Volume
 * two came in at 269 pages, where the spine is 0.820in rather than 0.834in —
 * a 0.014in difference, which is enough to misregister the wrap and get a
 * cover rejected. Every volume must be able to change page count, binding,
 * trim, or paper without touching code.
 *
 * SOURCE OF TRUTH
 * Amazon publishes no formula; the Cover Calculator is client-side JS with no
 * queryable endpoint. So this module stores VERIFIED calculator readings, each
 * with provenance, and will only interpolate between them when the resulting
 * model reproduces every stored anchor exactly. Anything it cannot derive with
 * confidence FAILS CLOSED with instructions, rather than guessing at a print
 * spec — a wrong spine is a wasted paid render and a rejected upload.
 *
 * ADDING A CONFIGURATION
 * Run https://kdp.amazon.com/en_US/cover-calculator, then add the reading to
 * VERIFIED_SPECS below with the date. Two anchors in a family unlock every
 * page count between them automatically.
 */

export type Binding = 'HARDCOVER' | 'PAPERBACK';
export type CoverType = 'CASE_LAMINATE' | 'DUST_JACKET';
export type InteriorType = 'PREMIUM_COLOR' | 'STANDARD_COLOR' | 'BLACK_AND_WHITE';
export type PaperType = 'WHITE' | 'CREAM' | 'GROUNDWOOD';
export type TrimSizeId = '5.5x8.5' | '6x9' | '6.14x9.21' | '7x10' | '8.25x11';

/** Everything that changes a KDP cover's dimensions. */
export interface KdpCoverConfig {
  binding: Binding;
  coverType: CoverType;
  interiorType: InteriorType;
  paperType: PaperType;
  trimSize: TrimSizeId;
  pageCount: number;
}

/** Dimensions in inches, exactly as the calculator reports them. */
export interface KdpCoverDimensions {
  fullWidthIn: number;
  fullHeightIn: number;
  spineIn: number;
  frontWidthIn: number;
  frontHeightIn: number;
  marginIn: number;
  wrapIn: number;
  hingeIn: number;
  spineSafeWidthIn: number;
  spineSafeHeightIn: number;
  barcodeMarginWidthIn: number;
  barcodeMarginHeightIn: number;
  /** 'verified' = read from the calculator. 'derived' = interpolated between verified anchors. */
  provenance: 'verified' | 'derived';
  note: string;
}

interface VerifiedSpec extends Omit<KdpCoverDimensions, 'provenance' | 'note'> {
  config: KdpCoverConfig;
  verifiedOn: string;
}

/**
 * Readings taken directly from the KDP Cover Calculator. Do not edit these to
 * make a build work — re-run the calculator and add a new entry.
 */
export const VERIFIED_SPECS: VerifiedSpec[] = [
  {
    // THE WILDLANDS Vol. II — Canadian Rockies. Read 2026-08-06.
    config: {
      binding: 'HARDCOVER',
      coverType: 'CASE_LAMINATE',
      interiorType: 'PREMIUM_COLOR',
      paperType: 'WHITE',
      trimSize: '7x10',
      pageCount: 269,
    },
    verifiedOn: '2026-08-06',
    fullWidthIn: 16.395,
    fullHeightIn: 11.417,
    spineIn: 0.82,
    frontWidthIn: 7.197,
    frontHeightIn: 10.236,
    marginIn: 0.125,
    wrapIn: 0.591,
    hingeIn: 0.394,
    spineSafeWidthIn: 0.695,
    spineSafeHeightIn: 9.986,
    barcodeMarginWidthIn: 0.25,
    barcodeMarginHeightIn: 0.375,
  },
  {
    // THE WILDLANDS Vol. I — New England. The values the original hardcover
    // scripts hardcoded; retained as the second anchor for this family.
    config: {
      binding: 'HARDCOVER',
      coverType: 'CASE_LAMINATE',
      interiorType: 'PREMIUM_COLOR',
      paperType: 'WHITE',
      trimSize: '7x10',
      pageCount: 275,
    },
    verifiedOn: '2026-07-04',
    fullWidthIn: 16.409,
    fullHeightIn: 11.417,
    spineIn: 0.834,
    frontWidthIn: 7.197,
    frontHeightIn: 10.236,
    marginIn: 0.125,
    wrapIn: 0.591,
    hingeIn: 0.394,
    spineSafeWidthIn: 0.695,
    spineSafeHeightIn: 9.986,
    barcodeMarginWidthIn: 0.25,
    barcodeMarginHeightIn: 0.375,
  },
];

/** Configuration identity, ignoring page count — the "family" a spine varies within. */
function familyKey(c: KdpCoverConfig): string {
  return [c.binding, c.coverType, c.interiorType, c.paperType, c.trimSize].join('|');
}

function round(n: number, dp = 3): number {
  return Number(n.toFixed(dp));
}

/** Human-readable config, for error messages. */
export function describeConfig(c: KdpCoverConfig): string {
  return `${c.binding}/${c.coverType}, ${c.interiorType}, ${c.paperType} paper, ${c.trimSize}in, ${c.pageCount}pp`;
}

/**
 * Official dimensions for a configuration.
 *
 * Exact verified reading if one exists. Otherwise interpolates from the two
 * nearest anchors in the same family — but ONLY if the fitted model reproduces
 * every anchor in that family to within a thousandth of an inch, and the
 * requested page count sits between them. Anything else throws.
 */
export function getKdpCoverDimensions(config: KdpCoverConfig): KdpCoverDimensions {
  if (!Number.isInteger(config.pageCount) || config.pageCount <= 0) {
    throw new Error(`KDP_COVER_SPEC: page count must be a positive integer, got ${config.pageCount}.`);
  }

  const family = familyKey(config);
  const anchors = VERIFIED_SPECS.filter((s) => familyKey(s.config) === family).sort(
    (a, b) => a.config.pageCount - b.config.pageCount,
  );

  const exact = anchors.find((s) => s.config.pageCount === config.pageCount);
  if (exact) {
    return {
      ...stripMeta(exact),
      provenance: 'verified',
      note: `Read from the KDP Cover Calculator on ${exact.verifiedOn} for ${describeConfig(config)}.`,
    };
  }

  if (anchors.length < 2) {
    throw new Error(
      [
        `KDP_COVER_SPEC: no verified dimensions for ${describeConfig(config)}.`,
        '',
        anchors.length === 0
          ? '  No readings exist for this binding/trim/paper combination at all.'
          : `  Only one reading exists for this combination (${anchors[0]!.config.pageCount}pp), which is not enough to interpolate a spine.`,
        '',
        '  Fix: open https://kdp.amazon.com/en_US/cover-calculator, enter this exact',
        '  configuration, and add the reading to VERIFIED_SPECS in this file.',
        '  Do not estimate the spine — a wrong spine misregisters the wrap and is rejected.',
      ].join('\n'),
    );
  }

  const lo = anchors[0]!;
  const hi = anchors[anchors.length - 1]!;
  if (config.pageCount < lo.config.pageCount || config.pageCount > hi.config.pageCount) {
    throw new Error(
      [
        `KDP_COVER_SPEC: ${config.pageCount}pp is outside the verified range for this configuration.`,
        `  Verified anchors: ${anchors.map((a) => `${a.config.pageCount}pp`).join(', ')}.`,
        '  Extrapolating past the verified range is not safe — KDP may band or step values there.',
        '',
        '  Fix: run https://kdp.amazon.com/en_US/cover-calculator for this page count',
        '  and add the reading to VERIFIED_SPECS in this file.',
      ].join('\n'),
    );
  }

  // Spine (and therefore full width) is the only page-count-dependent value.
  const perPage = (hi.spineIn - lo.spineIn) / (hi.config.pageCount - lo.config.pageCount);
  const intercept = lo.spineIn - perPage * lo.config.pageCount;
  const modelSpine = (pages: number) => perPage * pages + intercept;

  // The model must reproduce EVERY anchor, not just the two it was fitted on.
  for (const a of anchors) {
    if (Math.abs(modelSpine(a.config.pageCount) - a.spineIn) > 0.001) {
      throw new Error(
        [
          `KDP_COVER_SPEC: refusing to interpolate for ${describeConfig(config)}.`,
          `  A linear spine model does not reproduce the verified reading at ${a.config.pageCount}pp`,
          `  (model ${round(modelSpine(a.config.pageCount))}in vs actual ${a.spineIn}in), so KDP is`,
          '  not linear across this range — likely banded.',
          '',
          '  Fix: run the KDP Cover Calculator for this exact page count and add the reading.',
        ].join('\n'),
      );
    }
  }

  const spineIn = round(modelSpine(config.pageCount));
  // Full width = both covers + both wraps + spine. Derive the constant from an
  // anchor so it stays consistent with whatever KDP actually reports.
  const nonSpineWidth = round(lo.fullWidthIn - lo.spineIn);

  return {
    ...stripMeta(lo),
    spineIn,
    fullWidthIn: round(nonSpineWidth + spineIn),
    provenance: 'derived',
    note:
      `Interpolated between verified KDP readings at ${lo.config.pageCount}pp and ${hi.config.pageCount}pp ` +
      `for ${describeConfig(config)}. Verify against the KDP Cover Calculator before final upload.`,
  };
}

function stripMeta(s: VerifiedSpec): Omit<KdpCoverDimensions, 'provenance' | 'note'> {
  const { config: _c, verifiedOn: _v, ...dims } = s;
  return dims;
}
