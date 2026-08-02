import type { ZodIssue } from 'zod';
import type { ApiErrorField } from '@wildlands/shared';

/**
 * Field-path -> operator-facing label, matching the exact wording used on
 * screen so a translated error and the form it's about clearly refer to the
 * same thing. Keyed by the dot-joined path with array indices stripped
 * (e.g. "config.authorName", "chapters.entries").
 */
const FIELD_LABELS: Record<string, string> = {
  'config.title': 'Title',
  'config.subtitle': 'Subtitle',
  'config.authorName': 'Author / pen name',
  'config.volume': 'Volume',
  title: 'Title',
  subtitle: 'Subtitle',
  authorName: 'Author / pen name',
  volume: 'Volume',
};

/** "authorName" -> "Author Name" as a last-resort label for anything not in FIELD_LABELS. */
function humanize(segment: string): string {
  const spaced = segment
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function pathKey(path: Array<string | number>): string {
  return path.filter((p) => typeof p === 'string').join('.');
}

export function labelForPath(path: Array<string | number>): string {
  const key = pathKey(path);
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const lastSegment = [...path].reverse().find((p) => typeof p === 'string');
  return lastSegment ? humanize(String(lastSegment)) : 'This field';
}

/** Turns one Zod issue into a plain sentence — never the schema path or issue code. */
export function friendlyIssueMessage(issue: ZodIssue, label: string): string {
  switch (issue.code) {
    case 'too_small': {
      if (issue.type === 'string') {
        return issue.minimum <= 1 ? `${label} is required.` : `${label} must be at least ${issue.minimum} characters.`;
      }
      if (issue.type === 'array') {
        return issue.minimum <= 1 ? `${label} needs at least one entry.` : `${label} needs at least ${issue.minimum} entries.`;
      }
      if (issue.type === 'number') {
        return `${label} must be at least ${issue.minimum}.`;
      }
      return `${label} is too small.`;
    }
    case 'too_big': {
      if (issue.type === 'string') return `${label} must be at most ${issue.maximum} characters.`;
      if (issue.type === 'array') return `${label} has too many entries (max ${issue.maximum}).`;
      if (issue.type === 'number') return `${label} must be at most ${issue.maximum}.`;
      return `${label} is too large.`;
    }
    case 'invalid_type':
      if (issue.received === 'undefined') return `${label} is required.`;
      return `${label} is the wrong type.`;
    case 'invalid_enum_value':
      return `${label} must be one of: ${issue.options.join(', ')}.`;
    case 'invalid_string':
      return `${label} isn't formatted correctly.`;
    default:
      return `${label} is invalid.`;
  }
}

/** Converts a full set of Zod issues into field-level, operator-facing errors. */
export function issuesToFields(issues: ZodIssue[]): ApiErrorField[] {
  return issues.map((issue) => {
    const label = labelForPath(issue.path);
    return {
      path: issue.path.map(String).join('.'),
      label,
      message: friendlyIssueMessage(issue, label),
    };
  });
}

/** A single top-level summary sentence for a set of translated field errors. */
export function summaryMessage(fields: ApiErrorField[]): string {
  if (fields.length === 0) return 'The request was invalid.';
  if (fields.length === 1) return fields[0]!.message;
  return 'Please fix the highlighted fields.';
}
