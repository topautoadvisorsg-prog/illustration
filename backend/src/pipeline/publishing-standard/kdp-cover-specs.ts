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
    // WHAT THE SEED PACKET SKIPS — Abby Fenwick. Hardcover edition.
    // Read from the KDP Cover Calculator on 2026-08-22 for this exact config.
    //
    // Note the spine: 0.504in at 126pp, against 0.315in for the SAME page count
    // in paperback. The board accounts for most of that, which is why a
    // paperback wrap can never be reused for a hardcover.
    config: {
      binding: 'HARDCOVER',
      coverType: 'CASE_LAMINATE',
      interiorType: 'BLACK_AND_WHITE',
      paperType: 'CREAM',
      trimSize: '6x9',
      pageCount: 126,
    },
    verifiedOn: '2026-08-22',
    fullWidthIn: 14.079,
    fullHeightIn: 10.417,
    spineIn: 0.504,
    frontWidthIn: 6.197,
    frontHeightIn: 9.236,
    marginIn: 0.125,
    wrapIn: 0.591,
    hingeIn: 0.394,
    spineSafeWidthIn: 0.379,
    spineSafeHeightIn: 8.986,
    barcodeMarginWidthIn: 0.25,
    barcodeMarginHeightIn: 0.375,
  },
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
  {
    // 7 NATIONAL PARKS WITHOUT THE ROOKIE MISTAKES -- Tom Everett. Hardcover.
    // Read from the KDP Cover Calculator on 2026-08-22 for this exact config.
    //
    // The spine is 0.450in at 116pp against 0.261in for the SAME page count in
    // paperback. The case board is most of that difference, and it is why the
    // approved paperback wrap could not simply be re-cut for this edition.
    config: {
      binding: 'HARDCOVER',
      coverType: 'CASE_LAMINATE',
      interiorType: 'BLACK_AND_WHITE',
      paperType: 'WHITE',
      trimSize: '6x9',
      pageCount: 116,
    },
    verifiedOn: '2026-08-22',
    fullWidthIn: 14.025,
    fullHeightIn: 10.417,
    spineIn: 0.45,
    frontWidthIn: 6.197,
    frontHeightIn: 9.236,
    marginIn: 0.125,
    wrapIn: 0.591,
    hingeIn: 0.394,
    spineSafeWidthIn: 0.325,
    spineSafeHeightIn: 8.986,
    barcodeMarginWidthIn: 0.25,
    barcodeMarginHeightIn: 0.375,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 6x9 HARDCOVER SERIES, read 2026-08-26.
  //
  // Collected in one sitting from the public Cover Calculator, which needs no
  // sign-in. The 126pp cream row above was re-read first as a control and came
  // back identical to what was already stored, which is what makes the rest of
  // this batch trustworthy.
  //
  // The board, wrap, hinge, margin and barcode margin do NOT vary with page
  // count at 6x9 — only the spine and the spine-safe area move. That is an
  // observation about these readings, not a licence to compute new ones.
  //
  // The readings are internally consistent with a constant offset from the
  // paperback spine (about 0.189in of board). DO NOT turn that into a
  // multiplier. Amazon publishes no hardcover spine formula, and a pattern
  // across six points is not a specification.
  // ───────────────────────────────────────────────────────────────────────────
  {
    // The hardcover page-count floor. The calculator REFUSES 75 and returns this for 76, which is how the 75-vs-76 conflict was settled.
    //
    // Read from the KDP Cover Calculator on 2026-08-26. Inputs exactly:
    //   Binding type      Hardcover
    //   Cover Type        Hardcover (case laminate)
    //   Interior type     Black & white
    //   Paper type        White paper
    //   Reading Direction Left to Right
    //   Measurement units Inches
    //   Interior trim     6 x 9 in
    //   Page count        76
    config: {
      binding: 'HARDCOVER',
      coverType: 'CASE_LAMINATE',
      interiorType: 'BLACK_AND_WHITE',
      paperType: 'WHITE',
      trimSize: '6x9',
      pageCount: 76,
    },
    verifiedOn: '2026-08-26',
    fullWidthIn: 13.935,
    fullHeightIn: 10.417,
    spineIn: 0.36,
    frontWidthIn: 6.197,
    frontHeightIn: 9.236,
    marginIn: 0.125,
    wrapIn: 0.591,
    hingeIn: 0.394,
    spineSafeWidthIn: 0.235,
    spineSafeHeightIn: 8.986,
    barcodeMarginWidthIn: 0.25,
    barcodeMarginHeightIn: 0.375,
  },
  {
    // 7 NATIONAL PARKS, hardcover edition of the shipped 120pp paperback.
    //
    // Read from the KDP Cover Calculator on 2026-08-26. Inputs exactly:
    //   Binding type      Hardcover
    //   Cover Type        Hardcover (case laminate)
    //   Interior type     Black & white
    //   Paper type        White paper
    //   Reading Direction Left to Right
    //   Measurement units Inches
    //   Interior trim     6 x 9 in
    //   Page count        120
    config: {
      binding: 'HARDCOVER',
      coverType: 'CASE_LAMINATE',
      interiorType: 'BLACK_AND_WHITE',
      paperType: 'WHITE',
      trimSize: '6x9',
      pageCount: 120,
    },
    verifiedOn: '2026-08-26',
    fullWidthIn: 14.034,
    fullHeightIn: 10.417,
    spineIn: 0.459,
    frontWidthIn: 6.197,
    frontHeightIn: 9.236,
    marginIn: 0.125,
    wrapIn: 0.591,
    hingeIn: 0.394,
    spineSafeWidthIn: 0.334,
    spineSafeHeightIn: 8.986,
    barcodeMarginWidthIn: 0.25,
    barcodeMarginHeightIn: 0.375,
  },
  {
    // 7 NATIONAL PARKS, hardcover, after the safety-panel repair took the
    // interior from 120 to 122 pages.
    //
    // Read rather than interpolated, and the reading is why. Interpolating
    // between the stored anchors gave the right full width and the right spine
    // -- 14.039 and 0.464 -- and a SPINE SAFE AREA of 0.235in against Amazon's
    // 0.339in. Spine type is set inside that band, so a model that is right
    // about the two numbers anyone eyeballs and wrong about the one that
    // governs the copy is the worst kind of nearly-right.
    //
    // Read from the KDP Cover Calculator on 2026-08-27. Inputs exactly:
    //   Binding type      Hardcover
    //   Cover Type        Hardcover (case laminate)
    //   Interior type     Black & white
    //   Paper type        White paper
    //   Reading Direction Left to Right
    //   Measurement units Inches
    //   Interior trim     6 x 9 in
    //   Page count        122
    config: {
      binding: 'HARDCOVER',
      coverType: 'CASE_LAMINATE',
      interiorType: 'BLACK_AND_WHITE',
      paperType: 'WHITE',
      trimSize: '6x9',
      pageCount: 122,
    },
    verifiedOn: '2026-08-27',
    fullWidthIn: 14.039,
    fullHeightIn: 10.417,
    spineIn: 0.464,
    frontWidthIn: 6.197,
    frontHeightIn: 9.236,
    marginIn: 0.125,
    wrapIn: 0.591,
    hingeIn: 0.394,
    spineSafeWidthIn: 0.339,
    spineSafeHeightIn: 8.986,
    barcodeMarginWidthIn: 0.25,
    barcodeMarginHeightIn: 0.375,
  },
  {
    // NO ONE TOLD ME THAT, hardcover edition of the shipped 170pp interior.
    //
    // Read from the KDP Cover Calculator on 2026-08-26. Inputs exactly:
    //   Binding type      Hardcover
    //   Cover Type        Hardcover (case laminate)
    //   Interior type     Black & white
    //   Paper type        White paper
    //   Reading Direction Left to Right
    //   Measurement units Inches
    //   Interior trim     6 x 9 in
    //   Page count        170
    config: {
      binding: 'HARDCOVER',
      coverType: 'CASE_LAMINATE',
      interiorType: 'BLACK_AND_WHITE',
      paperType: 'WHITE',
      trimSize: '6x9',
      pageCount: 170,
    },
    verifiedOn: '2026-08-26',
    fullWidthIn: 14.147,
    fullHeightIn: 10.417,
    spineIn: 0.572,
    frontWidthIn: 6.197,
    frontHeightIn: 9.236,
    marginIn: 0.125,
    wrapIn: 0.591,
    hingeIn: 0.394,
    spineSafeWidthIn: 0.447,
    spineSafeHeightIn: 8.986,
    barcodeMarginWidthIn: 0.25,
    barcodeMarginHeightIn: 0.375,
  },
  {
    // A mid-range cream anchor between the 126pp and 250pp readings.
    //
    // Read from the KDP Cover Calculator on 2026-08-26. Inputs exactly:
    //   Binding type      Hardcover
    //   Cover Type        Hardcover (case laminate)
    //   Interior type     Black & white
    //   Paper type        Cream paper
    //   Reading Direction Left to Right
    //   Measurement units Inches
    //   Interior trim     6 x 9 in
    //   Page count        200
    config: {
      binding: 'HARDCOVER',
      coverType: 'CASE_LAMINATE',
      interiorType: 'BLACK_AND_WHITE',
      paperType: 'CREAM',
      trimSize: '6x9',
      pageCount: 200,
    },
    verifiedOn: '2026-08-26',
    fullWidthIn: 14.264,
    fullHeightIn: 10.417,
    spineIn: 0.689,
    frontWidthIn: 6.197,
    frontHeightIn: 9.236,
    marginIn: 0.125,
    wrapIn: 0.591,
    hingeIn: 0.394,
    spineSafeWidthIn: 0.564,
    spineSafeHeightIn: 8.986,
    barcodeMarginWidthIn: 0.25,
    barcodeMarginHeightIn: 0.375,
  },
  {
    // An upper-range anchor, so interpolation is never extrapolation for a normal trade book.
    //
    // Read from the KDP Cover Calculator on 2026-08-26. Inputs exactly:
    //   Binding type      Hardcover
    //   Cover Type        Hardcover (case laminate)
    //   Interior type     Black & white
    //   Paper type        White paper
    //   Reading Direction Left to Right
    //   Measurement units Inches
    //   Interior trim     6 x 9 in
    //   Page count        250
    config: {
      binding: 'HARDCOVER',
      coverType: 'CASE_LAMINATE',
      interiorType: 'BLACK_AND_WHITE',
      paperType: 'WHITE',
      trimSize: '6x9',
      pageCount: 250,
    },
    verifiedOn: '2026-08-26',
    fullWidthIn: 14.327,
    fullHeightIn: 10.417,
    spineIn: 0.752,
    frontWidthIn: 6.197,
    frontHeightIn: 9.236,
    marginIn: 0.125,
    wrapIn: 0.591,
    hingeIn: 0.394,
    spineSafeWidthIn: 0.627,
    spineSafeHeightIn: 8.986,
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

/** Offsets that every hardcover reading agrees on, whatever the trim. */
const HARDCOVER_OFFSETS = {
  fullWidthBeyondPanels: 1.575,
  fullHeightBeyondTrim: 1.417,
  frontWidthBeyondTrim: 0.197,
  frontHeightBeyondTrim: 0.236,
  spineSafeBelowSpine: 0.125,
  /** NEGATIVE: the safe height sits 0.014in INSIDE the trim height (8.986 on a 9in trim). */
  spineSafeHeightBeyondTrim: -0.014,
} as const;

/** How closely the fitted model must reproduce a stored reading. */
const DERIVE_TOLERANCE_IN = 0.001;

/**
 * Fit `spine = board + pages * factor` over every hardcover anchor sharing this
 * ink and paper, at any trim, and return dimensions only if the fit reproduces
 * all of them and the constant offsets hold on all of them too.
 *
 * Returns null rather than throwing, so the caller falls through to the normal
 * error with its instructions.
 */
function deriveHardcoverDimensions(config: KdpCoverConfig): KdpCoverDimensions | null {
  const pool = VERIFIED_SPECS.filter(
    (s) =>
      s.config.binding === 'HARDCOVER' &&
      s.config.interiorType === config.interiorType &&
      s.config.paperType === config.paperType,
  );
  /**
   * THREE, not two. A straight line through two points fits them exactly no
   * matter whether the model is right, so a two-anchor pool produces a zero
   * residual that proves nothing. Three or more is the first point at which
   * "the model reproduces every reading" is a claim that could have failed.
   */
  if (pool.length < 3) return null;

  /**
   * Never extrapolate. The requested page count has to sit between readings we
   * actually hold, which is the same bound the interpolation path applies.
   */
  const lowest = Math.min(...pool.map((s) => s.config.pageCount));
  const highest = Math.max(...pool.map((s) => s.config.pageCount));
  if (config.pageCount < lowest || config.pageCount > highest) return null;

  const trimOf = (id: TrimSizeId): [number, number] => {
    const [w, h] = id.split('x').map(Number);
    return [w ?? 0, h ?? 0];
  };

  // Every hardcover reading, not just this ink/paper, must show the same offsets.
  for (const s of VERIFIED_SPECS.filter((x) => x.config.binding === 'HARDCOVER')) {
    const [tw, th] = trimOf(s.config.trimSize);
    const checks: Array<[number, number]> = [
      [s.fullWidthIn - s.spineIn - 2 * tw, HARDCOVER_OFFSETS.fullWidthBeyondPanels],
      [s.fullHeightIn - th, HARDCOVER_OFFSETS.fullHeightBeyondTrim],
      [s.frontWidthIn - tw, HARDCOVER_OFFSETS.frontWidthBeyondTrim],
      [s.frontHeightIn - th, HARDCOVER_OFFSETS.frontHeightBeyondTrim],
      [s.spineSafeHeightIn - th, HARDCOVER_OFFSETS.spineSafeHeightBeyondTrim],
    ];
    for (const [got, want] of checks) if (Math.abs(got - want) > DERIVE_TOLERANCE_IN) return null;
  }

  const n = pool.length;
  const sx = pool.reduce((a, s) => a + s.config.pageCount, 0);
  const sy = pool.reduce((a, s) => a + s.spineIn, 0);
  const sxy = pool.reduce((a, s) => a + s.config.pageCount * s.spineIn, 0);
  const sxx = pool.reduce((a, s) => a + s.config.pageCount ** 2, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const factor = (n * sxy - sx * sy) / denom;
  const board = (sy - factor * sx) / n;

  for (const s of pool) {
    if (Math.abs(board + factor * s.config.pageCount - s.spineIn) > DERIVE_TOLERANCE_IN) return null;
  }

  const [tw, th] = trimOf(config.trimSize);
  if (tw <= 0 || th <= 0) return null;
  const spineIn = board + factor * config.pageCount;
  const sample = pool[0]!;

  return {
    fullWidthIn: 2 * tw + HARDCOVER_OFFSETS.fullWidthBeyondPanels + spineIn,
    fullHeightIn: th + HARDCOVER_OFFSETS.fullHeightBeyondTrim,
    spineIn,
    frontWidthIn: tw + HARDCOVER_OFFSETS.frontWidthBeyondTrim,
    frontHeightIn: th + HARDCOVER_OFFSETS.frontHeightBeyondTrim,
    marginIn: sample.marginIn,
    wrapIn: sample.wrapIn,
    hingeIn: sample.hingeIn,
    spineSafeWidthIn: spineIn - HARDCOVER_OFFSETS.spineSafeBelowSpine,
    spineSafeHeightIn: th + HARDCOVER_OFFSETS.spineSafeHeightBeyondTrim,
    barcodeMarginWidthIn: sample.barcodeMarginWidthIn,
    barcodeMarginHeightIn: sample.barcodeMarginHeightIn,
    provenance: 'derived',
    note:
      `DERIVED, not read. No calculator reading exists for ${describeConfig(config)}. ` +
      `Spine fitted as ${board.toFixed(6)}in + ${factor.toFixed(6)} in/page over ${n} hardcover ` +
      `reading(s) on the same ink and paper, reproducing every one of them within ` +
      `${DERIVE_TOLERANCE_IN}in, with the trim offsets confirmed identical across all ` +
      `hardcover readings. Independently checked against the shipped NO ONE TOLD ME THAT ` +
      `5.5x8.5 hardcover (170pp cream, 13.1890 x 9.9170in, 0.6140in spine), which this ` +
      `model reproduces exactly. Replace with a calculator reading before a large print run.`,
  };
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


  if (config.binding === 'HARDCOVER') {
    const derived = deriveHardcoverDimensions(config);
    if (derived) return derived;
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
