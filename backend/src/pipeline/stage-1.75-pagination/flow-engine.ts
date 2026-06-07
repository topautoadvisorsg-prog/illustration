/**
 * Stage 1.75 — Reading Block flow engine.
 *
 * The heart of pagination. Walks a manuscript token stream left-to-right and
 * pours tokens into Reading Blocks until each block is full or a hard-break
 * forces a new page. Page count is whatever this engine produces — it is not
 * pre-decided.
 *
 * See SPEC_PAGINATION_V1.md §5.1.
 *
 * Out-of-scope safety net: if the stream contains no `entry-start` token at
 * all, the engine returns an empty result and lets the caller decide whether
 * that is an error.
 */

import type { ContentType, LayoutTemplateId, ProjectConfig, TrimSize } from '@wildlands/shared';
import { computePaginationCapacity, type PaginationFitStatus } from './capacity.js';
import { DEFAULT_CONTINUATION_LAYOUT, type LayoutSequence } from './layout-sequence.js';
import {
  DEFAULT_ENTRY_BREAK_POLICY,
  type EntryBreakPolicy,
  type SectionHeadingToken,
  type StreamToken,
} from './stream.js';
import { countChars, countWords } from '../shared/markdown-text.js';
import { computePageGeometry } from '../stage-6-layout/page-geometry.js';
import { LINES_PER_SECTION_HEADER, analyzeTextFit } from '../stage-6-layout/text-fit.js';
import { directLayout, type LayoutAllocation } from '../stage-6-layout/layout-director.js';
import type { PaginatedPage } from './types.js';

// PaginatedPage is the engine's output row. Definition + Zod schema live in
// `types.ts` so both the engine and the future persistence layer share one
// authoritative shape.
export type { PaginatedPage } from './types.js';

export interface FlowEngineInput {
  stream: StreamToken[];
  sequence: LayoutSequence;
  config: ProjectConfig;
  trimSize: TrimSize;
  policy?: EntryBreakPolicy;
}

export interface FlowEngineResult {
  pages: PaginatedPage[];
  /** Engine-level warnings not tied to any single page (e.g. orphan tail). */
  warnings: string[];
}

/** Chapter-number lookup for entries. The stream doesn't carry chapter numbers
 *  on tokens (kept lean); the engine reads them via this map, populated by the
 *  caller from the original PageManifest list. */
export interface EntryMeta {
  chapterNumber: number;
  imageSubject: string;
  entryTitle: string;
  contentType: ContentType | undefined;
}

export type EntryMetaMap = Map<string, EntryMeta>;

interface WorkingBlock {
  layoutTemplate: LayoutTemplateId;
  capacityChars: number;
  charsPerLine: number;
  /** Total lines available for body text in this block's Reading Field. */
  usableLines: number;
  /** Markdown poured into the block so far (joined with paragraph spacing). */
  textChunks: string[];
  charsUsed: number;
  wordsUsed: number;
  /** Entry that owns this block's primary identity (drives image subject + key). */
  primaryEntryKey: string;
  primaryEntryTitle: string;
  primaryImageSubject: string;
  primaryChapterNumber: number;
  /** All entries whose entry-start token landed in this block (size > 1 = compacted). */
  entryKeysOnPage: string[];
  /** The entry whose body tokens we are CURRENTLY pouring into this block.
   *  May differ from `primaryEntryKey` after a soft break — that's the whole
   *  point: a compacted block can hold A's body then B's body, and an overflow
   *  while pouring B's body must continue B (not A) on the next page. */
  currentBodyEntryKey: string;
  /** Role determined at finalize time: opener vs continuation. */
  isOpener: boolean;
  /** Source partN within the primary entry's chain. */
  partN: number;
  warnings: string[];
  /** True if at least one atomic token was placed despite exceeding capacity. */
  overflowedAtomic: boolean;
}

function joinMarkdown(chunks: string[]): string {
  return chunks.join('\n\n').trim();
}

/**
 * Compute the Reading Block's capacity (chars + chars-per-line + usable-lines)
 * for a given layout at the project's typography. Uses the existing Stage 6
 * char-grid model — same authority Text-Fit uses at gate time.
 */
