/**
 * POST /api/projects/:id/working-manuscript — the derived manuscript moves, the
 * canonical source does not.
 *
 * ─── WHAT THESE TESTS ARE DEFENDING ───────────────────────────────────────
 * A book's canonical hash is the only thing tying a printed artifact back to the
 * manuscript an author froze. This platform has already lost that once: a write
 * recorded a sanitized derivative as the canonical source, and from then on the
 * project could not prove what it came from.
 *
 * The ingestion endpoint reconstitutes BOTH artifacts from whatever bytes it is
 * given, which is right for ingestion and catastrophic for a downstream stage
 * that only means to rewrite the working copy. This route exists for that case,
 * so the property under test is not "the handler works" — it is that canonical
 * provenance is UNREACHABLE from here, by construction rather than by care.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CANONICAL_SHA = 'a'.repeat(64);
const CURRENT_SHA = createHash('sha256').update('current working manuscript', 'utf8').digest('hex');
const NEW_BODY = 'working manuscript with figures';
const NEW_SHA = createHash('sha256').update(NEW_BODY, 'utf8').digest('hex');

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const WORKING_KEY = `${PROJECT_ID}/manuscripts/BOOK.md`;
const CANONICAL_KEY = `${PROJECT_ID}/manuscripts/source/BOOK.md`;

/** In-memory object store, so a write that never happened is visible as such. */
const objects = new Map<string, Buffer>();
const writes: string[] = [];

let row: Record<string, unknown>;

vi.mock('../db/repositories/projects.repo.js', () => ({
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  listProjects: vi.fn(async () => []),
  setManuscript: vi.fn(),
  setProjectStatus: vi.fn(),
  updateProjectConfig: vi.fn(),
  getProject: vi.fn(async () => row),
  replaceWorkingManuscript: vi.fn(async (_id: string, w: { manuscriptPath: string; manuscriptSha256: string }) => {
    // Deliberately mirrors the real operation: only these two columns move.
    row = { ...row, manuscriptPath: w.manuscriptPath, manuscriptSha256: w.manuscriptSha256 };
    return row;
  }),
}));

vi.mock('../services/storage/project-storage.js', () => ({
  getProjectStorage: () => ({
    readProjectFile: async (relativePath: string) => {
      const b = objects.get(relativePath);
      if (!b) throw new Error(`no such object: ${relativePath}`);
      return b;
    },
    writeProjectFile: async (projectId: string, parts: string[], data: Buffer | string) => {
      const key = [projectId, ...parts].join('/');
      writes.push(key);
      objects.set(key, Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'));
      return { relativePath: key, sizeBytes: Buffer.byteLength(data as string) };
    },
  }),
}));

const { registerProjectRoutes } = await import('../api/projects.routes.js');

async function makeApp() {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await registerProjectRoutes(app);
  await app.ready();
  return app;
}

const post = async (payload: Record<string, unknown>) => {
  const app = await makeApp();
  try {
    return await app.inject({
      method: 'POST',
      url: `/api/projects/${PROJECT_ID}/working-manuscript`,
      payload,
    });
  } finally {
    await app.close();
  }
};

const validBody = () => ({
  markdown: NEW_BODY,
  expectedCurrentWorkingSha256: CURRENT_SHA,
  expectedCanonicalSha256: CANONICAL_SHA,
  expectedNewSha256: NEW_SHA,
});

beforeEach(() => {
  objects.clear();
  writes.length = 0;
  objects.set(WORKING_KEY, Buffer.from('current working manuscript', 'utf8'));
  objects.set(CANONICAL_KEY, Buffer.from('THE CANONICAL SOURCE', 'utf8'));
  row = {
    id: PROJECT_ID,
    manuscriptPath: WORKING_KEY,
    manuscriptSha256: CURRENT_SHA,
    canonicalManuscriptPath: CANONICAL_KEY,
    canonicalManuscriptSha256: CANONICAL_SHA,
    manuscriptSanitized: true,
  };
});

describe('working-manuscript route — the happy path', () => {
  it('updates the working object and the row together', async () => {
    const res = await post(validBody());
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.applied).toBe(true);
    expect(body.alreadyInTargetState).toBe(false);
    expect(body.manuscriptSha256).toBe(NEW_SHA);

    // storage and row agree
    expect(createHash('sha256').update(objects.get(WORKING_KEY)!).digest('hex')).toBe(NEW_SHA);
    expect(row.manuscriptSha256).toBe(NEW_SHA);
    expect(row.manuscriptPath).toBe(WORKING_KEY);
  });

  it('leaves canonical path and hash byte-for-byte unchanged', async () => {
    const canonicalBefore = Buffer.from(objects.get(CANONICAL_KEY)!);
    await post(validBody());

    expect(row.canonicalManuscriptSha256).toBe(CANONICAL_SHA);
    expect(row.canonicalManuscriptPath).toBe(CANONICAL_KEY);
    expect(objects.get(CANONICAL_KEY)!.equals(canonicalBefore)).toBe(true);
  });

  it('never writes any object under manuscripts/source/', async () => {
    await post(validBody());
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.some((k) => k.includes('/manuscripts/source/'))).toBe(false);
  });

  it('keeps the working manuscript at its existing path', async () => {
    await post(validBody());
    expect(writes.every((k) => k === WORKING_KEY)).toBe(true);
  });
});

