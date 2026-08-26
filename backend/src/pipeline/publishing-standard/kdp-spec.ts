/**
 * KDP COVER SPECIFICATION — the published authority.
 *
 * Every number here was read from Amazon's live documentation on the date
 * recorded against it, and carries the topic it came from. Nothing is inferred,
 * nothing is averaged, and nothing is carried over from an older build script.
 *
 * ─── THE DISTINCTION THAT MATTERS ────────────────────────────────────────────
 * The platform's worst habit was defaults that looked authoritative. So every
 * value declares what KIND of thing it is:
 *
 *   OFFICIAL_FORMULA       Amazon publishes the arithmetic, so we can compute
 *                          any page count. Every paperback spine factor except
 *                          groundwood is of this kind.
 *   OFFICIAL_STATIC_RULE   Amazon publishes a fixed number: a bleed, a safe
 *                          margin, a minimum page count for spine text.
 *   OFFICIAL_CALCULATOR_FIXTURE
 *                          Amazon publishes NO formula, so the value must be
 *                          read from the Cover Calculator for one exact
 *                          configuration. Every hardcover spine is of this
 *                          kind, and so is groundwood. Hardcover readings live
 *                          in `kdp-cover-specs.ts` as VERIFIED_SPECS.
 *   HOUSE_POLICY           Ours, not Amazon's. Labelled so nobody mistakes a
 *                          house rule for a print requirement.
 *   LEGACY_COMPATIBILITY   Historical behaviour kept only to reproduce an old
 *                          artifact. Never canonical, never presented as KDP.
 *   UNVERIFIED             Nothing authoritative found. Fails closed.
 *
 * A configuration we cannot serve from one of the first three FAILS CLOSED. It
 * does not fall back to the nearest factor. `UnverifiedKdpConfigurationError`
 * says so and names what would resolve it.
 *
 * ─── WHAT VERIFICATION CORRECTED ─────────────────────────────────────────────
 * Five things believed true going in were wrong. Every one was caught by
 * reading the live source rather than trusting the brief, and three of them
 * would have produced a file KDP rejects:
 *
 *   GROUNDWOOD has NO published spine multiplier. Neither the cover page nor
 *   the groundwood help page states one; both defer to the Cover Calculator.
 *   It is therefore OFFICIAL_CALCULATOR_FIXTURE, not OFFICIAL_FORMULA. Two
 *   readings taken on 2026-08-26 both give exactly 0.00235 in/page, so the
 *   value is usable, but it must never be relabelled as published.
 *
 *   STANDARD COLOR AND PREMIUM COLOR DO NOT SHARE A SPINE FACTOR. They are
 *   listed separately with different multipliers — 0.002252 and 0.002347. A
 *   single "color" factor would have made every standard-colour spine 0.000095in
 *   per page too wide: 0.057in on a 600-page book.
 *
 *   CREAM DOES NOT SHARE WHITE'S PAGE LIMIT. White runs to 828, cream stops at
 *   776. Both were recorded as 828, so an 800-page cream book would have been
 *   accepted and refused at upload.
 *
 *   THE HARDCOVER PAGE FLOOR IS DISPUTED BY AMAZON ITSELF. GVBQ3CMEQW3W2VL6
 *   publishes "75 - 550". The Cover Calculator refuses 75 and reports
 *   "76 - 550". Verified by hand on 2026-08-26: 75 returns nothing, 76 returns
 *   a full result. We take the stricter number, because a wrap the calculator
 *   will not produce is a wrap nobody can check.
 *
 *   THERE IS NO MINIMUM SPINE WIDTH. The platform carried a 0.06in floor that
 *   overrode the published formula between 24 and 26 pages on white paper, in
 *   a range KDP prints. Amazon publishes no such minimum. It is gone from
 *   canonical geometry and survives only as LEGACY_COMPATIBILITY.
 */

export type KdpBinding = 'PAPERBACK' | 'HARDCOVER';
export type KdpInk = 'BLACK_AND_WHITE' | 'STANDARD_COLOR' | 'PREMIUM_COLOR';
export type KdpPaper = 'WHITE' | 'CREAM' | 'GROUNDWOOD';

