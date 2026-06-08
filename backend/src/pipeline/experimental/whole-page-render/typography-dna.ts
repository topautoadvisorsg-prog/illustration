/**
 * Whole-page render experiment — typography DNA constants.
 *
 * These numbers are experiment-only and intentionally different from the
 * production typography. They live here so the operator can tune them
 * without touching `config.typography`, which drives the real renderer.
 *
 * Defaults match SPEC §10 answer #2 (signed off):
 *   - 12pt body
 *   - 65-character measure
 *   - 1.45 line height
 *   - reading measure ~15% wider than production
 */

import type { TypographyDNA } from './types.js';

export const EXPERIMENT_TYPOGRAPHY_DNA: TypographyDNA = {
  identity: 'vintage_naturalist_collector_edition',
  bodyFamily: 'Caslon-class serif (Adobe Caslon, Goudy Old Style, or close equivalent)',
  bodyPt: 12,
  bodyLineHeight: 1.45,
  bodyMeasureChars: 65,
  titleFamily: 'Matching serif, full small-caps capitals, refined letter-spacing',
  titleHierarchy: ['CHAPTER', 'I', 'THE WILD LAND'],
  ornaments: [
    'botanical_rule_top_with_pinecone_motif',
    'botanical_rule_bottom_with_pinecone_motif',
  ],
  decorativeInitial: 'illuminated_drop_cap',
  noModernUi: true,
  noInfographic: true,
};

/** Percentage the experimental reading measure is wider than production. */
export const EXPERIMENT_READING_FIELD_WIDENING_PCT = 15;
