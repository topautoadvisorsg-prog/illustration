import { z } from 'zod';

export const SHARED_VERSION = '0.1.0';

export const BrandSchema = z.literal('THE_WILDLANDS');
export const AudienceSchema = z.literal('ADULT');
export const EditionSchema = z.enum(['PREMIUM', 'KINDLE_EPUB']);

export const ProjectStatusSchema = z.enum([
  'DRAFT',
  'MANUSCRIPT_UPLOADED',
  'MANIFESTED',
  'PLANNED',
  'GENERATING',
  'IMAGE_REVIEW',
  'UPSCALED',
  'LAYOUT_READY',
  'EXPORTED',
  'FAILED',
]);

export const ManifestKindSchema = z.enum(['BOOK', 'CHAPTER', 'PAGE']);
export const PageStatusSchema = z.enum([
  'PENDING',
  'PLANNED',
  'GENERATING',
  'REVIEW',
  'APPROVED',
  'UPSCALING',
  'PRINT_READY',
  'LAID_OUT',
  'FAILED_DPI',
  'FAILED',
]);

export const ImageStatusSchema = z.enum([
  'GENERATED',
  'REVIEW',
  'APPROVED',
  'REJECTED',
  'UPSCALING',
  'PRINT_READY',
  'FAILED',
]);

export const JobTypeSchema = z.enum(['image-generation', 'upscale', 'layout', 'pdf-compile', 'epub-export']);
export const JobStatusSchema = z.enum(['queued', 'active', 'completed', 'failed', 'dead-lettered']);
export const ExportKindSchema = z.enum(['PREMIUM_PDF', 'KINDLE_EPUB']);
export const ExportStatusSchema = z.enum(['REQUESTED', 'RUNNING', 'READY', 'FAILED']);
export const KnowledgeItemTypeSchema = z.enum([
  'EXPERIMENT',
  'DECISION',
  'STANDARD',
  'SOP',
  'COST_RECORD',
  'PRINT_REVIEW',
  'LESSON',
]);
export const KnowledgeStatusSchema = z.enum([
  'DRAFT',
  'RUNNING',
  'CONCLUDED',
  'ACCEPTED',
  'REJECTED',
  'LOCKED',
  'SUPERSEDED',
  'ARCHIVED',
]);
export const KnowledgeScopeSchema = z.enum(['GLOBAL', 'PROJECT', 'BOOK', 'CHAPTER', 'PAGE', 'LAYOUT', 'WORKFLOW']);
export const EvidenceTypeSchema = z.enum(['FILE', 'URL', 'SCREENSHOT', 'PDF', 'IMAGE', 'NOTE', 'COST_REPORT', 'PROOF_PHOTO']);
export const KnowledgeRelationTypeSchema = z.enum([
  'DERIVED_FROM',
  'PRODUCED_DECISION',
  'PROMOTED_TO_STANDARD',
  'UPDATES_SOP',
  'SUPERSEDES',
  'EVIDENCED_BY',
  'AFFECTS',
  'RELATED_TO',
]);
export const PrintFindingSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'BLOCKER']);
export const PrintFindingCategorySchema = z.enum(['MARGIN', 'TYPOGRAPHY', 'IMAGE_QUALITY', 'PAPER', 'COVER', 'KDP', 'COLOR', 'BINDING', 'OTHER']);
export const CostOperationSchema = z.enum(['LLM', 'IMAGE_GENERATION', 'UPSCALE', 'PDF_RENDER', 'EPUB_EXPORT', 'STORAGE', 'OTHER']);
export const LayoutTemplateIdSchema = z.enum([
  // Legacy named templates — kept as latent infrastructure for advanced /
  // operator-override flows. The simplified families below are the active
  // production surface when LAYOUT_SIMPLIFIED_V1 is on.
  'LAYOUT_1_STANDARD',
  'LAYOUT_2_TEXT_HEAVY',
  'LAYOUT_3_ILLUSTRATION_DOMINANT',
  'LAYOUT_4_DANGER_WARNING',
  'LAYOUT_5_CHAPTER_OPENER',
  'LAYOUT_6_BACK_MATTER',
  'LAYOUT_7_SCATTERED_VIGNETTES',
  'LAYOUT_8_MARGIN_ILLUSTRATION',
  'LAYOUT_9_DIAGNOSTIC_DIAGRAM',
  'LAYOUT_10_FULL_PAGE_PLATE',
  'LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD',
  'LAYOUT_12_DIAGNOSTIC_DIAGRAM',
  'LAYOUT_13_FEATURE_BANNER',
  'LAYOUT_14_SIDEBAR_FEATURE',
  'LAYOUT_15_PROGRESSION_STUDY',
  'LAYOUT_16_CUTAWAY_FEATURE',
  // ─── Simplified families (v1 production surface) ───────────────────────
  // Layout A — Full Text + Full Illustration pair. Text page leads, the
  // facing illustration page acts as the visual reward.
  'LAYOUT_A_TEXT',
  'LAYOUT_A_ILLUSTRATION',
  // Layout B — 50/50 split. Four variants by image placement.
  'LAYOUT_B_IMAGE_TOP',
  'LAYOUT_B_IMAGE_BOTTOM',
  'LAYOUT_B_IMAGE_LEFT',
  'LAYOUT_B_IMAGE_RIGHT',
  // Layout C — 25% support image in a page corner. Four corner variants.
  'LAYOUT_C_CORNER_TOP_LEFT',
  'LAYOUT_C_CORNER_TOP_RIGHT',
  'LAYOUT_C_CORNER_BOTTOM_LEFT',
  'LAYOUT_C_CORNER_BOTTOM_RIGHT',
  // Layout D — pure text / back matter. No illustration.
  'LAYOUT_D_PURE_TEXT',
  // Title Display — a centered, ceremonial text block with generous negative
  // space + thin edge ornaments. For very short text: title, dedication,
  // epigraph, quote, special notes. Fills the "little text, not a full
  // illustration" gap no other layout covers.
  'LAYOUT_TITLE_DISPLAY',
  // Fine Print — a small text block anchored low on the page (copyright/edition
  // notice, colophon, "printed in" lines). A calm illustrated field fills the
  // space above; the legal/credits fine print sits quietly at the bottom.
  'LAYOUT_FINE_PRINT',
  // Reference — a dense two-column reference page (glossary, index) at smaller
  // reference type, over the same subtle illustrated field + edge ornaments.
  'LAYOUT_REFERENCE',
]);