export type SpecAuthority =
  | 'OFFICIAL_FORMULA'
  | 'OFFICIAL_STATIC_RULE'
  | 'OFFICIAL_CALCULATOR_FIXTURE'
  | 'HOUSE_POLICY'
  | 'LEGACY_COMPATIBILITY'
  | 'UNVERIFIED';

/**
 * A value KDP has not published and we refuse to invent. Distinct from a
 * missing entry: this says we LOOKED and Amazon states nothing.
 */
export const NOT_PUBLISHED = 'NOT_PUBLISHED' as const;
export type NotPublished = typeof NOT_PUBLISHED;

export interface SpecSource {
  /** Amazon help topic id, or the tool. */
  topic: string;
  url: string;
  /** ISO date the value was read from the live page. */
  retrieved: string;
}

/** A value that can explain itself. */
export interface SpecValue<T = number> {
  value: T;
  units: string;
  authority: SpecAuthority;
  source: SpecSource;
  note?: string;
}

const CREATE_PAPERBACK_COVER: SpecSource = {
  topic: 'G201953020 — Create a Paperback Cover',
  url: 'https://kdp.amazon.com/en_US/help/topic/G201953020',
  retrieved: '2026-08-26',
};
const PAPERBACK_SUBMISSION: SpecSource = {
  topic: 'G201857950 — Paperback Submission Guidelines',
  url: 'https://kdp.amazon.com/en_US/help/topic/G201857950',
  retrieved: '2026-08-26',
};
const CREATE_HARDCOVER_COVER: SpecSource = {
  topic: 'GDTKFJPNQCBTMRV6 — Create a Hardcover Cover',
  url: 'https://kdp.amazon.com/en_US/help/topic/GDTKFJPNQCBTMRV6',
  retrieved: '2026-08-26',
};
const TRIM_BLEED_MARGINS: SpecSource = {
  topic: 'GVBQ3CMEQW3W2VL6 — Set Trim Size, Bleed, and Margins',
  url: 'https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6',
  retrieved: '2026-08-26',
};
const GROUNDWOOD_PAPER: SpecSource = {
  topic: 'G99WKT9FARBGHBJF — Groundwood Paper',
  url: 'https://kdp.amazon.com/en_US/help/topic/G99WKT9FARBGHBJF',
  retrieved: '2026-08-26',
};
const COVER_CALCULATOR: SpecSource = {
  topic: 'KDP Cover Calculator',
  url: 'https://kdp.amazon.com/cover-calculator',
  retrieved: '2026-08-26',
};

/** Where a paperback spine factor is published, keyed by ink then paper. */
type PaperbackSpineTable = {
  [ink in KdpInk]?: { [paper in KdpPaper]?: SpecValue };
};

/**
 * PAPERBACK SPINE FACTORS — published, verbatim.
 *
 *   Black & white, white paper   page count x 0.002252in  (0.0572 mm)
 *   Black & white, cream paper   page count x 0.0025in    (0.0635 mm)
 *   Premium Color paper          page count x 0.002347in  (0.0596 mm)
 *   Standard Color paper         page count x 0.002252in  (0.0572 mm)
 *
 * Groundwood is present but is a CALCULATOR reading, not a published formula.
 */
