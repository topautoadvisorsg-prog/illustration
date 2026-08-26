/**
 * ENGINE PROVENANCE — what code built a book, and whether it can be built again.
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * NO ONE TOLD ME THAT was frozen at rev24 on 2026-08-20: 170 pages, 11 of 11
 * illustrations placed, 26 inert overrides. Rebuilt from the byte-identical
 * manuscript five days later it came back with 9 illustrations, 2 orphaned, 28
 * inert overrides and 24 pages of reflowed text. Nothing about the book had
 * changed. The renderer had.
 *
 * The layout-standard registry already refuses to resolve "latest" precisely so
 * an approved design cannot move under a finished book. That protects the
 * design and stops there: the ENGINE that reads the standard was free to change
 * underneath it, and did, because work committed for a different title lives in
 * the same shared pipeline.
 *
 * Three things had to be true at once for this to happen, and all three were:
 *
 *   1. the freeze record named the manuscript and the standard, and said
 *      nothing whatsoever about the code;
 *   2. production builds read the WORKING TREE, so uncommitted edits were live
 *      in production without ever being committed, reviewed or attributable;
 *   3. the layout standard this book is pinned to, `educational-nonfiction@3`,
 *      was itself uncommitted on the day of the freeze and was swept into an
 *      unrelated commit two days later.
 *
 * Point 3 is why this module hashes FILE CONTENT rather than trusting a commit
 * id. There is no commit whose tree built rev24. A fingerprint over the bytes
 * actually read describes that state truthfully; `git rev-parse HEAD` would
 * have recorded a tree that never produced the book.
 *
 * ─── WHAT IS AND IS NOT GUARANTEED ───────────────────────────────────────────
 * Same fingerprint means the renderer sources are byte-for-byte what they were.
 * It deliberately does NOT cover node_modules, the Chromium binary, or the
 * fonts on disk. Those matter too, and pretending one hash covers them would be
 * worse than being explicit: this closes the hole that actually bit us and names
 * the ones it does not.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/** backend/src/pipeline -> repo root */
export const REPO_ROOT = resolve(HERE, '..', '..', '..');

/**
 * The sources whose content decides how a typeset page comes out.
 *
 * Listed explicitly rather than globbed. A glob silently widens as the tree
 * grows, so a fingerprint would change for reasons that cannot affect a page,
 * and every old freeze would read as unreproducible the first time someone adds
 * an unrelated file to the directory. Explicit means a change to this list is a
 * decision somebody made, visible in review.
 *
 * `layout-standards/` is included WHOLE and by directory listing, because the
 * incident turned on a standard file that was not yet committed — the failure
 * mode is precisely a standard appearing, changing, or vanishing.
 */
const ENGINE_DIRS = ['backend/src/pipeline/typeset/layout-standards'];
const ENGINE_FILES = [
  'backend/src/pipeline/typeset/typeset-book.ts',
  'backend/src/pipeline/typeset/render-typeset.ts',
  'backend/src/pipeline/typeset/build-typeset-interior.ts',
  'backend/src/pipeline/typeset/stamp-illustrations.ts',
  'backend/src/pipeline/typeset/front-matter.ts',
  'backend/src/pipeline/typeset/manuscript-parse-gate.ts',
  'backend/src/pipeline/stage-6-layout/render-pdf.ts',
  'backend/src/pipeline/stage-6-layout/render-html.ts',
  'backend/src/pipeline/stage-6-layout/page-geometry.ts',
];

export interface EngineFile {
  path: string;
  sha256: string;
}
export interface EngineFingerprint {
  engineFingerprint: string;
  engineFiles: EngineFile[];
  gitCommit?: string;
  gitBranch?: string;
  engineDirty: boolean;
  dirtyFiles: string[];
}

function git(args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

function listEngineSources(): string[] {
  const out = [...ENGINE_FILES];
  for (const dir of ENGINE_DIRS) {
    const abs = join(REPO_ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs).sort()) {
      if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(`${dir}/${name}`);
    }
  }
  return [...new Set(out)].sort();
}

/**
 * Hash the renderer as it exists on disk right now.
 *
 * Line endings are normalised before hashing. A Windows checkout rewrites LF to
 * CRLF on the way out of git, so hashing raw bytes would make the same source
 * fingerprint differently on two machines and every cross-platform rebuild would
 * look like a renderer change.
 */
export function computeEngineFingerprint(): EngineFingerprint {
  const files: EngineFile[] = [];
  for (const rel of listEngineSources()) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
    files.push({ path: rel, sha256: createHash('sha256').update(text, 'utf8').digest('hex') });
  }
  if (!files.length) {
    throw new Error(
      `No renderer sources found under ${REPO_ROOT}. build-provenance resolved the repo root incorrectly; ` +
        `a fingerprint over an empty set would silently certify every build as identical.`,
    );
  }
  const engineFingerprint = createHash('sha256')
    .update(files.map((f) => `${f.path}:${f.sha256}`).join('\n'), 'utf8')
    .digest('hex');

  // Dirty is asked ONLY about the files in the fingerprint. An unrelated edit
  // elsewhere in the tree cannot change a page and must not block a build.
  const tracked = files.map((f) => f.path);
  const porcelain = git(['status', '--porcelain', '--', ...tracked]) ?? '';
  const dirtyFiles = porcelain
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\S+\s+/, ''))
    .map((p) => relative(REPO_ROOT, resolve(REPO_ROOT, p)).replace(/\\/g, '/'))
    .filter((p) => tracked.includes(p));

  return {
    engineFingerprint,
    engineFiles: files,
    gitCommit: git(['rev-parse', 'HEAD']),
    gitBranch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    engineDirty: dirtyFiles.length > 0,
    dirtyFiles,
  };
}

