import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const brandEnum = pgEnum('brand', ['THE_WILDLANDS']);
export const audienceEnum = pgEnum('audience', ['ADULT']);
export const projectStatusEnum = pgEnum('project_status', [
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
export const manifestKindEnum = pgEnum('manifest_kind', ['BOOK', 'CHAPTER', 'PAGE']);
export const pageStatusEnum = pgEnum('page_status', [
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
export const imageStatusEnum = pgEnum('image_status', [
  'GENERATED',
  'REVIEW',
  'APPROVED',
  'REJECTED',
  'UPSCALING',
  'PRINT_READY',
  'FAILED',
]);
// Pagination v1 — Stage 1.75. A printed page's role within its source entry.
// `opener`       = first printed page of an entry; carries the image subject.
// `continuation` = later printed pages of a multi-page entry; clean reading layout.
// `compacted`    = single printed page carrying multiple short adjacent entries.
export const pageRoleEnum = pgEnum('page_role', ['opener', 'continuation', 'compacted']);
// Front Matter v1 — which part of the book spine a page belongs to. BODY
// default keeps every existing row correct with zero backfill.
export const pageSectionEnum = pgEnum('page_section', ['FRONT_MATTER', 'BODY', 'BACK_MATTER']);
// Pagination v1 — how the assigned text fits the Reading Field for the printed page.
// PENDING = not yet computed. FITS / TIGHT / OVERFLOW / UNDERFILL per SPEC §5.5.
export const fitStatusEnum = pgEnum('fit_status', ['PENDING', 'FITS', 'TIGHT', 'OVERFLOW', 'UNDERFILL']);
// Pagination v1 — audit log of operator decisions on the Text-In-Reading-Field preview.
export const pageApprovalDecisionEnum = pgEnum('page_approval_decision', ['APPROVED', 'REJECTED', 'RESET']);
// Whole-page render (AI-first pipeline) — its own lifecycle, never shared with
// the legacy illustration-only `image_status`. Many versions may be APPROVED;
// exactly one per page may be approved_for_book + active.
export const wholePageRenderStatusEnum = pgEnum('whole_page_render_status', [
  'QUEUED',
  'RENDERING',
  'RENDERED',
  'APPROVED',
  'REJECTED',
  'FAILED',
]);
export const jobTypeEnum = pgEnum('job_type', ['image-generation', 'upscale', 'layout', 'pdf-compile', 'epub-export']);
export const jobStatusEnum = pgEnum('job_status', ['queued', 'active', 'completed', 'failed', 'dead-lettered']);
export const exportKindEnum = pgEnum('export_kind', ['PREMIUM_PDF', 'KINDLE_EPUB']);
export const exportStatusEnum = pgEnum('export_status', ['REQUESTED', 'RUNNING', 'READY', 'FAILED']);
export const knowledgeItemTypeEnum = pgEnum('knowledge_item_type', [
  'EXPERIMENT',
  'DECISION',
  'STANDARD',
  'SOP',
  'COST_RECORD',
  'PRINT_REVIEW',
  'LESSON',
]);
export const knowledgeStatusEnum = pgEnum('knowledge_status', [
  'DRAFT',
  'RUNNING',
  'CONCLUDED',
  'ACCEPTED',
  'REJECTED',
  'LOCKED',
  'SUPERSEDED',
  'ARCHIVED',
]);
export const knowledgeScopeEnum = pgEnum('knowledge_scope', ['GLOBAL', 'PROJECT', 'BOOK', 'CHAPTER', 'PAGE', 'LAYOUT', 'WORKFLOW']);
export const evidenceTypeEnum = pgEnum('knowledge_evidence_type', [
  'FILE',
  'URL',
  'SCREENSHOT',
  'PDF',
  'IMAGE',
  'NOTE',
  'COST_REPORT',
  'PROOF_PHOTO',
]);
export const knowledgeRelationTypeEnum = pgEnum('knowledge_relation_type', [
  'DERIVED_FROM',
  'PRODUCED_DECISION',
  'PROMOTED_TO_STANDARD',
  'UPDATES_SOP',
  'SUPERSEDES',
  'EVIDENCED_BY',
  'AFFECTS',
  'RELATED_TO',
]);
export const printFindingSeverityEnum = pgEnum('print_finding_severity', ['LOW', 'MEDIUM', 'HIGH', 'BLOCKER']);
export const printFindingCategoryEnum = pgEnum('print_finding_category', [
  'MARGIN',
  'TYPOGRAPHY',
  'IMAGE_QUALITY',
  'PAPER',
  'COVER',
  'KDP',
  'COLOR',
  'BINDING',
  'OTHER',
]);
export const costOperationEnum = pgEnum('cost_operation', [
  'LLM',
  'IMAGE_GENERATION',
  'UPSCALE',
  'PDF_RENDER',
  'EPUB_EXPORT',
  'STORAGE',
  'OTHER',
]);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  ...timestamps,
});

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'restrict' }),
  brand: brandEnum('brand').default('THE_WILDLANDS').notNull(),
  audience: audienceEnum('audience').default('ADULT').notNull(),
  volume: integer('volume').notNull(),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  authorName: text('author_name').notNull(),
  config: jsonb('config').notNull(),
  manuscriptPath: text('manuscript_path'),
  manuscriptSha256: text('manuscript_sha256'),
  status: projectStatusEnum('status').default('DRAFT').notNull(),
  ...timestamps,
});

