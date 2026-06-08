/**
 * Pagination routes — guard tests with the flag ON.
 *
 * Verifies the 409 approval-protection guard on POST /paginate. Lives in its
 * own file because vi.mock is file-scoped — the sibling test file pins the
 * env mock to `PAGINATION_V1_ENABLED: false`, and this file needs it true.
 *
 * The repo + project loader are also mocked so the route's runtime behavior
 * can be exercised without a real Postgres connection.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

vi.mock('../env.js', async () => {
  const actual = await vi.importActual<typeof import('../env.js')>('../env.js');
  return {
    ...actual,
    getEnv: () => ({
      ...actual.getEnv(),
      PAGINATION_V1_ENABLED: true,
    }),
  };
});

const mockState = {
  approvedCount: 0,
  projectExists: true,
};

vi.mock('../db/repositories/projects.repo.js', () => ({
  getProject: vi.fn(async (id: string) =>
    mockState.projectExists
      ? { id, config: { volume: 1, title: 'T', authorName: 'A' } }
      : null,
  ),
}));

vi.mock('../db/repositories/manifests.repo.js', () => ({
  // Empty manifest list -> route returns 400; the 409 guard runs first, so
  // the 409 tests never reach this stub. Defensive default.
  listManifests: vi.fn(async () => []),
}));

vi.mock('../db/repositories/pagination.repo.js', () => ({
  countApprovedPages: vi.fn(async () => mockState.approvedCount),
  persistPaginatedPages: vi.fn(async () => ({ pagesWritten: 0 })),
  getPaginatedPageById: vi.fn(async () => null),
  getPaginationReport: vi.fn(async () => ({
    projectId: 'x', totalPages: 0, openers: 0, continuations: 0, compacted: 0,
    fitDistribution: { PENDING: 0, FITS: 0, TIGHT: 0, OVERFLOW: 0, UNDERFILL: 0 },
    approvedPages: 0, pendingApproval: 0, perChapter: [],
  })),
  listPaginatedPagesForProject: vi.fn(async () => []),
  recordPageApproval: vi.fn(async () => { throw new Error('not used in guard tests'); }),
  getEntryMetaByKeys: vi.fn(async () => new Map()),
}));

async function makeApp() {
  const { registerPaginationRoutes } = await import('../api/pagination.routes.js');
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await registerPaginationRoutes(app);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockState.approvedCount = 0;
  mockState.projectExists = true;
});

afterEach(() => vi.clearAllMocks());

describe('POST /paginate — approval protection guard (flag on)', () => {
  it('returns 409 when approved pages exist and mode is not "replace"', async () => {
    mockState.approvedCount = 7;
    const app = await makeApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/projects/00000000-0000-0000-0000-000000000001/paginate',
        payload: {},
      });
      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.error).toBe('Conflict');
      expect(body.message).toContain('7 approved page');
      expect(body.message).toContain('mode:"replace"');
    } finally {
      await app.close();
    }
  });

  it('proceeds past the guard when mode is "replace" (lands on the empty-manifest 400)', async () => {
    mockState.approvedCount = 7;
    const app = await makeApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/projects/00000000-0000-0000-0000-000000000001/paginate',
        payload: { mode: 'replace' },
      });
      // Mock has no manifests, so the route falls through to the 400 path
      // (no PAGE manifests). The important thing is that the 409 guard did
      // NOT fire — we got past it.
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.message).toMatch(/no page manifests/i);
    } finally {
      await app.close();
    }
  });

  it('proceeds when no approved pages exist (no guard to trip)', async () => {
    mockState.approvedCount = 0;
    const app = await makeApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/projects/00000000-0000-0000-0000-000000000001/paginate',
        payload: {},
      });
      expect(res.statusCode).toBe(400); // empty-manifest branch
    } finally {
      await app.close();
    }
  });

  it('returns 404 when the project does not exist', async () => {
    mockState.projectExists = false;
    const app = await makeApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/projects/00000000-0000-0000-0000-000000000001/paginate',
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
