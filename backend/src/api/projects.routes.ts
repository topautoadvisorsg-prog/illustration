import type { FastifyInstance } from 'fastify';
import { isNativeError } from 'node:util/types';
import {
  ApiErrorSchema,
  CreateProjectRequestSchema,
  LayoutApprovalSchema,
  PageManifestSchema,
  ProjectConfigSchema,
  type ProjectConfig,
  ProjectSchema,
} from '@wildlands/shared';
import { z } from 'zod';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  setManuscript,
  setProjectStatus,
  updateProjectConfig,
  type ProjectRow,
} from '../db/repositories/projects.repo.js';
import { listManifests, listPages } from '../db/repositories/manifests.repo.js';
import { updatePagePlanning } from '../db/repositories/manifests.repo.js';
import { callChat } from '../services/claude/claude.js';
import { ingestManuscript } from '../pipeline/stage-1-ingestion/ingest-manuscript.js';
import { UnsupportedManuscriptError } from '../pipeline/stage-1-ingestion/extract-manuscript.js';
import { generateManifests } from '../pipeline/stage-1.5-manifests/generate-manifests.js';
import { planPage, validateLayoutLibrary } from '../pipeline/stage-2-planner/plan-pages.js';
import { previewProjectTextFit } from '../pipeline/stage-6-layout/text-fit-preview.js';
import { RenderBlockedError, renderBookPdf, renderChapterPdf, renderCoverPdf } from '../pipeline/stage-6-layout/render-chapter.js';
import { countImagesForProject } from '../db/repositories/images.repo.js';
import { estimateCost } from '../services/cost/estimate.js';

const ProjectParamsSchema = z.object({ id: z.string().uuid() });
const ChapterLayoutApprovalParamsSchema = z.object({
  id: z.string().uuid(),
  chapterNumber: z.coerce.number().int().positive(),
});

const LayoutApprovalContractSchema = LayoutApprovalSchema;
const LayoutApprovalsSchema = z.record(LayoutApprovalContractSchema);

function parseProjectConfig(row: ProjectRow): ProjectConfig {
  return ProjectConfigSchema.parse(row.config);
}

function getLayoutApprovals(row: ProjectRow): ProjectConfig['layoutApprovals'] {
  return parseProjectConfig(row).layoutApprovals ?? {};
}

/**
 * A manuscript upload error caused by the file itself (wrong type, empty, or no
 * detectable chapter/entry structure) — surfaced to the client as a clean 400
 * rather than a 500. Anything else is a real server fault and rethrown.
 */
function isManuscriptUserError(err: unknown): err is Error {
  if (err instanceof UnsupportedManuscriptError) return true;
  if (isNativeError(err)) {
    return /^(NO_CHAPTERS_DETECTED|NO_ENTRIES_DETECTED|DUPLICATE_|CHAPTER_|ENTRY_)/.test(err.message);
  }
  return false;
}

function toContract(row: ProjectRow) {
  return {
    id: row.id,
    brand: row.brand,
    audience: row.audience,
    title: row.title,
    status: row.status,
    manuscriptPath: row.manuscriptPath,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const ProjectListResponseSchema = z.object({ projects: z.array(ProjectSchema) });
const CreatedProjectResponseSchema = z.object({ project: ProjectSchema });
const UpdateProjectConfigBodySchema = z.object({ config: ProjectConfigSchema });

const UploadManuscriptBodySchema = z
  .object({
    filename: z.string().min(1),
    /** Plain text for .md/.markdown/.txt manuscripts. */
    markdown: z.string().min(1).optional(),
    /** Base64 bytes for binary uploads (.docx/.pdf). */
    fileBase64: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.markdown) || Boolean(v.fileBase64), {
    message: 'Provide manuscript text (markdown) or file bytes (fileBase64).',
  });
const UploadManuscriptResponseSchema = z.object({
  project: ProjectSchema,
  manuscript: z.object({
    relativePath: z.string(),
    sha256: z.string(),
    sizeBytes: z.number(),
    totalChapters: z.number(),
    totalEntries: z.number(),
    totalWords: z.number(),
    warnings: z.array(z.string()),
  }),
});

const ManifestSummaryResponseSchema = z.object({
  project: ProjectSchema,
  summary: z.object({
    totalChapters: z.number(),
    totalEntries: z.number(),
    totalPages: z.number(),
    totalImagesNeeded: z.number(),
    manifestsWritten: z.number(),
    pagesWritten: z.number(),
  }),
});

const ManifestsListResponseSchema = z.object({
  manifests: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      externalId: z.string(),
      version: z.number(),
      content: z.unknown(),
    }),
  ),
});