export const manifests = pgTable(
  'manifests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: manifestKindEnum('kind').notNull(),
    version: integer('version').default(1).notNull(),
    externalId: text('external_id').notNull(),
    content: jsonb('content').notNull(),
    locked: boolean('locked').default(false).notNull(),
    ...timestamps,
  },
  (table) => ({
    projectKindExternalVersionIdx: uniqueIndex('manifests_project_kind_external_version_idx').on(
      table.projectId,
      table.kind,
      table.externalId,
      table.version,
    ),
  }),
);

export const pages = pgTable(
  'pages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    manifestId: uuid('manifest_id').references(() => manifests.id, { onDelete: 'restrict' }),
    pageKey: text('page_key').notNull(),
    chapterNumber: integer('chapter_number').notNull(),
    plannedPageNumber: integer('planned_page_number').notNull(),
    layoutTemplate: text('layout_template'),
    imagePrompt: text('image_prompt'),
    imagePromptSha256: text('image_prompt_sha256'),
    status: pageStatusEnum('status').default('PENDING').notNull(),
    // Pagination v1 — Stage 1.75. See SPEC_PAGINATION_V1.md §4.
    // `entryKey` points back to the opener page_key of the source entry; an
    // opener has `entryKey === pageKey`. Continuations share the opener's
    // entryKey but get suffixed pageKeys (e.g. CH01_P010_c1).
    entryKey: text('entry_key'),
    partN: integer('part_n').default(1).notNull(),
    totalParts: integer('total_parts').default(1).notNull(),
    pageRole: pageRoleEnum('page_role').default('opener').notNull(),
    carriesSubject: boolean('carries_subject').default(true).notNull(),
    // Per-PAGE image subject override (Stage 1.75 underfill recovery). A Type B
    // illustration-dominant continuation carries a DISTINCT secondary study of its
    // species (a different angle/detail from the opener). The render reads this as
    // a per-page override so the page never duplicates the opener's plate. Null for
    // ordinary pages, which fall back to the entry manifest's subject.
    imageSubject: text('image_subject'),
    compactedEntryKeys: jsonb('compacted_entry_keys'),
    readingFieldText: text('reading_field_text'),
    readingFieldChars: integer('reading_field_chars'),
    readingFieldWords: integer('reading_field_words'),
    fitStatus: fitStatusEnum('fit_status').default('PENDING').notNull(),
    previewApproved: boolean('preview_approved').default(false).notNull(),
    previewApprovedAt: timestamp('preview_approved_at', { withTimezone: true }),
    previewApprovedBy: text('preview_approved_by'),
    // ── Front Matter v1 (FRONT_MATTER_V1_SPEC.md) — additive, BODY default ──
    /** Spine section. Existing rows stay BODY with zero backfill. */
    section: pageSectionEnum('section').default('BODY').notNull(),
    /** Front/back-matter page kind (HALF_TITLE, TITLE_PAGE, COPYRIGHT_PAGE,
     *  DEDICATION, CONTENTS, INTRODUCTION, ABOUT_AUTHOR, ABOUT_SERIES,
     *  RESOURCES, BLANK). Null for BODY pages. Text (not enum) so v1.1 page
     *  kinds need no enum migration; zod validates at the boundary. */
    frontMatterType: text('front_matter_type'),
    /** Absolute order in the printed book. Assembly's single sort key:
     *  FRONT_MATTER < BODY < BACK_MATTER. Null for BODY (which keeps
     *  ordering by plannedPageNumber inside its section). */
    spineOrder: integer('spine_order'),
    /** The folio EXACTLY as printed ('i', 'iv', '1', '203', or null for
     *  unprinted folios — half title / title / copyright / blanks). */
    pageLabel: text('page_label'),
    ...timestamps,
  },
  (table) => ({
    projectPageKeyIdx: uniqueIndex('pages_project_page_key_idx').on(table.projectId, table.pageKey),
    projectStatusIdx: index('pages_project_status_idx').on(table.projectId, table.status),
    projectEntryKeyIdx: index('pages_project_entry_key_idx').on(table.projectId, table.entryKey),
    projectPreviewApprovedIdx: index('pages_project_preview_approved_idx').on(table.projectId, table.previewApproved),
  }),
);