/** Set to a REASON, not to "1". A build that had to be forced should say why. */
export const DIRTY_OVERRIDE_ENV = 'WL_ALLOW_DIRTY_ENGINE';

export class DirtyEngineError extends Error {
  constructor(public readonly fingerprint: EngineFingerprint) {
    super(
      `Renderer sources are modified and this is a production build.\n\n` +
        fingerprint.dirtyFiles.map((f) => `    ${f}`).join('\n') +
        `\n\nA production build must come from committed code. Uncommitted renderer edits ` +
        `are how NO ONE TOLD ME THAT lost two illustrations and 24 pages of pagination to work ` +
        `written for a different book: the changes were live in production without ever being ` +
        `committed or reviewed.\n\n` +
        `Commit the work, or move it to a branch, then rebuild. To build anyway — for development ` +
        `only, never for a freeze — set ${DIRTY_OVERRIDE_ENV} to a short reason, which is recorded ` +
        `in the build provenance.`,
    );
    this.name = 'DirtyEngineError';
  }
}

/**
 * Refuse a production build from a dirty renderer.
 *
 * The override takes a REASON rather than a boolean on purpose: it lands in the
 * provenance record, so a build that was forced can never later be mistaken for
 * one that was clean.
 */
export function assertEngineCleanForProduction(fp: EngineFingerprint = computeEngineFingerprint()): {
  fingerprint: EngineFingerprint;
  dirtyOverrideReason?: string;
} {
  if (!fp.engineDirty) return { fingerprint: fp };
  const reason = process.env[DIRTY_OVERRIDE_ENV];
  if (!reason || !reason.trim() || reason.trim() === '1') {
    throw new DirtyEngineError(fp);
  }
  return { fingerprint: fp, dirtyOverrideReason: reason.trim() };
}

/** Stable stringify, so a config hash does not depend on key order. */
export function canonicalJson(value: unknown): string {
  const walk = (v: any): any => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.keys(v)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = walk(v[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

export function configSnapshotSha256(config: unknown): string {
  return createHash('sha256').update(canonicalJson(config), 'utf8').digest('hex');
}

export interface ReproducibilityVerdict {
  reproducible: boolean;
  reason: string;
}

/**
 * Compare a recorded freeze against the engine in front of us.
 *
 * Deliberately returns a verdict instead of throwing. The caller decides whether
 * a mismatch is fatal — rebuilding a frozen book for delivery must stop, while an
 * operator asking "can I still rebuild this?" wants an answer, not an exception.
 *
 * A freeze with NO provenance is reported as not reproducible. That is the honest
 * answer for every book frozen before this existed, and it is better than
 * silently rebuilding one on today's renderer and calling it the same book.
 */
export function assertReproducible(
  recorded: { engineFingerprint?: string; layoutStandardId?: string; configSnapshotSha256?: string } | undefined,
  current: { engineFingerprint: string; layoutStandardId: string; configSnapshotSha256: string },
): ReproducibilityVerdict {
  if (!recorded?.engineFingerprint) {
    return {
      reproducible: false,
      reason:
        'This freeze predates engine provenance, so the renderer that built it was never recorded. ' +
        'Rebuilding it now uses TODAY\'s renderer, which is not the same book. Reconstruct the historical ' +
        'engine and record provenance before treating a rebuild as equivalent.',
    };
  }
  if (recorded.engineFingerprint !== current.engineFingerprint) {
    return {
      reproducible: false,
      reason:
        `Renderer changed since this book was frozen.\n` +
        `    recorded ${recorded.engineFingerprint}\n` +
        `    current  ${current.engineFingerprint}\n` +
        `Rebuild against the recorded engine, or migrate the book explicitly and re-run its full QA. ` +
        `Do not let a frozen book drift onto the current renderer by default.`,
    };
  }
  if (recorded.layoutStandardId && recorded.layoutStandardId !== current.layoutStandardId) {
    return {
      reproducible: false,
      reason: `Layout standard changed: recorded ${recorded.layoutStandardId}, current ${current.layoutStandardId}.`,
    };
  }
  if (recorded.configSnapshotSha256 && recorded.configSnapshotSha256 !== current.configSnapshotSha256) {
    return {
      reproducible: false,
      reason:
        `Project config changed since the freeze.\n` +
        `    recorded ${recorded.configSnapshotSha256}\n` +
        `    current  ${current.configSnapshotSha256}\n` +
        `Config is mutable and zod .default() writes defaulted keys back on parse, so a schema change made ` +
        `for another book can alter this one's stored config without anyone editing it. Rebuild from the ` +
        `recorded configSnapshot.`,
    };
  }
  return { reproducible: true, reason: 'Engine, standard and config all match the freeze record.' };
}
