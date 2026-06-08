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
  identity:
    'museum-grade collector edition, vintage natural-history monograph — letterpress feel, deep printed ink texture, fine paper grain visible under the type',
  bodyFamily:
    'Old-style serif in the Caslon / Goudy Old Style / Adobe Garamond family — generous x-height, bracketed serifs, dark printed ink (warm near-black, never pure black), subtle letterpress impression',
  bodyPt: 13,
  bodyLineHeight: 1.5,
  bodyMeasureChars: 70,
  titleFamily:
    'Engraved roman caps with refined letter-spacing — confident hierarchy: small refined "CHAPTER" kicker (tracked small-caps, hairline rule on either side), oversized Roman numeral as the dominant glyph, and a full-width title in stately serif caps. Title color is the same warm printed ink as the body, never a brand color.',
  titleHierarchy: ['CHAPTER', 'I', 'THE WILD LAND'],
  ornaments: [
    'engraved botanical swag at the top: pine branches with cones, oak leaves with acorns, ferns — symmetrical, centered medallion with a single pinecone, fine line-engraving in warm sepia ink',
    'matching engraved botanical swag at the bottom: mirrors the top, slightly slimmer, centered pinecone medallion',
    'hairline decorative rules flanking the CHAPTER kicker and the title name — thin, elegant, period-correct',
    'subtle paper-grain and gentle vignette around the page edges — collector-edition finish, never a digital drop-shadow',
  ],
  decorativeInitial:
    'illuminated drop-cap on the first letter of the body — engraved botanical surround (leaves, vines, a small pinecone), warm sepia ink, ~3 lines tall, refined and restrained, never cartoonish',
  noModernUi: true,
  noInfographic: true,
};

/** Percentage the experimental reading measure is wider than production. */
export const EXPERIMENT_READING_FIELD_WIDENING_PCT = 20;