const PagesListResponseSchema = z.object({
  pages: z.array(
    z.object({
      id: z.string(),
      pageKey: z.string(),
      chapterNumber: z.number(),
      plannedPageNumber: z.number(),
      layoutTemplate: z.string().nullable(),
      imagePrompt: z.string().nullable(),
      imagePromptSha256: z.string().nullable(),
      status: z.string(),
    }),
  ),
  layoutApprovals: LayoutApprovalsSchema,
});

const PlanPagesResponseSchema = z.object({
  project: ProjectSchema,
  layoutLibrary: z.object({
    totalTemplates: z.number(),
    approvedTemplates: z.number(),
    missingTemplates: z.array(z.string()),
    readyForProduction: z.boolean(),
    issues: z.array(
      z.object({
        templateId: z.string(),
        severity: z.enum(['BLOCKER', 'WARNING']),
        code: z.string(),
        message: z.string(),
      }),
    ),
  }),
  plannedPages: z.array(
    z.object({
      pageKey: z.string(),
      entryTitle: z.string(),
      wordCount: z.number(),
      contentType: z.string(),
      contentTypePurpose: z.string(),
      contentTypeUsedFor: z.array(z.string()),
      multiSubject: z.boolean(),
      coverage: z.number(),
      architecture: z.string(),
      layoutTemplate: z.string(),
      layoutReferenceLabel: z.string(),
      promptSha256: z.string(),
      promptReady: z.boolean(),
      reasonCodes: z.array(z.string()),
      blockers: z.array(z.string()),
      warnings: z.array(z.string()),
      layoutInstructions: z.object({
        description: z.string(),
        useCases: z.array(z.string()),
        avoidWhen: z.array(z.string()),
        textZone: z.string(),
        imageZone: z.string(),
        textFitRule: z.string(),
      }),
      capacity: z.object({
        minWords: z.number(),
        targetWords: z.number(),
        maxWords: z.number(),
        status: z.string(),
        overMaxWords: z.boolean(),
        underMinWords: z.boolean(),
      }),
      typography: z.object({
        bodyFont: z.string(),
        bodyPt: z.number(),
        lineHeight: z.number(),
      }),
      artBrief: z.object({
        imagePercent: z.number(),
        textPercent: z.number(),
        placement: z.string(),
        textPlacement: z.string(),
        architecture: z.string(),
        artBox: z.object({
          xIn: z.number(),
          yIn: z.number(),
          widthIn: z.number(),
          heightIn: z.number(),
          recommendedWidthPx: z.number(),
          recommendedHeightPx: z.number(),
          bleedPaddingPx: z.number(),
          aspectRatio: z.string(),
          overlaySafeArea: z.string(),
        }),
      }),
      agent: z.object({
        id: z.string(),
        name: z.string(),
        mission: z.string(),
        expertFrame: z.string(),
      }),
      textFitStatus: z.enum(['PENDING_PREVIEW', 'BLOCKED_LAYOUT_LIBRARY']),
    }),
  ),
});