// â”€â”€ Layered layout model (Phase 1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Content Type -> Coverage -> Architecture -> Master Style -> Subject.
// These axes are orthogonal: a content type has default coverage + architecture,
// but each can be overridden independently. They sit ABOVE the 15 named layout
// templates (which remain the render authority) and resolve down to them.

/** What KIND of educational page this is (defines its purpose). */
export const ContentTypeSchema = z.enum([
  'SPECIES_PROFILE',
  'ANIMAL_PROFILE',
  'COMPARISON',
  'MULTI_SPECIES_COMPARISON',
  'IDENTIFICATION_GUIDE',
  'DIAGNOSTIC_DIAGRAM',
  'CHAPTER_OPENER',
  'HABITAT_OVERVIEW',
  'PROGRESSION_STUDY',
  'CUTAWAY_ILLUSTRATION',
  'SIDEBAR_FEATURE',
  'REFERENCE_PAGE',
  'WARNING_PAGE',
  'BOTANICAL_PLATE',
  'TERRAIN_ANALYSIS',
  'FIELD_NOTES_PAGE',
  'ENCYCLOPEDIA_ENTRY',
  // Display/ceremonial short-text page (title, dedication, epigraph, quote,
  // special note) — a compact centered text block, not a reading page.
  'TITLE_DISPLAY',
]);

/** How MUCH of the page the imagery occupies (percent buckets). */
export const CoverageSchema = z.union([
  z.literal(0), // Layout D — pure text, no illustration
  z.literal(5), // Layout A text page — minimal decoration only
  z.literal(15),
  z.literal(25),
  z.literal(40),
  z.literal(50),
  z.literal(60),
  z.literal(75),
  z.literal(100),
]);

/** How the image space is ARRANGED on the page (independent of coverage). */
export const ArchitectureSchema = z.enum([
  'FLOAT_LEFT',
  'FLOAT_RIGHT',
  'TOP_BAND',
  'BOTTOM_BAND',
  'FULL_PAGE',
  'SIDEBAR_RIGHT',
  'SCATTERED',
  'CENTER_WRAP',
  // Corner architectures for Layout C (25% support-image variants).
  'CORNER_TOP_LEFT',
  'CORNER_TOP_RIGHT',
  'CORNER_BOTTOM_LEFT',
  'CORNER_BOTTOM_RIGHT',
  // A compact centered text block framed by thin top/bottom edge ornaments,
  // with large surrounding negative space (display/ceremonial pages).
  'TITLE_BLOCK',
  // A small text block anchored LOW on the page over a calm illustrated field
  // (fine-print pages: copyright, colophon, edition notice).
  'FINE_PRINT_BOTTOM',
  // Two reading columns of dense reference type over the illustrated field
  // (reference pages: glossary, index).
  'REFERENCE_COLUMNS',
]);

export type ContentType = z.infer<typeof ContentTypeSchema>;
export type Coverage = z.infer<typeof CoverageSchema>;
export type Architecture = z.infer<typeof ArchitectureSchema>;

export const TrimSizeSchema = z.object({
  widthIn: z.number().positive(),
  heightIn: z.number().positive(),
  bleedIn: z.number().nonnegative(),
});

export const PublishingFormatSchema = z.enum([
  'KINDLE_DIGITAL',
  'PAPERBACK_6X9',
  'HARDCOVER_7X10',
  'LARGE_FORMAT_HARDCOVER_8_5X11',
  'CUSTOM',
]);
export type PublishingFormat = z.infer<typeof PublishingFormatSchema>;

export const PublishingStandardSchema = z.object({
  format: PublishingFormatSchema.default('HARDCOVER_7X10'),
  label: z.string().min(1).default('Hardcover 7 x 10'),
  typographyPackage: z.string().min(1).default('Wild Lands Default'),
  status: z.enum(['CONFIGURED', 'CUSTOM']).default('CONFIGURED'),
});

