/**
 * End-to-end regression coverage for the error-handling/diagnostics platform
 * (docs/ERROR_HANDLING_STANDARD.md) — real routes via buildServer() +
 * app.inject(), same pattern as server.test.ts. Unlike error-handling.test.ts
 * (a minimal Fastify instance, no DB), these hit the real dev database, so
 * every test that creates a project cleans it up itself (finally block).
 *
 * Explicitly NOT covered here, and not faked: browser-refresh recovery and
 * the render-approval recovery flow are frontend/browser behaviors
 * (localStorage persistence, React state, actual AI image spend) — this repo
 * has no Playwright/E2E browser tooling, so there is no cheap, real way to
 * assert them from a backend test. If that coverage is wanted later, it
 * needs a browser-level test tool, not a backend integration test pretending
 * to be one.
 *
 * Known characteristic, not a bug: these tests all pass reliably alone or in
 * a targeted subset. Under a full `vitest run` (all ~60 files in parallel
 * worker threads), the extra real network/DB round trips here occasionally
 * push an unrelated CPU-heavy test (sharp-based image composition in
 * cover-print.test.ts / print-prep.test.ts, or a DB-timing-sensitive guard
 * in pagination.routes.guards.test.ts) into a transient failure under
 * resource contention — a different one each run, never a repeatable logic
 * failure. server.test.ts already hits the same live DB the same way; this
 * file is more of the same pattern, not a new category of risk. If the full
 * suite needs to be flake-free under parallel execution, that's a test
 * runner concurrency/pool-tuning project of its own, not something to
 * improvise here.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { ERROR_CODES } from '../lib/error-codes.js';
import { ERROR_REGISTRY, ERROR_REGISTRY_VERSION, allErrorRegistryEntries } from '../lib/error-registry.js';
import { getErrorFrequencyReport } from '../db/repositories/error-events.repo.js';
import { getOperationTimingReport } from '../db/repositories/operation-events.repo.js';

const authHeaders = { Authorization: `Bearer ${process.env.CONSOLE_PASSWORD || ''}` };

async function createTestProject(app: FastifyInstance, title: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: authHeaders,
    payload: { config: { volume: 1, title, authorName: 'E2E Test' } },
  });
  expect(res.statusCode).toBe(201);
  return res.json().project.id as string;
}

async function deleteTestProject(app: FastifyInstance, id: string) {
  await app.inject({ method: 'DELETE', url: `/api/projects/${id}`, headers: authHeaders });
}

describe('Create Project — complete workflow', () => {
  it('rejects a blank author with a field-level translated error, then succeeds once fixed', async () => {
    const app = await buildServer();
    let projectId: string | undefined;
    try {
      const bad = await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: authHeaders,
        payload: { config: { volume: 1, title: 'E2E Create Project Test', authorName: '' } },
      });
      expect(bad.statusCode).toBe(400);
      const badBody = bad.json();
      expect(badBody.errorCode).toBe(ERROR_CODES.FIELD_REQUIRED_AUTHOR_NAME);
      expect(badBody.fields).toEqual([
        expect.objectContaining({ path: 'config.authorName', label: 'Author / pen name', errorCode: ERROR_CODES.FIELD_REQUIRED_AUTHOR_NAME }),
      ]);
      expect(bad.payload).not.toMatch(/body\/|instancePath|"issue":/);

      const good = await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: authHeaders,
        payload: { config: { volume: 1, title: 'E2E Create Project Test', authorName: 'E2E Test' } },
      });
      expect(good.statusCode).toBe(201);
      projectId = good.json().project.id;
      expect(good.json().project.authorName).toBe('E2E Test');
    } finally {
      if (projectId) await deleteTestProject(app, projectId);
      await app.close();
    }
  });
});

describe('Manuscript/Breakdown — recovery flow', () => {
  it('WL-2003 on an empty chapter, with a Return-to-Manuscript action; fixing it and re-running Breakdown succeeds', async () => {
    const app = await buildServer();
    let projectId: string | undefined;
    try {
      projectId = await createTestProject(app, 'E2E Breakdown Recovery Test');

      const upload1 = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/manuscript`,
        headers: authHeaders,
        payload: {
          filename: 'm.md',
          markdown: '# CHAPTER 1: EMPTY\n\nNo entries in this one.\n\n# CHAPTER 2: REAL\n\n### An Entry\n\nBody text.\n',
        },
      });
      expect(upload1.statusCode).toBe(200);

      const breakdown1 = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/manifests`, headers: authHeaders });
      expect(breakdown1.statusCode).toBe(400);
      const errBody = breakdown1.json();
      expect(errBody.errorCode).toBe(ERROR_CODES.EMPTY_CHAPTER);
      expect(errBody.message).toContain('CHAPTER 1');
      expect(errBody.action).toEqual({ type: 'navigate', target: 'manuscript', label: 'Return to Manuscript' });
      expect(typeof errBody.correlationId).toBe('string');
      // The regression this whole layer exists to prevent.
      expect(breakdown1.payload).not.toMatch(/"code":"too_small"|"path":\[/);

      const upload2 = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/manuscript`,
        headers: authHeaders,
        payload: {
          filename: 'm.md',
          markdown: '# CHAPTER 1: FIXED\n\n### Fixed Entry\n\nNow has content.\n\n# CHAPTER 2: REAL\n\n### An Entry\n\nBody text.\n',
        },
      });
      expect(upload2.statusCode).toBe(200);

      const breakdown2 = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/manifests`, headers: authHeaders });
      expect(breakdown2.statusCode).toBe(200);
      expect(breakdown2.json().summary.totalChapters).toBe(2);
    } finally {
      if (projectId) await deleteTestProject(app, projectId);
      await app.close();
    }
  });

  it('WL-3002 when Breakdown is attempted with no manuscript on file', async () => {
    const app = await buildServer();
    let projectId: string | undefined;
    try {
      projectId = await createTestProject(app, 'E2E No Manuscript Test');
      const res = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/manifests`, headers: authHeaders });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.errorCode).toBe(ERROR_CODES.MANUSCRIPT_MISSING);
      expect(body.action?.target).toBe('manuscript');
    } finally {
      if (projectId) await deleteTestProject(app, projectId);
      await app.close();
    }
  });
});

describe('Diagnostics endpoints — shape and registry integrity', () => {
  it('GET /api/diagnostics/errors returns a well-shaped report tagged with the registry version', async () => {
    const app = await buildServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/diagnostics/errors?hours=24', headers: authHeaders });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.registryVersion).toBe(ERROR_REGISTRY_VERSION);
      expect(typeof body.totalErrors).toBe('number');
      expect(Array.isArray(body.topCodes)).toBe(true);
      expect(Array.isArray(body.topPaths)).toBe(true);
      expect(body.recovery).toEqual(
        expect.objectContaining({ clicked: expect.any(Number), succeeded: expect.any(Number) }),
      );
    } finally {
      await app.close();
    }
  });

  it('GET /api/diagnostics/renders returns a well-shaped report', async () => {
    const app = await buildServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/diagnostics/renders?hours=24', headers: authHeaders });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(typeof body.totalRenders).toBe('number');
      expect(typeof body.failedRenders).toBe('number');
    } finally {
      await app.close();
    }
  });

  it('GET /api/diagnostics/registry matches the in-process ERROR_REGISTRY exactly', async () => {
    const app = await buildServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/diagnostics/registry', headers: authHeaders });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.version).toBe(ERROR_REGISTRY_VERSION);
      expect(body.entries).toHaveLength(allErrorRegistryEntries().length);
      const wl1002 = body.entries.find((e: { code: string }) => e.code === ERROR_CODES.FIELD_REQUIRED_AUTHOR_NAME);
      expect(wl1002).toEqual(ERROR_REGISTRY[ERROR_CODES.FIELD_REQUIRED_AUTHOR_NAME]);
    } finally {
      await app.close();
    }
  });
});

describe('Telemetry event generation', () => {
  it('a translated error increments the error_events count for its code within the reporting window', async () => {
    const app = await buildServer();
    try {
      const before = await getErrorFrequencyReport(1);
      const beforeCount = before.topCodes.find((c) => c.errorCode === ERROR_CODES.FIELD_REQUIRED_TITLE)?.count ?? 0;

      const res = await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: authHeaders,
        payload: { config: { volume: 1, title: '', authorName: `e2e-telemetry-${randomUUID()}` } },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().errorCode).toBe(ERROR_CODES.FIELD_REQUIRED_TITLE);

      const after = await getErrorFrequencyReport(1);
      const afterCount = after.topCodes.find((c) => c.errorCode === ERROR_CODES.FIELD_REQUIRED_TITLE)?.count ?? 0;
      expect(afterCount).toBe(beforeCount + 1);
    } finally {
      await app.close();
    }
  });
});

describe('Performance timing (backend/src/lib/timing.ts)', () => {
  it('a successful Breakdown records a "breakdown" operation_events row via GET /api/diagnostics/operations', async () => {
    const app = await buildServer();
    let projectId: string | undefined;
    try {
      const before = await getOperationTimingReport(1);
      const beforeCount = before.operations.find((o) => o.operation === 'breakdown')?.count ?? 0;

      projectId = await createTestProject(app, 'E2E Operation Timing Test');
      const upload = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/manuscript`,
        headers: authHeaders,
        payload: { filename: 'm.md', markdown: '# CHAPTER 1: TIMING\n\n### An Entry\n\nBody text.\n' },
      });
      expect(upload.statusCode).toBe(200);

      const breakdown = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/manifests`, headers: authHeaders });
      expect(breakdown.statusCode).toBe(200);

      const afterViaEndpoint = await app.inject({ method: 'GET', url: '/api/diagnostics/operations?hours=1', headers: authHeaders });
      expect(afterViaEndpoint.statusCode).toBe(200);
      const afterBody = afterViaEndpoint.json();
      const afterRow = afterBody.operations.find((o: { operation: string }) => o.operation === 'breakdown');
      expect(afterRow).toBeDefined();
      expect(afterRow.count).toBe(beforeCount + 1);
      expect(afterRow.avgDurationMs).toBeGreaterThan(0);
      expect(afterRow.successRate).toBeGreaterThan(0);
    } finally {
      if (projectId) await deleteTestProject(app, projectId);
      await app.close();
    }
  });
});