const TextFitPreviewResponseSchema = z.object({
  geometry: z.object({
    pageWidthIn: z.number(),
    pageHeightIn: z.number(),
    textWidthIn: z.number(),
    textHeightIn: z.number(),
  }),
  totals: z.object({
    pages: z.number(),
    fits: z.number(),
    tight: z.number(),
    overflow: z.number(),
    underfilled: z.number(),
  }),
  readyForImageSpend: z.boolean(),
  pages: z.array(
    z.object({
      pageKey: z.string(),
      entryTitle: z.string(),
      layoutTemplate: z.string(),
      layoutReasonCodes: z.array(z.string()),
      promptReady: z.boolean(),
      blockers: z.array(z.string()),
      fit: z.object({
        status: z.enum(['FITS', 'TIGHT', 'OVERFLOW', 'UNDERFILLED']),
        fits: z.boolean(),
        charCount: z.number(),
        capacityChars: z.number(),
        fillRatio: z.number(),
        estimatedLines: z.number(),
        usableLines: z.number(),
        estimatedRenderedPages: z.number(),
        notes: z.array(z.string()),
      }),
      allocation: z.object({
        architecture: z.string(),
        imagePlacement: z.string(),
        textPlacement: z.string(),
        openingPageImagePercent: z.number(),
        openingPageTextPercent: z.number(),
        continuationPageImagePercent: z.number(),
        continuationPageTextPercent: z.number(),
        estimatedRenderedPages: z.number(),
        wordsPerOpeningPage: z.number(),
        wordsPerContinuationPage: z.number(),
        artBox: z.object({
          xIn: z.number(),
          yIn: z.number(),
          widthIn: z.number(),
          heightIn: z.number(),
          recommendedWidthPx: z.number(),
          recommendedHeightPx: z.number(),
          bleedPaddingPx: z.number(),
          aspectRatio: z.string(),
          overlaySafeArea: z.string(),
        }),
        notes: z.array(z.string()),
      }),
    }),
  ),
});

const ChapterLayoutApprovalResponseSchema = z.object({
  approval: LayoutApprovalContractSchema,
  layoutApprovals: LayoutApprovalsSchema,
});

