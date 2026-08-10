import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ingestManuscript } from '../pipeline/stage-1-ingestion/ingest-manuscript.js';
import type { ProjectStorage } from '../services/storage/project-storage.js';

/**
 * The defect: ingest sanitized the upload and stored ONLY the sanitized result,
 * so a frozen manuscript's SHA-256 could never be verified against the platform.
 * Observed on NO ONE TOLD ME THAT: one emoji in a heading changed the stored
 * hash, and the author's frozen hash appeared nowhere in the system.
 */

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** In-memory storage that records every write, so we can assert on both files. */
function stubStorage() {
  const writes = new Map<string, string>();
  const storage: ProjectStorage = {
    async listProjectFiles(projectId, folder) {
      const prefix = `${projectId}/${folder}/`;
      return [...writes.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
    },
    async writeProjectFile(projectId, parts, data) {
      const relativePath = [projectId, ...parts].join('/');
      const text = typeof data === 'string' ? data : data.toString('utf8');
      writes.set(relativePath, text);
      return { relativePath, sha256: sha(text), sizeBytes: Buffer.byteLength(text, 'utf8') } as never;
    },
    async readProjectFile(relativePath) {
      return Buffer.from(writes.get(relativePath) ?? '', 'utf8');
    },
  };
  return { storage, writes };
}

/**
 * The upload route's canonical-provenance predicate, mirrored exactly.
 *
 * Refuse when the submitted bytes ARE the stored working copy, unless we can
 * PROVE the working copy is itself the canonical source. Deliberately does not
 * consult `manuscriptSanitized`: that column is NULL on every project ingested
 * before canonical retention existed, and gating on it left the guard inert for
 * exactly those rows (observed live — a legacy project had its canonical slot
 * overwritten with the derivative because the flag was null, not true).
 */
function wouldRefuse(
  submittedSha: string,
  row: { manuscriptSha256: string | null; canonicalManuscriptSha256: string | null },
): boolean {
  if (!row.manuscriptSha256) return false;
  const workingIsProvablyCanonical =
    row.canonicalManuscriptSha256 !== null && row.canonicalManuscriptSha256 === row.manuscriptSha256;
  return submittedSha === row.manuscriptSha256 && !workingIsProvablyCanonical;
}

const PROJECT_ID = '2e4267b0-9f98-4a81-ab28-f726893a4f93';
// .trim() matters: the sanitizer strips trailing whitespace per line, so a
// fixture ending in a space is not "already clean".
const body = 'Some ordinary paragraph of manuscript prose that is long enough to count. '.repeat(4).trim();

/** Reproduces the real defect: an emoji in a heading, which the sanitizer strips. */
const WITH_EMOJI = [
  '# Chapter 1',
  '## No One Told Me That',
  body,
  '',
  '### 🚩 FIRST — the ones that don\'t wait',
  body,
].join('\n');

/** Same manuscript with nothing for the sanitizer to change. */
const ALREADY_CLEAN = [
  '# Chapter 1',
  '## No One Told Me That',
  body,
  '',
  '### FIRST — the ones that don\'t wait',
  body,
].join('\n');

describe('canonical source is retained byte-for-byte at ingest', () => {
  it('REGRESSION: stores the uploaded bytes unchanged even when sanitization edits them', async () => {
    const { storage, writes } = stubStorage();
    const r = await ingestManuscript(
      { projectId: PROJECT_ID, filename: 'FROZEN.md', markdown: WITH_EMOJI },
      storage,
    );

    // The canonical artifact round-trips EXACTLY — this is the frozen hash.
    expect(writes.get(r.canonicalSource.relativePath)).toBe(WITH_EMOJI);
    expect(r.canonicalSource.sha256).toBe(sha(WITH_EMOJI));

    // The working copy is a DERIVATIVE with its own, different hash.
    expect(r.sanitized).toBe(true);
    expect(r.manuscript.sha256).not.toBe(r.canonicalSource.sha256);
    expect(writes.get(r.manuscript.relativePath)).not.toContain('🚩');

    // Two distinct files. The derivative never overwrites the source.
    expect(r.manuscript.relativePath).not.toBe(r.canonicalSource.relativePath);
    expect(r.canonicalSource.relativePath).toContain('/manuscripts/source/');
  });

  it('reports sanitized=false and matching hashes when the upload is already clean', async () => {
    const { storage, writes } = stubStorage();
    const r = await ingestManuscript(
      { projectId: PROJECT_ID, filename: 'CLEAN.md', markdown: ALREADY_CLEAN },
      storage,
    );
    expect(r.sanitized).toBe(false);
    expect(r.canonicalSource.sha256).toBe(r.manuscript.sha256);
    expect(writes.get(r.canonicalSource.relativePath)).toBe(ALREADY_CLEAN);
  });

  it('writes the canonical source even if it is the only thing that survives review', async () => {
    // Both artifacts are always written — canonical retention is not conditional
    // on whether sanitization did anything.
    const { storage, writes } = stubStorage();
    const r = await ingestManuscript(
      { projectId: PROJECT_ID, filename: 'CLEAN.md', markdown: ALREADY_CLEAN },
      storage,
    );
    expect(writes.has(r.canonicalSource.relativePath)).toBe(true);
    expect(writes.has(r.manuscript.relativePath)).toBe(true);
    expect(writes.size).toBe(2);
  });

  /**
   * THE LAUNDERING DEFECT, end to end.
   *
   * The console restores the sanitized WORKING copy into the Manuscript
   * textarea. Re-uploading that text would record a derivative as the canonical
   * artifact and make the provenance panel confidently display the wrong frozen
   * hash. The server refuses it; canonical provenance must not move.
   */
  it('REGRESSION: refuses to overwrite canonical provenance with the restored working copy', async () => {
    const { storage, writes } = stubStorage();

    // 1. Genuine canonical upload — the 🚩 heading is present in the source.
    const first = await ingestManuscript(
      { projectId: PROJECT_ID, filename: 'FROZEN.md', markdown: WITH_EMOJI },
      storage,
    );
    const canonicalShaBefore = first.canonicalSource.sha256;
    expect(canonicalShaBefore).toBe(sha(WITH_EMOJI));
    expect(first.sanitized).toBe(true);

    // 2. The project row, as the upload route would have written it.
    const projectRow = {
      manuscriptSha256: first.manuscript.sha256,
      manuscriptSanitized: first.sanitized,
    };

    // 3. "Reload the project": the console restores the stored WORKING copy.
    const restoredText = writes.get(first.manuscript.relativePath)!;
    expect(restoredText).not.toContain('🚩');

    // 4. The operator clicks Upload without dropping a new source file. This is
    //    the exact predicate the upload route applies before touching storage.
    const submittedSha = sha(restoredText);
    const refused = wouldRefuse(submittedSha, {
      manuscriptSha256: projectRow.manuscriptSha256,
      canonicalManuscriptSha256: first.canonicalSource.sha256,
    });
    expect(refused).toBe(true);

    // 5. Canonical provenance is untouched — no second ingest ran.
    expect(canonicalShaBefore).toBe(sha(WITH_EMOJI));
    expect(writes.get(first.canonicalSource.relativePath)).toBe(WITH_EMOJI);
    expect(writes.size).toBe(2);
  });

  it('REGRESSION: refuses on a LEGACY row whose canonical hash is null', () => {
    // Projects ingested before canonical retention have canonical=null and
    // sanitized=null. The first version of this guard keyed off
    // `sanitized === true` and therefore did nothing here — and this is the
    // state of every pre-existing project, so it was the most exposed case, not
    // the least. Observed live: a legacy project's canonical slot was
    // overwritten with its own derivative.
    const workingSha = sha('sanitized working text');
    expect(
      wouldRefuse(workingSha, { manuscriptSha256: workingSha, canonicalManuscriptSha256: null }),
    ).toBe(true);
  });

  it('allows a genuine new source on a legacy row', () => {
    // The repair path: dropping the real file submits bytes that differ from the
    // stored working copy, so the guard stands aside and canonical gets fixed.
    const workingSha = sha('sanitized working text');
    expect(
      wouldRefuse(sha('the real source bytes'), {
        manuscriptSha256: workingSha,
        canonicalManuscriptSha256: null,
      }),
    ).toBe(false);
  });

  it('does NOT refuse when sanitization was a no-op (nothing can be laundered)', async () => {
    // If working == canonical, submitting those bytes is indistinguishable from
    // submitting the real file and produces identical provenance. Refusing here
    // would be a false positive that blocks a legitimate re-upload.
    const { storage } = stubStorage();
    const r = await ingestManuscript(
      { projectId: PROJECT_ID, filename: 'CLEAN.md', markdown: ALREADY_CLEAN },
      storage,
    );
    expect(r.sanitized).toBe(false);
    expect(
      wouldRefuse(sha(ALREADY_CLEAN), {
        manuscriptSha256: r.manuscript.sha256,
        canonicalManuscriptSha256: r.canonicalSource.sha256,
      }),
    ).toBe(false);
  });

  it('accepts a genuine re-upload of the real source file after a restore', async () => {
    const { storage } = stubStorage();
    const first = await ingestManuscript(
      { projectId: PROJECT_ID, filename: 'FROZEN.md', markdown: WITH_EMOJI },
      storage,
    );
    // The operator drops the ACTUAL file again: its bytes are the canonical
    // ones, which never equal the sanitized working hash.
    expect(
      wouldRefuse(sha(WITH_EMOJI), {
        manuscriptSha256: first.manuscript.sha256,
        canonicalManuscriptSha256: first.canonicalSource.sha256,
      }),
    ).toBe(false);

    const second = await ingestManuscript(
      { projectId: PROJECT_ID, filename: 'FROZEN.md', markdown: WITH_EMOJI },
      storage,
    );
    expect(second.canonicalSource.sha256).toBe(first.canonicalSource.sha256);
  });

  it('still produces a usable outline from the WORKING copy', async () => {
    const { storage } = stubStorage();
    const r = await ingestManuscript(
      { projectId: PROJECT_ID, filename: 'FROZEN.md', markdown: WITH_EMOJI },
      storage,
    );
    expect(r.outline.chapters).toHaveLength(1);
    expect(r.outline.totalEntries).toBeGreaterThan(0);
  });
});