export const PAPERBACK_SPINE_FACTOR_IN: PaperbackSpineTable = {
  BLACK_AND_WHITE: {
    WHITE: {
      value: 0.002252,
      units: 'in/page',
      authority: 'OFFICIAL_FORMULA',
      source: CREATE_PAPERBACK_COVER,
      note: 'Quoted: "White paper: page count x 0.002252" (0.0572 mm)".',
    },
    CREAM: {
      value: 0.0025,
      units: 'in/page',
      authority: 'OFFICIAL_FORMULA',
      source: CREATE_PAPERBACK_COVER,
      note: 'Quoted: "Cream paper: page count x 0.0025" (0.0635 mm)".',
    },
    /**
     * NOT a published formula. Amazon publishes no groundwood multiplier at
     * all; both help pages send you to the Cover Calculator. These readings
     * were taken from the calculator itself on 2026-08-26, 6x9in paperback,
     * black & white, groundwood:
     *
     *     120 pages  ->  spine 0.282in   0.282 / 120 = 0.00235
     *     240 pages  ->  spine 0.564in   0.564 / 240 = 0.00235
     *
     * Two independent readings, exact agreement, so the calculator is linear
     * here and the quotient is safe to apply. The authority stays
     * OFFICIAL_CALCULATOR_FIXTURE: if Amazon changes the stock, a published
     * formula would tell us and this will not.
     */
    GROUNDWOOD: {
      value: 0.00235,
      units: 'in/page',
      authority: 'OFFICIAL_CALCULATOR_FIXTURE',
      source: COVER_CALCULATOR,
      note:
        'Derived from two Cover Calculator readings on 2026-08-26 (6x9 paperback, B&W, groundwood): 120pp -> 0.282in and 240pp -> 0.564in, both exactly 0.00235 in/page. Amazon publishes NO groundwood multiplier; do not relabel this as OFFICIAL_FORMULA.',
    },
  },
  PREMIUM_COLOR: {
    WHITE: {
      value: 0.002347,
      units: 'in/page',
      authority: 'OFFICIAL_FORMULA',
      source: CREATE_PAPERBACK_COVER,
      note: 'Quoted: "Premium Color paper: page count x 0.002347" (0.0596 mm)".',
    },
  },
  STANDARD_COLOR: {
    WHITE: {
      value: 0.002252,
      units: 'in/page',
      authority: 'OFFICIAL_FORMULA',
      source: CREATE_PAPERBACK_COVER,
      note:
        'Quoted: "Standard Color paper: page count x 0.002252" (0.0572 mm)". ' +
        'Numerically equal to B&W white today, but a SEPARATE published line — ' +
        'do not collapse them, and do not assume it equals Premium Color.',
    },
  },
};

/** Paperback rules that do not depend on page count. */
export const PAPERBACK_RULES = {
  bleedIn: {
    value: 0.125,
    units: 'in',
    authority: 'OFFICIAL_STATIC_RULE',
    source: CREATE_PAPERBACK_COVER,
    note: 'Added to the top, bottom and outside edges. Quoted: "add 0.125" (3.2 mm) to the top, bottom, and outside edges".',
  } as SpecValue,
  safeFromOutsideEdgeIn: {
    value: 0.25,
    units: 'in',
    authority: 'OFFICIAL_STATIC_RULE',
    source: PAPERBACK_SUBMISSION,
    note: 'Quoted: "Any content you don\'t intend to be trimmed off should be a minimum of 0.25" (6.4 mm) from the outside cover edge."',
  } as SpecValue,
  spineTextMinPages: {
    value: 80,
    units: 'pages',
    authority: 'OFFICIAL_STATIC_RULE',
    source: CREATE_PAPERBACK_COVER,
    note:
      'Quoted: "We only print spine text on books with more than 79 pages". ' +
      'MORE THAN 79 means the first eligible count is 80. The platform previously ' +
      'used >= 79, which admitted an 79-page book KDP would refuse.',
  } as SpecValue,
  spineTextSafeIn: {
    value: 0.0625,
    units: 'in',
    authority: 'OFFICIAL_STATIC_RULE',
    source: CREATE_PAPERBACK_COVER,
    note: 'Quoted: "at least 0.0625" (1.6 mm) of space between the text and the edge".',
  } as SpecValue,
  foldVarianceIn: {
    value: 0.0625,
    units: 'in',
    authority: 'OFFICIAL_STATIC_RULE',
    source: CREATE_PAPERBACK_COVER,
    note: 'Quoted: "Allow for 0.0625" (1.6 mm) variance on either side of the fold lines".',
  } as SpecValue,
  minDpi: {
    value: 300,
    units: 'dpi',
    authority: 'OFFICIAL_STATIC_RULE',
    source: PAPERBACK_SUBMISSION,
    note: 'Quoted: "All images (both cover and manuscript) should be at least 300 DPI."',
  } as SpecValue,
  /**
   * KDP places a barcode on the back cover when none is supplied. The paperback
   * pages state that it happens; they do NOT publish a size or an offset for
   * paperback. The 2.0 x 1.2in figure the platform uses comes from the HARDCOVER
   * page, where it IS published, and is applied to paperback as a house rule.
   */
  barcodeReserve: {
    value: { widthIn: 2.0, heightIn: 1.2 },
    units: 'in',
    authority: 'HOUSE_POLICY',
    source: CREATE_HARDCOVER_COVER,
    note:
      'NOT published for paperback. KDP states only that it places a barcode on the ' +
      'back cover if none is supplied. The size is borrowed from the published ' +
      'HARDCOVER barcode requirement and applied as a house reserve. Keep readable ' +
      'copy out of it; artwork may run through.',
  } as SpecValue<{ widthIn: number; heightIn: number }>,
} as const;