export const PUBLISHING_STANDARD_PRESETS = {
  HARDCOVER_7X10: {
    format: 'HARDCOVER_7X10',
    label: 'Hardcover 7 x 10',
    typographyPackage: 'Wild Lands Default',
    trimSize: { widthIn: 7, heightIn: 10, bleedIn: 0.125 },
    typography: { bodyPt: 11, lineHeight: 1.4 },
    outputProfile: {
      printEdition: 'PREMIUM',
      ebookEdition: 'KINDLE_EPUB',
      renderEngine: 'PUPPETEER_PAGEDJS',
      pdfTarget: 'KDP premium color hardcover 7 x 10',
    },
  },
  PAPERBACK_6X9: {
    format: 'PAPERBACK_6X9',
    label: 'Paperback 6 x 9',
    typographyPackage: 'Wild Lands Default Compact',
    trimSize: { widthIn: 6, heightIn: 9, bleedIn: 0.125 },
    typography: { bodyPt: 10.5, lineHeight: 1.35 },
    outputProfile: {
      printEdition: 'PREMIUM',
      ebookEdition: 'KINDLE_EPUB',
      renderEngine: 'PUPPETEER_PAGEDJS',
      pdfTarget: 'KDP premium color paperback 6 x 9',
    },
  },
  LARGE_FORMAT_HARDCOVER_8_5X11: {
    format: 'LARGE_FORMAT_HARDCOVER_8_5X11',
    label: 'Large Format Hardcover 8.5 x 11',
    typographyPackage: 'Wild Lands Default Large Format',
    trimSize: { widthIn: 8.5, heightIn: 11, bleedIn: 0.125 },
    typography: { bodyPt: 11.5, lineHeight: 1.35 },
    outputProfile: {
      printEdition: 'PREMIUM',
      ebookEdition: 'KINDLE_EPUB',
      renderEngine: 'PUPPETEER_PAGEDJS',
      pdfTarget: 'KDP premium color hardcover 8.5 x 11',
    },
  },
  KINDLE_DIGITAL: {
    format: 'KINDLE_DIGITAL',
    label: 'Kindle / Digital Edition',
    typographyPackage: 'Wild Lands Digital',
    trimSize: { widthIn: 6, heightIn: 9, bleedIn: 0 },
    typography: { bodyPt: 11, lineHeight: 1.45 },
    outputProfile: {
      printEdition: 'PREMIUM',
      ebookEdition: 'KINDLE_EPUB',
      renderEngine: 'PUPPETEER_PAGEDJS',
      pdfTarget: 'Kindle digital reference proof',
    },
  },
} as const satisfies Record<
  Exclude<PublishingFormat, 'CUSTOM'>,
  {
    format: Exclude<PublishingFormat, 'CUSTOM'>;
    label: string;
    typographyPackage: string;
    trimSize: { widthIn: number; heightIn: number; bleedIn: number };
    typography: { bodyPt: number; lineHeight: number };
    outputProfile: {
      printEdition: 'PREMIUM';
      ebookEdition: 'KINDLE_EPUB';
      renderEngine: 'PUPPETEER_PAGEDJS';
      pdfTarget: string;
    };
  }
>;

/**
 * Role-based typography. `headingFont` is the display face (book/chapter/section/
 * entry titles, headings, labels); `bodyFont` is the text face (body + captions).
 * Per-role point sizes are tuned for a ~7x10 trim and may be scaled per trim.
 * Defaults follow the Wild Lands system: Cormorant Garamond display + EB Garamond body.
 */
export const TypographyConfigSchema = z.object({
  headingFont: z.string().min(1).default('Cormorant Garamond'),
  bodyFont: z.string().min(1).default('EB Garamond'),
  captionFont: z.string().min(1).default('EB Garamond'),
  // Role sizes (pt), tuned for a ~7x10 trim.
  bookTitlePt: z.number().positive().default(52),
  chapterTitlePt: z.number().positive().default(32),
  entryTitlePt: z.number().positive().default(26),
  sectionHeadingPt: z.number().positive().default(13),
  subsectionHeadingPt: z.number().positive().default(12.5),
  bodyPt: z.number().positive().default(11),
  captionPt: z.number().positive().default(9),
  labelPt: z.number().positive().default(8.5),
  lineHeight: z.number().positive().default(1.4),
  smallCaps: z.boolean().default(true),
});

// Defaults match the THE_WILDLANDS master style block (single source of truth for color).
export const ColorPaletteSchema = z.object({
  paper: z.string().min(1).default('#F5EDD6'),
  ink: z.string().min(1).default('#2C1A0E'),
  accent: z.string().min(1).default('#3A5C3A'),
  warning: z.string().min(1).default('#8B2020'),
});

export const ImageGenerationConfigSchema = z.object({
  masterStyleBlockVersion: z.string().min(1).default('VINTAGE_NATURALIST_DNA_v1.0'),
  masterStyleBlockText: z.string().min(1).default('Vintage Naturalist master visual identity.'),
  styleName: z.string().min(1).default('Vintage Naturalist'),
  imageModel: z.string().min(1).default('gpt-image-2'),
  upscaleModel: z.string().min(1).default('Replicate Real-ESRGAN'),
});

/**
 * Layout-selection thresholds. Previously hardcoded in `chooseLayout`. Lifted
 * into project config so an operator can tune publishing decisions without code
 * changes. Defaults preserve current behavior exactly.
 */
