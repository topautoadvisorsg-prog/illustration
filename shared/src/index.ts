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
]);

// ── Layered layout model (Phase 1) ─────────────────────────────────────────
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
]);

/** How MUCH of the page the imagery occupies (percent buckets). */
export const CoverageSchema = z.union([
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
]);

export type ContentType = z.infer<typeof ContentTypeSchema>;
export type Coverage = z.infer<typeof CoverageSchema>;
export type Architecture = z.infer<typeof ArchitectureSchema>;

export const TrimSizeSchema = z.object({
  widthIn: z.number().positive(),
  heightIn: z.number().positive(),
  bleedIn: z.number().nonnegative(),
});

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
  imageModel: z.string().min(1).default('gpt-image-1'),
  upscaleModel: z.string().min(1).default('Replicate Real-ESRGAN'),
});

export const LayoutPolicySchema = z.object({
  layoutReferenceSet: z.string().min(1).default('wildlands-layout-references-v1'),
  textFitFirst: z.boolean().default(true),
  chapterByChapterRender: z.boolean().default(true),
  defaultTemplate: LayoutTemplateIdSchema.default('LAYOUT_1_STANDARD'),
  longTextTemplate: LayoutTemplateIdSchema.default('LAYOUT_2_TEXT_HEAVY'),
  comparisonTemplate: LayoutTemplateIdSchema.default('LAYOUT_4_DANGER_WARNING'),
});

export const LayoutPromptAssetSchema = z.object({
  templateId: LayoutTemplateIdSchema,
  label: z.string().min(1),
  mockupImagePath: z.string().min(1),
  mockupImageDataUrl: z.string().optional(),
  layoutDescription: z.string().min(1).default('Written description of the layout structure.'),
  useCases: z.array(z.string().min(1)).default([]),
  avoidWhen: z.array(z.string().min(1)).default([]),
  textZoneDescription: z.string().min(1).default('Describe where manuscript text fits on this layout.'),
  imageZoneDescription: z.string().min(1).default('Describe where generated subject art fits on this layout.'),
  capacityNotes: z.string().default(''),
  minWords: z.number().int().nonnegative().default(0),
  targetWords: z.number().int().nonnegative().default(250),
  maxWords: z.number().int().positive().default(400),
  recommendedBodyPt: z.number().positive().default(11),
  recommendedLineHeight: z.number().positive().default(1.28),
  promptTemplate: z.string().min(1),
  placeholders: z.array(z.string().min(1)).default(['{MASTER_STYLE_DNA}', '{SUBJECT}', '{SCIENTIFIC_DETAILS}', '{COMPOSITION_NOTES}']),
  textFitRule: z.string().min(1).default('Fit manuscript text into this mockup before image generation.'),
  imageSlotDescription: z.string().min(1).default('Replace mockup art with generated subject illustration after text fit approval.'),
  capacityTestStatus: z.enum(['UNTESTED', 'TESTING', 'APPROVED']).default('UNTESTED'),
  operatorNotes: z.string().default(''),
});

export const OutputProfileSchema = z.object({
  printEdition: z.literal('PREMIUM').default('PREMIUM'),
  ebookEdition: z.literal('KINDLE_EPUB').default('KINDLE_EPUB'),
  renderEngine: z.literal('PUPPETEER_PAGEDJS').default('PUPPETEER_PAGEDJS'),
  pdfTarget: z.string().min(1).default('KDP premium color hardcover'),
});

export const ProjectConfigSchema = z.object({
  brand: BrandSchema.default('THE_WILDLANDS'),
  audience: AudienceSchema.default('ADULT'),
  editions: z.array(EditionSchema).default(['PREMIUM', 'KINDLE_EPUB']),
  volume: z.number().int().positive(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  authorName: z.string().min(1),
  trimSize: TrimSizeSchema.default({ widthIn: 7, heightIn: 10, bleedIn: 0.125 }),
  typography: TypographyConfigSchema.default({}),
  colorPalette: ColorPaletteSchema.default({}),
  imageGeneration: ImageGenerationConfigSchema.default({}),
  layoutPolicy: LayoutPolicySchema.default({}),
  layoutPromptAssets: z.array(LayoutPromptAssetSchema).default([]),
  outputProfile: OutputProfileSchema.default({}),
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

export const PageManifestSchema = z.object({
  pageId: z.string().min(1),
  projectId: z.string().uuid().optional(),
  chapterNumber: z.number().int().positive(),
  pageNumber: z.number().int().positive(),
  entryTitle: z.string().min(1),
  scientificName: z.string().optional(),
  /** Entry classification from Stage 1.5 (e.g. EDIBLE, TOXIC) — drives danger layout. */
  category: z.string().optional(),
  /** First-class educational page type (Phase 1 layered model). */
  contentType: ContentTypeSchema.optional(),
  layoutTemplate: LayoutTemplateIdSchema,
  layoutReferenceId: z.string().min(1).optional(),
  imageSubject: z.string().min(1),
  imagePrompt: z.string().optional(),
  bodyMarkdown: z.string().min(1),
  warnings: z.array(z.string()).default([]),
});

// ── Manifest generation (Stage 1.5) ────────────────────────────────────────
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
