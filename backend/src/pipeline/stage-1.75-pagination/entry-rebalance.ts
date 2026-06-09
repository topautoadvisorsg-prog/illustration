/**
 * Stage 1.75 — entry-rebalance (Patch B + C).
 *
 * Post-pass that runs after `flowEngine`. The engine pours greedily, filling
 * each page to capacity before breaking. That produces a cliff: every full
 * page sits AT capacity, and a small markdown↔stripped char drift can push
 * any one of them into OVERFLOW. Patch A made capacity correct; this patch
 * stops the cliff.
 *
 * For each STANDALONE multi-part entry (opener + N continuations), re-pour
 * the joined text across the same parts (or one extra). Targets are
 * PROPORTIONAL to each part's capacity (Patch C): opener (smaller capacity
 * for image-bearing layouts) gets fewer chars; continuations (larger
 * capacity for LAYOUT_2_TEXT_HEAVY) get more. Every part lands at the same
 * overall fill ratio = totalChars / totalCapacity.
 *
 * Entry boundaries and chapter boundaries are never crossed; compacted
 * pages are skipped (multi-entry layouts are operator territory, not pure
 * splits).
 *
 * The pass is pure. It produces a new `PaginatedPage[]` and the list of
 * entryKeys it touched, for warnings and tests.
 */

import type { TrimSize } from '@wildlands/shared';
import { stripMarkdown } from '../stage-2-planner/plan-pages.js';
import { countWords } from '../shared/markdown-text.js';
import { computePaginationCapacity } from './capacity.js';
import { computePageGeometry } from '../stage-6-layout/page-geometry.js';
import { directLayout } from '../stage-6-layout/layout-director.js';
import { analyzeTextFit } from '../stage-6-layout/text-fit.js';
import { DEFAULT_CONTINUATION_LAYOUT } from './layout-sequence.js';
import type { PaginatedPage } from './types.js';

/** Target per-page fillRatio after rebalance. Sits well below the TIGHT
 *  threshold (0.85) so small markdown↔stripped char drift never pushes a
 *  rebalanced page back into OVERFLOW. */
const TARGET_FILL_RATIO = 0.85;

/** Rebalance an entry when its parts differ by at least this much in fill,
 *  even if no part is OVERFLOW. Prevents 100%-then-30% sibling layouts. */
const IMBALANCE_THRESHOLD = 0.30;

/** When deciding whether to break BEFORE a heading, only do so if the current
 *  part is already at least this much of its target — otherwise we get tiny
 *  fragments because every chapter has many h2s in a row. */
const HEADING_BREAK_MIN_FRACTION = 0.7;

export interface RebalanceEntriesInput {
  pages: PaginatedPage[];
  trimSize: TrimSize;
  bodyPt: number;
  lineHeight: number;
}

export interface RebalanceEntriesResult {
  pages: PaginatedPage[];
  /** entryKeys whose parts were re-poured by this pass. */
  rebalancedEntryKeys: string[];
  /** entryKeys that received an extra continuation. */
  expandedEntryKeys: string[];
  /** Warnings (e.g. content still overflows after adding a continuation). */
  warnings: string[];
}