// Pagination v1 — Stage 1.75. Audit log of operator decisions on the
// Text-In-Reading-Field preview. Every approve/reject/reset is logged so the
// "who said yes to spending image credits on this page" trail is durable.
export const pageApprovals = pgTable(
  'page_approvals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    decision: pageApprovalDecisionEnum('decision').notNull(),
    reason: text('reason'),
    decidedBy: text('decided_by').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pageDecidedAtIdx: index('page_approvals_page_decided_at_idx').on(table.pageId, table.decidedAt),
  }),
);

export const images = pgTable(
  'images',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    prompt: text('prompt').notNull(),
    promptSha256: text('prompt_sha256').notNull(),
    generatedPath: text('generated_path'),
    upscaledPath: text('upscaled_path'),
    dpiW: integer('dpi_w'),
    dpiH: integer('dpi_h'),
    widthPx: integer('width_px'),
    heightPx: integer('height_px'),
    active: boolean('active').default(false).notNull(),
    status: imageStatusEnum('status').default('GENERATED').notNull(),
    ...timestamps,
  },
  (table) => ({
    pageVersionIdx: uniqueIndex('images_page_version_idx').on(table.pageId, table.version),
    pageActiveIdx: index('images_page_active_idx').on(table.pageId, table.active),
  }),
);

