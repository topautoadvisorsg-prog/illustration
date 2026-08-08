import { ERROR_CODES } from './error-codes.js';

/**
 * Registry format version — NOT a code family, and not bumped when codes are
 * added (adding entries is normal, ongoing growth). Bump it only on a
 * breaking change to the registry's SHAPE (an ErrorRegistryEntry field is
 * renamed, removed, or changes meaning) — the kind of change that could
 * break something reading docs/ERROR_REGISTRY.md or the diagnostics API
 * programmatically. See docs/ERROR_HANDLING_STANDARD.md §1 (frozen
 * contracts) before touching this.
 */
export const ERROR_REGISTRY_VERSION = 'v1';

/**
 * The single source of truth for every WL-#### code's metadata — what it
 * means, why it fires, how an operator recovers, and how severe it is. This
 * is what docs/ERROR_REGISTRY.md is generated FROM (see
 * scripts/generate-error-registry-doc.ts) — never hand-edit that doc
 * directly, it will be overwritten.
 *
 * `severity`:
 *   'validation'  — an ordinary input mistake, expected to happen regularly,
 *                    fixed by editing a field. Not worth alerting on.
 *   'structural'  — the manuscript/project isn't in a usable shape yet
 *                    (missing prerequisite, bad structure). Common during
 *                    setup, should trend toward zero as the operator learns
 *                    the format — worth watching if it doesn't.
 *   'system'      — an error the translation layer didn't have a specific
 *                    code for. Should be rare; a code showing up here often
 *                    in telemetry means it needs a real entry (mint one).
 */
export type ErrorSeverity = 'validation' | 'structural' | 'system';

/** Workflow step key this error is raised in — matches STEPS keys in
 *  frontend/src/ProductionConsole.js (project/manuscript/setup/breakdown/
 *  paginate/matter/render/assemble), or 'any' when it isn't step-specific. */
export type WorkflowStep =
  | 'project'
  | 'manuscript'
  | 'setup'
  | 'breakdown'
  | 'paginate'
  | 'matter'
  | 'render'
  | 'assemble'
  | 'any';

export interface ErrorRegistryEntry {
  code: string;
  /** Short human title, e.g. "Missing Author". */
  title: string;
  /** What the operator actually sees (the general shape — exact wording can
   *  include specifics like a chapter name that this template omits). */
  friendlyMessage: string;
  /** What in the code actually triggers this, for debugging. */
  technicalCause: string;
  /** Plain-English description of how the operator recovers. */
  recovery: string;
  step: WorkflowStep;
  severity: ErrorSeverity;
}

