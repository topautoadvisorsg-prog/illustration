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
export const jobTypeEnum = pgEnum('job_type', ['image-generation', 'upscale', 'layout', 'pdf-compile', 'epub-export']);
export const jobStatusEnum = pgEnum('job_status', ['queued', 'active', 'completed', 'failed', 'dead-lettered']);
export const exportKindEnum = pgEnum('export_kind', ['PREMIUM_PDF', 'KINDLE_EPUB']);
export const exportStatusEnum = pgEnum('export_status', ['REQUESTED', 'RUNNING', 'READY', 'FAILED']);

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
    ...timestamps,
  },
  (table) => ({
    projectPageKeyIdx: uniqueIndex('pages_project_page_key_idx').on(table.projectId, table.pageKey),
    projectStatusIdx: index('pages_project_status_idx').on(table.projectId, table.status),
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
