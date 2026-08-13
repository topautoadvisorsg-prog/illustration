/**
 * BOOK INTAKE — one call takes a manuscript and a brief and gives back a
 * project that is already broken down, paginated, and audited.
 *
 * Why this exists: `docs/SPEC_BOOK_INTAKE.md`. Onboarding a book was six
 * console steps plus a config blob assembled by hand, and the platform gave no
 * answer to "is this set up correctly enough to start spending?" until after
 * the money was spent. 234 scripts in `backend/scripts` are the receipt.
 *
 * This route COMPOSES existing stages. It does not reimplement any of them:
 * ingest, breakdown and pagination are the same functions the console calls, so
 * the two paths cannot drift.
 */
import { createHash } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ProjectConfigSchema, type ProjectConfig } from '@wildlands/shared';

import { createProject, getProject, listProjects } from '../db/repositories/projects.repo.js';
import { auditReadiness } from '../pipeline/readiness/audit-readiness.js';
import { getProductionProfile, isKnownProductionProfile, listProductionProfiles } from '../pipeline/production-profiles/registry.js';
import { UserFacingError } from '../lib/user-facing-error.js';
import { ERROR_CODES } from '../lib/error-codes.js';

/** Trim presets the console offers. Explicit trimSize always wins. */
const TRIM_PRESETS: Record<string, { widthIn: number; heightIn: number; bleedIn: number }> = {
  '5.5x8.5': { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
  '6x9': { widthIn: 6, heightIn: 9, bleedIn: 0.125 },
  '7x10': { widthIn: 7, heightIn: 10, bleedIn: 0.125 },
  '8.5x11': { widthIn: 8.5, heightIn: 11, bleedIn: 0.125 },
};

const BriefSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  authorName: z.string().min(1),
  volume: z.number().int().positive().default(1),
  trimPreset: z.enum(['5.5x8.5', '6x9', '7x10', '8.5x11']).optional(),
  trimSize: z.object({ widthIn: z.number().positive(), heightIn: z.number().positive(), bleedIn: z.number().min(0) }).optional(),
  paperStock: z.enum(['cream', 'white']).default('cream'),
  productionProfileId: z.string().min(1),
  typesetLayoutStandardId: z.string().min(1).optional(),
});

const IntakeBodySchema = z.object({
  brief: BriefSchema,
  /**
   * Mirrors the manuscript upload contract exactly: text books send `markdown`,
   * binary drops (.docx/.pdf) send `fileBase64`. Intake does not convert or
   * pre-parse — it hands the bytes to the same ingest the console uses.
   */
  manuscript: z
    .object({
      filename: z.string().min(1),
      markdown: z.string().min(1).optional(),
      fileBase64: z.string().min(1).optional(),
    })
    .refine((v) => Boolean(v.markdown) || Boolean(v.fileBase64), {
      message: 'Provide manuscript text (markdown) or file bytes (fileBase64).',
    })
    .optional(),
  /** Stop after creating the project; do not run breakdown or pagination. */
  setupOnly: z.boolean().default(false),
});

export type IntakeBody = z.infer<typeof IntakeBodySchema>;

/** Stable identity for a brief + manuscript, so a retry cannot create a twin. */
export function briefHash(body: IntakeBody): string {
  const h = createHash('sha256');
  h.update(JSON.stringify(body.brief));
  if (body.manuscript) h.update(body.manuscript.markdown ?? body.manuscript.fileBase64 ?? '');
  return h.digest('hex');
}

export function resolveTrim(brief: z.infer<typeof BriefSchema>): { widthIn: number; heightIn: number; bleedIn: number } {
  if (brief.trimSize) return brief.trimSize;
  if (brief.trimPreset) return TRIM_PRESETS[brief.trimPreset]!;
  throw new UserFacingError('Give either trimPreset or an explicit trimSize.', {
    code: 'Missing Trim',
    errorCode: ERROR_CODES.UNCLASSIFIED,
    statusCode: 422,
  });
}

/** Build a full, valid ProjectConfig from the brief. Defaults come from the schema. */
export function configFromBrief(brief: z.infer<typeof BriefSchema>): ProjectConfig {
  return ProjectConfigSchema.parse({
    volume: brief.volume,
    title: brief.title,
    subtitle: brief.subtitle,
    authorName: brief.authorName,
    trimSize: resolveTrim(brief),
    paperStock: brief.paperStock,
    productionProfileId: brief.productionProfileId,
    ...(brief.typesetLayoutStandardId ? { typesetLayoutStandardId: brief.typesetLayoutStandardId } : {}),
  });
}

// ── response contracts ──────────────────────────────────────────────────────
// Declared, not just returned. `/api/docs` is generated from these, and the
// README now points operators and agents at that spec as the live route
// reference — a route with no schema documents nothing and quietly breaks that
// promise. It is also the house convention (see this folder's README).

const ReadinessCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(['PASS', 'WARN', 'FAIL', 'NA']),
  detail: z.string(),
  fix: z.string().optional(),
});

const ReadinessReportSchema = z.object({
  projectId: z.string(),
  title: z.string(),
  status: z.enum(['READY', 'WARNING', 'BLOCKED']),
  checks: z.array(ReadinessCheckSchema),
  nextAction: z.string(),
  generatedAt: z.string(),
});

const IntakeOptionsResponseSchema = z.object({
  trimPresets: z.array(z.object({ id: z.string(), widthIn: z.number(), heightIn: z.number(), bleedIn: z.number() })),
  paperStocks: z.array(z.string()),
  productionProfiles: z.array(z.object({ id: z.string(), label: z.string() })),
});

