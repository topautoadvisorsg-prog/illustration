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

import type { WholePageSpec } from './types.js';

const HEADER =
  'You are rendering a complete finished collector-edition book page. The specification below is authoritative. Render the page exactly as specified. Do not invent text. Do not rearrange the layout. Do not substitute words. The body text is provided verbatim and must appear on the page exactly as supplied.';

function block(title: string, payload: unknown): string {
  return [title, '```json', JSON.stringify(payload, null, 2), '```'].join('\n');
}

function hardConstraints(spec: WholePageSpec): string {
  const lines: string[] = ['HARD CONSTRAINTS — not negotiable:'];
  if (spec.pageType === 'CHAPTER_OPENER') {
    lines.push(
      `- The title hierarchy must read exactly: "${spec.pageText.title.kicker}" / "${spec.pageText.title.number}" / "${spec.pageText.title.name}". Three separate lines, vertically stacked, centered above the body.`,
    );
    if (spec.pageText.dropCap) {
      lines.push(
        `- The first paragraph of the body begins with an illuminated drop-cap "${spec.pageText.dropCap}".`,
      );
    }
  }
  lines.push(
    '- Body text appears VERBATIM. Do not paraphrase, summarize, abbreviate, or invent.',
    `- Body typography: ${spec.typographyDNA.bodyFamily}, approximately ${spec.typographyDNA.bodyPt}pt, line height ${spec.typographyDNA.bodyLineHeight}, reading measure approximately ${spec.typographyDNA.bodyMeasureChars} characters wide.`,
    '- The reading field sits at the supplied coordinates. Do not move it. Do not change its proportions.',
    '- Vintage naturalist / collector-edition natural history book aesthetic. No modern UI. No infographic styling. No clip-art icons.',
    '- All typography must be visually consistent — same family, same color, balanced spacing.',
    '- Do not add page numbers, captions, watermarks, signatures, or copyright text unless explicitly listed in `decorativeElements`.',
  );
  return lines.join('\n');
}

export function assembleExperimentPrompt(spec: WholePageSpec): string {
  return [
    HEADER,
    '',
    block('TYPOGRAPHY DNA', spec.typographyDNA),
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
    'PAGE TEXT — body (RENDER VERBATIM, do not paraphrase):',
    '"""',
    spec.pageText.body.trim(),
    '"""',
    '',
    block('DECORATIVE ELEMENTS', spec.decorativeElements),
    '',
    hardConstraints(spec),
  ].join('\n');
}
