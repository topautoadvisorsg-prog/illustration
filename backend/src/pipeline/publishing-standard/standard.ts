/**
 * Wild Lands Publishing Standard — v1.0 (LOCKED)
 *
 * Single machine source of truth for the visual identity of every
 * Wild Lands page. Imported by:
 *   - the whole-page render experiment (prompt assembly)
 *   - the print-prep pipeline (paper-color matching)
 *   - any future renderer / page builder
 *
 * Drift is a bug. If you find a hex value, font name, or pt number
 * hardcoded somewhere downstream, that's a violation — route it
 * through this module.
 *
 * ─── DIRECTION OF AUTHORITY ───────────────────────────────────────
 *   Standard → Render.    NEVER  Render → Standard.
 *
 * Once a version is locked, values are frozen. Do NOT empirically
 * sample colors / sizes / placements from a generated PNG to
 * "recalibrate" the spec — that creates an infinite drift loop:
 *
 *     Render → Standard → Render → Standard → ...
 *
 * Renders conform to the Standard. The Standard does not conform
 * to renders. A render that disagrees is a re-prompt problem, not
 * a re-spec problem.
 *
 * Values change ONLY through an explicit version bump (v1.1, v2.0)
 * signed off by the operator.
 *
 * Human-readable companion: ./STANDARD.md
 */

export const STANDARD_VERSION = '1.0' as const;

// ─── 1. PALETTE ────────────────────────────────────────────────────────────
export const PALETTE = {
  /** Paper background — empirical median of the proven renders. */
  parchment: { hex: '#E0C8A0', rgb: [224, 200, 160] as const },
  /** All typography ink. Warm sepia brown. NEVER pure black. */
  ink:       { hex: '#543C24', rgb: [84, 60, 36] as const },
  /** Forest badge ring + forest-zone accents. */
  forestGreen: { hex: '#3F5A43', rgb: [63, 90, 67] as const },
  /** Mountain badge ring + geology-zone accents. */
  mountainOchre: { hex: '#A47A3C', rgb: [164, 122, 60] as const },
} as const;

export type PaletteRole = keyof typeof PALETTE;

// ─── 2. TYPOGRAPHY ────────────────────────────────────────────────────────
export const TYPOGRAPHY = {
  body: {
    family: 'Caslon-class old-style serif (Adobe Caslon, Goudy Old Style, or Adobe Garamond) — generous x-height, bracketed serifs',
    pt: 13,
    lineHeight: 1.5,
    measureChars: 70,
    inkHex: PALETTE.ink.hex,
    treatment:
      'Letterpress feel, slight printed-ink impression, paper grain visible under the type. Warm sepia ink, never pure black.',
  },
  title: {
    family:
      'Matching old-style serif, engraved roman caps. Three-tier hierarchy: small refined CHAPTER kicker (tracked small-caps, hairline rule each side), oversized Roman numeral as the dominant glyph, full-width title name in stately serif caps.',
    inkHex: PALETTE.ink.hex,
    /** Title color is the same warm printed ink as the body. Never colored. */
    coloredEver: false,
  },
  subhead: {
    family: 'Same serif as body, bold weight',
    ptDeltaFromBody: 1, // body 13pt → subhead 14pt
    inkHex: PALETTE.ink.hex,
  },
  dropCap: {
    heightInLines: 3,
    treatment:
      'Illuminated drop cap with engraved botanical surround — leaves, vines, a single small pinecone. Warm sepia ink, refined and restrained, never cartoonish.',
    inkHex: PALETTE.ink.hex,
  },
} as const;

// ─── 3. CHAPTER SYSTEM ────────────────────────────────────────────────────
export const CHAPTER_SYSTEM = {
  kicker: 'CHAPTER',
  numeralStyle: 'roman' as const,
  hierarchy: ['kicker', 'numeral', 'name'] as const,
  rules: {
    titleNameUppercase: true,
    flankedByHairlineRules: true,
    stackedLinesCentered: true,
  },
} as const;

/** Convert chapter number to Roman numeral. Lightweight — chapter numbers
 *  stay <= 100 for any realistic book. */
