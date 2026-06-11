/**
 * Wild Lands Publishing Standard — v1.0 (LOCKED)
 *
 * Single machine source of truth for the visual identity of every
 * Wild Lands page. Imported by:
 *   - the whole-page render pipeline (prompt assembly)
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
 * ─── OWNERSHIP RULE ZERO (v1.2) ───────────────────────────────────
 *   No module may define a value owned by another module. Modules
 *   reference owned values through tokens — never raw literals.
 *
 *     WRONG:  Illustration DNA  paper = '#E0C8A0'
 *     RIGHT:  Illustration DNA  paper = PALETTE.parchment
 *     WRONG:  Typography        ink   = '#543C24'
 *     RIGHT:  Typography        ink   = PALETTE.ink
 *
 *   Color is owned by PALETTE. Text is owned by TYPOGRAPHY. Badges by
 *   BADGES. Composition by the Layout System. Physical output by
 *   Print-Prep. Illustration DNA owns artwork BEHAVIOR only. A value
 *   defined in two places is a bug.
 *
 * Human-readable companion: ./STANDARD.md
 * Reconciliation audit trail: ./STANDARD_V1_2_RECONCILIATION.md
 */

export const STANDARD_VERSION = '1.2' as const;

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
  /**
   * Concrete CSS font stack for renderer-STAMPED text (badge labels, source
   * lettermarks, folios) — NOT the image-model prose above. Leads with fonts
   * installed in the production Docker image (Dockerfile.backend:
   * fonts-liberation → Liberation Serif, fonts-dejavu-core → DejaVu Serif) so
   * sharp/librsvg renders deterministically and never falls back to blank.
   * Georgia/Times follow for local dev. Owning module: Typography.
   */
  renderFontFamily:
    "'Liberation Serif', 'DejaVu Serif', Georgia, 'Times New Roman', serif",
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

// ─── 4b. ILLUSTRATION DNA (v1.2) ──────────────────────────────────────────
// Owns ARTWORK BEHAVIOR ONLY — medium, brushwork, naturalist language, mood,
// texture, lighting, feathered edges. Per Rule Zero it owns NO color values:
// it references PALETTE tokens. It owns NO text (Typography), NO composition
// (Layout), NO badges (Badge System), NO physical output (Print-Prep).
// This is the reconciled Master Style Block (see STANDARD_V1_2_RECONCILIATION.md).
export const ILLUSTRATION_DNA = {
  medium:
    "19th-century naturalist's expedition-journal illustration — pen-and-ink linework with a warm watercolor wash.",
  referenceArtists: 'John James Audubon, Ernest Thompson Seton, Royal Geographical Society expedition artists.',
  lineWork:
    'Confident, expressive, organic pen-and-ink linework — sometimes precise and diagnostic, sometimes loose and gestural. Hand-drawn, never mechanical, never traced, never vector.',
  colorDiscipline:
    'Muted, atmospheric watercolor wash applied sparingly. Restrained vintage saturation — never neon, never digital, never over-processed.',
  mood: 'Contemplative, reverent, grounded in the natural world; collected, hand-bound, kept in a leather satchel.',
  naturalistPrecision:
    'Anatomically accurate to field-guide standard — habitat, gill structure, bark texture, leaf venation, track patterns, and proportional scale rendered correctly. Naturalist precision is the foundation; the painterly handling is the surface.',
  lighting: 'Warm, soft, and directional — as if from a high window in an autumn study.',
  paperTexture: 'Aged fibrous parchment with subtle fiber and gentle patina (paper colour owned by PALETTE.parchment).',
  edgeTreatment: 'The wash has soft, feathered edges — no hard rectangular border on the artwork itself.',
  antiStyle: [
    'no photography, photorealism, or photographic lighting',
    'no flat vector, isometric, low-poly, anime, manga, cartoon, or comic-book linework',
    'no anthropomorphized animals, cartoon expressions, or whimsical fantasy elements',
  ],
} as const;

/**
 * Assemble the Illustration-DNA prompt fragment. The ONLY place colour values
 * enter is via PALETTE tokens (Rule Zero) — this function interpolates the
 * token hex; it never hardcodes one.
 */
export function assembleIllustrationDna(): string {
  return [
    ILLUSTRATION_DNA.medium,
    `Aesthetic: ${ILLUSTRATION_DNA.mood} Reference points: ${ILLUSTRATION_DNA.referenceArtists}`,
    `LINE WORK: ${ILLUSTRATION_DNA.lineWork} Line colour is the Standard ink (${PALETTE.ink.hex}).`,
    `COLOUR: ${ILLUSTRATION_DNA.colorDiscipline} Whites are the parchment paper itself (${PALETTE.parchment.hex}), never bright paper-white. Accents are drawn from the Standard palette.`,
    `DETAIL: ${ILLUSTRATION_DNA.naturalistPrecision}`,
    `LIGHT: ${ILLUSTRATION_DNA.lighting}`,
    `PAPER: ${ILLUSTRATION_DNA.paperTexture}`,
    `EDGES: ${ILLUSTRATION_DNA.edgeTreatment}`,
    `Avoid: ${ILLUSTRATION_DNA.antiStyle.join('; ')}.`,
  ].join('\n');
}

// ─── 5. BADGE SYSTEM (v1.1) ───────────────────────────────────────────────
// Three families. Badges are DETERMINISTIC OVERLAYS stamped by print-prep —
// the image model never draws them. Colors are within the warm-sepia world
// (no screen-bright reds). Physical proof decides final tuning.

