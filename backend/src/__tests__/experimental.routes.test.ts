/**
 * Experimental routes — flag-gated smoke test.
 *
 * Mirrors pagination.routes.test.ts: the route must return 503 when
 * WHOLE_PAGE_EXPERIMENT_ENABLED is false (production default). The handler
 * short-circuits before any DB/OpenAI call, so the test runs without
 * Postgres or an API key.
 */

import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerExperimentalRoutes } from '../api/experimental.routes.js';

vi.mock('../env.js', async () => {
  const actual = await vi.importActual<typeof import('../env.js')>('../env.js');
  return {
    ...actual,
    getEnv: () => ({
      ...actual.getEnv(),
      WHOLE_PAGE_EXPERIMENT_ENABLED: false,
    }),
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

describe('Experimental routes — flag off (default)', () => {
  it('POST /api/experimental/whole-page-render/:pageId returns 503 when the flag is off', async () => {
    const app = await makeApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/experimental/whole-page-render/00000000-0000-0000-0000-000000000000',
        payload: { decidedBy: 'tester' },
      });
      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.error).toBe('Service Unavailable');
      expect(body.message).toContain('WHOLE_PAGE_EXPERIMENT_ENABLED');
    } finally {
      await app.close();
    }
  });
});