function probeBlockCapacity(
  layoutTemplate: LayoutTemplateId,
  trimSize: TrimSize,
  bodyPt: number,
  lineHeight: number,
): { capacityChars: number; charsPerLine: number; usableLines: number } {
  const geometry = computePageGeometry(trimSize);
  // analyzeTextFit accepts an empty body to probe the geometry only — the
  // returned charCount/fillRatio for empty text is 0/0 and we ignore them.
  const fit = analyzeTextFit({
    bodyMarkdown: '',
    layoutTemplate,
    geometry,
    bodyPt,
    lineHeight,
  });
  return { capacityChars: fit.capacityChars, charsPerLine: fit.charsPerLine, usableLines: fit.usableLines };
}

function openWorkingBlock(
  layoutTemplate: LayoutTemplateId,
  primary: { entryKey: string; entryTitle: string; imageSubject: string; chapterNumber: number },
  isOpener: boolean,
  partN: number,
  trimSize: TrimSize,
  bodyPt: number,
  lineHeight: number,
): WorkingBlock {
  const probe = probeBlockCapacity(layoutTemplate, trimSize, bodyPt, lineHeight);
  return {
    layoutTemplate,
    capacityChars: probe.capacityChars,
    charsPerLine: probe.charsPerLine,
    usableLines: probe.usableLines,
    textChunks: [],
    charsUsed: 0,
    wordsUsed: 0,
    primaryEntryKey: primary.entryKey,
    primaryEntryTitle: primary.entryTitle,
    primaryImageSubject: primary.imageSubject,
    primaryChapterNumber: primary.chapterNumber,
    entryKeysOnPage: [primary.entryKey],
    currentBodyEntryKey: primary.entryKey,
    isOpener,
    partN,
    warnings: [],
    overflowedAtomic: false,
  };
}

function finalizeBlock(block: WorkingBlock, trimSize: TrimSize, bodyPt: number, lineHeight: number): PaginatedPage {
  const text = joinMarkdown(block.textChunks);
  // Recompute fit_status against the now-final text. computePaginationCapacity
  // re-runs the char grid against the actual text, which catches subtle
  // markdown-stripping differences from the per-token char counts.
  const fit = computePaginationCapacity({
    readingFieldText: text,
    layoutTemplate: block.layoutTemplate,
    trimSize,
    bodyPt,
    lineHeight,
  });

  // Layout zones (text-safe / image-priority / typography) so Stage 1.8 preview
  // renderer can place text in the right rectangle without re-running directLayout.
  const geometry = computePageGeometry(trimSize);
  const zones = directLayout({
    bodyMarkdown: text,
    layoutTemplate: block.layoutTemplate,
    geometry,
    bodyPt,
    lineHeight,
  });

  const isCompacted = block.entryKeysOnPage.length > 1;
  const pageRole: PaginatedPage['pageRole'] = isCompacted
    ? 'compacted'
    : block.isOpener
      ? 'opener'
      : 'continuation';

  const pageKey = isCompacted
    ? `${block.primaryEntryKey}_m`
    : block.isOpener
      ? block.primaryEntryKey
      : `${block.primaryEntryKey}_c${block.partN - 1}`; // _c1 = first continuation after opener (partN=2)

  const finalStatus: PaginationFitStatus = block.overflowedAtomic ? 'OVERFLOW' : fit.status;

  return {
    // plannedPageNumber is set by the orchestrator after the full page list
    // is known. Start at 0 here so the engine's intermediate result is shape-
    // complete (Zod validation rejects 0, so DO NOT validate before the
    // orchestrator finalizes).
    plannedPageNumber: 0,
    entryKey: block.primaryEntryKey,
    entryTitle: block.primaryEntryTitle,
    pageKey,
    chapterNumber: block.primaryChapterNumber,
    partN: block.partN,
    totalParts: 0, // set later by the orchestrator
    pageRole,
    carriesSubject: block.isOpener,
    compactedEntryKeys: isCompacted ? [...block.entryKeysOnPage] : null,
    imageSubject: block.isOpener ? block.primaryImageSubject : null,
    layoutTemplate: block.layoutTemplate,
    readingFieldText: text,
    readingFieldChars: fit.charCount,
    readingFieldWords: countWords(text),
    fitStatus: finalStatus,
    zones,
    warnings: block.warnings,
  };
}