export const LayoutSelectionThresholdsSchema = z.object({
  /** Word count at/under which a fallback entry uses the short-text default layout. */
  shortTextThreshold: z.number().int().positive().default(200),
  /** Word count above which a fallback entry uses the long-text template. */
  longTextThreshold: z.number().int().positive().default(400),
  // ANIMAL / SPECIES profile word-count routing.
  speciesProfileSidebarThreshold: z.number().int().positive().default(900),
  speciesProfileMarginThreshold: z.number().int().positive().default(650),
  speciesProfileTextHeavyThreshold: z.number().int().positive().default(420),
  speciesProfileIllustrationDominantThreshold: z.number().int().positive().default(180),
  // Habitat/terrain word-count split between feature banner and landscape spread.
  terrainBannerThreshold: z.number().int().positive().default(140),
  // Tall-subject signal split between sidebar and margin layouts.
  tallSubjectSidebarThreshold: z.number().int().positive().default(300),
});

export const LayoutPolicySchema = z.object({
  layoutReferenceSet: z.string().min(1).default('wildlands-layout-references-v1'),
  textFitFirst: z.boolean().default(true),
  chapterByChapterRender: z.boolean().default(true),
  defaultTemplate: LayoutTemplateIdSchema.default('LAYOUT_1_STANDARD'),
  longTextTemplate: LayoutTemplateIdSchema.default('LAYOUT_2_TEXT_HEAVY'),
  comparisonTemplate: LayoutTemplateIdSchema.default('LAYOUT_4_DANGER_WARNING'),
  thresholds: LayoutSelectionThresholdsSchema.default({}),
});

export const LayoutPromptAssetSchema = z.object({
  templateId: LayoutTemplateIdSchema,
  label: z.string().min(1),
  mockupImagePath: z.string().min(1),
  mockupImageDataUrl: z.string().optional(),
  layoutDescription: z.string().min(1).default('Written description of the layout structure.'),
  useCases: z.array(z.string().min(1)).default([]),
  avoidWhen: z.array(z.string().min(1)).default([]),
  // Full-page artwork model: the image IS the page; these fields describe the
  // ZONES on that page (where text is safe to live; where the strongest visual
  // content should live). Field names kept for back-compat with stored configs.
  /** Where manuscript body text lives on the artwork (the text-safe zone). */
  textZoneDescription: z.string().min(1).default('Text-safe zone: the calm region of the artwork reserved for body text and captions.'),
  /** Where the strongest visual content should live in the artwork (image-priority zone). */
  imageZoneDescription: z.string().min(1).default('Image-priority zone: the area where focal subjects and primary visual detail should live in the artwork.'),
  capacityNotes: z.string().default(''),
  minWords: z.number().int().nonnegative().default(0),
  targetWords: z.number().int().nonnegative().default(250),
  maxWords: z.number().int().positive().default(400),
  recommendedBodyPt: z.number().positive().default(11),
  recommendedLineHeight: z.number().positive().default(1.28),
  promptTemplate: z.string().min(1),
  placeholders: z.array(z.string().min(1)).default(['{MASTER_STYLE_DNA}', '{SUBJECT}', '{SCIENTIFIC_DETAILS}', '{COMPOSITION_NOTES}']),
  textFitRule: z.string().min(1).default('Fit manuscript text into the text-safe zone before any image is generated.'),
  /** @deprecated Use `imageZoneDescription`. Kept for back-compat with stored configs. */
  imageSlotDescription: z.string().min(1).default('Image-priority zone description (legacy field name; describes where focal visual content lives on the full-page artwork).'),
  capacityTestStatus: z.enum(['UNTESTED', 'TESTING', 'APPROVED']).default('UNTESTED'),
  operatorNotes: z.string().default(''),
});

export const OutputProfileSchema = z.object({
  printEdition: z.literal('PREMIUM').default('PREMIUM'),
  ebookEdition: z.literal('KINDLE_EPUB').default('KINDLE_EPUB'),
  renderEngine: z.literal('PUPPETEER_PAGEDJS').default('PUPPETEER_PAGEDJS'),
  pdfTarget: z.string().min(1).default('KDP premium color hardcover'),
});

export const LayoutApprovalSchema = z.object({
  status: z.literal('APPROVED'),
  chapterNumber: z.number().int().positive(),
  approvedAt: z.string().datetime(),
  approvedBy: z.string().min(1).default('operator'),
  pageKeys: z.array(z.string().min(1)),
  promptSha256ByPage: z.record(z.string().min(1)),
  textFitSummary: z.object({
    pages: z.number().int().nonnegative(),
    fits: z.number().int().nonnegative(),
    tight: z.number().int().nonnegative(),
    overflow: z.number().int().nonnegative(),
    underfilled: z.number().int().nonnegative(),
  }),
});

/**
 * Snapshot of the planning-relevant config captured WHEN the page plan was
 * generated. Used to detect when the publishing standard / geometry has changed
 * since planning, so the operator is warned the plan is stale (Priority #1).
 */
export const PlanMetaSchema = z.object({
  standardLabel: z.string(),
  format: PublishingFormatSchema,
  trimSize: TrimSizeSchema,
  bodyPt: z.number(),
  lineHeight: z.number(),
  plannedAt: z.string(),
});
export type PlanMeta = z.infer<typeof PlanMetaSchema>;

export const ProofArtifactSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['PAGE_PROOF', 'CHAPTER_PROOF', 'BOOK_PROOF', 'COVER_PROOF']),
  title: z.string().min(1),
  chapterNumber: z.number().int().positive().optional(),
  pageKey: z.string().min(1).optional(),
  storagePath: z.string().min(1),
  sha256: z.string().min(1),
  fileSizeBytes: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type ProofArtifact = z.infer<typeof ProofArtifactSchema>;