export function rebalanceEntries(input: RebalanceEntriesInput): RebalanceEntriesResult {
  // 1. Group STANDALONE pages by entryKey. Compacted pages (multi-entry) are
  //    excluded — their layout is operator-territory, not a pure split.
  const partsByEntry = new Map<string, PaginatedPage[]>();
  for (const page of input.pages) {
    if (page.pageRole === 'compacted') continue;
    if (page.compactedEntryKeys != null) continue;
    const list = partsByEntry.get(page.entryKey) ?? [];
    list.push(page);
    partsByEntry.set(page.entryKey, list);
  }

  // 2. For each multi-part entry, decide whether to rebalance and how.
  const replacements = new Map<PaginatedPage, PaginatedPage[]>();
  const rebalancedEntryKeys: string[] = [];
  const expandedEntryKeys: string[] = [];
  const warnings: string[] = [];

  const geometry = computePageGeometry(input.trimSize);
  const continuationProbe = analyzeTextFit({
    bodyMarkdown: '',
    layoutTemplate: DEFAULT_CONTINUATION_LAYOUT,
    geometry,
    bodyPt: input.bodyPt,
    lineHeight: input.lineHeight,
  });
  const continuationCapacityChars = continuationProbe.capacityChars;

  for (const [entryKey, parts] of partsByEntry) {
    if (parts.length < 2) continue;

    const sorted = [...parts].sort((a, b) => a.partN - b.partN);

    // Measure each part's current fill against its layout's capacity. We use
    // computePaginationCapacity (the same function the engine uses to write
    // fitStatus) so this layer is consistent with what the operator sees.
    const measured = sorted.map((page) => {
      const fit = computePaginationCapacity({
        readingFieldText: page.readingFieldText,
        layoutTemplate: page.layoutTemplate,
        trimSize: input.trimSize,
        bodyPt: input.bodyPt,
        lineHeight: input.lineHeight,
      });
      return { page, fillRatio: fit.fillRatio, capacityChars: fit.capacityChars };
    });

    const hasOverflow = measured.some((m) => m.fillRatio > 1);
    const maxFill = Math.max(...measured.map((m) => m.fillRatio));
    const minFill = Math.min(...measured.map((m) => m.fillRatio));
    const imbalanced = maxFill - minFill > IMBALANCE_THRESHOLD && maxFill > TARGET_FILL_RATIO;

    if (!hasOverflow && !imbalanced) continue;

    // 3. Decide target part count. Goal: max fill across all parts ≤ TARGET.
    const totalCapacity = measured.reduce((s, m) => s + m.capacityChars, 0);
    const joinedText = sorted.map((p) => p.readingFieldText).join('\n\n');
    const totalChars = stripMarkdown(joinedText).length;

    let targetParts = sorted.length;
    let workingCapacity = totalCapacity;
    if (totalChars > workingCapacity * TARGET_FILL_RATIO && continuationCapacityChars > 0) {
      targetParts += 1;
      workingCapacity += continuationCapacityChars;
      expandedEntryKeys.push(entryKey);
    }

    if (totalChars > workingCapacity) {
      // Even with one extra continuation, content exceeds capacity. Surface
      // it (operator action), but proceed — we'd rather distribute the
      // overflow evenly across many parts than pile it on the last one.
      warnings.push(
        `rebalance_overflow_persists:${entryKey}:chars=${totalChars}:capacity=${workingCapacity}`,
      );
    }

    // 4. Compute per-part char targets PROPORTIONAL to each part's capacity
    //    (Patch C). Even-splitting by part count is wrong when the opener has
    //    smaller capacity than the continuations — the opener overflows while
    //    the continuations have slack. Targets at the entry's overall fill
    //    ratio (chars/capacity) land every part at the SAME fill ratio.
    const openerProbe = analyzeTextFit({
      bodyMarkdown: '',
      layoutTemplate: sorted[0]!.layoutTemplate,
      geometry,
      bodyPt: input.bodyPt,
      lineHeight: input.lineHeight,
    });
    const openerCapacityChars = openerProbe.capacityChars;
    const capacitiesByPart: number[] = [openerCapacityChars];
    for (let i = 1; i < targetParts; i++) {
      capacitiesByPart.push(continuationCapacityChars);
    }
    const totalTargetCapacity = capacitiesByPart.reduce((a, b) => a + b, 0);
    const overallFillRatio = totalTargetCapacity > 0 ? totalChars / totalTargetCapacity : 1;
    const targetsByPart = capacitiesByPart.map((cap) => cap * overallFillRatio);

    // 5. Re-pour. Greedy distribution at paragraph + heading boundaries.
    const newTexts = redistribute(joinedText, targetsByPart);
    if (newTexts.length === 0) continue;

    // 6. Build new pages. Opener keeps its layout + subject + warnings;
    //    continuations are LAYOUT_2_TEXT_HEAVY with carriesSubject=false.
    const opener = sorted[0]!;
    const newParts: PaginatedPage[] = newTexts.map((text, i) => {
      const isOpener = i === 0;
      const layoutTemplate = isOpener ? opener.layoutTemplate : DEFAULT_CONTINUATION_LAYOUT;
      const partN = i + 1;
      const pageKey = isOpener ? entryKey : `${entryKey}_c${partN - 1}`;
      const fit = computePaginationCapacity({
        readingFieldText: text,
        layoutTemplate,
        trimSize: input.trimSize,
        bodyPt: input.bodyPt,
        lineHeight: input.lineHeight,
      });
      const zones = directLayout({
        bodyMarkdown: text,
        layoutTemplate,
        geometry,
        bodyPt: input.bodyPt,
        lineHeight: input.lineHeight,
      });
      return {
        // plannedPageNumber is re-assigned by the orchestrator after this pass.
        plannedPageNumber: opener.plannedPageNumber,
        entryKey,
        entryTitle: opener.entryTitle,
        pageKey,
        chapterNumber: opener.chapterNumber,
        partN,
        totalParts: newTexts.length,
        pageRole: isOpener ? ('opener' as const) : ('continuation' as const),
        carriesSubject: isOpener,
        compactedEntryKeys: null,
        imageSubject: isOpener ? opener.imageSubject : null,
        layoutTemplate,
        readingFieldText: text,
        readingFieldChars: fit.charCount,
        readingFieldWords: countWords(text),
        fitStatus: fit.status,
        zones,
        warnings: isOpener ? [...opener.warnings] : [],
      };
    });

    // 7. Replace: first old part → all new parts, other old parts → empty (drop).
    replacements.set(sorted[0]!, newParts);
    for (let i = 1; i < sorted.length; i++) replacements.set(sorted[i]!, []);

    rebalancedEntryKeys.push(entryKey);
  }

  // 8. Splice replacements into the page list, preserving spine order.
  const out: PaginatedPage[] = [];
  for (const page of input.pages) {
    const replacement = replacements.get(page);
    if (replacement === undefined) {
      out.push(page);
    } else {
      out.push(...replacement);
    }
  }

  return {
    pages: out,
    rebalancedEntryKeys,
    expandedEntryKeys,
    warnings,
  };
}