function linesRemaining(block: WorkingBlock): number {
  const charsLeft = Math.max(0, block.capacityChars - block.charsUsed);
  return Math.floor(charsLeft / Math.max(1, block.charsPerLine));
}

/**
 * Account for an extra full line of capacity consumed by a section heading.
 * The Stage 6 text-fit model charges `LINES_PER_SECTION_HEADER` lines on top
 * of the heading's own characters — pagination has to do the same or it will
 * over-pour into a block and then surprise the operator at finalize time.
 */
function sectionHeadingExtraChars(block: WorkingBlock): number {
  return LINES_PER_SECTION_HEADER * block.charsPerLine;
}

function pushToken(block: WorkingBlock, token: StreamToken): void {
  if (token.kind === 'entry-start') return; // titles never enter the body text
  block.textChunks.push(token.markdown);
  block.charsUsed += token.chars;
  if (token.kind === 'section-heading') block.charsUsed += sectionHeadingExtraChars(block);
  if (token.kind === 'paragraph') block.wordsUsed += token.words;
}

/**
 * Pour the stream through the Reading Blocks. Stateless aside from the local
 * working block — the engine reads `entryMeta` and `sequence` but never
 * mutates them.
 */
export function flowEngine(input: FlowEngineInput, entryMeta: EntryMetaMap): FlowEngineResult {
  const { stream, sequence, config, trimSize } = input;
  const policy = input.policy ?? DEFAULT_ENTRY_BREAK_POLICY;
  const bodyPt = config.typography.bodyPt;
  const lineHeight = config.typography.lineHeight;

  // State is held in this mutable object; helpers receive it by reference so
  // TypeScript's control-flow analysis can track the `currentBlock` field
  // through method calls (a plain `let` bound to a closure narrows poorly).
  interface FlowState {
    currentBlock: WorkingBlock | null;
  }
  const state: FlowState = { currentBlock: null };
  const pages: PaginatedPage[] = [];
  const engineWarnings: string[] = [];
  /** Tracks the next partN to assign for an entry that has produced pages so far. */
  const partCounterByEntry = new Map<string, number>();

  function closeAndPushBlock(): void {
    if (!state.currentBlock) return;
    pages.push(finalizeBlock(state.currentBlock, trimSize, bodyPt, lineHeight));
    state.currentBlock = null;
  }

  function openOpenerBlock(entryKey: string): WorkingBlock | null {
    const meta = entryMeta.get(entryKey);
    if (!meta) {
      engineWarnings.push(`entry_meta_missing:${entryKey}`);
      return null;
    }
    const openerIdx = sequence.openerIndexByEntryKey.get(entryKey);
    const slot = openerIdx !== undefined ? sequence.slots[openerIdx] : undefined;
    const layoutTemplate = slot?.layoutTemplate ?? config.layoutPolicy.defaultTemplate;
    const partN = 1;
    partCounterByEntry.set(entryKey, partN + 1);
    const block = openWorkingBlock(
      layoutTemplate,
      {
        entryKey,
        entryTitle: meta.entryTitle,
        imageSubject: meta.imageSubject,
        chapterNumber: meta.chapterNumber,
      },
      true,
      partN,
      trimSize,
      bodyPt,
      lineHeight,
    );
    state.currentBlock = block;
    return block;
  }

  function openContinuationBlock(entryKey: string): WorkingBlock | null {
    const meta = entryMeta.get(entryKey);
    if (!meta) {
      engineWarnings.push(`entry_meta_missing:${entryKey}`);
      return null;
    }
    const nextPart = partCounterByEntry.get(entryKey) ?? 2;
    partCounterByEntry.set(entryKey, nextPart + 1);
    const block = openWorkingBlock(
      DEFAULT_CONTINUATION_LAYOUT,
      {
        entryKey,
        entryTitle: meta.entryTitle,
        imageSubject: meta.imageSubject,
        chapterNumber: meta.chapterNumber,
      },
      false,
      nextPart,
      trimSize,
      bodyPt,
      lineHeight,
    );
    state.currentBlock = block;
    return block;
  }

  for (const token of stream) {
    if (token.kind === 'entry-start') {
      const open = state.currentBlock;
      // Soft break is ONLY available when the current block is an opener
      // (continuation pages may not carry a second entry — they would mark
      // the new entry as carriesSubject=false, losing its image slot). When
      // the current block is a continuation, every entry-start is a hard break.
      const softAllowed = open !== null && open.isOpener;
      const needHard =
        open === null
        || token.breakBehavior === 'hard'
        || !softAllowed
        || linesRemaining(open) < policy.softBreakMinLinesRemaining;

      if (needHard) {
        closeAndPushBlock();
        openOpenerBlock(token.entryKey);
      } else if (open) {
        // Soft break: keep the current block, record the entry as compacted.
        // The current block's primary identity (entryKey + image subject) does
        // NOT change — the first entry keeps the image slot, per SPEC §5.5.
        open.entryKeysOnPage.push(token.entryKey);
        // Inject a visible h2 heading so the operator (and the preview
        // renderer) can SEE where the second entry begins inside the shared
        // Reading Field. Without this the readingFieldText would jump from
        // A's body straight into B's body with no break.
        const headingMarkdown = `## ${token.entryTitle}`;
        const headingChars = countChars(headingMarkdown);
        const headingToken: SectionHeadingToken = {
          kind: 'section-heading',
          markdown: headingMarkdown,
          chars: headingChars,
          source: token.source,
        };
        pushToken(open, headingToken);
        // The body pointer advances so that an overflow while pouring B's text
        // creates a continuation page belonging to B (not A). Seed B's
        // partN counter to 2 — B's "page 1" is THIS shared compacted opener,
        // so B's first standalone continuation is partN=2.
        open.currentBodyEntryKey = token.entryKey;
        partCounterByEntry.set(token.entryKey, 2);
      }
      continue;
    }

    const open = state.currentBlock;
    if (!open) {
      // Body token before any entry-start: malformed stream. Skip but warn.
      engineWarnings.push('stream_started_with_body_token');
      continue;
    }

    // Effective cost includes the section-heading line surcharge, so a
    // heading near the end of a block doesn't squeak past the fit check
    // only to be discovered as TIGHT/OVERFLOW at finalize time.
    const overhead = token.kind === 'section-heading' ? sectionHeadingExtraChars(open) : 0;
    if (open.charsUsed + token.chars + overhead <= open.capacityChars) {
      pushToken(open, token);
      continue;
    }

    // Doesn't fit. Close current block, open a continuation for the entry
    // whose body we were CURRENTLY pouring (which may differ from the block's
    // primary entry after a soft break).
    const continuingEntry = open.currentBodyEntryKey;
    closeAndPushBlock();
    const next = openContinuationBlock(continuingEntry);
    if (!next) continue; // entry meta missing — already warned above

    if (token.chars > next.capacityChars) {
      // Atomic token (code block / image) exceeds an entire continuation
      // block's capacity. v1 places it whole and marks OVERFLOW so the
      // operator sees the issue.
      pushToken(next, token);
      next.overflowedAtomic = true;
      next.warnings.push(`atomic_token_exceeds_capacity:${token.kind}`);
    } else {
      pushToken(next, token);
    }
  }

  closeAndPushBlock();

  // Fill totalParts now that the chain is known. An entry's chain length is
  // the count of pages where ANY of the following is true:
  //   - the page's primary entry IS this entry (entryKey match), OR
  //   - this entry appears in the page's compactedEntryKeys list.
  // That way a secondary entry on a compacted opener (its only on-page
  // appearance) still contributes to its own totalParts.
  const partsByEntry = new Map<string, number>();
  for (const page of pages) {
    const seen = new Set<string>([page.entryKey]);
    if (page.compactedEntryKeys) {
      for (const key of page.compactedEntryKeys) seen.add(key);
    }
    for (const key of seen) {
      partsByEntry.set(key, (partsByEntry.get(key) ?? 0) + 1);
    }
  }
  for (const page of pages) {
    page.totalParts = partsByEntry.get(page.entryKey) ?? 1;
  }

  return { pages, warnings: engineWarnings };
}