export const PageQualityResolutionStatusSchema = z.enum(['ACCEPTED', 'FIXED', 'DEFERRED', 'OVERRIDDEN']);
export const PageQualityResolutionSchema = z.object({
  findingId: z.string().min(1),
  status: PageQualityResolutionStatusSchema,
  note: z.string().optional(),
  action: z
    .object({
      type: z.string().min(1),
      summary: z.string().min(1),
      pageKey: z.string().min(1).optional(),
      fromLayoutTemplate: LayoutTemplateIdSchema.optional(),
      toLayoutTemplate: LayoutTemplateIdSchema.optional(),
    })
    .optional(),
  resolvedAt: z.string().datetime(),
  resolvedBy: z.string().min(1).default('operator'),
});
export type PageQualityResolution = z.infer<typeof PageQualityResolutionSchema>;
export type PageQualityResolutionStatus = z.infer<typeof PageQualityResolutionStatusSchema>;

// ── Front Matter v1 — generic publishing metadata (FRONT_MATTER_V1_SPEC.md §5).
// Platform-level: NOTHING book-, brand-, or series-specific is hardcoded here.
// Every field is data; templates and AI prompts read from this block only.
export const PublishingMetadataSchema = z.object({
  /** Overrides project title/subtitle/author when present; falls back to them. */
  title: z.string().min(1).optional(),
  subtitle: z.string().optional(),
  authors: z.array(z.string().min(1)).optional(),
  language: z.string().default('en'),
  publisher: z
    .object({
      imprint: z.string().min(1),
      location: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
  copyrightYear: z.number().int().optional(),
  copyrightHolder: z.string().optional(),
  edition: z.string().default('First Edition'),
  isbn: z.object({ print: z.string().optional(), ebook: z.string().optional() }).optional(),
  printedIn: z.string().optional(),
  dedication: z.string().optional(),
  disclaimers: z.array(z.string()).default([]),
  credits: z.string().optional(),
  additionalResources: z
    .object({ heading: z.string().min(1), items: z.array(z.string().min(1)) })
    .optional(),
  series: z
    .object({
      name: z.string().min(1),
      description: z.string().optional(),
      volumeNumber: z.number().int().positive().optional(),
      otherVolumes: z.array(z.string()).optional(),
    })
    .optional(),
  audienceDescription: z.string().optional(),
  bookPurpose: z.string().optional(),
  toneKeywords: z.array(z.string()).default([]),
  authorBio: z
    .object({ verbatim: z.string().optional(), facts: z.array(z.string()).optional() })
    .optional(),
  bookDescription: z.object({ hooks: z.array(z.string()).optional() }).optional(),
  aiIntroduction: z.object({ enabled: z.boolean().default(false) }).default({ enabled: false }),
  /** Front-cover descriptive line (e.g. "A Field Guide to ..."). Data-driven, per book. */
  coverDescription: z.string().optional(),
  coverAssetPath: z.string().optional(),
  // Cover/interior synchronization record (Phase 0 production gate). Captured
  // when the cover ARTWORK is generated — the spine width is baked into the art
  // at that page count. Final export compares builtForPageCount against the
  // current interior page count and blocks on a mismatch.
  coverSync: z
    .object({
      builtForPageCount: z.number().int().nonnegative(),
      spineIn: z.number(),
      generatedAt: z.string(),
    })
    .optional(),
});
export type PublishingMetadata = z.infer<typeof PublishingMetadataSchema>;

/** Volume numbers are stored as integers; Roman numerals are a DISPLAY concern only. */
export function toRoman(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  const table: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  let rem = Math.floor(n);
  for (const [value, sym] of table) {
    while (rem >= value) { out += sym; rem -= value; }
  }
  return out;
}

/**
 * The single source of truth for the series line printed on the cover, title
 * page, and series page: "[SERIES NAME] — VOLUME [Roman]". Fully data-driven —
 * returns null when no series name is set (nothing book-specific in code).
 */
export function buildSeriesLine(seriesName?: string | null, volume?: number | null): string | null {
  const name = (seriesName ?? '').trim();
  if (!name) return null;
  const roman = volume != null ? toRoman(volume) : '';
  return roman ? `${name.toUpperCase()} — VOLUME ${roman}` : name.toUpperCase();
}

/**
 * Strip a leading manuscript ordinal from a reader-facing title. The manuscript
 * may number its entries ("1. Black Bear", "10) Eastern White Pine") for the
 * author's own organization; the printed book shows clean names. Conservative:
 * only a leading "<digits><.|)><space>" run is removed, so "Hazard 3 — Moose"
 * or "1080p" pass through untouched. Used everywhere a title is PRESENTED
 * (entry opener bands, index, contents) — never mutates stored manifest data.
 */
export function stripLeadingOrdinal(title: string): string {
  return title.replace(/^\s*\d{1,3}[.)]\s+/, '').trim();
}

export const ProjectConfigSchema = z.object({
  brand: BrandSchema.default('THE_WILDLANDS'),
  audience: AudienceSchema.default('ADULT'),
  editions: z.array(EditionSchema).default(['PREMIUM', 'KINDLE_EPUB']),
  volume: z.number().int().positive(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  authorName: z.string().min(1),
  publishingStandard: PublishingStandardSchema.default({}),
  // Default is the Publishing Standard trim (8.5×11). The old silent 7×10
  // default caused render (7×10) vs print-prep (8.75×11.25) divergence —
  // see SPEC_GEOMETRY_RECONCILIATION. Geometry is resolved via resolveGeometry.
  trimSize: TrimSizeSchema.default({ widthIn: 8.5, heightIn: 11, bleedIn: 0.125 }),
  typography: TypographyConfigSchema.default({}),
  colorPalette: ColorPaletteSchema.default({}),
  imageGeneration: ImageGenerationConfigSchema.default({}),
  layoutPolicy: LayoutPolicySchema.default({}),
  layoutPromptAssets: z.array(LayoutPromptAssetSchema).default([]),
  layoutApprovals: z.record(LayoutApprovalSchema).default({}),
  pageQualityReview: z
    .object({
      reviewedAt: z.string().datetime(),
      review: z.unknown(),
    })
    .optional(),
  pageQualityResolutions: z.record(PageQualityResolutionSchema).default({}),
  proofArtifacts: z.array(ProofArtifactSchema).default([]),
  outputProfile: OutputProfileSchema.default({}),
  /** Set by Page Plan; compared against current config to detect a stale plan. */
  planMeta: PlanMetaSchema.optional(),
  /** Front Matter v1 — generic publishing metadata. Additive + optional so
   *  every existing project config parses unchanged. */
  publishing: PublishingMetadataSchema.default({}),
});

export const CreateProjectRequestSchema = z.object({
  config: ProjectConfigSchema,
});

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  brand: BrandSchema,
  audience: AudienceSchema,
  title: z.string(),
  status: ProjectStatusSchema,
  manuscriptPath: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ── Subject + Badge Metadata (Standard v1.1) ──────────────────────────────
// The image subject stays clean; hazards/region/source live in badge fields.
export const RegionBadgeSchema = z.enum([
  'FOREST', 'MOUNTAIN', 'RIVER', 'WETLAND', 'COASTAL', 'ALPINE', 'FIELD', 'GENERAL',
]);
export type RegionBadge = z.infer<typeof RegionBadgeSchema>;

export const HazardBadgeSchema = z.enum([
  'DEADLY', 'TOXIC', 'VENOMOUS', 'AGGRESSIVE', 'CAUTION',
  'EXPERT_REVIEW', 'EDIBLE', 'MEDICINAL', 'NONE',
]);
export type HazardBadge = z.infer<typeof HazardBadgeSchema>;

export const SourceBadgeSchema = z.enum([
  'SCIENTIFIC_LITERATURE', 'FIELD_GUIDE', 'TRADITIONAL_USE',
  'HISTORICAL_SOURCE', 'GENERAL_REFERENCE',
]);
export type SourceBadge = z.infer<typeof SourceBadgeSchema>;

/** A single resolved badge to stamp, tagged with its family. */
export const BadgeSchema = z.object({
  family: z.enum(['region', 'hazard', 'source']),
  value: z.string(),
});
export type Badge = z.infer<typeof BadgeSchema>;

export const PageManifestSchema = z.object({
  pageId: z.string().min(1),
  projectId: z.string().uuid().optional(),
  chapterNumber: z.number().int().positive(),
  pageNumber: z.number().int().positive(),
  entryTitle: z.string().min(1),
  scientificName: z.string().optional(),
  /** Entry classification from Stage 1.5 (e.g. EDIBLE, TOXIC) â€” drives danger layout. */
  category: z.string().optional(),
  /** First-class educational page type (Phase 1 layered model). */
  contentType: ContentTypeSchema.optional(),
  layoutTemplate: LayoutTemplateIdSchema,
  layoutReferenceId: z.string().min(1).optional(),
  imageSubject: z.string().min(1),
  imagePrompt: z.string().optional(),
  bodyMarkdown: z.string().min(1),
  warnings: z.array(z.string()).default([]),
  // ── Standard v1.1 subject + badge metadata (optional; filled by the
  //    deterministic extractor, never by the image model). ──
  /** Illustration subject ONLY — no warnings, tags, or editorial markup. */
  cleanSubject: z.string().optional(),
  /** Usage/hazard badges, most-severe-first; [] or ['NONE'] when none apply. */
  hazard: z.array(HazardBadgeSchema).optional(),
  /** Where the subject lives. Defaults to GENERAL on concept pages. */
  region: RegionBadgeSchema.optional(),
  /** Source confidence. Defaults to GENERAL_REFERENCE. */
  sourceConfidence: SourceBadgeSchema.optional(),
  /** Resolved ordered badge set the renderer stamps (region, hazard…, source). */
  badgeSet: z.array(BadgeSchema).optional(),
});

// â”€â”€ Manifest generation (Stage 1.5) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Schema Claude returns via tool-call. Kept deliberately flat and simple so the
// model produces it reliably; the pipeline maps it into book/chapter/page rows.

export const GeneratedEntrySchema = z.object({
  entryTitle: z.string().min(1),
  scientificName: z.string().optional(),
  category: z.string().optional(),
  contentType: ContentTypeSchema.optional(),
  imageSubject: z.string().min(1),
  layoutTemplate: LayoutTemplateIdSchema.default('LAYOUT_1_STANDARD'),
  bodyMarkdown: z.string().min(1),
});

export const GeneratedChapterSchema = z.object({
  chapterNumber: z.number().int().positive(),
  chapterTitle: z.string().min(1),
  entries: z.array(GeneratedEntrySchema).min(1),
});

export const ManifestGenerationResultSchema = z.object({
  bookTitle: z.string().min(1),
  chapters: z.array(GeneratedChapterSchema).min(1),
});

export const BookManifestSchema = z.object({
  bookTitle: z.string().min(1),
  totalChapters: z.number().int().nonnegative(),
  totalEntries: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  totalImagesNeeded: z.number().int().nonnegative(),
  chapters: z.array(
    z.object({
      chapterNumber: z.number().int().positive(),
      chapterTitle: z.string().min(1),
      entryCount: z.number().int().nonnegative(),
    }),
  ),
});

export const ChapterManifestSchema = z.object({
  chapterNumber: z.number().int().positive(),
  chapterTitle: z.string().min(1),
  pageKeys: z.array(z.string().min(1)),
});

export type GeneratedEntry = z.infer<typeof GeneratedEntrySchema>;
export type GeneratedChapter = z.infer<typeof GeneratedChapterSchema>;
export type ManifestGenerationResult = z.infer<typeof ManifestGenerationResultSchema>;
export type BookManifest = z.infer<typeof BookManifestSchema>;
export type ChapterManifest = z.infer<typeof ChapterManifestSchema>;

export const LayoutReferenceSchema = z.object({
  id: z.string().min(1),
  templateId: LayoutTemplateIdSchema,
  imagePath: z.string().min(1),
  label: z.string().min(1),
  useWhen: z.array(z.string()).min(1),
  promptTemplate: z.string().min(1).optional(),
  placeholders: z.array(z.string().min(1)).default([]),
  imageSlotDescription: z.string().optional(),
  minWords: z.number().int().nonnegative().optional(),
  maxWords: z.number().int().positive().optional(),
  contentTypes: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export const KnowledgeItemSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  type: KnowledgeItemTypeSchema,
  title: z.string(),
  summary: z.string().nullable(),
  status: KnowledgeStatusSchema,
  scope: KnowledgeScopeSchema,
  ownerName: z.string().nullable(),
  tags: z.array(z.string()),
  metadata: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const KnowledgeEvidenceSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  evidenceType: EvidenceTypeSchema,
  title: z.string(),
  uri: z.string().nullable(),
  storagePath: z.string().nullable(),
  sha256: z.string().nullable(),
  mimeType: z.string().nullable(),
  notes: z.string().nullable(),
  metadata: z.record(z.unknown()),
  createdAt: z.string(),
});

export const KnowledgeLinkSchema = z.object({
  id: z.string().uuid(),
  sourceItemId: z.string().uuid(),
  targetItemId: z.string().uuid(),
  relationType: KnowledgeRelationTypeSchema,
  note: z.string().nullable(),
  createdAt: z.string(),
});

export const KnowledgeEventSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  eventType: z.string(),
  actorName: z.string().nullable(),
  summary: z.string(),
  previousValue: z.record(z.unknown()).nullable(),
  nextValue: z.record(z.unknown()).nullable(),
  createdAt: z.string(),
});

