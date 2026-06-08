/**
 * Whole-page render experiment — JSON spec → image-model prompt.
 *
 * The thesis: the image model performs better when handed structured data
 * instead of prose about what to do. So this assembler does the bare minimum
 * of natural-language framing and lets the JSON spec carry the load.
 *
 * Order (SPEC §5):
 *   1. Header (one sentence: you are rendering a finished page)
 *   2. Typography DNA
 *   3. Illustration DNA (Master Style + subject)
 *   4. Page geometry
 *   5. Reading-field geometry
 *   6. Page text (title + body, verbatim)
 *   7. Decorative elements
 *   8. Hard constraints
 */

import { PALETTE, WILDLANDS_STANDARD } from '../../publishing-standard/index.js';
import type { WholePageSpec } from './types.js';

const HEADER = [
  `You are rendering a complete, FINISHED, publishable collector-edition book page under the Wild Lands Publishing Standard v${WILDLANDS_STANDARD.version}.`,
  'The target quality is a museum-grade, vintage natural-history monograph — the kind of page that ships in a hardcover boxed edition.',
  'This is NOT an illustration with text dropped on top. This is a single, integrated, designed page where the typography, ornamentation, and illustration belong to the same composition.',
  `The page paper is parchment ${PALETTE.parchment.hex}. All typography ink is warm sepia ${PALETTE.ink.hex} — never pure black, never colored. Forest badges use ${PALETTE.forestGreen.hex}. Mountain badges use ${PALETTE.mountainOchre.hex}. These are not suggestions — they are house standards locked across every page in the series.`,
  'The specification below is authoritative. Render the page exactly as specified. Do not invent text. Do not rearrange the layout. Do not substitute words. The body text is provided verbatim and must appear on the page exactly as supplied.',
].join(' ');

function block(title: string, payload: unknown): string {
  return [title, '```json', JSON.stringify(payload, null, 2), '```'].join('\n');
}

function hardConstraints(spec: WholePageSpec): string {
  const lines: string[] = ['HARD CONSTRAINTS — not negotiable:'];
  if (spec.pageType === 'CHAPTER_OPENER') {
    lines.push(
      `- Title hierarchy reads EXACTLY, on three stacked, centered lines: "${spec.pageText.title.kicker}" (small, refined, tracked small-caps with hairline rules either side) — "${spec.pageText.title.number}" (oversized, dominant engraved Roman numeral, the visual anchor of the title block) — "${spec.pageText.title.name}" (stately serif caps, full width of the reading measure). Same warm printed-ink color throughout. Never colored, never a brand accent.`,
    );
    if (spec.pageText.dropCap) {
      lines.push(
        `- The first paragraph of the body begins with an illuminated drop-cap "${spec.pageText.dropCap}", engraved botanical surround (leaves / vines / pinecone), warm sepia ink, ~3 lines tall, refined and restrained.`,
      );
    }
  }
  lines.push(
    '- Body text appears VERBATIM, every word, in order. Do not paraphrase, summarize, abbreviate, truncate, or invent.',
    `- Body typography: ${spec.typographyDNA.bodyFamily}. Set at approximately ${spec.typographyDNA.bodyPt}pt with ${spec.typographyDNA.bodyLineHeight} line height, reading measure approximately ${spec.typographyDNA.bodyMeasureChars} characters wide — generous and confident, never cramped.`,
    '- The reading field sits at the supplied coordinates. Do not move it. Do not shrink it. Do not change its proportions.',
    '- Ornamentation: engraved botanical swags top and bottom, with centered pinecone medallions, drawn in the same warm sepia ink. Hairline decorative rules around the CHAPTER kicker and the title. Period-correct, line-engraving feel — never clip art, never digital flourish.',
    '- The whole page must read as ONE integrated composition. The illustration, the typography, and the ornamentation share the same paper, the same ink palette, the same period. The page should look like it was printed from a single plate, not assembled in software.',
    '- Vintage natural-history monograph aesthetic. No modern UI. No infographic styling. No flat icons. No drop-shadows that look digital. No gradients. No sans-serif anywhere on the page.',
    '- Do not add page numbers, captions, watermarks, signatures, copyright text, folios, or running heads unless explicitly listed in `decorativeElements`.',
    // Standard v1.1 — badges are deterministic stamped overlays, NOT model-drawn.
    '- Do NOT draw any badges, hazard symbols, warning icons, region/category icons, labels, or page numbers. Keep BOTH bottom corners (about 0.9 inch square each) visually quiet and uncluttered — that space is reserved for badges the renderer stamps later. The hazard/region/source values are CONTEXT to set the mood only; never render them as marks on the page.',
    '- Output a finished, publishable page. If the result would not pass as a real spread in a collector-edition hardcover, it is wrong.',
  );
  return lines.join('\n');
}

export function assembleExperimentPrompt(spec: WholePageSpec): string {
  // Drop-cap governance (SPEC_GEOMETRY_RECONCILIATION §3): when there is no
  // drop-cap, the surround description must not reach the model at all — drop
  // `decorativeInitial` from the typography block entirely rather than emit a
  // stray "null" that still nudges the model toward an illuminated initial.
  const typographyDNA =
    spec.typographyDNA.decorativeInitial == null
      ? (() => {
          const { decorativeInitial: _omit, ...rest } = spec.typographyDNA;
          return rest;
        })()
      : spec.typographyDNA;

  return [
    HEADER,
    '',
    block('TYPOGRAPHY DNA', typographyDNA),
    '',
    block('ILLUSTRATION DNA — subject', spec.illustrationDNA.subject),
    '',
    'ILLUSTRATION DNA — master style:',
    spec.illustrationDNA.masterStyleBlock.trim(),
    '',
    block('PAGE GEOMETRY (inches)', spec.layoutGeometry),
    '',
    block('READING-FIELD GEOMETRY (inches)', spec.readingFieldGeometry),
    '',
    block('PAGE TEXT — title', spec.pageText.title),
    '',
    'PAGE BODY — render every block below IN ORDER. "heading" = a bold serif',
    'section heading; "subheading" = a smaller bold heading; "paragraph" = body',
    'prose. The text is already plain — it contains NO markdown. Render each',
    'block\'s text EXACTLY and verbatim; never print the block labels, the word',
    '"type"/"text", braces, or any #/*/_ characters.',
    '```json',
    JSON.stringify(spec.pageText.bodyBlocks, null, 2),
    '```',
    '',
    block('DECORATIVE ELEMENTS', spec.decorativeElements),
    '',
    block('BADGE CONTEXT (mood only — do NOT draw these; the renderer stamps them)', spec.badgeContext),
    '',
    hardConstraints(spec),
  ].join('\n');
}
