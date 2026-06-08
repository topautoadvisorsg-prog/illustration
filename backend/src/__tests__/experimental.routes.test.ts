/**
 * Whole-page render routes — flag-gated smoke tests.
 *
 * Every route returns 503 when WHOLE_PAGE_EXPERIMENT_ENABLED is false. The
 * flag-check short-circuits before any DB/OpenAI call, so the suite runs
 * without Postgres or an API key — matching the rest of the backend tests.
 */

import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerExperimentalRoutes } from '../api/experimental.routes.js';

vi.mock('../env.js', async () => {
  const actual = await vi.importActual<typeof import('../env.js')>('../env.js');
  return {
    ...actual,
    getEnv: () => ({ ...actual.getEnv(), WHOLE_PAGE_EXPERIMENT_ENABLED: false }),
  };
});

async function makeApp() {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await registerExperimentalRoutes(app);
  await app.ready();
  return app;
}

const UUID = '00000000-0000-0000-0000-000000000000';

const ROUTES: Array<{ method: 'GET' | 'POST'; url: string; payload?: unknown }> = [
  { method: 'POST', url: `/api/experimental/whole-page-render/${UUID}`, payload: { decidedBy: 't' } },
  { method: 'POST', url: `/api/experimental/whole-page-render/${UUID}/regenerate`, payload: { decidedBy: 't' } },
  { method: 'GET', url: `/api/experimental/whole-page-render/page/${UUID}/versions` },
  { method: 'POST', url: `/api/experimental/whole-page-render/${UUID}/approve`, payload: { decidedBy: 't' } },
  { method: 'POST', url: `/api/experimental/whole-page-render/${UUID}/print-prep`, payload: {} },
  { method: 'POST', url: `/api/experimental/whole-page-render/${UUID}/select-for-book`, payload: { decidedBy: 't' } },
  { method: 'POST', url: `/api/experimental/whole-page-render/${UUID}/reject`, payload: { decidedBy: 't', reason: 'x' } },
  { method: 'GET', url: `/api/experimental/whole-page-render/project/${UUID}` },
  { method: 'POST', url: `/api/experimental/whole-page-render/project/${UUID}/assemble`, payload: {} },
  { method: 'GET', url: `/api/experimental/whole-page-render/file?path=x/experimental/whole-page/y.png` },
];

describe('Whole-page render routes — flag off (default)', () => {
  for (const route of ROUTES) {
    it(`${route.method} ${route.url.split('?')[0]} returns 503 when the flag is off`, async () => {
      const app = await makeApp();
      try {
        const res = await app.inject({
          method: route.method,
          url: route.url,
          ...(route.payload ? { payload: route.payload } : {}),
        });
        expect(res.statusCode).toBe(503);
        const body = res.json();
        expect(body.error).toBe('Service Unavailable');
        expect(body.message).toContain('WHOLE_PAGE_EXPERIMENT_ENABLED');
      } finally {
        await app.close();
      }
    });
  }
});