/** Region family (8). Where the subject lives. Bottom-LEFT corner. */
export const REGION_BADGES = {
  FOREST:   { label: 'FOREST',   icon: 'evergreen tree',  colorHex: '#3F5A43' },
  MOUNTAIN: { label: 'MOUNTAIN', icon: 'mountain peaks',  colorHex: '#A47A3C' },
  RIVER:    { label: 'RIVER',    icon: 'flowing river',   colorHex: '#3E5C6E' },
  WETLAND:  { label: 'WETLAND',  icon: 'cattail reeds',   colorHex: '#5C6B43' },
  COASTAL:  { label: 'COASTAL',  icon: 'wave and shore',  colorHex: '#6E7A78' },
  ALPINE:   { label: 'ALPINE',   icon: 'bare summit',     colorHex: '#8A8472' },
  FIELD:    { label: 'FIELD',    icon: 'open meadow',     colorHex: '#9A7B3C' },
  GENERAL:  { label: 'GENERAL',  icon: 'compass rose',    colorHex: '#6B5A40' },
} as const;
export type RegionBadge = keyof typeof REGION_BADGES;

/** Hazard / usage family (9). Bottom-RIGHT corner. Multiple allowed when
 *  non-contradictory; rendered in HAZARD_DISPLAY_ORDER (most severe first). */
export const HAZARD_BADGES = {
  DEADLY:        { label: 'DEADLY',        icon: 'skull',          colorHex: '#3A2018' },
  TOXIC:         { label: 'TOXIC',         icon: 'warning amber',  colorHex: '#8A5A1E' },
  VENOMOUS:      { label: 'VENOMOUS',      icon: 'fang',           colorHex: '#5A2A1E' },
  AGGRESSIVE:    { label: 'AGGRESSIVE',    icon: 'charging horns', colorHex: '#7A3E1E' },
  CAUTION:       { label: 'CAUTION',       icon: 'exclamation',    colorHex: '#A47A3C' },
  EXPERT_REVIEW: { label: 'EXPERT REVIEW', icon: 'magnifier',      colorHex: '#4A4A40' },
  EDIBLE:        { label: 'EDIBLE',        icon: 'check leaf',     colorHex: '#3F5A43' },
  MEDICINAL:     { label: 'MEDICINAL',     icon: 'mortar pestle',  colorHex: '#5C6B43' },
  NONE:          { label: '',              icon: '',               colorHex: '' },
} as const;
export type HazardBadge = keyof typeof HAZARD_BADGES;

/** Severity order — most severe stamped first. NONE means "no badge". */
export const HAZARD_DISPLAY_ORDER: HazardBadge[] = [
  'DEADLY', 'TOXIC', 'VENOMOUS', 'AGGRESSIVE', 'CAUTION',
  'EXPERT_REVIEW', 'EDIBLE', 'MEDICINAL', 'NONE',
];

/** Pairs that must never co-occur on a page. */
export const HAZARD_CONTRADICTIONS: Array<[HazardBadge, HazardBadge]> = [
  ['DEADLY', 'EDIBLE'],
  ['DEADLY', 'MEDICINAL'],
  ['TOXIC', 'EDIBLE'],
];

/** Source / confidence family (5). Small sepia seal, near the hazard badge. */
export const SOURCE_BADGES = {
  SCIENTIFIC_LITERATURE: { label: 'SCIENTIFIC LITERATURE', colorHex: PALETTE.ink.hex },
  FIELD_GUIDE:           { label: 'FIELD GUIDE',           colorHex: PALETTE.ink.hex },
  TRADITIONAL_USE:       { label: 'TRADITIONAL USE',       colorHex: PALETTE.ink.hex },
  HISTORICAL_SOURCE:     { label: 'HISTORICAL SOURCE',     colorHex: PALETTE.ink.hex },
  GENERAL_REFERENCE:     { label: 'GENERAL REFERENCE',     colorHex: PALETTE.ink.hex },
} as const;
export type SourceBadge = keyof typeof SOURCE_BADGES;

/** Locked placement. Badges are stamped, never model-drawn. The image model
 *  must keep these corners visually quiet. */
export const BADGE_PLACEMENT = {
  region: 'bottom-left',
  hazard: 'bottom-right',
  source: 'bottom-right-inner',
  /** Reserved clean square in each bottom corner (inside trim safe area). */
  safeZoneIn: 0.9,
} as const;

/** Back-compat: v1.0 referenced BADGES.{FOREST,MOUNTAIN}. Keep the alias so
 *  nothing that imported BADGES breaks; it now points at the region family. */
export const BADGES = REGION_BADGES;
export type BadgeId = RegionBadge;

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
  illustrationDna: ILLUSTRATION_DNA,
  chapterSystem: CHAPTER_SYSTEM,
  ornaments: ORNAMENTS,
  badges: {
    region: REGION_BADGES,
    hazard: HAZARD_BADGES,
    source: SOURCE_BADGES,
    hazardDisplayOrder: HAZARD_DISPLAY_ORDER,
    hazardContradictions: HAZARD_CONTRADICTIONS,
    placement: BADGE_PLACEMENT,
  },
  layoutFamilies: LAYOUT_FAMILIES,
  pageHierarchy: {
    chapterOpener: CHAPTER_OPENER_HIERARCHY,
    interior: INTERIOR_HIERARCHY,
  },
  spacing: SPACING,
} as const;

export type WildlandsStandard = typeof WILDLANDS_STANDARD;
