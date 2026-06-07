/**
 * Stage 1.75 — manuscript → stream conversion.
 *
 * The Reading Block flow model treats the book as one stream of typed tokens
 * with entry boundaries as anchors (not as page breaks). The flow engine
 * consumes this stream left-to-right and pours tokens into Reading Blocks
 * until each block is full.
 *
 * See SPEC_PAGINATION_V1.md §5.4 (stream shape) and §5.5 (break policy).
 */

import type { ContentType, PageManifest } from '@wildlands/shared';
import { countChars, countWords as countWordsShared } from '../shared/markdown-text.js';

/** A token's source position in the manuscript, for debugging + future operator UI. */
export interface StreamTokenSource {
  entryKey: string;
  entryTitle: string;
}

interface StreamTokenBase {
  source: StreamTokenSource;
}

export interface EntryStartToken extends StreamTokenBase {
  kind: 'entry-start';
  entryKey: string;
  entryTitle: string;
  contentType: ContentType | undefined;
  imageSubject: string;
  /** Whether this entry MUST start a new Reading Block (hard) or MAY continue
   *  the current block when room remains (soft). Derived from the break policy. */
  breakBehavior: 'hard' | 'soft';
}

export interface ParagraphToken extends StreamTokenBase {
  kind: 'paragraph';
  markdown: string;
  chars: number;
  words: number;
}

export interface SectionHeadingToken extends StreamTokenBase {
  kind: 'section-heading';
  markdown: string;
  chars: number;
}

export interface AtomicBlockToken extends StreamTokenBase {
  kind: 'code-block' | 'image-embed';
  markdown: string;
  chars: number;
}

export type StreamToken =
  | EntryStartToken
  | ParagraphToken
  | SectionHeadingToken
  | AtomicBlockToken;

/**
 * Operator-tunable entry-break policy. Lives on `config.layoutPolicy` so a
 * project can dial how aggressively the flow engine compacts entries.
 *
 * The `alwaysHardBreak` array is `readonly` so callers can't mutate the
 * shared default policy through a returned reference.
 */
export interface EntryBreakPolicy {
  kind: 'hybrid';
  /** Soft-break only if at least this many lines remain in the current block. */
  softBreakMinLinesRemaining: number;
  /** Maximum number of entries that may share a single compacted page. The
   *  flow engine refuses a soft break that would push the block past this
   *  cap, hard-breaking to a new page instead. Keeps compacted pages visually
   *  legible — one image + N small entries with injected `## headings`.
   *  v1 default: 2 (one host entry + one compacted entry). */
  maxEntriesPerCompactedPage: number;
  /** Content types that ALWAYS hard-break to a fresh page. */
  alwaysHardBreak: readonly ContentType[];
}

export const DEFAULT_ENTRY_BREAK_POLICY: EntryBreakPolicy = Object.freeze({
  kind: 'hybrid',
  softBreakMinLinesRemaining: 8,
  maxEntriesPerCompactedPage: 2,
  alwaysHardBreak: Object.freeze<ContentType[]>([
    'WARNING_PAGE',
    'CHAPTER_OPENER',
    'BOTANICAL_PLATE',
    'DIAGNOSTIC_DIAGRAM',
  ]),
});

/**
 * Derive the entry's break behavior from the policy. The flow engine just
 * reads `token.breakBehavior` — it does NOT re-evaluate the policy itself.
 * For 'soft' the flow engine still enforces the lines-remaining check at flow
 * time using the live Reading Block state.
 */
export function breakBehaviorFor(
  contentType: ContentType | undefined,
  policy: EntryBreakPolicy = DEFAULT_ENTRY_BREAK_POLICY,
): 'hard' | 'soft' {
  if (!contentType) return 'soft';
  return policy.alwaysHardBreak.includes(contentType) ? 'hard' : 'soft';
}

// Thin aliases that match this file's older call sites; the implementations
// now live in the shared markdown-text helper.
const countWords = countWordsShared;
const charCount = countChars;

/**
 * Parse one entry's bodyMarkdown into an ordered list of body tokens. Code
 * fences and HTML comment blocks are atomic — they become single tokens and
 * are never split across Reading Blocks. Section headings (`###`, `####`,
 * etc.) get their own token so the flow engine can keep them attached to the
 * following paragraph.
 *
 * Parsing strategy:
 *   - Walk the body line by line.
 *   - Open code fences (``` or ~~~) absorb every line until the matching close.
 *   - HTML comment blocks (<!-- ... -->) absorb every line until the close.
 *   - A heading line (#{2,6}) becomes its own section-heading token.
 *   - Everything else accumulates into paragraph tokens, separated by blank lines.
 */