const IntakeResponseSchema = z.object({
  projectId: z.string(),
  created: z.boolean(),
  message: z.string().optional(),
  steps: z
    .array(z.object({ step: z.string(), status: z.enum(['DONE', 'SKIPPED', 'FAILED']), detail: z.string() }))
    .optional(),
  readiness: ReadinessReportSchema,
});

export async function registerBookRoutes(app: FastifyInstance): Promise<void> {
  /** What a brief may legally name. Lets a client build a valid brief without guessing. */
  app.get(
    '/api/books/intake-options',
    { schema: { response: { 200: IntakeOptionsResponseSchema } } },
    async () => ({
      trimPresets: Object.entries(TRIM_PRESETS).map(([id, size]) => ({ id, ...size })),
      paperStocks: ['cream', 'white'],
      productionProfiles: listProductionProfiles(),
    }),
  );

  app.post('/api/books/intake', { schema: { response: { 200: IntakeResponseSchema, 201: IntakeResponseSchema } } }, async (request, reply) => {
    const body = IntakeBodySchema.parse(request.body ?? {});
    const { brief } = body;

    // Fail on an unregistered profile rather than accepting it. `getProductionProfile`
    // falls back to the field guide, so without this the operator would get a
    // silently different book and no error at all.
    if (!isKnownProductionProfile(brief.productionProfileId)) {
      throw new UserFacingError(
        `"${brief.productionProfileId}" is not a registered production profile. ` +
          `Use one of: ${listProductionProfiles().map((p) => p.id).join(', ')}.`,
        {
          code: 'Unknown Production Profile',
          errorCode: ERROR_CODES.UNCLASSIFIED,
          statusCode: 422,
        },
      );
    }

    // Idempotency. Re-posting the same brief returns the project it already
    // made — the guard against the duplicate-project state this platform has
    // been in before (two identical "THE WILDLANDS" rows).
    const hash = briefHash(body);
    const existing = (await listProjects()).find(
      (p) => (p.config as { intake?: { briefHash?: string } } | null)?.intake?.briefHash === hash,
    );
    if (existing) {
      return reply.send({
        projectId: existing.id,
        created: false,
        message: 'This exact brief was already taken in; returning the existing project.',
        readiness: await auditReadiness(existing.id),
      });
    }

    const config: ProjectConfig = {
      ...configFromBrief(brief),
      intake: { briefHash: hash, takenInAt: new Date().toISOString() },
    };
    const row = await createProject({ config });
    const projectId = row.id;

    const steps: Array<{ step: string; status: 'DONE' | 'SKIPPED' | 'FAILED'; detail: string }> = [
      { step: 'create', status: 'DONE', detail: `project ${projectId}` },
    ];

    // Each stage is called through the app's own HTTP surface so that intake
    // and the console run identical code paths, including their validation.
    const call = async (step: string, url: string, payload?: unknown) => {
      const res = await app.inject({
        method: 'POST',
        url,
        payload: payload ?? {},
        headers: { 'content-type': 'application/json', ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}) },
      });
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      steps.push({
        step,
        status: ok ? 'DONE' : 'FAILED',
        detail: ok ? `${res.statusCode}` : `${res.statusCode} ${(res.json() as { message?: string })?.message ?? res.body.slice(0, 200)}`,
      });
      return ok;
    };

    if (body.manuscript) {
      const uploaded = await call('manuscript', `/api/projects/${projectId}/manuscript`, {
        filename: body.manuscript.filename,
        ...(body.manuscript.markdown ? { markdown: body.manuscript.markdown } : {}),
        ...(body.manuscript.fileBase64 ? { fileBase64: body.manuscript.fileBase64 } : {}),
      });
      if (uploaded && !body.setupOnly) {
        // Breakdown and pagination belong to the AI whole-page track. Running
        // them on a typeset book would build manifests and page rows that
        // nothing ever reads, and a parse failure on either would report the
        // intake as broken for a book that is perfectly fine.
        const track = getProductionProfile(brief.productionProfileId).bodyRenderTrack;
        if (track === 'typeset') {
          const reason = 'not used by the typeset track — page breaks come from the typesetter';
          steps.push({ step: 'breakdown', status: 'SKIPPED', detail: reason });
          steps.push({ step: 'paginate', status: 'SKIPPED', detail: reason });
        } else {
          const broke = await call('breakdown', `/api/projects/${projectId}/manifests`);
          if (broke) await call('paginate', `/api/projects/${projectId}/paginate`, { mode: 'safe', confirmOrphanRenders: false });
          else steps.push({ step: 'paginate', status: 'SKIPPED', detail: 'breakdown did not succeed' });
        }
      }
    } else {
      steps.push({ step: 'manuscript', status: 'SKIPPED', detail: 'no manuscript in the brief' });
    }

    const readiness = await auditReadiness(projectId);
    return reply.code(201).send({ projectId, created: true, steps, readiness });
  });

  /** The pre-spend gate. Free, deterministic, read-only. */
  app.get(
    '/api/projects/:id/readiness',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: ReadinessReportSchema, 404: z.object({ error: z.string(), message: z.string(), statusCode: z.number() }) },
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const project = await getProject(id);
      if (!project) return reply.code(404).send({ error: 'Not Found', message: 'Project not found', statusCode: 404 });
      return reply.send(await auditReadiness(id));
    },
  );
}
