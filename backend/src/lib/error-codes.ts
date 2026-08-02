/**
 * Stable, developer-facing codes for every user-facing error the platform
 * produces. The operator only ever sees the translated message (see
 * validation-messages.ts / user-facing-error.ts) — these codes exist for
 * logs, support conversations, docs, and future automation. See
 * docs/ERROR_HANDLING_STANDARD.md for the policy this backs.
 *
 * Rule: once assigned, a code's MEANING must never change — retire it and
 * mint a new one instead of repurposing it. Message WORDING is free to
 * change any time without touching the code.
 *
 * Families:
 *   WL-1xxx — field-level validation (Create Project / Book Setup forms)
 *   WL-2xxx — manuscript structure (Breakdown)
 *   WL-3xxx — manuscript file / format (upload)
 *   WL-9xxx — unclassified fallback. This should stay rare — a code that
 *             shows up here often in telemetry is a signal to mint a real
 *             code for it, not a permanent home.
 */
export const ERROR_CODES = {
  FIELD_GENERIC: 'WL-1000',
  FIELD_REQUIRED_TITLE: 'WL-1001',
  FIELD_REQUIRED_AUTHOR_NAME: 'WL-1002',
  FIELD_INVALID_VOLUME: 'WL-1003',
  FIELD_INVALID_SUBTITLE: 'WL-1004',

  INVALID_MANUSCRIPT_STRUCTURE: 'WL-2000',
  NO_CHAPTERS_DETECTED: 'WL-2001',
  NO_ENTRIES_DETECTED: 'WL-2002',
  EMPTY_CHAPTER: 'WL-2003',

  MANUSCRIPT_FORMAT_GENERIC: 'WL-3000',
  UNSUPPORTED_MANUSCRIPT_FORMAT: 'WL-3001',
  MANUSCRIPT_MISSING: 'WL-3002',

  UNCLASSIFIED: 'WL-9000',
} as const;

const FIELD_ERROR_CODES: Record<string, string> = {
  title: ERROR_CODES.FIELD_REQUIRED_TITLE,
  authorName: ERROR_CODES.FIELD_REQUIRED_AUTHOR_NAME,
  volume: ERROR_CODES.FIELD_INVALID_VOLUME,
  subtitle: ERROR_CODES.FIELD_INVALID_SUBTITLE,
};

/** Maps a dot-joined field path (e.g. "config.authorName") to its stable code. */
export function codeForFieldPath(path: Array<string | number>): string {
  const lastSegment = [...path].reverse().find((p) => typeof p === 'string');
  return (lastSegment && FIELD_ERROR_CODES[String(lastSegment)]) || ERROR_CODES.FIELD_GENERIC;
}