export const KnowledgeOverviewSchema = z.object({
  totals: z.object({
    experiments: z.number(),
    decisions: z.number(),
    standards: z.number(),
    sops: z.number(),
    costRecords: z.number(),
    printReviews: z.number(),
    lessons: z.number(),
  }),
  lockedStandards: z.number(),
  openExperiments: z.number(),
  recentItems: z.array(KnowledgeItemSchema),
});

export const CreateKnowledgeBaseSchema = z.object({
  projectId: z.string().uuid().optional(),
  title: z.string().min(1),
  summary: z.string().optional(),
  scope: KnowledgeScopeSchema.default('GLOBAL'),
  ownerName: z.string().optional(),
  tags: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.unknown()).default({}),
});

export const CreateExperimentRequestSchema = CreateKnowledgeBaseSchema.extend({
  hypothesis: z.string().min(1),
  testPerformed: z.string().min(1),
  result: z.string().optional(),
  conclusion: z.string().optional(),
  status: KnowledgeStatusSchema.default('RUNNING'),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
});

export const CreateDecisionRequestSchema = CreateKnowledgeBaseSchema.extend({
  decision: z.string().min(1),
  reason: z.string().min(1),
  status: KnowledgeStatusSchema.default('ACCEPTED'),
  acceptedAt: z.string().datetime().optional(),
  supersededByItemId: z.string().uuid().optional(),
});

