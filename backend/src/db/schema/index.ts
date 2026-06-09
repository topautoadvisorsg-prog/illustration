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
    compactedEntryKeys: jsonb('compacted_entry_keys'),
    readingFieldText: text('reading_field_text'),
    readingFieldChars: integer('reading_field_chars'),
    readingFieldWords: integer('reading_field_words'),
    fitStatus: fitStatusEnum('fit_status').default('PENDING').notNull(),
    previewApproved: boolean('preview_approved').default(false).notNull(),
    previewApprovedAt: timestamp('preview_approved_at', { withTimezone: true }),
    previewApprovedBy: text('preview_approved_by'),
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

export const knowledgeItems = pgTable(
  'knowledge_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    type: knowledgeItemTypeEnum('type').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    status: knowledgeStatusEnum('status').default('DRAFT').notNull(),
    scope: knowledgeScopeEnum('scope').default('GLOBAL').notNull(),
    ownerName: text('owner_name'),
    tags: jsonb('tags').notNull(),
    metadata: jsonb('metadata').notNull(),
    ...timestamps,
  },
  (table) => ({
    projectTypeIdx: index('knowledge_items_project_type_idx').on(table.projectId, table.type),
    statusIdx: index('knowledge_items_status_idx').on(table.status),
    scopeIdx: index('knowledge_items_scope_idx').on(table.scope),
    createdAtIdx: index('knowledge_items_created_at_idx').on(table.createdAt),
  }),
);

export const experiments = pgTable('experiments', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id')
    .notNull()
    .unique()
    .references(() => knowledgeItems.id, { onDelete: 'cascade' }),
  hypothesis: text('hypothesis').notNull(),
  testPerformed: text('test_performed').notNull(),
  result: text('result'),
  conclusion: text('conclusion'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  ...timestamps,
});

export const decisions = pgTable('decisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id')
    .notNull()
    .unique()
    .references(() => knowledgeItems.id, { onDelete: 'cascade' }),
  decision: text('decision').notNull(),
  reason: text('reason').notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  supersededByItemId: uuid('superseded_by_item_id').references(() => knowledgeItems.id, { onDelete: 'set null' }),
  ...timestamps,
});

export const standards = pgTable(
  'standards',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .unique()
      .references(() => knowledgeItems.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    standardKey: text('standard_key').notNull(),
    currentVersionId: uuid('current_version_id'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    domainKeyIdx: uniqueIndex('standards_domain_key_idx').on(table.domain, table.standardKey),
  }),
);

export const standardVersions = pgTable(
  'standard_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    standardId: uuid('standard_id')
      .notNull()
      .references(() => standards.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    value: jsonb('value').notNull(),
    rationale: text('rationale').notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by'),
    ...timestamps,
  },
  (table) => ({
    standardVersionIdx: uniqueIndex('standard_versions_standard_version_idx').on(table.standardId, table.version),
  }),
);

export const sops = pgTable('sops', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id')
    .notNull()
    .unique()
    .references(() => knowledgeItems.id, { onDelete: 'cascade' }),
  workflowName: text('workflow_name').notNull(),
  currentVersionId: uuid('current_version_id'),
  ...timestamps,
});

export const sopVersions = pgTable(
  'sop_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sopId: uuid('sop_id')
      .notNull()
      .references(() => sops.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    bodyMarkdown: text('body_markdown').notNull(),
    checklist: jsonb('checklist').notNull(),
    changeNotes: text('change_notes'),
    createdBy: text('created_by'),
    ...timestamps,
  },
  (table) => ({
    sopVersionIdx: uniqueIndex('sop_versions_sop_version_idx').on(table.sopId, table.version),
  }),
);

export const lessonsLearned = pgTable('lessons_learned', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id')
    .notNull()
    .unique()
    .references(() => knowledgeItems.id, { onDelete: 'cascade' }),
  lesson: text('lesson').notNull(),
  prevention: text('prevention'),
  appliesTo: jsonb('applies_to').notNull(),
  ...timestamps,
});

export const printReviews = pgTable('print_reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id')
    .notNull()
    .unique()
    .references(() => knowledgeItems.id, { onDelete: 'cascade' }),
  proofName: text('proof_name').notNull(),
  vendor: text('vendor').notNull(),
  format: text('format').notNull(),
  orderedAt: timestamp('ordered_at', { withTimezone: true }),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  overallStatus: text('overall_status').default('OPEN').notNull(),
  metadata: jsonb('metadata').notNull(),
  ...timestamps,
});

export const printFindings = pgTable(
  'print_findings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    printReviewId: uuid('print_review_id')
      .notNull()
      .references(() => printReviews.id, { onDelete: 'cascade' }),
    relatedItemId: uuid('related_item_id').references(() => knowledgeItems.id, { onDelete: 'set null' }),
    severity: printFindingSeverityEnum('severity').notNull(),
    category: printFindingCategoryEnum('category').notNull(),
    pageKey: text('page_key'),
    layoutTemplate: text('layout_template'),
    finding: text('finding').notNull(),
    recommendation: text('recommendation'),
    status: text('status').default('OPEN').notNull(),
    ...timestamps,
  },
  (table) => ({
    reviewSeverityIdx: index('print_findings_review_severity_idx').on(table.printReviewId, table.severity),
    categoryIdx: index('print_findings_category_idx').on(table.category),
  }),
);

export const costEvents = pgTable(
  'cost_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .unique()
      .references(() => knowledgeItems.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id').references(() => pages.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    model: text('model'),
    operation: costOperationEnum('operation').notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 4 }).notNull(),
    unitCostUsd: numeric('unit_cost_usd', { precision: 10, scale: 6 }),
    costUsd: numeric('cost_usd', { precision: 10, scale: 4 }).notNull(),
    incurredAt: timestamp('incurred_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').notNull(),
    ...timestamps,
  },
  (table) => ({
    projectOperationIdx: index('cost_events_project_operation_idx').on(table.projectId, table.operation),
    incurredAtIdx: index('cost_events_incurred_at_idx').on(table.incurredAt),
  }),
);

export const knowledgeEvidence = pgTable(
  'knowledge_evidence',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: 'cascade' }),
    evidenceType: evidenceTypeEnum('evidence_type').notNull(),
    title: text('title').notNull(),
    uri: text('uri'),
    storagePath: text('storage_path'),
    sha256: text('sha256'),
    mimeType: text('mime_type'),
    notes: text('notes'),
    metadata: jsonb('metadata').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    itemIdx: index('knowledge_evidence_item_idx').on(table.itemId),
    typeIdx: index('knowledge_evidence_type_idx').on(table.evidenceType),
  }),
);

export const knowledgeLinks = pgTable(
  'knowledge_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceItemId: uuid('source_item_id')
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: 'cascade' }),
    targetItemId: uuid('target_item_id')
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: 'cascade' }),
    relationType: knowledgeRelationTypeEnum('relation_type').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    lineageIdx: uniqueIndex('knowledge_links_lineage_idx').on(table.sourceItemId, table.targetItemId, table.relationType),
    sourceIdx: index('knowledge_links_source_idx').on(table.sourceItemId),
    targetIdx: index('knowledge_links_target_idx').on(table.targetItemId),
  }),
);

export const knowledgeEvents = pgTable(
  'knowledge_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    actorName: text('actor_name'),
    summary: text('summary').notNull(),
    previousValue: jsonb('previous_value'),
    nextValue: jsonb('next_value'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    itemCreatedIdx: index('knowledge_events_item_created_idx').on(table.itemId, table.createdAt),
  }),
);