/** Hardcover rules, published explicitly and separately from paperback. */
export const HARDCOVER_RULES = {
  /**
   * KDP publishes a spine-text page minimum for PAPERBACK only. The hardcover
   * page states none, so this is NOT_PUBLISHED rather than a number. If we
   * later want a readability floor of our own, add it as a separate
   * HOUSE_POLICY value and call it that. Do not fill this in.
   */
  spineTextMinPages: {
    value: NOT_PUBLISHED,
    units: 'pages',
    authority: 'UNVERIFIED',
    source: CREATE_HARDCOVER_COVER,
    note:
      'Read 2026-08-26: the hardcover cover page publishes no spine-text page minimum. Absence of a rule is not permission to invent one.',
  } as SpecValue<NotPublished>,
  caseWrapIn: {
    value: 0.51,
    units: 'in',
    authority: 'OFFICIAL_STATIC_RULE',
    source: CREATE_HARDCOVER_COVER,
    note: 'Quoted: "Cover file images should extend 0.51" (15 mm) past the edge of the front cover." Wraps the case board and is glued inside.',
  } as SpecValue,
  hingeIn: {
    value: 0.4,
    units: 'in',
    authority: 'OFFICIAL_STATIC_RULE',
    source: CREATE_HARDCOVER_COVER,
    note: 'Quoted: "There\'s a 0.4" (10 mm) space between the spine and safe area on the front and back covers."',
  } as SpecValue,
  safeFromEdgeIn: {
    value: 0.635,
    units: 'in',
    authority: 'OFFICIAL_STATIC_RULE',
    source: CREATE_HARDCOVER_COVER,
    note: 'Quoted: "All text and images should be 0.635" (16 mm) from the edge of the book. This is 0.125" (3 mm) inside the margin line."',
  } as SpecValue,
  barcode: {
    value: { widthIn: 2.0, heightIn: 1.2, fromBottomIn: 0.76, fromSpineHingeIn: 0.25 },
    units: 'in',
    authority: 'OFFICIAL_STATIC_RULE',
    source: CREATE_HARDCOVER_COVER,
    note:
      'Quoted: 300 DPI, "2" (50.8 mm) wide and 1.2" (30.5 mm) high", placed ' +
      '"at least 0.76" (19 mm) from the bottom of the cover and at least 0.25" (6 mm) from the spine hinge".',
  } as SpecValue<{ widthIn: number; heightIn: number; fromBottomIn: number; fromSpineHingeIn: number }>,
  minDpi: {
    value: 300,
    units: 'dpi',
    authority: 'OFFICIAL_STATIC_RULE',
    source: CREATE_HARDCOVER_COVER,
    note: 'Quoted: "Ensure your cover image meets the minimum resolution of 300 DPI (dots per inch)."',
  } as SpecValue,
  spineFactor: {
    value: null,
    units: 'in/page',
    authority: 'OFFICIAL_CALCULATOR_FIXTURE',
    source: COVER_CALCULATOR,
    note:
      'THERE IS NO PUBLISHED HARDCOVER SPINE MULTIPLIER. The help page directs you ' +
      'to the Cover Calculator with ink, paper, trim and page count. Several stored ' +
      'readings happen to look linear; that is NOT evidence of a published factor and ' +
      'must not be turned into one. Hardcover spines come from VERIFIED_SPECS in ' +
      'kdp-cover-specs.ts, which fails closed outside its anchors.',
  } as SpecValue<null>,
} as const;

