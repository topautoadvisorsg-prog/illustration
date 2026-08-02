/**
 * Regression tests for the centralized error-translation layer
 * (docs/ERROR_HANDLING_STANDARD.md). Uses a minimal Fastify instance — no
 * database, no real routes — so these run fast and never touch the live DB.
 */
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { z, ZodError } from 'zod';
import { describe, expect, it } from 'vitest';
import { registerErrorHandler } from '../error-handler.js';
import { UserFacingError } from '../user-facing-error.js';
import { ERROR_CODES } from '../error-codes.js';
import { ERROR_REGISTRY, allErrorRegistryEntries, type WorkflowStep } from '../error-registry.js';

// Must track frontend/src/ProductionConsole.js's STEPS keys, plus 'any' for
// step-agnostic entries. Kept as a plain literal list (not a cross-package
// import) so this test has no dependency on the frontend build.
const KNOWN_FRONTEND_STEPS = new Set<WorkflowStep>([
  'project',
  'manuscript',
  'setup',
  'breakdown',
  'paginate',
  'matter',
  'render',
  'assemble',
  'any',
]);

function buildTestApp() {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  app.post('/user-facing', { schema: { body: z.object({}) } }, async () => {
    throw new UserFacingError('Chapter 1 ("Intro") doesn\'t contain any entries.', {
      code: 'Empty Chapter',
      errorCode: ERROR_CODES.EMPTY_CHAPTER,
      statusCode: 400,
      action: { type: 'navigate', target: 'manuscript', label: 'Return to Manuscript' },
    });
  });

  app.post(
    '/schema-validated',
    { schema: { body: z.object({ authorName: z.string().min(1), title: z.string().min(1) }) } },
    async () => ({ ok: true }),
  );

  app.post('/raw-zod', async () => {
    z.object({ chapters: z.array(z.string()).min(1) }).parse({ chapters: [] });
  });

  app.get('/boom', async () => {
    throw new Error('unexpected internal failure');
  });

  return app;
}

describe('error registry — data integrity', () => {
  it('every entry has all required, non-empty fields', () => {
    for (const e of allErrorRegistryEntries()) {
      expect(e.code, 'code').toMatch(/^WL-\d{4}$/);
      expect(e.title.length, `${e.code} title`).toBeGreaterThan(0);
      expect(e.friendlyMessage.length, `${e.code} friendlyMessage`).toBeGreaterThan(0);
      expect(e.technicalCause.length, `${e.code} technicalCause`).toBeGreaterThan(0);
      expect(e.recovery.length, `${e.code} recovery`).toBeGreaterThan(0);
      expect(['validation', 'structural', 'system'], `${e.code} severity`).toContain(e.severity);
      expect(KNOWN_FRONTEND_STEPS.has(e.step), `${e.code} step "${e.step}" is not a known workflow step`).toBe(true);
    }
  });

  it('every ERROR_CODES value has a matching registry entry', () => {
    for (const code of Object.values(ERROR_CODES)) {
      expect(ERROR_REGISTRY[code], `no registry entry for ${code}`).toBeDefined();
    }
  });

  it('no two entries share a code (object keys already guarantee this, but guard the invariant explicitly)', () => {
    const codes = allErrorRegistryEntries().map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('UserFacingError -> HTTP response', () => {
  it('produces the declared status code and a full, well-shaped body', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/user-facing', payload: {} });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('Empty Chapter');
    expect(body.errorCode).toBe(ERROR_CODES.EMPTY_CHAPTER);
    expect(body.message).toContain('doesn\'t contain any entries');
    expect(body.action).toEqual({ type: 'navigate', target: 'manuscript', label: 'Return to Manuscript' });
    expect(typeof body.correlationId).toBe('string');
    expect(body.correlationId.length).toBeGreaterThan(0);
  });

  it('gives every occurrence a distinct correlationId', async () => {
    const app = buildTestApp();
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: '/user-facing', payload: {} }),
      app.inject({ method: 'POST', url: '/user-facing', payload: {} }),
    ]);
    expect(a.json().correlationId).not.toBe(b.json().correlationId);
  });
});

describe('Fastify schema validation -> HTTP response', () => {
  it('translates a missing required field into a plain sentence with a field code, never a schema path', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/schema-validated', payload: { title: 'x' } });
    expect(res.statusCode).toBe(400);
    const raw = res.payload;
    const body = res.json();

    expect(body.message).toBe('Author / pen name is required.');
    expect(body.fields).toHaveLength(1);
    expect(body.fields[0]).toMatchObject({ path: 'authorName', label: 'Author / pen name', errorCode: ERROR_CODES.FIELD_REQUIRED_AUTHOR_NAME });
    expect(body.errorCode).toBe(ERROR_CODES.FIELD_REQUIRED_AUTHOR_NAME);

    // The regression this whole layer exists to prevent: a Zod/AJV schema
    // path or instancePath leaking into what the operator sees.
    expect(raw).not.toMatch(/body\/|instancePath|schemaPath|"issue":/);
  });

  it('never leaks the raw Zod issues array shape (code/minimum/inclusive/exact keys)', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/schema-validated', payload: {} });
    const raw = res.payload;
    for (const rawZodKey of ['"minimum"', '"inclusive"', '"exact"', '"received"']) {
      expect(raw, `raw payload should not contain ${rawZodKey}`).not.toContain(rawZodKey);
    }
  });
});

describe('raw ZodError safety net -> HTTP response', () => {
  it('translates an uncaught ZodError instead of dumping its issues array', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/raw-zod' });
    expect(res.statusCode).toBe(400);
    const raw = res.payload;
    const body = res.json();

    expect(body.message.length).toBeGreaterThan(0);
    expect(typeof body.errorCode).toBe('string');
    expect(typeof body.correlationId).toBe('string');
    // No leftover ZodIssue shape or stack trace.
    expect(raw).not.toMatch(/"code":"too_small"|"path":\[|\bat\s+\S+\s+\(/);
  });

  it('is a genuine ZodError under the hood (sanity check on the test fixture itself)', () => {
    let caught: unknown;
    try {
      z.object({ chapters: z.array(z.string()).min(1) }).parse({ chapters: [] });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ZodError);
  });
});

describe('generic/uncaught errors -> no stack trace ever reaches the operator', () => {
  // A generic (non-UserFacingError, non-Zod) throw is a real internal bug —
  // that class of error deliberately isn't translated (see
  // docs/ERROR_HANDLING_STANDARD.md §1: only operator-caused conditions go
  // through UserFacingError). Fastify's own default serialization still
  // applies here, and the guarantee this test protects is narrower but firm:
  // whatever it does, the multi-frame .stack never ends up in the JSON body,
  // even though the single-line .message legitimately does.
  it('a plain thrown Error\'s .stack never appears in the response body', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/boom' });
    const body = res.json();
    expect(body.stack).toBeUndefined();
    // Multi-frame stack traces look like "at functionName (file.ts:12:34)" —
    // that shape should never appear, regardless of which field it'd be in.
    expect(res.payload).not.toMatch(/at\s+\S+\s+\(.*:\d+:\d+\)/);
  });
});
