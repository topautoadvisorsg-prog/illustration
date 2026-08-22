import { z } from 'zod';

export const SHARED_VERSION = '0.1.0';

export const BrandSchema = z.literal('THE_WILDLANDS');
export const AudienceSchema = z.literal('ADULT');
export const EditionSchema = z.enum(['PREMIUM', 'KINDLE_EPUB']);

/**
 * LOCAL LAYOUT OVERRIDE — the closed, safe set of things an operator may change
 * about ONE block of ONE book.
 *
 * Deliberately not a stylesheet. Every property here is a spacing or
 * page-breaking decision a typesetter makes by hand on a problem page, with a
 * bounded value. There is no `css` field and there never will be: an arbitrary
 * style hook would become a second, unversioned layout system competing with
 * the layout standard, which is the exact problem the standard was built to
 * solve. Anything needed on more than a couple of blocks is evidence of a
 * SYSTEMIC gap and belongs in the standard instead.
 *
 * There is likewise no text field. The manuscript is frozen; an override
 * changes how a block is SET, never what it says.
 */

/**
 * A B&W illustration stamped onto a finished page.
 *
 * IDENTITY IS THE BLOCK, NEVER THE PAGE NUMBER. An illustration is anchored to
 * the stable id of the last block on the page it decorates, and its page is
 * RESOLVED on every build. Pagination moved four times during this book's QA;
 * anything page-keyed would by now be pointing at unrelated content.
 *
 * Placement is stored as a physical SIZE, not a box. The safe region is
 * recomputed from wherever the type actually ends on the resolved page and the
 * illustration is centred inside it, so art approved at a given size keeps that
 * size, and its native resolution, even if the page around it changes.
 *
 * The asset never enters the HTML. It is stamped onto the completed PDF, so it
 * cannot reflow a line, and removing it restores the untouched typeset page.
 */
export const PageIllustrationSchema = z
  .object({
    /** Storage key of the asset as generated, kept so a replacement can be compared. */
    rawAssetPath: z.string().min(1),
    /** Storage key of the asset actually stamped. */
    approvedAssetPath: z.string().min(1),
    /** Bumped on every replacement so a cached render cannot serve stale art. */
    version: z.number().int().min(1).default(1),
    /** Native pixels of the generated asset. The resolution authority. */
    nativeWidthPx: z.number().int().positive(),
    nativeHeightPx: z.number().int().positive(),
    /** Printed size. Native pixels over this is the only honest ppi figure. */
    placementWidthIn: z.number().positive(),
    placementHeightIn: z.number().positive(),
    status: z.enum(['draft', 'approved']).default('draft'),
    /** What produced it, so a replacement can start from the same brief. */
    prompt: z.string().optional(),
    model: z.string().optional(),
    styleDnaId: z.string().optional(),
    subject: z.string().optional(),
    note: z.string().optional(),
    createdAt: z.string().optional(),
  })
  .strict();

export type PageIllustration = z.infer<typeof PageIllustrationSchema>;

export const LayoutOverrideSchema = z
  .object({
    /** Extra space above the block, in em. Bounded: this is a nudge, not a layout. */
    spaceBeforeEm: z.number().min(-2).max(6).optional(),
    /** Extra space below the block, in em. */
    spaceAfterEm: z.number().min(-2).max(6).optional(),
    /** Never end a page immediately after this block (`break-after: avoid`). */
    keepWithNext: z.boolean().optional(),
    /** Never split this block across a page (`break-inside: avoid`). */
    keepTogether: z.boolean().optional(),
    /** Force or forbid a page break before this block. */
    breakBefore: z.enum(['auto', 'page', 'avoid']).optional(),
    /** Force or forbid a page break after this block. */
    breakAfter: z.enum(['auto', 'page', 'avoid']).optional(),
    /**
     * An APPROVED variant of the block's component, not free styling. Only
     * variants the layout standard defines are honoured; anything else is
     * reported as unknown rather than silently applied.
     */
    variant: z.enum(['compact', 'roomy', 'closing-beat']).optional(),
    /** Why this exception exists — for whoever regenerates the book next. */
    note: z.string().max(300).optional(),
  })
  .strict();