/**
 * Page-count limits, per binding and ink/paper. Outside these, KDP will not
 * print at all, so a geometry answer would be meaningless.
 */
export const PAGE_COUNT_LIMITS: Array<{
  binding: KdpBinding;
  ink: KdpInk;
  paper: KdpPaper;
  min: number;
  max: number;
  source: SpecSource;
}> = [
  { binding: 'PAPERBACK', ink: 'BLACK_AND_WHITE', paper: 'WHITE', min: 24, max: 828, source: TRIM_BLEED_MARGINS },
  // Cream tops out LOWER than white. Read 2026-08-26: "Black Ink & Cream Paper: 24 - 776".
  { binding: 'PAPERBACK', ink: 'BLACK_AND_WHITE', paper: 'CREAM', min: 24, max: 776, source: TRIM_BLEED_MARGINS },
  { binding: 'PAPERBACK', ink: 'BLACK_AND_WHITE', paper: 'GROUNDWOOD', min: 24, max: 812, source: TRIM_BLEED_MARGINS },
  { binding: 'PAPERBACK', ink: 'STANDARD_COLOR', paper: 'WHITE', min: 72, max: 600, source: TRIM_BLEED_MARGINS },
  { binding: 'PAPERBACK', ink: 'PREMIUM_COLOR', paper: 'WHITE', min: 24, max: 828, source: TRIM_BLEED_MARGINS },
  // TWO OFFICIAL AMAZON SOURCES DISAGREE on the hardcover minimum.
  //   GVBQ3CMEQW3W2VL6 publishes "75 - 550".
  //   The Cover Calculator REFUSES 75 and its own validation message reads
  //   "Page count must be between 76 - 550". Verified 2026-08-26: 75 produces
  //   no result, 76 returns a full set of dimensions.
  // We take the stricter number. A 75-page hardcover cannot be given a wrap by
  // the calculator, so treating it as valid would produce a cover nobody can
  // check. Recorded here rather than silently picked.
  { binding: 'HARDCOVER', ink: 'BLACK_AND_WHITE', paper: 'WHITE', min: 76, max: 550, source: COVER_CALCULATOR },
  { binding: 'HARDCOVER', ink: 'BLACK_AND_WHITE', paper: 'CREAM', min: 76, max: 550, source: COVER_CALCULATOR },
  { binding: 'HARDCOVER', ink: 'PREMIUM_COLOR', paper: 'WHITE', min: 76, max: 550, source: COVER_CALCULATOR },
];

/** Trim sizes KDP lists for each binding, in inches. */
export const SUPPORTED_TRIMS: Record<KdpBinding, string[]> = {
  PAPERBACK: [
    '5x8', '5.06x7.81', '5.25x8', '5.5x8.5', '6x9',
    '6.14x9.21', '6.69x9.61', '7x10', '7.44x9.69', '7.5x9.25',
    '8x10', '8.25x6', '8.25x8.25', '8.5x8.5', '8.5x11', '8.27x11.69',
  ],
  HARDCOVER: ['5.5x8.5', '6x9', '6.14x9.21', '7x10', '8.25x11'],
};

/** The Cover Calculator's own accepted ranges, for validating a custom trim. */
export const CALCULATOR_LIMITS = {
  pageCount: { min: 24, max: 830 },
  trimWidthIn: { min: 4, max: 8.5 },
  trimHeightIn: { min: 6, max: 11.69 },
  source: COVER_CALCULATOR,
} as const;

