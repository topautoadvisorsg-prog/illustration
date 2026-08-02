import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  hasZodFastifySchemaValidationErrors,
} from 'fastify-type-provider-zod';
import { ZodError } from 'zod';
import { getEnv } from './env.js';
import { UserFacingError } from './lib/user-facing-error.js';
import { issuesToFields, summaryMessage } from './lib/validation-messages.js';
import { registerHealthRoutes } from './api/health.routes.js';
import { registerProjectRoutes } from './api/projects.routes.js';
import { registerPageRoutes } from './api/pages.routes.js';
import { registerAgentRoutes } from './api/agents.routes.js';
import { registerPaginationRoutes } from './api/pagination.routes.js';
import { registerWholePageRoutes } from './api/whole-page.routes.js';
import { registerSubjectBadgeRoutes } from './api/subject-badges.routes.js';
import { registerSupervisorRoutes } from './api/supervisor.routes.js';
import { registerEpubRoutes } from './api/epub.routes.js';

export async function buildServer(): Promise<FastifyInstance> {
  const env = getEnv();
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
    // A full book manuscript (and base64-encoded DOCX/PDF) far exceeds Fastify's
    // 1 MB default, which silently rejects full uploads. Allow up to 25 MB.
    bodyLimit: 25 * 1024 * 1024,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Centralized error-translation layer. Without this, Fastify's default
  // handler sends raw Zod validation output straight to the operator (schema
  // paths like "body/config/authorName", or — for a manually-thrown ZodError
  // that escapes a route handler — a JSON-dumped issues array). Every path
  // below ends in a plain sentence per field, never a schema path, raw JSON,
  // or stack trace. Routes that already reply with a structured error via
  // `reply.code().send(...)` never reach this handler at all — it only
  // catches thrown/uncaught errors.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof UserFacingError) {
      reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
        statusCode: error.statusCode,
        fields: error.fields,
        action: error.action,
      });
      return;
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const issues = error.validation.map((v) => v.params.issue);
      const fields = issuesToFields(issues);
      reply.code(400).send({
        error: 'Validation Error',
        message: summaryMessage(fields),
        statusCode: 400,
        fields,
      });
      return;
    }

    if (error instanceof ZodError) {
      const fields = issuesToFields(error.issues);
      reply.code(400).send({
        error: 'Validation Error',
        message: summaryMessage(fields),
        statusCode: 400,
        fields,
      });
      return;
    }

    request.log.error(error);
    reply.send(error);
  });

  await app.register(cors, {
    origin: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    // Expose render headers so the browser can read page counts on the PDF responses.
    exposedHeaders: ['x-total-pages', 'x-page-count', 'x-preflight-passed'],
  });

  // Simple single-shared-password gate. When CONSOLE_PASSWORD is set, every
  // request must present it — either as `Authorization: Bearer <pw>` (API/fetch)
  // or as a `?k=<pw>` query param (so <img>/<iframe>/PDF loads work without
  // custom headers). `/health` and the API docs stay open. CORS preflight
  // (OPTIONS) is never blocked. When the env var is unset the gate is disabled
  // (local/dev), and we log a clear warning so production never runs open by
  // accident. No user accounts — the goal is only to keep casual visitors out.
  const consolePassword = (process.env.CONSOLE_PASSWORD || '').trim();
  if (consolePassword) {
    app.addHook('onRequest', async (req, reply) => {
      if (req.method === 'OPTIONS') return; // let CORS preflight through
      const path = req.url.split('?')[0] ?? '';
      if (path === '/health' || path === '/' || path.startsWith('/api/docs')) return;
      const auth = req.headers['authorization'];
      const headerKey = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
      const q = req.query as Record<string, unknown> | undefined;
      const queryKey = typeof q?.k === 'string' ? q.k : undefined;
      if (headerKey === consolePassword || queryKey === consolePassword) return;
      reply.code(401).send({ error: 'unauthorized' });
    });
  } else {
    app.log.warn('CONSOLE_PASSWORD is not set — the API is OPEN (no access gate).');
  }

  await app.register(sensible);
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'The Wildlands Publishing Platform API',
        version: '0.1.0',
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  await registerHealthRoutes(app);
  await registerProjectRoutes(app);
  await registerPageRoutes(app);
  await registerAgentRoutes(app);
  // Pagination v1 — routes are registered always; each one self-gates on
  // PAGINATION_V1_ENABLED and returns 503 when the flag is off.
  await registerPaginationRoutes(app);
  // Whole-page render pipeline — self-gates on WHOLE_PAGE_RENDER_ENABLED.
  await registerWholePageRoutes(app);
  // Subject + Badge metadata cleanup (Standard v1.1) — deterministic, no AI.
  await registerSubjectBadgeRoutes(app);
  // Book Production Supervisor — orchestrates the no-spend half of the pipeline
  // and returns a unified PipelineReport with PASS / WARNING / BLOCKED verdict +
  // next-action CTA. Image generation stays gated behind operator authorization.
  await registerSupervisorRoutes(app);
  // Stage 8 — Kindle EPUB export. Read-only; builds a reflowable EPUB from the
  // existing structured book data. Does not touch the print pipeline.
  await registerEpubRoutes(app);

  app.get('/', async () => ({
    service: 'wildlands-backend',
    docs: `http://${env.HOST}:${env.PORT}/api/docs`,
  }));

  return app;
}