export type LayoutOverride = z.infer<typeof LayoutOverrideSchema>;

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
  // Layout E — BALANCED ~25%: a contained natural-history illustration band
  // across the top, a clean centered reading field filling the rest below it.
  // The middle ground between the 12% small-accent (LAYOUT_2_TEXT_HEAVY) and the
  // 50% band (LAYOUT_B) — for pages that need a real, meaningful illustration
  // without compressing the text or leaving dead parchment.
  'LAYOUT_E_BAND_BALANCED',
  // Layout F — FULL-PAGE STANDARD: full-bleed illustration over the whole page,
  // body text in a centered contained panel (text sizes down to fit; art never
  // shrinks). The reusable "full page with readable centered text" standard.
  'LAYOUT_F_FULL_PAGE_CENTERED',
  // Layout G — FRAMED BANDS: a mandatory illustration band at the TOP and another
  // at the BOTTOM (the model fails top/bottom on its own), text boxed in the middle
  // sized down to fit. Forces illustration all around dense text pages.
  'LAYOUT_G_FRAMED_BANDS',
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
  // Digest 5.5x8.5 — the standard middle-grade / young-teen trim. Regular trim
  // (full KDP royalty). Selected as the working trim for text-first B&W
  // nonfiction; see CHAPTER_BOOK_STANDARD.md. NOT a global default: the
  // Wildlands field guides stay on HARDCOVER_7X10.
  'PAPERBACK_DIGEST_5_5X8_5',
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
  PAPERBACK_DIGEST_5_5X8_5: {
    format: 'PAPERBACK_DIGEST_5_5X8_5',
    label: 'Paperback Digest 5.5 x 8.5',
    typographyPackage: 'Text-First Digest',
    // Bleed 0: illustrations sit INSIDE the margins with white around them, so
    // nothing runs to the trim. If any illustration ever bleeds, the whole file
    // needs 0.125 bleed (CHAPTER_BOOK_STANDARD.md §1).
    trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
    typography: { bodyPt: 12, lineHeight: 1.3 },
    outputProfile: {
      printEdition: 'PREMIUM',
      ebookEdition: 'KINDLE_EPUB',
      renderEngine: 'PUPPETEER_PAGEDJS',
      pdfTarget: 'KDP black & white paperback 5.5 x 8.5 (digest)',
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
/**
 * Default accuracy note for health/safety titles.
 *
 * Deliberately describes what was DONE — research and cross-checking against
 * published guidance — and claims nothing about a named professional having
 * read the manuscript. Any book that has had a real review should say so
 * explicitly, with the reviewer named.
 */
export const DEFAULT_ACCURACY_NOTE =
  'Medical accuracy: Health information in this book was researched and cross-checked against guidance ' +
  'from established pediatric and medical organizations and physician-reviewed sources.';

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
  /**
   * The rights sentence on the copyright page.
   *
   * Absent falls back to the long "no part of this book may be reproduced…"
   * boilerplate in `front-matter.ts`. Present replaces it outright, because
   * "All rights reserved." on its own is a deliberate choice on some books and
   * there was previously no way to say it without editing the renderer.
   */
  rightsStatement: z.string().optional(),
  /**
   * The copyright line printed verbatim, replacing the generated
   * "Copyright (c) <year> <author>". For a book whose rights holder is not
   * its byline, or which words the line its own way.
   */
  copyrightLine: z.string().optional(),
  edition: z.string().default('First Edition'),
  isbn: z.object({ print: z.string().optional(), ebook: z.string().optional() }).optional(),
  printedIn: z.string().optional(),
  dedication: z.string().optional(),
  disclaimers: z.array(z.string()).default([]),
  /**
   * ACCURACY NOTE — an optional front-matter line for books that make health,
   * safety or other claims a reader could act on.
   *
   * Off by default. Editable per book, because the honest wording depends
   * entirely on what was actually done: a book cross-checked against published
   * guidance and a book read by a named paediatrician are different claims and
   * must not share a sentence.
   *
   * ─── THE GUARD ────────────────────────────────────────────────────────────
   * "Medically reviewed by" is a statement about a person. It is refused unless
   * `reviewerName` names one. This is enforced in the SCHEMA rather than in the
   * form, so it holds for the API, a script, and a future UI equally — the
   * claim is a liability, and a validation that only lives in a textarea is not
   * a control.
   */
  accuracyNote: z
    .object({
      enabled: z.boolean().default(false),
      text: z.string().default(DEFAULT_ACCURACY_NOTE),
      /** The actual professional who reviewed it, when one did. */
      reviewerName: z.string().optional(),
      reviewerCredentials: z.string().optional(),
    })
    .superRefine((v, ctx) => {
      const claimsReview = /medical(ly)?\s+(review|vetted|approved|checked)|reviewed\s+by\s+(a\s+)?(doctor|physician|paediatrician|pediatrician|md\b)/i.test(
        v.text,
      );
      if (claimsReview && !v.reviewerName?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['text'],
          message:
            'This note claims a medical professional reviewed the book. Name them in reviewerName, or remove the claim. ' +
            'Saying a book was medically reviewed when nobody reviewed it is a false statement about a health product.',
        });
      }
    })
    .default({ enabled: false, text: DEFAULT_ACCURACY_NOTE }),
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
  // Back-cover copy for the full-wrap cover. Three SEPARATE pieces so the cover
  // hierarchy reaches the AI as distinct information: the main sales paragraph,
  // the "Inside This Volume" feature list, and a short author note. `hooks` is
  // the legacy flat form, still honoured for older projects.
  bookDescription: z
    .object({
      hooks: z.array(z.string()).optional(),
      blurb: z.string().optional(),
      features: z.array(z.string()).optional(),
      authorBio: z.string().optional(),
    })
    .optional(),
  aiIntroduction: z.object({ enabled: z.boolean().default(false) }).default({ enabled: false }),
  /** Front-cover descriptive line (e.g. "A Field Guide to ..."). Data-driven, per book. */
  coverDescription: z.string().optional(),
  /**
   * Operator art-direction for the full-wrap cover SCENE (back · spine · front).
   * When set, it replaces the generic "establishing scene evoked by the title"
   * so the cover can be a specific, premium, curated wrap (e.g. a hero animal on
   * the front, a secondary animal on the back, a panorama between). Typography is
   * still driven by the title/author/series fields, not this text.
   */
  coverArtDirection: z.string().optional(),
  /** The CURRENT cover artwork. Points at whichever version is selected. */
  coverAssetPath: z.string().optional(),
  /**
   * COVER VERSION HISTORY.
   *
   * Until now the only way artwork could become the cover was a paid
   * generation: `generateCoverWrapArtwork` wrote the asset and nothing else
   * did. So a cover fixed outside the pipeline could never get back IN, and the
   * console went on showing a superseded generation as if it were current.
   *
   * Every version is kept and none is overwritten, because the reason a cover
   * gets replaced is usually a defect found late, and the previous one is the
   * thing you fall back to when the replacement is worse.
   */
  coverVersions: z
    .array(
      z.object({
        version: z.number().int().positive(),
        assetPath: z.string().min(1),
        source: z.enum(['generated', 'uploaded']),
        widthPx: z.number().int().positive(),
        heightPx: z.number().int().positive(),
        createdAt: z.string(),
        note: z.string().optional(),
        /** Which version was current when this one arrived, for provenance. */
        replacedVersion: z.number().int().positive().optional(),
        /**
         * The interior page count this wrap's spine was sized for.
         *
         * Carried per version so switching back to an older cover also restores
         * the right `coverSync`. Without it, selecting version 1 after
         * uploading version 2 leaves the export gate certifying version 2's
         * page count while version 1's artwork is what ships — a wrong spine
         * that passes the check. Optional because versions recorded before this
         * field existed genuinely do not know.
         */
        builtForPageCount: z.number().int().positive().optional(),
        spineIn: z.number().positive().optional(),
      }),
    )
    .default([]),
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
 * page, and series page: "[SERIES NAME] — SERIES [Roman]". Fully data-driven —
 * returns null when no series name is set (nothing book-specific in code).
 * The em dash here is the established branding style (matches earlier
 * volumes) — do not "fix" it to a colon. The no-em-dash rule applies to
 * back-cover prose (blurb/bio paragraphs), not this short branding line.
 */
