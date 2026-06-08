/**
 * Pagination v1 routes — flag-gated smoke tests.
 *
 * Verifies that every endpoint returns 503 when PAGINATION_V1_ENABLED is
 * false (the production default), so the routes can ship dormant without
 * accidentally exposing the new pipeline. The DB calls inside each handler
 * are deliberately not reached in these tests because the flag-check short-
 * circuits before any repository call — so the suite runs without a Postgres
 * instance, which matches the rest of the backend test suite.
 */

import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerPaginationRoutes } from '../api/pagination.routes.js';

vi.mock('../env.js', async () => {
  const actual = await vi.importActual<typeof import('../env.js')>('../env.js');
  return {
    ...actual,
    getEnv: () => ({
      ...actual.getEnv(),
      PAGINATION_V1_ENABLED: false,
    }),
  };
});

async function makeApp() {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await registerPaginationRoutes(app);
  await app.ready();
  return app;
}

describe('Pagination routes — flag off (default)', () => {
  it('POST /api/projects/:id/paginate returns 503 when the flag is off', async () => {
    const app = await makeApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/projects/00000000-0000-0000-0000-000000000000/paginate',
        payload: {},
      });
      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.error).toBe('Service Unavailable');
      expect(body.message).toContain('PAGINATION_V1_ENABLED');
    } finally {
      await app.close();
    }
  });

  it('GET /api/projects/:id/paginated-pages returns 503 when the flag is off', async () => {
    const app = await makeApp();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/projects/00000000-0000-0000-0000-000000000000/paginated-pages',
      });
      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.error).toBe('Service Unavailable');
    } finally {
      await app.close();
    }
  });

  it('GET /api/projects/:id/pagination-report returns 503 when the flag is off', async () => {
    const app = await makeApp();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/projects/00000000-0000-0000-0000-000000000000/pagination-report',
      });
      expect(res.statusCode).toBe(503);
    } finally {
      await app.close();
    }
  });

  it('GET /api/pages/:pageId/preview returns 503 when the flag is off', async () => {
    const app = await makeApp();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/pages/00000000-0000-0000-0000-000000000000/preview',
      });
      expect(res.statusCode).toBe(503);
    } finally {
      await app.close();
    }
  });

  it('POST /api/pages/:pageId/preview/approve returns 503 when the flag is off', async () => {
    const app = await makeApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pages/00000000-0000-0000-0000-000000000000/preview/approve',
        payload: { decidedBy: 'tester' },
      });
      expect(res.statusCode).toBe(503);
    } finally {
      await app.close();
    }
  });

  it('POST /api/pages/:pageId/preview/reject returns 503 when the flag is off', async () => {
    const app = await makeApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pages/00000000-0000-0000-0000-000000000000/preview/reject',
        payload: { decidedBy: 'tester', reason: 'too tight' },
      });
      expect(res.statusCode).toBe(503);
    } finally {
      await app.close();
    }
  });
});