export function toRoman(n: number): string {
  const map: Array<[number, string]> = [
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  let rem = n;
  for (const [val, sym] of map) {
    while (rem >= val) {
      out += sym;
      rem -= val;
    }
  }
  return out || String(n);
}

// ─── 4. ORNAMENT SYSTEM ──────────────────────────────────────────────────
export const ORNAMENTS = {
  family: 'BotanicalPinecone' as const,
  components: {
    topSwag:
      'Engraved botanical swag — pine branches with cones, oak leaves with acorns, fern fronds, symmetrical, centered pinecone medallion. Fine line-engraving in warm sepia ink. Period-correct, museum monograph feel.',
    bottomSwag:
      'Mirror of the top swag — slightly slimmer, same components, centered pinecone medallion.',
    hairlineRule:
      'Thin engraved single line in warm sepia ink, paired around the kicker and the title name.',
    dropCapSurround:
      'Engraved botanical wreath — leaves, vines, a single small pinecone — surrounding the drop-cap letter.',
  },
  forbidden: [
    'clip art',
    'digital flourishes',
    'gradients',
    'drop shadows that look digital',
    'newly invented ornament families',
  ],
} as const;

// ─── 5. BADGE SYSTEM ──────────────────────────────────────────────────────
export const BADGES = {
  FOREST: {
    label: 'FOREST',
    icon: 'evergreen tree',
    ringColorHex: PALETTE.forestGreen.hex,
    appliesTo: ['forest-zone pages'],
  },
  MOUNTAIN: {
    label: 'MOUNTAIN',
    icon: 'mountain peaks',
    ringColorHex: PALETTE.mountainOchre.hex,
    appliesTo: ['mountain-zone pages', 'geology pages'],
  },
} as const;

export type BadgeId = keyof typeof BADGES;

/** Pending v1.1 evaluation — only added when a render proves out. */
export const PENDING_BADGES = ['RIVER', 'WETLAND', 'COASTAL', 'ALPINE', 'TUNDRA'] as const;

// ─── 6. LAYOUT FAMILIES ─────────────────────────────────────────────────
/** Reference only — the canonical definitions live in
 *  `pipeline/stage-6-layout/layout-profiles.ts`. Listed here so the
 *  standard document and the renderer agree on which families exist. */
export const LAYOUT_FAMILIES = {
  A: 'Full text + full illustration (paired pages)',
  B: '50/50 split (image-left or image-right)',
  C: '25% corner illustration',
  D: 'Pure text',
  CHAPTER_OPENER: 'LAYOUT_13_FEATURE_BANNER — top-band illustration + body',
  DANGER: 'LAYOUT_4_DANGER_WARNING — image-left + caution treatment',
} as const;

// ─── 7. PAGE HIERARCHY ──────────────────────────────────────────────────
export const CHAPTER_OPENER_HIERARCHY = [
  'top_swag',
  'title_block',
  'title_flanking_rules',
  'illustration_zone',
  'body_block',
  'subheads_inline',
  'bottom_swag',
  'badges_bottom_corners',
] as const;

export const INTERIOR_HIERARCHY = [
  'illustration_zone',
  'body_block',
  'subheads_inline',
] as const;

// ─── 8. SPACING ─────────────────────────────────────────────────────────
export const SPACING = {
  trimIn: { w: 8.5, h: 11.0 },
  bleedIn: 0.125,
  canvasIn: { w: 8.75, h: 11.25 },
  printDpi: 300,
  badgeClearFromTrimIn: 0.5,
} as const;

// ─── 9. COMPOSED EXPORT ─────────────────────────────────────────────────
export const WILDLANDS_STANDARD = {
  version: STANDARD_VERSION,
  palette: PALETTE,
  typography: TYPOGRAPHY,
  chapterSystem: CHAPTER_SYSTEM,
  ornaments: ORNAMENTS,
  badges: BADGES,
  pendingBadges: PENDING_BADGES,
  layoutFamilies: LAYOUT_FAMILIES,
  pageHierarchy: {
    chapterOpener: CHAPTER_OPENER_HIERARCHY,
    interior: INTERIOR_HIERARCHY,
  },
  spacing: SPACING,
} as const;

export type WildlandsStandard = typeof WILDLANDS_STANDARD;