// Whole-page render (AI-first pipeline). Mirrors the `images` versioning model
// but is a separate product (typography baked into the generated image). Lives
// alongside `images`; never mutates legacy state. Book assembly reads only rows
// where active=true AND approved_for_book=true. See SPEC_PRODUCTIONIZE.md.
export const wholePageRenders = pgTable(
  'whole_page_renders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: wholePageRenderStatusEnum('status').default('QUEUED').notNull(),
    // Inputs that produced this render — full audit trail.
    specJson: jsonb('spec_json').notNull(),
    assembledPrompt: text('assembled_prompt').notNull(),
    promptSha256: text('prompt_sha256').notNull(),
    standardVersion: text('standard_version').notNull(),
    // Output.
    imagePath: text('image_path'),
    specPath: text('spec_path'),
    promptPath: text('prompt_path'),
    // Blueprint auditability (SPEC_GEOMETRY_RECONCILIATION §4): the layout
    // blueprint handed to the model, kept for a complete render package.
    blueprintPath: text('blueprint_path'),
    widthPx: integer('width_px'),
    heightPx: integer('height_px'),
    model: text('model'),
    // Selection.
    active: boolean('active').default(false).notNull(),
    approvedForBook: boolean('approved_for_book').default(false).notNull(),
    // Print-prep (STD-3). Additive; null until print-prep runs for this render.
    printPngPath: text('print_png_path'),
    printPdfPath: text('print_pdf_path'),
    preflightPassed: boolean('preflight_passed'),
    // Decision trail.
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    // Error handling.
    attempts: integer('attempts').default(0).notNull(),
    errorMessage: text('error_message'),
    ...timestamps,
  },
  (table) => ({
    pageVersionIdx: uniqueIndex('wpr_page_version_idx').on(table.pageId, table.version),
    pageActiveIdx: index('wpr_page_active_idx').on(table.pageId, table.active),
    projectStatusIdx: index('wpr_project_status_idx').on(table.projectId, table.status),
  }),
);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bullmqJobId: text('bullmq_job_id'),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id').references(() => pages.id, { onDelete: 'cascade' }),
    jobType: jobTypeEnum('job_type').notNull(),
    status: jobStatusEnum('status').default('queued').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    errorMessage: text('error_message'),
    payload: jsonb('payload').notNull(),
    ...timestamps,
  },
  (table) => ({
    idempotencyIdx: uniqueIndex('jobs_idempotency_key_idx').on(table.idempotencyKey),
    statusIdx: index('jobs_status_idx').on(table.status),
  }),
);

export const exports = pgTable('exports', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  kind: exportKindEnum('kind').notNull(),
  status: exportStatusEnum('status').default('REQUESTED').notNull(),
  filePath: text('file_path'),
  sha256: text('sha256'),
  fileSizeBytes: integer('file_size_bytes'),
  ...timestamps,
});

export const llmUsage = pgTable('llm_usage', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  pageId: uuid('page_id').references(() => pages.id, { onDelete: 'set null' }),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  operation: text('operation').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  imageCount: integer('image_count'),
  costUsd: numeric('cost_usd', { precision: 10, scale: 4 }),
  ...timestamps,
});