// Every value here is already checked against ErrorRegistryEntry by this
// Record's own type — no per-entry wrapper function needed for that.
export const ERROR_REGISTRY: Record<string, ErrorRegistryEntry> = {
  [ERROR_CODES.FIELD_GENERIC]: {
    code: ERROR_CODES.FIELD_GENERIC,
    title: 'Field Invalid (Unmapped)',
    friendlyMessage: '<Field> is invalid.',
    technicalCause:
      'A Zod schema validation issue on a field with no specific entry in FIELD_ERROR_CODES (validation-messages.ts) — the fallback label/code path.',
    recovery: 'Fix the highlighted field. If this shows up often for the same field, mint it a real code.',
    step: 'project',
    severity: 'validation',
  },
  [ERROR_CODES.FIELD_REQUIRED_TITLE]: {
    code: ERROR_CODES.FIELD_REQUIRED_TITLE,
    title: 'Missing Title',
    friendlyMessage: 'Title is required.',
    technicalCause: 'ProjectConfigSchema.title failed Zod min(1) on Create Project or Book Setup save.',
    recovery: 'Enter a book title.',
    step: 'project',
    severity: 'validation',
  },
  [ERROR_CODES.FIELD_REQUIRED_AUTHOR_NAME]: {
    code: ERROR_CODES.FIELD_REQUIRED_AUTHOR_NAME,
    title: 'Missing Author',
    friendlyMessage: 'Author / pen name is required.',
    technicalCause: 'ProjectConfigSchema.authorName failed Zod min(1) on Create Project or Book Setup save.',
    recovery: 'Enter an author name.',
    step: 'project',
    severity: 'validation',
  },
  [ERROR_CODES.FIELD_INVALID_VOLUME]: {
    code: ERROR_CODES.FIELD_INVALID_VOLUME,
    title: 'Invalid Volume',
    friendlyMessage: 'Volume must be a positive number.',
    technicalCause: 'ProjectConfigSchema.volume failed Zod int().positive() — should be unreachable from the UI since the form always coerces to >=1, but reachable via direct API calls.',
    recovery: 'Set Volume to a whole number of 1 or more.',
    step: 'setup',
    severity: 'validation',
  },
  [ERROR_CODES.FIELD_INVALID_SUBTITLE]: {
    code: ERROR_CODES.FIELD_INVALID_SUBTITLE,
    title: 'Invalid Subtitle',
    friendlyMessage: 'Subtitle is invalid.',
    technicalCause: 'ProjectConfigSchema.subtitle failed Zod validation (subtitle is optional, so this is rare — usually a type mismatch from a direct API call).',
    recovery: 'Fix or clear the Subtitle field.',
    step: 'project',
    severity: 'validation',
  },

  [ERROR_CODES.INVALID_MANUSCRIPT_STRUCTURE]: {
    code: ERROR_CODES.INVALID_MANUSCRIPT_STRUCTURE,
    title: 'Invalid Manuscript Structure',
    friendlyMessage: 'The manuscript could not be converted into a valid book structure. Check the chapter and entry formatting and try again.',
    technicalCause: 'buildDeterministicManifestResult (generate-manifests.ts) hit a ManifestGenerationResultSchema validation failure that wasn\'t the specific empty-chapter case — a safety-net fallback.',
    recovery: 'Return to Manuscript, re-check the required structure card, and re-upload.',
    step: 'breakdown',
    severity: 'structural',
  },
  [ERROR_CODES.NO_CHAPTERS_DETECTED]: {
    code: ERROR_CODES.NO_CHAPTERS_DETECTED,
    title: 'No Chapters Detected',
    friendlyMessage: 'This manuscript doesn\'t contain any chapters. Mark each chapter with a top-level "# Chapter Title" heading before running Breakdown.',
    technicalCause: 'assertUsableManuscriptOutline (parse-manuscript-outline.ts): outline.chapters.length === 0. Runs both on manuscript upload and on Breakdown.',
    recovery: 'Return to Manuscript and add at least one "# Chapter Title" heading.',
    step: 'manuscript',
    severity: 'structural',
  },
  [ERROR_CODES.NO_ENTRIES_DETECTED]: {
    code: ERROR_CODES.NO_ENTRIES_DETECTED,
    title: 'No Entries Detected',
    friendlyMessage: 'This manuscript doesn\'t contain any entries. Mark each entry with a "### Entry Title" heading inside its chapter before running Breakdown.',
    technicalCause: 'assertUsableManuscriptOutline (parse-manuscript-outline.ts): outline.totalEntries === 0. Runs both on manuscript upload and on Breakdown.',
    recovery: 'Return to Manuscript and add at least one "### Entry Title" heading inside a chapter.',
    step: 'manuscript',
    severity: 'structural',
  },
  [ERROR_CODES.EMPTY_CHAPTER]: {
    code: ERROR_CODES.EMPTY_CHAPTER,
    title: 'Empty Chapter',
    friendlyMessage: 'Chapter <N> ("<title>") doesn\'t contain any entries. Each chapter needs at least one "### Entry Title" heading before Breakdown can continue.',
    technicalCause: 'buildDeterministicManifestResult (generate-manifests.ts): a specific chapter\'s entries array is empty, caught from ManifestGenerationResultSchema\'s per-chapter min(1) on entries.',
    recovery: 'Return to Manuscript and add at least one "### Entry Title" heading to the named chapter.',
    step: 'breakdown',
    severity: 'structural',
  },

  [ERROR_CODES.MANUSCRIPT_FORMAT_GENERIC]: {
    code: ERROR_CODES.MANUSCRIPT_FORMAT_GENERIC,
    title: 'Manuscript Format Problem (Unclassified)',
    friendlyMessage: 'The uploaded manuscript could not be read.',
    technicalCause: 'Reserved fallback for a manuscript-format problem that does not match UnsupportedManuscriptError\'s known reasons — not currently thrown anywhere; kept for future use.',
    recovery: 'Re-check the file and re-upload; if this keeps happening, mint a specific code for the actual cause.',
    step: 'manuscript',
    severity: 'structural',
  },
  [ERROR_CODES.UNSUPPORTED_MANUSCRIPT_FORMAT]: {
    code: ERROR_CODES.UNSUPPORTED_MANUSCRIPT_FORMAT,
    title: 'Unsupported Manuscript Format',
    friendlyMessage: 'e.g. "Uploaded text file is empty." / "No selectable text found in the PDF (it may be scanned images)."',
    technicalCause: 'UnsupportedManuscriptError thrown in extract-manuscript.ts (empty file, DOCX/PDF missing bytes, or no extractable text) and translated at the upload route\'s catch site.',
    recovery: 'Upload a non-empty .md/.markdown/.txt/.docx/.pdf with real, selectable text.',
    step: 'manuscript',
    severity: 'validation',
  },
  [ERROR_CODES.MANUSCRIPT_MISSING]: {
    code: ERROR_CODES.MANUSCRIPT_MISSING,
    title: 'No Manuscript On File',
    friendlyMessage: 'No manuscript on file. Upload one before running Breakdown. / Stored manuscript file is missing. Re-upload the manuscript.',
    technicalCause: 'POST /api/projects/:id/manifests: project.manuscriptPath is null, or the stored file 404s (ENOENT) when read from storage.',
    recovery: 'Go to Manuscript and upload (or re-upload) the manuscript.',
    step: 'breakdown',
    severity: 'structural',
  },

  [ERROR_CODES.WORKING_COPY_NOT_A_SOURCE]: {
    code: ERROR_CODES.WORKING_COPY_NOT_A_SOURCE,
    title: 'Working Copy Is Not A Source',
    friendlyMessage:
      'That is the stored working copy, not a source file. It is the sanitized derivative of your canonical manuscript, so uploading it would replace the canonical source with a derivative and record the wrong hash. Drop the original manuscript file instead.',
    technicalCause:
      "POST /api/projects/:id/manuscript: the submitted markdown hashes to the project's stored manuscript_sha256 (the sanitized working copy) while manuscript_sanitized is true, so the working copy provably differs from the canonical source. The console restores the working copy into the Manuscript textarea, so clicking Upload without dropping a file submits derived bytes.",
    recovery:
      'Drop the original manuscript file into the Manuscript step. The character count shown must match the real file, not the restored copy.',
    step: 'manuscript',
    severity: 'validation',
  },

  [ERROR_CODES.UNCLASSIFIED]: {
    code: ERROR_CODES.UNCLASSIFIED,
    title: 'Unclassified Validation Error',
    friendlyMessage: 'The request was invalid. / Please fix the highlighted fields.',
    technicalCause: 'A raw ZodError reached the global error handler without going through a specific UserFacingError path — the safety net for validation failures we haven\'t seen before.',
    recovery: 'No specific recovery — if this code appears in telemetry, find the throw site and give it a real code.',
    step: 'any',
    severity: 'system',
  },
};

/** All registry entries, for iteration (docs generation, tests). */
export function allErrorRegistryEntries(): ErrorRegistryEntry[] {
  return Object.values(ERROR_REGISTRY);
}