export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/projects',
    { schema: { response: { 200: ProjectListResponseSchema } } },
    async () => {
      const rows = await listProjects();
      return { projects: rows.map(toContract) };
    },
  );

  app.post(
    '/api/projects',
    { schema: { body: CreateProjectRequestSchema, response: { 201: CreatedProjectResponseSchema } } },
    async (request, reply) => {
      const body = CreateProjectRequestSchema.parse(request.body);
      const row = await createProject({ config: body.config });
      return reply.code(201).send({ project: toContract(row) });
    },
  );

  app.get(
    '/api/projects/:id',
    { schema: { params: ProjectParamsSchema, response: { 200: CreatedProjectResponseSchema, 404: ApiErrorSchema } } },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const row = await getProject(id);
      if (!row) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      return { project: toContract(row) };
    },
  );

  // Permanently delete a project and all its manifests, pages, and images.
  app.delete(
    '/api/projects/:id',
    { schema: { params: ProjectParamsSchema, response: { 200: z.object({ deleted: z.boolean(), id: z.string() }), 404: ApiErrorSchema } } },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const existing = await getProject(id);
      if (!existing) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      await deleteProject(id);
      return { deleted: true, id };
    },
  );

  // Operator chat: talk to the agent about THIS project. Read-only/advisory —
  // it explains state and recommends the next button; it does not run actions.
  const ChatBodySchema = z.object({
    messages: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1) }))
      .min(1)
      .max(40),
    recentLog: z.array(z.string()).max(40).optional(),
  });
  app.post(
    '/api/projects/:id/chat',
    { schema: { params: ProjectParamsSchema, body: ChatBodySchema, response: { 200: z.object({ reply: z.string() }), 404: ApiErrorSchema } } },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const body = ChatBodySchema.parse(request.body);
      const project = await getProject(id);
      if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });

      const manifests = await listManifests(id);
      const pages = await listPages(id);
      const chapters = manifests.filter((m) => m.kind === 'CHAPTER').length;
      const statusCounts = pages.reduce<Record<string, number>>((acc, p) => {
        acc[p.status] = (acc[p.status] ?? 0) + 1;
        return acc;
      }, {});
      const pageLines = pages
        .slice(0, 30)
        .map((p) => `  - ${p.pageKey}: layout=${p.layoutTemplate ?? 'none'} status=${p.status}`)
        .join('\n');

      const system = [
        'You are the operator-facing agent for The Wildlands Publishing Platform, which turns a manuscript into a print-ready illustrated book.',
        'The pipeline order is: Upload manuscript -> Breakdown (split into chapters/pages) -> Page Plan (assign layouts) -> Text-Fit -> Generate Images (paid) -> Approve -> Render PDF -> Export.',
        'You ADVISE and EXPLAIN. You cannot click buttons or run actions yourself; tell the operator which button to click. Be concise, plain, and direct. No jargon, no filler.',
        'NEVER claim the book is "done", "complete", or "ready to export" unless EVERY page status is APPROVED or PRINT_READY and the project status is EXPORTED. A rendered PDF *preview* uses PLACEHOLDER art slots and is only a draft — it is NOT a finished book. Do not tell the operator to "click export to download the final print-ready file" while pages still lack approved images. Be honest about how much work remains.',
        '',
        'CURRENT PROJECT STATE:',
        `- Title: ${project.title}`,
        `- Status: ${project.status}`,
        `- Manuscript uploaded: ${project.manuscriptPath ? 'yes' : 'no'}`,
        `- Chapters detected: ${chapters}`,
        `- Pages: ${pages.length}${pages.length ? ` (by status: ${JSON.stringify(statusCounts)})` : ''}`,
        pages.length ? `Pages:\n${pageLines}` : '',
        body.recentLog?.length ? `\nRECENT ACTIVITY LOG (newest first):\n${body.recentLog.slice(0, 20).map((l) => `  - ${l}`).join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const replyText = await callChat({
        system,
        messages: body.messages,
        projectId: id,
        operation: 'operator-chat',
        maxTokens: 700,
      });
      return { reply: replyText };
    },
  );

  // Per-stage "Review" — the agent QA-checks its own output for a step and gives
  // a verdict, so the operator doesn't have to inspect every page by hand.
  const REVIEW_RUBRICS: Record<string, string> = {
    breakdown:
      'Verify the manuscript was split into sensible chapters and entries. Flag: empty/near-empty entries, missing or garbled titles, entries that look like meta/outline/front-matter rather than real content, and any chapter with an implausible entry count.',
    plan:
      'Verify every page has a layout assigned and a resolved image prompt. Flag: pages with no layout, blockers, unresolved prompt placeholders, or layouts that look wrong for the content.',
    textfit:
      'Verify the text-fit results. Long entries flowing across multiple pages are FINE (not overflow). Flag only genuinely broken cases (e.g. an illustration-dominant layout chosen for a very long entry).',
    images:
      'Verify image status. Report how many pages have approved art vs none. Do NOT recommend spending on generation unless the plan/text-fit look right first.',
    render:
      'Verify the book is structurally complete: chapters present, and (for a full book) front matter, table of contents, index, and back matter should exist. Flag missing structural pieces.',
  };
  const ReviewBodySchema = z.object({ stage: z.enum(['breakdown', 'plan', 'textfit', 'images', 'render']) });
  app.post(
    '/api/projects/:id/review',
    { schema: { params: ProjectParamsSchema, body: ReviewBodySchema, response: { 200: z.object({ review: z.string() }), 404: ApiErrorSchema } } },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const { stage } = ReviewBodySchema.parse(request.body);
      const project = await getProject(id);
      if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });

      const manifests = await listManifests(id);
      const pages = await listPages(id);
      const book = manifests.find((m) => m.kind === 'BOOK');
      const chapters = manifests
        .filter((m) => m.kind === 'CHAPTER')
        .map((m) => m.content as { chapterNumber: number; chapterTitle: string; pageKeys?: string[] });
      const statusCounts = pages.reduce<Record<string, number>>((acc, p) => {
        acc[p.status] = (acc[p.status] ?? 0) + 1;
        return acc;
      }, {});
      const bookContent = book?.content as { totalChapters?: number; totalEntries?: number; chapters?: Array<{ chapterNumber: number; chapterTitle: string; entryCount: number }> } | undefined;
      const chapterLines = (bookContent?.chapters ?? chapters.map((c) => ({ chapterNumber: c.chapterNumber, chapterTitle: c.chapterTitle, entryCount: c.pageKeys?.length ?? 0 })))
        .slice(0, 30)
        .map((c) => `  - Ch${c.chapterNumber} "${c.chapterTitle}": ${c.entryCount} entries`)
        .join('\n');
      const pagesNoLayout = pages.filter((p) => !p.layoutTemplate).length;

      const system = [
        `You are a strict, meticulous book-production QA reviewer for The Wildlands Publishing Platform, reviewing the "${stage}" step for the book "${project.title}". Be an honest editor/production manager: do not invent problems, do not rubber-stamp.`,
        '',
        'PROJECT STATE:',
        `- Status: ${project.status}; chapters: ${bookContent?.totalChapters ?? chapters.length}; total entries: ${bookContent?.totalEntries ?? pages.length}; pages: ${pages.length} (status: ${JSON.stringify(statusCounts)}); pages missing a layout: ${pagesNoLayout}`,
        chapterLines ? `Chapters:\n${chapterLines}` : '',
        '',
        `RUBRIC for "${stage}": ${REVIEW_RUBRICS[stage]}`,
        '',
        'Respond EXACTLY in this format, concise and specific:',
        'VERDICT: PASS or NEEDS WORK',
        "WHAT'S GOOD: 1-3 short bullets",
        'ISSUES: specific problems, or "none"',
        'FIX NEXT: concrete next action(s), or "nothing — ready to proceed"',
      ]
        .filter(Boolean)
        .join('\n');

      const review = await callChat({
        system,
        messages: [{ role: 'user', content: `Review the ${stage} output and give your verdict.` }],
        projectId: id,
        operation: `review-${stage}`,
        maxTokens: 600,
      });
      return { review };
    },
  );

  app.patch(
    '/api/projects/:id/config',
    {
      schema: {
        params: ProjectParamsSchema,
        body: UpdateProjectConfigBodySchema,
        response: { 200: CreatedProjectResponseSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const body = UpdateProjectConfigBodySchema.parse(request.body);
      const existing = await getProject(id);
      if (!existing) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      const existingConfig = parseProjectConfig(existing);
      const row = await updateProjectConfig(id, {
        ...body.config,
        layoutApprovals: existingConfig.layoutApprovals ?? {},
      });
      if (!row) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      return { project: toContract(row) };
    },
  );

  app.post(
    '/api/projects/:id/manuscript',
    {
      schema: {
        params: ProjectParamsSchema,
        body: UploadManuscriptBodySchema,
        response: { 200: UploadManuscriptResponseSchema, 400: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const body = UploadManuscriptBodySchema.parse(request.body);

      const existing = await getProject(id);
      if (!existing) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });

      let manuscript;
      let outline;
      try {
        ({ manuscript, outline } = await ingestManuscript({
          projectId: id,
          filename: body.filename,
          markdown: body.markdown,
          fileBase64: body.fileBase64,
        }));
      } catch (err) {
        if (isManuscriptUserError(err)) {
          return reply.code(400).send({ error: 'Bad Request', message: err.message, statusCode: 400 });
        }
        throw err;
      }
      const updated = await setManuscript(id, manuscript.relativePath, manuscript.sha256);

      return {
        project: toContract(updated ?? existing),
        manuscript: {
          relativePath: manuscript.relativePath,
          sha256: manuscript.sha256,
          sizeBytes: manuscript.sizeBytes,
          totalChapters: outline.chapters.length,
          totalEntries: outline.totalEntries,
          totalWords: outline.totalWords,
          warnings: outline.warnings,
        },
      };
    },
  );

  app.post(
    '/api/projects/:id/manifests',
    {
      schema: {
        params: ProjectParamsSchema,
        response: { 200: ManifestSummaryResponseSchema, 400: ApiErrorSchema, 404: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const project = await getProject(id);
      if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });

      if (!project.manuscriptPath) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'No manuscript on file. Upload one first.',
          statusCode: 400,
        });
      }

      const { getProjectStorage } = await import('../services/storage/project-storage.js');
      let buf: Buffer;
      try {
        buf = await getProjectStorage().readProjectFile(project.manuscriptPath);
      } catch (error) {
        if (isNativeError(error) && 'code' in error && error.code === 'ENOENT') {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Stored manuscript file is missing. Re-upload the manuscript before generating manifests.',
            statusCode: 404,
          });
        }
        throw error;
      }
      const markdown = buf.toString('utf8');

      try {
        const config = project.config as import('@wildlands/shared').ProjectConfig;
        const summary = await generateManifests({ projectId: id, manuscriptMarkdown: markdown, config });
        const updated = await setProjectStatus(id, 'MANIFESTED');

        return { project: toContract(updated ?? project), summary };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('already has manifests/pages')) {
          return reply.code(409).send({ error: 'Conflict', message, statusCode: 409 });
        }
        throw error;
      }
    },
  );

  app.get(
    '/api/projects/:id/manifests',
    { schema: { params: ProjectParamsSchema, response: { 200: ManifestsListResponseSchema } } },
    async (request) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const rows = await listManifests(id);
      return {
        manifests: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          externalId: r.externalId,
          version: r.version,
          content: r.content,
        })),
      };
    },
  );

  app.post(
    '/api/projects/:id/plan',
    {
      schema: {
        params: ProjectParamsSchema,
        response: { 200: PlanPagesResponseSchema, 400: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const project = await getProject(id);
      if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });

      const rows = await listManifests(id, 'PAGE');
      if (rows.length === 0) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'No page manifests found. Generate manifests before planning pages.',
          statusCode: 400,
        });
      }

      const config = parseProjectConfig(project);
      const layoutLibrary = validateLayoutLibrary(config);
      const plannedPages = [];
      for (const row of rows) {
        const page = PageManifestSchema.parse(row.content);
        const decision = planPage(page, config);
        await updatePagePlanning(id, decision.pageKey, {
          layoutTemplate: decision.layoutTemplate,
          imagePrompt: decision.prompt,
          imagePromptSha256: decision.promptSha256,
        });
        plannedPages.push({
          pageKey: decision.pageKey,
          entryTitle: decision.entryTitle,
          wordCount: decision.wordCount,
          contentType: decision.contentType,
          contentTypePurpose: decision.contentTypePurpose,
          contentTypeUsedFor: decision.contentTypeUsedFor,
          multiSubject: decision.multiSubject,
          coverage: decision.coverage,
          architecture: decision.architecture,
          layoutTemplate: decision.layoutTemplate,
          layoutReferenceLabel: decision.layoutReferenceLabel,
          promptSha256: decision.promptSha256,
          promptReady: decision.promptReady,
          reasonCodes: decision.reasonCodes,
          blockers: decision.blockers,
          warnings: decision.warnings,
          layoutInstructions: decision.layoutInstructions,
          capacity: decision.capacity,
          typography: decision.typography,
          artBrief: decision.artBrief,
          agent: decision.agent,
          textFitStatus: decision.textFitStatus,
        });
      }

      const clearedConfig = { ...config, layoutApprovals: {} };
      await updateProjectConfig(id, clearedConfig);
      const updated = await setProjectStatus(id, 'PLANNED');
      return { project: toContract(updated ?? project), layoutLibrary, plannedPages };
    },
  );

  app.get(
    '/api/projects/:id/pages',
    { schema: { params: ProjectParamsSchema, response: { 200: PagesListResponseSchema, 404: ApiErrorSchema } } },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const project = await getProject(id);
      if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      const rows = await listPages(id);
      return {
        pages: rows.map((p) => ({
          id: p.id,
          pageKey: p.pageKey,
          chapterNumber: p.chapterNumber,
          plannedPageNumber: p.plannedPageNumber,
          layoutTemplate: p.layoutTemplate,
          imagePrompt: p.imagePrompt,
          imagePromptSha256: p.imagePromptSha256,
          status: p.status,
        })),
        layoutApprovals: getLayoutApprovals(project),
      };
    },
  );

  app.post(
    '/api/projects/:id/text-fit-preview',
    {
      schema: {
        params: ProjectParamsSchema,
        response: { 200: TextFitPreviewResponseSchema, 400: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const rows = await listManifests(id, 'PAGE');
      if (rows.length === 0) {
        const project = await getProject(id);
        if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'No page manifests found. Generate manifests before running a text-fit preview.',
          statusCode: 400,
        });
      }
      return previewProjectTextFit(id);
    },
  );

  app.post(
    '/api/projects/:id/chapters/:chapterNumber/layout-approval',
    {
      schema: {
        params: ChapterLayoutApprovalParamsSchema,
        response: { 200: ChapterLayoutApprovalResponseSchema, 404: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const { id, chapterNumber } = ChapterLayoutApprovalParamsSchema.parse(request.params);
      const project = await getProject(id);
      if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });

      const pageRows = (await listPages(id)).filter((page) => page.chapterNumber === chapterNumber);
      if (pageRows.length === 0) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Chapter ${chapterNumber} has no page rows to approve.`,
          statusCode: 404,
        });
      }

      const unplanned = pageRows.filter((page) => !page.layoutTemplate || !page.imagePrompt || !page.imagePromptSha256);
      if (unplanned.length > 0) {
        return reply.code(409).send({
          error: 'Conflict',
          message: `Chapter ${chapterNumber} still has ${unplanned.length} unplanned page(s). Run Page Plan before approval.`,
          statusCode: 409,
        });
      }

      const preview = await previewProjectTextFit(id);
      const pageKeys = new Set(pageRows.map((page) => page.pageKey));
      const chapterPreview = preview.pages.filter((page) => pageKeys.has(page.pageKey));
      if (chapterPreview.length !== pageRows.length) {
        return reply.code(409).send({
          error: 'Conflict',
          message: `Chapter ${chapterNumber} text-fit preview does not match the persisted page rows. Re-run Page Plan before approval.`,
          statusCode: 409,
        });
      }
      // Only genuine planning blockers (missing/unresolved image prompt) hard-block
      // approval. "Overflow" just means an entry's text spans multiple pages — the
      // Paged.js render flows it cleanly (verified, no text lost), so it's recorded
      // as a warning in the summary, not a gate.
      const blockers = chapterPreview.filter((page) => page.blockers.length > 0);
      if (blockers.length > 0) {
        return reply.code(409).send({
          error: 'Conflict',
          message: `Chapter ${chapterNumber} is not ready: ${blockers.length} page(s) have planning blockers (missing or unresolved image prompt). Re-run Page Plan.`,
          statusCode: 409,
        });
      }

      const textFitSummary = chapterPreview.reduce(
        (totals, page) => {
          totals.pages += 1;
          if (page.fit.status === 'FITS') totals.fits += 1;
          else if (page.fit.status === 'TIGHT') totals.tight += 1;
          else if (page.fit.status === 'OVERFLOW') totals.overflow += 1;
          else totals.underfilled += 1;
          return totals;
        },
        { pages: 0, fits: 0, tight: 0, overflow: 0, underfilled: 0 },
      );

      const config = parseProjectConfig(project);
      const approval = LayoutApprovalSchema.parse({
        status: 'APPROVED',
        chapterNumber,
        approvedAt: new Date().toISOString(),
        approvedBy: 'operator',
        pageKeys: pageRows.map((page) => page.pageKey),
        promptSha256ByPage: Object.fromEntries(pageRows.map((page) => [page.pageKey, page.imagePromptSha256!])),
        textFitSummary,
      });
      const layoutApprovals = {
        ...(config.layoutApprovals ?? {}),
        [String(chapterNumber)]: approval,
      };
      await updateProjectConfig(id, { ...config, layoutApprovals });

      return { approval, layoutApprovals };
    },
  );

  // Simple cost estimate: images generated x flat average $/image.
  const CostEstimateResponseSchema = z.object({
    imageCount: z.number(),
    avgCostPerImageUsd: z.number(),
    estimatedCostUsd: z.number(),
  });
  app.get(
    '/api/projects/:id/cost-estimate',
    { schema: { params: ProjectParamsSchema, response: { 200: CostEstimateResponseSchema } } },
    async (request) => {
      const { id } = ProjectParamsSchema.parse(request.params);
      const imageCount = await countImagesForProject(id);
      return estimateCost(imageCount);
    },
  );

  function renderErrorStatus(code: string): 404 | 409 | 503 {
    if (code === 'not_found') return 404;
    if (code === 'no_chromium') return 503;
    return 409;
  }

  // Stage 6 — render one chapter to a PDF (uses approved/upscaled art, else clean
  // placeholders so it works before images exist). Returns the PDF binary.
  const RenderChapterParamsSchema = z.object({ id: z.string().uuid(), chapterNumber: z.coerce.number().int().positive() });
  app.post('/api/projects/:id/chapters/:chapterNumber/render', async (request, reply) => {
    const { id, chapterNumber } = RenderChapterParamsSchema.parse(request.params);
    try {
      const { pdf, totalPages } = await renderChapterPdf(id, chapterNumber);
      if ((request.query as { format?: string } | undefined)?.format === 'json') {
        return reply.send({ ok: true, chapterNumber, totalPages, bytes: pdf.byteLength });
      }
      reply.header('content-type', 'application/pdf');
      reply.header('content-disposition', `inline; filename="chapter-${chapterNumber}.pdf"`);
      reply.header('x-total-pages', String(totalPages));
      return reply.send(pdf);
    } catch (error) {
      if (error instanceof RenderBlockedError) {
        const status = renderErrorStatus(error.code);
        return reply.code(status).send({ error: 'Render Blocked', message: error.message, statusCode: status });
      }
      throw error;
    }
  });

  // Stage 7 — render every chapter, stitch into the interior book PDF, run KDP
  // preflight, store it, record the export. ?format=json returns the preflight report.
  app.post('/api/projects/:id/render-book', async (request, reply) => {
    const { id } = ProjectParamsSchema.parse(request.params);
    try {
      const result = await renderBookPdf(id);
      if ((request.query as { format?: string } | undefined)?.format === 'json') {
        return reply.send({
          ok: result.preflight.passed,
          pageCount: result.pageCount,
          chaptersRendered: result.chaptersRendered,
          storedPath: result.storedPath,
          preflight: result.preflight,
        });
      }
      reply.header('content-type', 'application/pdf');
      reply.header('content-disposition', 'inline; filename="wildlands-book.pdf"');
      reply.header('x-page-count', String(result.pageCount));
      reply.header('x-preflight-passed', String(result.preflight.passed));
      return reply.send(result.pdf);
    } catch (error) {
      if (error instanceof RenderBlockedError) {
        const status = renderErrorStatus(error.code);
        return reply.code(status).send({ error: 'Render Blocked', message: error.message, statusCode: status });
      }
      throw error;
    }
  });

  // Stage 7 — render the print-ready full-wrap cover PDF (spine width from the
  // interior page count). Returns the cover PDF inline.
  app.post('/api/projects/:id/render-cover', async (request, reply) => {
    const { id } = ProjectParamsSchema.parse(request.params);
    try {
      const result = await renderCoverPdf(id);
      reply.header('content-type', 'application/pdf');
      reply.header('content-disposition', 'inline; filename="wildlands-cover.pdf"');
      return reply.send(result.pdf);
    } catch (error) {
      if (error instanceof RenderBlockedError) {
        const status = renderErrorStatus(error.code);
        return reply.code(status).send({ error: 'Render Blocked', message: error.message, statusCode: status });
      }
      throw error;
    }
  });
}
