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
]);

export const TrimSizeSchema = z.object({
  widthIn: z.number().positive(),
  heightIn: z.number().positive(),
  bleedIn: z.number().nonnegative(),
});

export const ProjectConfigSchema = z.object({
  brand: BrandSchema.default('THE_WILDLANDS'),
  audience: AudienceSchema.default('ADULT'),
  editions: z.array(EditionSchema).default(['PREMIUM', 'KINDLE_EPUB']),
  volume: z.number().int().positive(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  authorName: z.string().min(1),
  trimSize: TrimSizeSchema.default({ widthIn: 8.5, heightIn: 11, bleedIn: 0.125 }),
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
  minWords: z.number().int().nonnegative().optional(),
  maxWords: z.number().int().positive().optional(),
  contentTypes: z.array(z.string()).default([]),
  notes: z.string().optional(),
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
export type LayoutTemplateId = z.infer<typeof LayoutTemplateIdSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type PageManifest = z.infer<typeof PageManifestSchema>;
export type LayoutReference = z.infer<typeof LayoutReferenceSchema>;
