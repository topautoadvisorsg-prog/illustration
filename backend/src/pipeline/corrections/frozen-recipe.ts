/**
 * THE FROZEN BUILD RECIPE — everything needed to rebuild a frozen book, in one
 * place, so nobody has to rediscover it.
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Correcting two sentences in NO ONE TOLD ME THAT took roughly ten full book
 * builds. Two of them were the correction. The rest were rediscovery: which
 * layout standard is this book pinned to, which production profile, does
 * `chaptersStartRecto` need to be false, how many page targets are there, does
 * the current config still reproduce the shipped artifact at all.
 *
 * Every one of those answers already existed. `book-proof-*` provenance records
 * the standard, the profile, the config snapshot, the manuscript hash and the
 * engine fingerprint. Nothing read it back. So each correction re-derived, by
 * building the whole book, facts that were sitting in the project row.
 *
 * This module reads them instead.
 *
 * ─── THE EXPENSIVE PART IS NOT WHAT IT LOOKS LIKE ────────────────────────────
 * Measured, not assumed: a full 170-page build with 11 stamped illustrations is
 * 19.6 seconds. Parsing a finished PDF into a page model is 0.9 seconds. Ten
 * builds is three minutes of compute. Compute was never the problem.
 *
 * The cost was DECISIONS AND DETOURS: a one-off script written per step, each
 * re-implementing env loading and hashing and each with its own bugs; facts
 * re-derived by experiment because nothing read them back; a side investigation
 * into an unrelated operator's uncommitted file. So the point of this module is
 * not to save CPU. It is to make the answers retrievable so nobody re-derives
 * them, and to let one command do what six ad-hoc scripts did.
 *
 * A control build is still skipped, and still worth skipping — not for its 20
 * seconds, but because "does the config still reproduce the freeze" turns from
 * something you reason about into a string compare with an answer.
 */
import { createHash } from 'node:crypto';
import type { ProjectConfig, ProofArtifact } from '@wildlands/shared';
import { computeEngineFingerprint, configSnapshotSha256 } from '../build-provenance.js';

export interface FrozenRecipe {
  /** The freeze this recipe came from, e.g. `book-proof-rev26`. */
  freezeId: string;
  title: string;
  storagePath: string;
  pdfSha256: string;
  pageCount: number;
  fileSizeBytes: number;
  layoutStandardId: string;
  productionProfileId?: string;
  manuscriptSha256: string;
  canonicalManuscriptSha256?: string;
  configSnapshotSha256: string;
  /** The config as frozen. Build from THIS, not from live config. */
  configSnapshot: ProjectConfig;
  engineFingerprint: string;
  engineDirty: boolean;
  dirtyFiles: string[];
  illustrations: { blockId: string; page?: number; assetSha256?: string }[];
  builtAt: string;
  buildOptions: { chaptersStartRecto: boolean };
  /**
   * True when `buildOptions` came from the freeze record; false when the record
   * predates the field and the value is a default.
   *
   * This distinction is the whole point. `chaptersStartRecto` changes the page
   * count of the book, and reproducing NO ONE TOLD ME THAT returned 178 pages
   * instead of 170 until the value was found by trying both. An inferred value
   * that happens to be right is indistinguishable from one that is wrong, so the
   * fast path refuses to treat an inferred recipe as a verified baseline.
   */
  buildOptionsRecorded: boolean;
}

export class NoFrozenRecipeError extends Error {
  constructor(projectId: string) {
    super(
      `Project ${projectId} has no BOOK_PROOF carrying build provenance.\n\n` +
        `The fast path needs a recorded recipe to compare against. A book frozen before ` +
        `provenance existed cannot use it: there is nothing that says which renderer built ` +
        `it, so a "regression" against it would only be measuring today's renderer.\n\n` +
        `Freeze the book once with provenance, then corrections can take the fast path.`,
    );
    this.name = 'NoFrozenRecipeError';
  }
}

/** The current, un-superseded BOOK_PROOF. Superseded ones are history. */
export function currentFreeze(config: ProjectConfig): ProofArtifact | undefined {
  const proofs = (config.proofArtifacts ?? []).filter(
    (a) => a.kind === 'BOOK_PROOF' && !a.title.includes('SUPERSEDED'),
  );
  // Last wins: freezes are appended, so the tail is the newest.
  return proofs[proofs.length - 1];
}

