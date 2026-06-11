/**
 * Whole-page render pipeline — typography DNA.
 *
 * v1.0+: this file no longer defines DNA. It composes the DNA used by the
 * prompt assembler from the locked Wild Lands Publishing Standard
 * (`pipeline/publishing-standard/standard.ts`). Drift is impossible because
 * every value comes from one place.
 */

import {
  PALETTE,
  TYPOGRAPHY,
  WILDLANDS_STANDARD,
} from '../publishing-standard/index.js';
import type { TypographyDNA } from './types.js';

/** Derive the pipeline's typography DNA from the locked publishing standard. */
export const PAGE_TYPOGRAPHY_DNA: TypographyDNA = {
  identity: `Wild Lands Publishing Standard v${WILDLANDS_STANDARD.version} — museum-grade collector edition, vintage natural-history monograph. Paper ${PALETTE.parchment.hex}, ink ${PALETTE.ink.hex}.`,
  bodyFamily: TYPOGRAPHY.body.family + '. ' + TYPOGRAPHY.body.treatment,
  bodyPt: TYPOGRAPHY.body.pt,
  bodyLineHeight: TYPOGRAPHY.body.lineHeight,
  bodyMeasureChars: TYPOGRAPHY.body.measureChars,
  titleFamily: TYPOGRAPHY.title.family,
  // Filled per-page by the spec builder — the standard locks the SHAPE of the
  // hierarchy, the content comes from the page row.
  titleHierarchy: [],
  ornaments: [
    WILDLANDS_STANDARD.ornaments.components.topSwag,
    WILDLANDS_STANDARD.ornaments.components.bottomSwag,
    WILDLANDS_STANDARD.ornaments.components.hairlineRule,
  ],
  decorativeInitial: WILDLANDS_STANDARD.ornaments.components.dropCapSurround,
  noModernUi: true,
  noInfographic: true,
};

/**
 * How much wider the widened reading field is vs. the legacy production
 * measure. Feeds `readingFieldGeometry.widerThanProductionPct` in the spec, a
 * hint to the model that the text column is generous. The absolute measure
 * itself is locked by the Standard (70 chars).
 */
export const READING_FIELD_WIDENING_PCT = 20;