export function buildSeriesLine(seriesName?: string | null, volume?: number | null): string | null {
  const name = (seriesName ?? '').trim();
  if (!name) return null;
  const roman = volume != null ? toRoman(volume) : '';
  return roman ? `${name.toUpperCase()} — SERIES ${roman}` : name.toUpperCase();
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

/** The structured back-cover copy as the AI cover wrap consumes it: three
 *  distinct pieces (main description, "Inside This Volume" feature list, author
 *  note). Falls back to legacy `hooks` as the main description. Returns null
 *  when no copy of any kind is set. */
export interface BackCoverCopy {
  mainDescription?: string;
  insideThisVolume?: string[];
  authorBio?: string;
}
type BookDescription = {
  hooks?: string[];
  blurb?: string;
  features?: string[];
  authorBio?: string;
};
export function buildBackCoverCopy(bd?: BookDescription | null): BackCoverCopy | null {
  if (!bd) return null;
  const mainDescription = (bd.blurb ?? '').trim() || (bd.hooks?.length ? bd.hooks.join(' ').trim() : '');
  const insideThisVolume = (bd.features ?? []).map((f) => f.trim()).filter(Boolean);
  const authorBio = (bd.authorBio ?? '').trim();
  if (!mainDescription && insideThisVolume.length === 0 && !authorBio) return null;
  const out: BackCoverCopy = {};
  if (mainDescription) out.mainDescription = mainDescription;
  if (insideThisVolume.length) out.insideThisVolume = insideThisVolume;
  if (authorBio) out.authorBio = authorBio;
  return out;
}

/** Flatten back-cover copy into display lines — for the interior back-cover
 *  copy asset and the legacy HTML cover. The AI wrap uses buildBackCoverCopy()
 *  directly so it understands the hierarchy. */
export function backCoverLines(bd?: BookDescription | null): string[] {
  const c = buildBackCoverCopy(bd);
  if (!c) return [];
  const lines: string[] = [];
  if (c.mainDescription) lines.push(c.mainDescription);
  if (c.insideThisVolume?.length) lines.push('Inside this volume:', ...c.insideThisVolume.map((f) => `• ${f}`));
  if (c.authorBio) lines.push(c.authorBio);
  return lines;
}

export const ProjectConfigSchema = z.object({
  brand: BrandSchema.default('THE_WILDLANDS'),
  audience: AudienceSchema.default('ADULT'),
  /**
   * BOOK PRODUCTION PROFILE — the single switch that says "what kind of book is
   * this?". Resolved through the production-profile registry
   * (`pipeline/production-profiles/registry.ts`), exactly like `styleDnaId` is
   * resolved through the Style DNA registry.
   *
   * Lives in the config JSONB deliberately. `brand` and `audience` are Postgres
   * ENUM columns (`brandEnum`, `audienceEnum`), so widening either one needs an
   * `ALTER TYPE` migration; the profile id needs none, and it is the real
   * switch. Widening brand/audience stays available later if we ever want to
   * query by them.
   *
   * Defaults to the field-guide profile so every existing project parses and
   * behaves byte-identically.
   */
  productionProfileId: z.string().min(1).default('wildlands-field-guide'),
  /**
   * PINNED TYPESET LAYOUT STANDARD — the versioned id this book's interior is
   * rendered against, e.g. `educational-nonfiction-typeset@1`.
   *
   * Written once, from the production profile, the first time the book is
   * typeset. After that it is the project's, not the profile's: registering an
   * improved `@2` must never silently re-render a book that was approved on
   * `@1`, because the operator would have no way to tell the design had moved.
   * Upgrading is an explicit action that rewrites this field.
   *
   * Optional so every existing project parses unchanged; absent means "not yet
   * typeset", and the first render pins it.
   */
  typesetLayoutStandardId: z.string().min(1).optional(),
  /**
   * CHAPTER-START POLICY for the typeset track.
   *
   * false (default): chapter 1 opens recto, every later chapter starts on the
   * next available page. true: every chapter is forced onto a right-hand page,
   * which inserts a blank before roughly half of them.
   *
   * It lives on the BOOK because it changes the page count, and the page count
   * sizes the spine. It used to exist only as a preview query parameter, so the
   * interior, the cover and the export could each be built under a different
   * policy and none of them would notice; that is a mis-printed spine, not a
   * bug in a preview.
   */
  typesetChaptersStartRecto: z.boolean().default(false),
  /**
   * LOCAL LAYOUT OVERRIDES — per-block exceptions to the pinned standard.
   *
   * Keyed by stable block id (see `pipeline/typeset/block-identity.ts`), NEVER
   * by page number: pagination moved four times during this book's QA and any
   * page-keyed override would have silently re-pointed at unrelated content.
   *
   * Per-project on purpose, so an exception travels with the book it was made
   * for and cannot leak into the reusable standard. The rule this enforces:
   *
   *     systemic defect -> fix the layout standard
   *     isolated defect -> local override
   *     manuscript      -> frozen, always
   */
  layoutOverrides: z.record(z.string(), LayoutOverrideSchema).default({}),
  /**
   * Illustrations, keyed by the stable block id they are anchored to. Same
   * reasoning as layoutOverrides above: never keyed by page.
   */
  illustrations: z.record(z.string(), PageIllustrationSchema).default({}),
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
  /**
   * Interior paper stock. Drives SPINE WIDTH, and nothing else.
   *
   * KDP: white 0.002252in per page, cream 0.0025in. On a 154-page book that is
   * a 0.038in difference - enough to pull the front artwork around the fold, and
   * invisible in the file. It was hardcoded to white, which was correct for the
   * one book that had shipped and wrong for any book printed on cream.
   *
   * Defaults to white so every existing project keeps the geometry it was built
   * and proofed with.
   */
  paperStock: z.enum(['white', 'cream']).default('white'),
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
  /**
   * BOOK INTAKE provenance, set by `POST /api/books/intake`.
   *
   * `briefHash` makes intake idempotent: re-posting the same brief and
   * manuscript returns the project it already created instead of a twin. This
   * schema is not `.strict()`, so unknown keys are STRIPPED rather than
   * rejected — a hash parked here without a declared field would vanish on the
   * first config parse and every retry would make another book.
   */
  intake: z
    .object({
      briefHash: z.string().min(1),
      takenInAt: z.string(),
    })
    .optional(),
});

export const CreateProjectRequestSchema = z.object({
  config: ProjectConfigSchema,
});

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  brand: BrandSchema,
  audience: AudienceSchema,
  title: z.string(),
  subtitle: z.string().nullable(),
  authorName: z.string().nullable(),
  status: ProjectStatusSchema,
  manuscriptPath: z.string().nullable(),
  /** Hash of the DERIVED WORKING manuscript — what production reads. */
  manuscriptSha256: z.string().nullable().optional(),
  /** Hash of the CANONICAL SOURCE artifact — the operator's uploaded bytes.
   *  This is the value an author freezes and quotes. Null on projects ingested
   *  before canonical retention existed. */
  canonicalManuscriptSha256: z.string().nullable().optional(),
  /** True when sanitization changed something, so working != source. */
  manuscriptSanitized: z.boolean().nullable().optional(),
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

/** One field-level validation problem, translated into operator-facing language. */
export const ApiErrorFieldSchema = z.object({
  /** Dot-joined path into the request body, e.g. "config.authorName". */
  path: z.string(),
  /** Human label matching the on-screen field, e.g. "Author / pen name". */
  label: z.string(),
  /** Plain-English sentence, never a schema path or raw Zod message. */
  message: z.string(),
  /** Stable code (e.g. "WL-1002") for logs/support/docs — see docs/ERROR_HANDLING_STANDARD.md. */
  errorCode: z.string().optional(),
});

/**
 * Optional follow-up the UI can offer the operator (e.g. "Return to Manuscript").
 * Standardized shape every recoverable error should populate where it applies
 * (see docs/ERROR_HANDLING_STANDARD.md): explanation (why this happened, in
 * addition to the top-level message), destination (target + label, what
 * happens when clicked), and an optional docLink for a longer explanation.
 */
export const ApiErrorActionSchema = z.object({
  type: z.literal('navigate'),
  /** Step key (or route) the action navigates to. */
  target: z.string(),
  /** Button text, e.g. "Return to Manuscript". */
  label: z.string(),
  /** Optional one-line "why" shown alongside the button, when the top-level
   *  message alone doesn't make the next step obvious. */
  explanation: z.string().optional(),
  /** Optional link to a longer explanation (docs site, standard doc). Not
   *  used yet — reserved for when operator-facing docs exist online. */
  docLink: z.string().optional(),
});

export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  statusCode: z.number().int(),
  /** Per-field problems, when the error can be pinned to specific inputs. */
  fields: z.array(ApiErrorFieldSchema).optional(),
  /** A suggested next step for the operator, when one applies. */
  action: ApiErrorActionSchema.optional(),
  /** Stable top-level code for this error — see docs/ERROR_HANDLING_STANDARD.md. */
  errorCode: z.string().optional(),
  /** Unique per occurrence — ties a later "recovery clicked"/"recovery
   *  succeeded" telemetry event back to this specific error. */
  correlationId: z.string().optional(),
});

export type ApiErrorField = z.infer<typeof ApiErrorFieldSchema>;
export type ApiErrorAction = z.infer<typeof ApiErrorActionSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
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