export function loadFrozenRecipe(projectId: string, config: ProjectConfig): FrozenRecipe {
  const proof = currentFreeze(config);
  if (!proof?.provenance) throw new NoFrozenRecipeError(projectId);
  const p = proof.provenance;
  const snapshot = p.configSnapshot as ProjectConfig;
  return {
    freezeId: proof.id,
    title: proof.title,
    storagePath: proof.storagePath,
    pdfSha256: proof.sha256,
    pageCount: proof.totalPages,
    fileSizeBytes: proof.fileSizeBytes,
    layoutStandardId: p.layoutStandardId,
    productionProfileId: p.productionProfileId,
    manuscriptSha256: p.manuscriptSha256,
    canonicalManuscriptSha256: p.canonicalManuscriptSha256,
    configSnapshotSha256: p.configSnapshotSha256,
    configSnapshot: snapshot,
    engineFingerprint: p.engineFingerprint,
    engineDirty: p.engineDirty,
    dirtyFiles: p.dirtyFiles ?? [],
    illustrations: p.illustrations ?? [],
    builtAt: p.builtAt,
    buildOptions: p.buildOptions ?? { chaptersStartRecto: false },
    buildOptionsRecorded: Boolean(p.buildOptions),
  };
}

export interface RecipeIntegrity {
  /** True when a rebuild from this recipe should reproduce the frozen layout. */
  intact: boolean;
  configMatches: boolean;
  engineMatches: boolean;
  currentConfigSha: string;
  currentEngineFingerprint: string;
  /** Non-empty when something moved; each entry is a reason to escalate. */
  reasons: string[];
}

/**
 * Can we still reproduce the freeze — WITHOUT building anything?
 *
 * This is the check that replaces the control build. If the config the book was
 * frozen from still hashes the same, and the renderer sources still hash the
 * same, then a rebuild reproduces the frozen layout by construction, and
 * spending minutes to demonstrate that is spending minutes to learn nothing.
 *
 * Note it compares against the FROZEN config snapshot, not live config. Live
 * config drifts — a zod `.default()` added for another book writes new keys into
 * every config that gets parsed. Building from the snapshot is what makes a
 * correction a correction rather than a silent re-issue.
 */
export function checkRecipeIntegrity(recipe: FrozenRecipe, liveConfig: ProjectConfig): RecipeIntegrity {
  const currentConfigSha = configSnapshotSha256(recipe.configSnapshot);
  const fp = computeEngineFingerprint();
  const reasons: string[] = [];

  const configMatches = currentConfigSha === recipe.configSnapshotSha256;
  if (!configMatches) {
    reasons.push(
      `The frozen config snapshot no longer hashes to its recorded value ` +
        `(${currentConfigSha.slice(0, 12)}… vs ${recipe.configSnapshotSha256.slice(0, 12)}…). ` +
        `The record has been altered since the freeze; do not trust it as a baseline.`,
    );
  }

  const engineMatches = fp.engineFingerprint === recipe.engineFingerprint;
  if (!engineMatches) {
    reasons.push(
      `Renderer changed since the freeze (${fp.engineFingerprint.slice(0, 12)}… vs ` +
        `${recipe.engineFingerprint.slice(0, 12)}…). A rebuild is not comparable to the frozen ` +
        `artifact until this is understood. Compare engineFiles to see which source moved.`,
    );
  }

  // Live config differing from the snapshot is NOT a failure — it is the normal
  // state after any config edit. It is reported so the operator knows a rebuild
  // from the snapshot will ignore whatever changed.
  const liveSha = configSnapshotSha256(liveConfig);
  if (liveSha !== recipe.configSnapshotSha256) {
    reasons.push(
      `NOTE (not a blocker): live config differs from the frozen snapshot ` +
        `(${liveSha.slice(0, 12)}…). The fast path builds from the SNAPSHOT, so live-only ` +
        `changes will not appear. Intentional config changes need a new freeze, not a correction.`,
    );
  }

  return {
    intact: configMatches && engineMatches,
    configMatches,
    engineMatches,
    currentConfigSha,
    currentEngineFingerprint: fp.engineFingerprint,
    reasons,
  };
}

export const sha256 = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');