/**
 * Raised instead of guessing. Carries what was asked for and what would settle
 * it, because an error that only says "unsupported" sends someone to read this
 * file.
 */
export class UnverifiedKdpConfigurationError extends Error {
  readonly kind = 'UNVERIFIED_KDP_CONFIGURATION';
  constructor(
    readonly request: { binding: KdpBinding; ink: KdpInk; paper: KdpPaper; trim: string; pageCount: number },
    readonly reason: string,
    readonly remedy: string,
  ) {
    super(
      [
        `UNVERIFIED KDP CONFIGURATION — official calculator/template required`,
        ``,
        `  requested : ${request.binding} · ${request.ink} · ${request.paper} paper · ${request.trim}in · ${request.pageCount}pp`,
        `  reason    : ${reason}`,
        `  remedy    : ${remedy}`,
      ].join('\n'),
    );
    this.name = 'UnverifiedKdpConfigurationError';
  }
}

export interface SpineResolution {
  spineIn: number;
  authority: SpecAuthority;
  source: SpecSource;
  /** Human-readable arithmetic, e.g. "120 pages x 0.002252 in/page = 0.270240in". */
  explanation: string;
}

/** Page-count limit lookup. Returns null when KDP publishes none for the combination. */
export function pageCountLimit(binding: KdpBinding, ink: KdpInk, paper: KdpPaper) {
  return PAGE_COUNT_LIMITS.find((l) => l.binding === binding && l.ink === ink && l.paper === paper) ?? null;
}

/**
 * THE RESOLVER. Published formula, else a calculator fixture, else refuse.
 *
 * Hardcover deliberately has no branch here: it has no published formula, so it
 * is answered by `kdp-cover-specs.ts` and its verified anchors. Routing it
 * through this function would invite someone to add a multiplier.
 */
export function resolvePaperbackSpine(args: {
  ink: KdpInk;
  paper: KdpPaper;
  trim: string;
  pageCount: number;
}): SpineResolution {
  const { ink, paper, trim, pageCount } = args;
  const request = { binding: 'PAPERBACK' as const, ink, paper, trim, pageCount };

  if (!Number.isInteger(pageCount) || pageCount <= 0) {
    throw new UnverifiedKdpConfigurationError(
      request,
      `page count must be a positive integer, got ${pageCount}`,
      'Read the page count from the final interior PDF rather than passing one.',
    );
  }

  const limit = pageCountLimit('PAPERBACK', ink, paper);
  if (!limit) {
    throw new UnverifiedKdpConfigurationError(
      request,
      `KDP publishes no page-count range for PAPERBACK / ${ink} / ${paper}`,
      'Confirm the combination is offered at all; if it is, add its range to PAGE_COUNT_LIMITS with a source.',
    );
  }
  if (pageCount < limit.min || pageCount > limit.max) {
    throw new UnverifiedKdpConfigurationError(
      request,
      `${pageCount}pp is outside the printable range ${limit.min}-${limit.max} for this combination`,
      `KDP will not print this book at all. Source: ${limit.source.topic}.`,
    );
  }

  const factor = PAPERBACK_SPINE_FACTOR_IN[ink]?.[paper];
  if (!factor) {
    throw new UnverifiedKdpConfigurationError(
      request,
      `KDP publishes no spine multiplier for ${ink} on ${paper} paper`,
      paper === 'GROUNDWOOD'
        ? `Groundwood resolves from Cover Calculator readings, not from ${CREATE_PAPERBACK_COVER.topic}. If it is failing here, the ink is not BLACK_AND_WHITE — Amazon offers groundwood for black & white only.`
        : 'Read the KDP Cover Calculator for this exact configuration and record it as a fixture.',
    );
  }

  const spineIn = pageCount * factor.value;
  return {
    spineIn,
    authority: factor.authority,
    source: factor.source,
    explanation: `${pageCount} pages x ${factor.value} in/page = ${spineIn.toFixed(6)}in`,
  };
}