function tokenizeBody(body: string, source: StreamTokenSource): StreamToken[] {
  const lines = body.split(/\r?\n/);
  const tokens: StreamToken[] = [];

  let buffer: string[] = [];
  let fenceMarker: string | null = null;       // '```' or '~~~' when inside a fence
  let inHtmlComment = false;
  let atomicBuffer: string[] = [];

  const flushParagraph = () => {
    if (buffer.length === 0) return;
    const markdown = buffer.join('\n').trim();
    buffer = [];
    if (!markdown) return;
    tokens.push({
      kind: 'paragraph',
      markdown,
      chars: charCount(markdown),
      words: countWords(markdown),
      source,
    });
  };

  const flushAtomic = (kind: 'code-block' | 'image-embed') => {
    if (atomicBuffer.length === 0) return;
    const markdown = atomicBuffer.join('\n');
    atomicBuffer = [];
    tokens.push({
      kind,
      markdown,
      // Use the RAW markdown length for atomic blocks. stripMarkdown removes
      // entire code fences and HTML comments (treats them as zero chars), but
      // the renderer still has to lay them out as visible monospace text — so
      // for capacity decisions we measure the bytes that will hit the page.
      chars: markdown.length,
      source,
    });
  };

  for (const line of lines) {
    // Inside a code fence: absorb every line until the matching close.
    if (fenceMarker) {
      atomicBuffer.push(line);
      if (line.trimStart().startsWith(fenceMarker)) {
        flushAtomic('code-block');
        fenceMarker = null;
      }
      continue;
    }
    // Inside an HTML comment block: absorb until -->
    if (inHtmlComment) {
      atomicBuffer.push(line);
      if (line.includes('-->')) {
        flushAtomic('code-block'); // treated as code-block kind for atomicity
        inHtmlComment = false;
      }
      continue;
    }

    const trimmed = line.trim();
    const openFenceMatch = trimmed.match(/^(```|~~~)/);
    if (openFenceMatch) {
      flushParagraph();
      atomicBuffer.push(line);
      fenceMarker = openFenceMatch[1] ?? '```';
      continue;
    }
    if (trimmed.startsWith('<!--')) {
      flushParagraph();
      atomicBuffer.push(line);
      // Single-line comment that closes on the same line.
      if (trimmed.includes('-->')) {
        flushAtomic('code-block');
      } else {
        inHtmlComment = true;
      }
      continue;
    }

    // A standalone image embed (whole line) is atomic so the flow engine never
    // puts half an image syntax across two pages.
    const imageOnlyLine = trimmed.match(/^!\[[^\]]*]\([^)]+\)\s*$/);
    if (imageOnlyLine) {
      flushParagraph();
      tokens.push({
        kind: 'image-embed',
        markdown: trimmed,
        // Raw length: stripMarkdown deletes image embeds entirely so for
        // capacity decisions we measure the rendered placeholder size instead.
        chars: trimmed.length,
        source,
      });
      continue;
    }

    // Section heading (##..######). The opening chapter `#` headings live at
    // the chapter level (not inside entry bodies) so they never appear here.
    const headingMatch = trimmed.match(/^(#{2,6})\s+/);
    if (headingMatch) {
      flushParagraph();
      tokens.push({
        kind: 'section-heading',
        markdown: trimmed,
        chars: charCount(trimmed),
        source,
      });
      continue;
    }

    // Blank line ends the current paragraph.
    if (trimmed === '') {
      flushParagraph();
      continue;
    }

    buffer.push(line);
  }

  // Defensive: if a fence or comment never closed, emit what we have.
  if (fenceMarker || inHtmlComment) {
    flushAtomic('code-block');
  }
  flushParagraph();
  return tokens;
}

export interface EntriesToStreamOptions {
  policy?: EntryBreakPolicy;
}

/**
 * Convert ordered PAGE manifests into a single stream. Each entry produces one
 * `entry-start` token followed by its body tokens, in source order. The flow
 * engine consumes left-to-right.
 */
export function entriesToStream(
  entries: PageManifest[],
  options: EntriesToStreamOptions = {},
): StreamToken[] {
  const policy = options.policy ?? DEFAULT_ENTRY_BREAK_POLICY;
  const tokens: StreamToken[] = [];
  for (const entry of entries) {
    const source: StreamTokenSource = { entryKey: entry.pageId, entryTitle: entry.entryTitle };
    tokens.push({
      kind: 'entry-start',
      entryKey: entry.pageId,
      entryTitle: entry.entryTitle,
      contentType: entry.contentType,
      imageSubject: entry.imageSubject,
      breakBehavior: breakBehaviorFor(entry.contentType, policy),
      source,
    });
    for (const token of tokenizeBody(entry.bodyMarkdown, source)) {
      tokens.push(token);
    }
  }
  return tokens;
}