export const CreateStandardRequestSchema = CreateKnowledgeBaseSchema.extend({
  domain: z.string().min(1),
  standardKey: z.string().min(1),
  value: z.record(z.unknown()),
  rationale: z.string().min(1),
  status: KnowledgeStatusSchema.default('LOCKED'),
  effectiveAt: z.string().datetime().optional(),
});

export const CreateSopRequestSchema = CreateKnowledgeBaseSchema.extend({
  workflowName: z.string().min(1),
  bodyMarkdown: z.string().min(1),
  checklist: z.array(z.string().min(1)).default([]),
  changeNotes: z.string().optional(),
  status: KnowledgeStatusSchema.default('ACCEPTED'),
});

export const CreateLessonRequestSchema = CreateKnowledgeBaseSchema.extend({
  lesson: z.string().min(1),
  prevention: z.string().optional(),
  appliesTo: z.array(z.string().min(1)).default([]),
  status: KnowledgeStatusSchema.default('ACCEPTED'),
});

export const CreatePrintReviewRequestSchema = CreateKnowledgeBaseSchema.extend({
  proofName: z.string().min(1),
  vendor: z.string().min(1).default('KDP'),
  format: z.string().min(1).default('Premium color proof'),
  orderedAt: z.string().datetime().optional(),
  receivedAt: z.string().datetime().optional(),
  overallStatus: z.string().min(1).default('OPEN'),
  status: KnowledgeStatusSchema.default('RUNNING'),
});