/**
 * Split joined markdown into N chunks at paragraph boundaries, where each
 * chunk targets a part-specific char count (Patch C: PROPORTIONAL to capacity).
 *
 * `targetsByPart[i]` is the target char count for part i. Caller computes
 * these as `capacityChars[i] × overallFillRatio` so every part lands at the
 * same fill ratio — opener (smaller capacity) gets fewer chars, continuations
 * (larger capacity) get more.
 *
 * Section headings (`##`+) stay attached to the paragraph that follows —
 * we break BEFORE a heading, never after, so each part opens cleanly.
 *
 * Pure greedy. Walks paragraphs in order; closes the current part when
 * adding the next paragraph would overshoot the CURRENT part's target, OR
 * when the next paragraph is a heading and the current part is already
 * ≥70% of its target.
 */
function redistribute(joinedText: string, targetsByPart: number[]): string[] {
  const targetParts = targetsByPart.length;
  if (targetParts < 1) return [];
  if (targetParts === 1) return [joinedText];

  const paragraphs = joinedText.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length === 0) return [joinedText];

  const charsByPara = paragraphs.map((p) => stripMarkdown(p).length);
  if (charsByPara.reduce((a, b) => a + b, 0) === 0) return [joinedText];

  const isHeading = (p: string): boolean => /^#{2,6}\s+/.test(p.trimStart());

  const parts: string[][] = [];
  let current: string[] = [];
  let currentChars = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i]!;
    const paraChars = charsByPara[i]!;
    // Target for the part we're currently filling. Each part has its own.
    const currentTarget = targetsByPart[parts.length] ?? 0;
    const remainingPartsAfterThis = targetParts - parts.length - 1;
    // Don't close a part if we'd leave fewer paragraphs than parts still
    // needed — that produces empty parts at the tail.
    const enoughLeftToFill = paragraphs.length - i >= remainingPartsAfterThis;
    const canCloseAnother = parts.length < targetParts - 1;

    const wouldOvershoot = currentChars + paraChars > currentTarget;
    const isCleanHeadingBreak =
      isHeading(para) && currentChars >= currentTarget * HEADING_BREAK_MIN_FRACTION;

    const shouldClose =
      current.length > 0 && canCloseAnother && enoughLeftToFill && (wouldOvershoot || isCleanHeadingBreak);

    if (shouldClose) {
      parts.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(para);
    currentChars += paraChars;
  }
  if (current.length > 0) parts.push(current);

  return parts.map((paras) => paras.join('\n\n'));
}