describe('working-manuscript route — preconditions reject without mutating', () => {
  it('rejects a wrong current-working hash as a conflict', async () => {
    const res = await post({ ...validBody(), expectedCurrentWorkingSha256: 'b'.repeat(64) });
    expect(res.statusCode).toBe(409);
    expect(row.manuscriptSha256).toBe(CURRENT_SHA);
    expect(writes).toHaveLength(0);
  });

  it('rejects a wrong canonical hash as a conflict', async () => {
    const res = await post({ ...validBody(), expectedCanonicalSha256: 'c'.repeat(64) });
    expect(res.statusCode).toBe(409);
    expect(row.manuscriptSha256).toBe(CURRENT_SHA);
    expect(writes).toHaveLength(0);
  });

  it('rejects bytes that do not hash to the declared new sha', async () => {
    const res = await post({ ...validBody(), markdown: 'something else entirely' });
    expect(res.statusCode).toBe(422);
    expect(row.manuscriptSha256).toBe(CURRENT_SHA);
    expect(writes).toHaveLength(0);
  });
});

describe('working-manuscript route — idempotency', () => {
  it('a repeated request reports the state instead of rewriting it', async () => {
    const first = await post(validBody());
    expect(first.json().applied).toBe(true);
    const writesAfterFirst = writes.length;

    // The pipeline replays with the SAME body it sent before.
    const second = await post(validBody());
    expect(second.statusCode).toBe(200);
    expect(second.json().applied).toBe(false);
    expect(second.json().alreadyInTargetState).toBe(true);

    expect(writes.length).toBe(writesAfterFirst);
    expect(row.manuscriptSha256).toBe(NEW_SHA);
    expect(row.canonicalManuscriptSha256).toBe(CANONICAL_SHA);
  });
});

describe('replaceWorkingManuscript — the invariant, not the intention', () => {
  /**
   * Read the repository source and assert the canonical columns are absent from
   * the operation entirely. A behavioural test only shows today's handler does
   * not write them; this shows the operation CANNOT, which is the guarantee the
   * route depends on and the thing a future edit is most likely to erode.
   */
  it('cannot express a canonical column at all', () => {
    const src = readFileSync(new URL('../db/repositories/projects.repo.ts', import.meta.url), 'utf8');
    const start = src.indexOf('export async function replaceWorkingManuscript');
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf('\n}', start));

    expect(body).not.toMatch(/canonicalManuscriptPath/);
    expect(body).not.toMatch(/canonicalManuscriptSha256/);
    // and it really is an update of the two working columns
    expect(body).toMatch(/manuscriptPath:/);
    expect(body).toMatch(/manuscriptSha256:/);
  });
});
