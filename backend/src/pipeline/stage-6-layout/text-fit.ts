/**
 * Stage 6 — deterministic text-fit analyzer.
 *
 * What it does: estimates whether a page's body copy fits the chosen layout's
 * text zone at the configured typography, BEFORE any image-generation spend.
 * This is the gate the operator reviews. It is an estimate (character-grid model);
 * the real Paged.js render is the final authority on exact page count, but this
 * catches obvious overflow/underflow cheaply and deterministically.
 *
 * Model: text frame (pt) -> chars-per-line (from avg glyph advance) x usable
 * lines (frame height / line box), reduced by the layout's text-area factor and
 * fixed overhead for the title + section headers. Compare to the stripped body
 * character count.
 */

import type { LayoutTemplateId } from '@wildlands/shared';
import { stripMarkdown } from '../stage-2-planner/plan-pages.js';
import type { PageGeometry } from './page-geometry.js';
import { getLayoutProfile } from './layout-profiles.js';

/** Average glyph advance for a serif body face (EB Garamond), in ems. */
export const AVG_CHAR_WIDTH_EM = 0.5;
/** Lines consumed by the entry title + scientific name + spacing. */
export const TITLE_OVERHEAD_LINES = 4;
/** Extra lines consumed per section header (header line + spacing). */
export const LINES_PER_SECTION_HEADER = 2;

export type TextFitStatus = 'FITS' | 'TIGHT' | 'OVERFLOW' | 'UNDERFILLED';

export interface TextFitInput {
  bodyMarkdown: string;
  layoutTemplate: LayoutTemplateId;
  geometry: PageGeometry;
  bodyPt: number;
  /** Unitless line-height multiplier (e.g. 1.28). */
  lineHeight: number;
}

export interface TextFitResult {
  charCount: number;
  charsPerLine: number;
  totalLines: number;
  usableLines: number;
  capacityChars: number;
  estimatedLines: number;
  fillRatio: number;
  status: TextFitStatus;
  fits: boolean;
  notes: string[];
}

function countSectionHeaders(markdown: string): number {
  const matches = markdown.match(/^#{2,6}\s+/gm);
  return matches ? matches.length : 0;
}

export function analyzeTextFit(input: TextFitInput): TextFitResult {
  const { geometry, bodyPt, lineHeight, layoutTemplate } = input;
  const profile = getLayoutProfile(layoutTemplate);
  const notes: string[] = [];

  const charCount = stripMarkdown(input.bodyMarkdown).length;

  const charsPerLine = Math.max(1, Math.floor(geometry.textWidthPt / (AVG_CHAR_WIDTH_EM * bodyPt)));
  const lineBoxPt = bodyPt * lineHeight;
  const totalLines = Math.max(1, Math.floor(geometry.textHeightPt / lineBoxPt));

  const overheadLines = TITLE_OVERHEAD_LINES + countSectionHeaders(input.bodyMarkdown) * LINES_PER_SECTION_HEADER;
  const linesForText = Math.max(1, totalLines - overheadLines);
  const usableLines = Math.max(1, Math.floor(linesForText * profile.textAreaFactor));

  const capacityChars = charsPerLine * usableLines;
  const estimatedLines = Math.ceil(charCount / charsPerLine);
  const fillRatio = capacityChars > 0 ? charCount / capacityChars : Number.POSITIVE_INFINITY;

  let status: TextFitStatus;
  if (fillRatio > 1) {
    status = 'OVERFLOW';
    notes.push(
      `Body ~${charCount} chars exceeds estimated capacity ~${capacityChars} for ${layoutTemplate}. ` +
        `Route to a more text-heavy layout or add a continuation page.`,
    );
  } else if (fillRatio >= 0.9) {
    status = 'TIGHT';
    notes.push('Estimated near capacity; confirm with the Paged.js render before locking.');
  } else if (profile.textLight ? fillRatio < 0.05 : fillRatio < 0.25) {
    status = 'UNDERFILLED';
    notes.push(
      `Body fills only ~${Math.round(fillRatio * 100)}% of the text zone; ` +
        `an illustration-dominant layout may suit this page better.`,
    );
  } else {
    status = 'FITS';
  }

  return {
    charCount,
    charsPerLine,
    totalLines,
    usableLines,
    capacityChars,
    estimatedLines,
    fillRatio: Math.round(fillRatio * 1000) / 1000,
    status,
    fits: status === 'FITS' || status === 'TIGHT',
    notes,
  };
}