export const CreatePrintFindingRequestSchema = z.object({
  printReviewItemId: z.string().uuid(),
  relatedItemId: z.string().uuid().optional(),
  severity: PrintFindingSeveritySchema,
  category: PrintFindingCategorySchema,
  pageKey: z.string().optional(),
  layoutTemplate: LayoutTemplateIdSchema.optional(),
  finding: z.string().min(1),
  recommendation: z.string().optional(),
  status: z.string().min(1).default('OPEN'),
});

export const CreateCostEventRequestSchema = CreateKnowledgeBaseSchema.extend({
  pageId: z.string().uuid().optional(),
  provider: z.string().min(1),
  model: z.string().optional(),
  operation: CostOperationSchema,
  quantity: z.number().nonnegative().default(1),
  unitCostUsd: z.number().nonnegative().optional(),
  costUsd: z.number().nonnegative(),
  incurredAt: z.string().datetime().optional(),
});

export const CreateKnowledgeEvidenceRequestSchema = z.object({
  itemId: z.string().uuid(),
  evidenceType: EvidenceTypeSchema,
  title: z.string().min(1),
  uri: z.string().optional(),
  storagePath: z.string().optional(),
  sha256: z.string().optional(),
  mimeType: z.string().optional(),
  notes: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const CreateKnowledgeLinkRequestSchema = z.object({
  sourceItemId: z.string().uuid(),
  targetItemId: z.string().uuid(),
  relationType: KnowledgeRelationTypeSchema,
  note: z.string().optional(),
});

export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  statusCode: z.number().int(),
});

export type Brand = z.infer<typeof BrandSchema>;
export type Audience = z.infer<typeof AudienceSchema>;
export type Edition = z.infer<typeof EditionSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type ManifestKind = z.infer<typeof ManifestKindSchema>;
export type PageStatus = z.infer<typeof PageStatusSchema>;
export type ImageStatus = z.infer<typeof ImageStatusSchema>;
export type JobType = z.infer<typeof JobTypeSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type ExportKind = z.infer<typeof ExportKindSchema>;
export type ExportStatus = z.infer<typeof ExportStatusSchema>;
export type KnowledgeItemType = z.infer<typeof KnowledgeItemTypeSchema>;
export type KnowledgeStatus = z.infer<typeof KnowledgeStatusSchema>;
export type KnowledgeScope = z.infer<typeof KnowledgeScopeSchema>;
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;
export type KnowledgeRelationType = z.infer<typeof KnowledgeRelationTypeSchema>;
export type PrintFindingSeverity = z.infer<typeof PrintFindingSeveritySchema>;
export type PrintFindingCategory = z.infer<typeof PrintFindingCategorySchema>;
export type CostOperation = z.infer<typeof CostOperationSchema>;
export type LayoutTemplateId = z.infer<typeof LayoutTemplateIdSchema>;
export type TrimSize = z.infer<typeof TrimSizeSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type PageManifest = z.infer<typeof PageManifestSchema>;
export type LayoutReference = z.infer<typeof LayoutReferenceSchema>;
export type LayoutPromptAsset = z.infer<typeof LayoutPromptAssetSchema>;
export type KnowledgeItem = z.infer<typeof KnowledgeItemSchema>;
export type KnowledgeEvidence = z.infer<typeof KnowledgeEvidenceSchema>;
export type KnowledgeLink = z.infer<typeof KnowledgeLinkSchema>;
export type KnowledgeEvent = z.infer<typeof KnowledgeEventSchema>;
export type KnowledgeOverview = z.infer<typeof KnowledgeOverviewSchema>;
export type CreateExperimentRequest = z.infer<typeof CreateExperimentRequestSchema>;
export type CreateDecisionRequest = z.infer<typeof CreateDecisionRequestSchema>;
export type CreateStandardRequest = z.infer<typeof CreateStandardRequestSchema>;
export type CreateSopRequest = z.infer<typeof CreateSopRequestSchema>;
export type CreateLessonRequest = z.infer<typeof CreateLessonRequestSchema>;
export type CreatePrintReviewRequest = z.infer<typeof CreatePrintReviewRequestSchema>;
export type CreatePrintFindingRequest = z.infer<typeof CreatePrintFindingRequestSchema>;
export type CreateCostEventRequest = z.infer<typeof CreateCostEventRequestSchema>;
export type CreateKnowledgeEvidenceRequest = z.infer<typeof CreateKnowledgeEvidenceRequestSchema>;
export type CreateKnowledgeLinkRequest = z.infer<typeof CreateKnowledgeLinkRequestSchema>;