export const imageEvents = pgTable('image_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  imageId: uuid('image_id')
    .notNull()
    .references(() => images.id, { onDelete: 'cascade' }),
  pageId: uuid('page_id')
    .notNull()
    .references(() => pages.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  note: text('note'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// First-class ENTRY layer (Phase A — see docs/KINDLE_ARCHITECTURE_AUDIT.md). An entry
// is one subject/topic (Black Bear, Moose, Navigation): a BODY opener page + its
// continuations, grouped by `entryKey`. DERIVED/backfilled READ-ONLY from `pages` +
// `manifests` — it changes no page/render/print data. The reusable handle that
// editions (Kindle, hero illustrations, web, flashcards, translations) attach to,
// instead of re-deriving entries from pages every time.
export const entries = pgTable(
  'entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    entryKey: text('entry_key').notNull(),
    chapterNumber: integer('chapter_number').notNull(),
    chapterTitle: text('chapter_title'),
    entryTitle: text('entry_title').notNull(),
    scientificName: text('scientific_name'),
    // Always BODY for entries (front/back matter pages are NOT entries).
    section: text('section').default('BODY').notNull(),
    // Manifest contentType when available (SPECIES / PLANT / WARNING / …) — generic.
    entryType: text('entry_type'),
    firstPageKey: text('first_page_key').notNull(),
    pageKeys: jsonb('page_keys').notNull(), // ordered string[] of the entry's page keys
    pageCount: integer('page_count').notNull(),
    readingOrder: integer('reading_order').notNull(), // 1-based order within the book body
    wordCount: integer('word_count').default(0).notNull(),
    ...timestamps,
  },
  (table) => ({
    projectEntryKeyIdx: uniqueIndex('entries_project_entry_key_idx').on(table.projectId, table.entryKey),
    projectOrderIdx: index('entries_project_reading_order_idx').on(table.projectId, table.readingOrder),
  }),
);

// ─── EDITIONS (One Book → Many Editions) ──────────────────────────────────
// An edition selects the Style DNA + surface palette/paper + format for ONE
// rendering of the shared manuscript. The shared layer (manuscript, breakdown,
// pagination, entries, layouts, prompts, metadata) is inherited — only the
// edition fields below change between Color / B&W / Vintage / Kids. The existing
// book is backfilled as the default Color edition. Adding an edition is a ROW,
// not a code change (styleDnaId comes from the Style DNA registry).
export const editions = pgTable(
  'editions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    editionKey: text('edition_key').notNull(), // 'color', 'bw', 'vintage', 'kids'
    label: text('label').notNull(),
    styleDnaId: text('style_dna_id').notNull(), // id in the Style DNA registry
    // Surface overrides. NULL = inherit from the Style DNA profile (the registry).
    paperType: text('paper_type'), // 'premium-color' | 'standard-bw' | 'cream-bw' | ...
    paletteOverride: jsonb('palette_override'), // { paperHex, inkHex } | null
    trimOverride: jsonb('trim_override'), // { widthIn, heightIn, bleedIn } | null
    formatSettings: jsonb('format_settings'), // edition-specific export knobs | null
    isDefault: boolean('is_default').default(false).notNull(),
    status: text('status').default('active').notNull(), // active | archived
    ...timestamps,
  },
  (table) => ({
    projectKeyIdx: uniqueIndex('editions_project_key_idx').on(table.projectId, table.editionKey),
  }),
);

// ─── Error-handling telemetry (docs/ERROR_HANDLING_STANDARD.md) ───────────
// One row per translated user-facing error. `projectId` is a plain column,
// deliberately WITHOUT a foreign key: telemetry must still record (and must
// survive) an invalid/nonexistent id or a project that's later deleted — it's
// a log, not a relation. `correlationId` ties a later recovery-clicked/
// recovery-succeeded row (recoveryEvents) back to the specific error that
// prompted it.
export const errorEvents = pgTable(
  'error_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    correlationId: uuid('correlation_id').notNull(),
    errorCode: text('error_code').notNull(),
    method: text('method').notNull(),
    path: text('path').notNull(),
    projectId: uuid('project_id'),
    statusCode: integer('status_code').notNull(),
    appVersion: text('app_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    errorCodeIdx: index('error_events_error_code_idx').on(table.errorCode),
    createdAtIdx: index('error_events_created_at_idx').on(table.createdAt),
    correlationIdIdx: index('error_events_correlation_id_idx').on(table.correlationId),
  }),
);

// One row per recovery-flow milestone: the operator clicked a recovery
// action's button ('clicked'), or the next action they took after that
// succeeded ('succeeded'). No FK to error_events — correlationId is the join
// key, looked up at query time; keeps this insert-only and dependency-free.
export const recoveryEvents = pgTable(
  'recovery_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    correlationId: uuid('correlation_id').notNull(),
    kind: text('kind').notNull(), // 'clicked' | 'succeeded'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    correlationIdIdx: index('recovery_events_correlation_id_idx').on(table.correlationId),
  }),
);

// Performance telemetry — one row per timed pipeline operation (see
// backend/src/lib/timing.ts). Same "plain column, no FK" reasoning as
// error_events: this is a log, and must survive a project being deleted.
// Only Breakdown is instrumented today (docs/ERROR_HANDLING_ARCHITECTURE.md);
// pagination/render/review are follow-up work, not attempted wholesale here.
export const operationEvents = pgTable(
  'operation_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    operation: text('operation').notNull(),
    projectId: uuid('project_id'),
    durationMs: integer('duration_ms').notNull(),
    success: boolean('success').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    operationIdx: index('operation_events_operation_idx').on(table.operation),
    createdAtIdx: index('operation_events_created_at_idx').on(table.createdAt),
  }),
);
