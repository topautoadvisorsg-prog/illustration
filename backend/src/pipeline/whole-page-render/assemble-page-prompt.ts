/**
 * Whole-page render pipeline — JSON spec → image-model prompt.
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

import { PALETTE, WILDLANDS_STANDARD } from '../publishing-standard/index.js';
import type { WholePageSpec } from './types.js';

// CORE IDENTITY — stated ONCE. The Wild Lands identity, the single-plate
// composition principle, and the parchment/ink palette live here and nowhere
// else; every other section (typography, illustration, constraints) assumes it.
const HEADER = [
  `You are rendering a complete, FINISHED, publishable collector-edition book page under the Wild Lands Publishing Standard v${WILDLANDS_STANDARD.version} — a museum-grade, vintage natural-history field guide in an expedition-journal aesthetic.`,
  'It is ONE single, integrated page printed from a single plate: typography, ornamentation, and illustration share the same parchment, period, and ink — never artwork with text pasted on top.',
  `The page paper is parchment ${PALETTE.parchment.hex}; all ink is warm sepia ${PALETTE.ink.hex} — never pure black, never colored.`,
  'The specification below is authoritative — render it exactly as specified.',
].join(' ');

// HARD NEGATIVES — stated ONCE, consolidated. Every "no modern UI / no
// photography / no vector / no infographic" rule lives here, not scattered
// across the typography DNA flags and the hard constraints.
const HARD_NEGATIVES = [
  'HARD NEGATIVES — never:',
  '- No photography, photorealism, or photographic lighting; no 3D render, flat vector, isometric, low-poly, anime, manga, cartoon, or comic-book linework.',
  '- No modern UI, infographic styling, flat icons, gradients, or digital drop-shadows.',
  '- No sans-serif type anywhere on the page.',
  '- No anthropomorphized animals, cartoon expressions, or whimsical fantasy elements.',
].join('\n');

function rendersCriticalText(spec: WholePageSpec): boolean {
  return !['COVER_WRAP', 'TITLE_PAGE', 'GLOSSARY_ORNAMENT', 'INDEX_ORNAMENT'].includes(spec.pageType);
}

function promptHeader(spec: WholePageSpec): string {
  // Every page on this path bakes its own text (the cover is the sole exception
  // and uses assembleCoverPrompt — it never reaches here), so the standard
  // text-rendering header always applies.
  if (rendersCriticalText(spec)) return HEADER;
  return [
    `You are rendering the artwork layer for a publishable collector-edition ${spec.pageType.toLowerCase().replaceAll('_', ' ')} under the Wild Lands Publishing Standard v${WILDLANDS_STANDARD.version}.`,
    'Render artwork, ornament, paper character, and naturally calm reserved zones only.',
    'Do not render readable text. The publishing engine adds all exact typography, reference copy, spine text, and barcode elements after artwork generation.',
  ].join(' ');
}

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
        `- The first paragraph of the body begins with a large engraved drop-cap "${spec.pageText.dropCap}" in warm sepia ink, ~3 lines tall — a plain raised/dropped initial letter only. NO botanical surround, wreath, leaves, vines, pinecone, or ornament around it; the letter is pure typography.`,
      );
    }
  }
  if (spec.pageType === 'TITLE_PAGE') {
    lines.push(
      '- TITLE PAGE ARTWORK: reserve a calm central title-safe region and a smaller lower imprint-safe region. Do not render title, subtitle, author, imprint, series, or any other readable text.',
    );
  }
  if (spec.pageType === 'COVER_WRAP') {
    lines.push(
      '- COVER ARTWORK ONLY: create one continuous full-bleed illustration across back cover, spine, and front cover.',
      '- Reserve calm composition zones for front-cover title/subtitle/author, back-cover copy, and optional spine typography. Keep the lower-right back-cover barcode zone visually quiet.',
      '- Do not render letters, words, title text, author text, back-cover copy, spine text, barcode, ISBN, price box, or placeholder labels. The publishing engine adds those elements exactly.',
    );
  }
  if (spec.pageType === 'INTERIOR' && spec.pageText.title.name) {
    const sci = spec.pageText.title.scientificName;
    lines.push(
      `- ENTRY TITLE — render "${spec.pageText.title.name}" as the page's engraved section heading across the calm upper title band: stately serif caps in warm sepia ink, paired with a thin engraved rule.` +
        (sci
          ? ` Directly BENEATH the heading (above the engraved rule), render the scientific name "${sci}" as the species byline: a smaller, centered, ITALIC old-style serif line in the same warm sepia ink — clearly subordinate to the heading (roughly half its size), the classic field-guide binomial subtitle. Render it EXACTLY as given, italic, with no asterisks or markup, and do not uppercase it. Do NOT repeat the scientific name anywhere inside the body.`
          : '') +
        ` The body text begins BELOW it, inside the reading field. Do NOT repeat this title anywhere inside the body.`,
    );
  }
  lines.push(
    // F-8 — the Chapter 1 production run proved the attached blueprint alone
    // is loosely followed: corner-accent layouts rendered as full-width bands
    // and a 50/50 page mirrored. State the placement contract in prose and
    // forbid the three observed failure modes (move / mirror / enlarge).
    // Typography, ornamentation, negatives, and the verbatim rule are NOT
    // repeated here — they live in the Typography DNA, Illustration DNA, the
    // consolidated HARD NEGATIVES, and the PAGE BODY section respectively.
    `- PRODUCTION GUIDES ARE NOT ARTWORK (ABSOLUTE RULE)
The blueprint, reading-field guides, safe-area guides, trim guides, placement zones, construction marks, measurement marks, boundary indicators, and all layout references are PRODUCTION INSTRUCTIONS ONLY.
They do NOT exist on the final page.
They must NEVER be drawn, painted, engraved, printed, traced, watermarked, embossed, suggested, implied, or represented in any way.
The final page contains ONLY: illustration, parchment, and typography.
No guide lines. No dashed lines. No rectangles. No borders. No blueprint marks. No construction marks. No placement indicators.
If any guide line, dashed line, rectangle, or blueprint element appears in the artwork, the page is incorrect.`,
    `- COMPOSITION CONTRACT — image placement: ${spec.composition.imagePlacement}. Text placement: ${spec.composition.textPlacement}. Respect this placement EXACTLY: do not move the artwork to a different region, do not mirror left/right or top/bottom, do not enlarge a small accent into a band or a band into a full page. Use the attached layout reference ONLY to place the artwork and text — it is a production guide and must NEVER be drawn on the page.`,
    // Architecture v1.3 — the LAYER / BLEED rule. Decorative botanical swags are
    // removed entirely (they were protected content that kept getting trimmed).
    // Two layers, two bleed rules: illustration bleeds, everything designed does not.
    '- LAYER ARCHITECTURE (bleed rule — not negotiable): Layer 1, ENVIRONMENTAL ILLUSTRATION — the BACKGROUND and surroundings (mountains, water, sky, foliage, habitat) may and SHOULD bleed off all four trim edges; it is expected to be cut, and that is fine. BUT the MAIN SUBJECT / focal point of the artwork — the key species and ESPECIALLY its face, head, eyes, and defining features, or the single most important element of the page — must be kept comfortably INSIDE the trim-safe area so the trim NEVER cuts it. Compose so only the non-essential background fades off the edge; the important subject stays inside. Layer 2, TYPOGRAPHY (every heading and word), and Layer 3, IDENTITY / DECORATIVE DEVICES (any badge, marker, rule, frame, or decorative element), are PROTECTED CONTENT: they must sit ENTIRELY inside the trim-safe area, at least 0.5 inch in from every trim edge, and may NEVER enter the bleed. The outer trim strip is disposable — only non-essential environmental illustration belongs there.',
    '- NO DECORATIVE BANDS OR FRAMES: do NOT add top or bottom botanical swags, ornament bands, pinecone garlands, decorative borders, corner flourishes, or framing devices anywhere on the page. The page identity is carried by the illustration, the parchment, the engraved typography, and the stamped badges — nothing else.',
    '- NO LINE OR BORDER AROUND THE TEXT (critical): do NOT draw any line, rule, outline, box, panel edge, frame, or border AROUND the body text or the reading area. The text sits DIRECTLY on the parchment and must feel natural, like a printed book page — never boxed, outlined, or contained by a drawn line. The illustration simply opens into the calm parchment where the text sits, with no hard edge or seam between them.',
    '- SAFE CONTENT AREA (production instruction only) — WHY THIS MATTERS: this is a PRINTED book that is TRIMMED at the edges, so anything past the trim is physically CUT OFF and lost on the finished page. Keep EVERY heading, every line of body text, the page number, and every important subject (faces, key features) comfortably INSIDE the safe content area, well clear of the trim edge. The illustration is MEANT to be cut: it fills the page and bleeds off all four edges — only the disposable background runs to the edge, never the text or the important subject.',
    // QA reinforcement (operator): text placement is the highest priority — never
    // let an illustration crowd the copy toward the safe boundary; centre the text.
    '- TEXT SAFETY IS HIGHEST PRIORITY: keeping EVERY piece of text — body, headings, scientific names, captions, educational content — fully INSIDE the safe content area outranks everything else. If the copy is dense or nearing the boundary, SIZE THE TEXT DOWN (to the smallest still-clearly-readable book size) so every line fits inside the safe content area. Do NOT shrink, move, or crop the illustration to make room — the TEXT adapts, the illustration stays full.',
    '- TEXT CENTERING: visually CENTER the body-text block inside its reading field — do NOT anchor it to the top edge, do NOT anchor it to the bottom edge, and never let it drift toward any page edge. Keep comfortable whitespace on all sides; when in doubt, pull the text inward toward the centre of the reading area.',
    '- SAFE-ZONE (hard constraint): treat the safe-content boundary as a hard limit. Text must never touch, cross, or visually crowd it. Aim text slightly INSIDE the safe area with a comfortable buffer.',
    '- ILLUSTRATION IS FULL-BLEED, NEVER REDUCED: the illustration fills its zones and bleeds off the trim edges; do NOT shrink it, frame it, or pull it inward to make room for text. When text is dense, the TEXT sizes down to fit inside the safe content area — the illustration is never made smaller.',
    '- The reading field sits at the supplied coordinates. Do not move it, shrink it, or change its proportions.',
    // The copyright page legitimately renders copyright text as its body, so do
    // not forbid it there — only forbid the AI from INVENTING such furniture on
    // every other page.
    `- Do not add page numbers, captions, watermarks, signatures, ${spec.pageType === 'COPYRIGHT_PAGE' ? '' : 'copyright text, '}folios, or running heads unless explicitly listed in \`decorativeElements\`.`,
  );
  return lines.join('\n');
}

export function assemblePagePrompt(spec: WholePageSpec): string {
  // Drop-cap governance (SPEC_GEOMETRY_RECONCILIATION §3): when there is no
  // drop-cap, the surround description must not reach the model at all — drop
  // `decorativeInitial` from the typography block entirely rather than emit a
  // stray "null" that still nudges the model toward an illuminated initial.
  // Shape the Typography DNA that reaches the model:
  //  - `identity` lives in the header (core identity, stated once) — drop it.
  //  - `noModernUi` / `noInfographic` live in HARD NEGATIVES — drop them.
  //  - `titleFamily` carries the chapter kicker / Roman-numeral hierarchy, which
  //    is ONLY relevant to chapter openers and title pages — omit it elsewhere
  //    (a glossary/copyright page must never see "chapter kicker").
  //  - `decorativeInitial` only when a drop-cap is actually present.
  const emitTitleFamily = spec.pageType === 'CHAPTER_OPENER' || spec.pageType === 'TITLE_PAGE';
  const {
    identity: _identity,
    noModernUi: _noModernUi,
    noInfographic: _noInfographic,
    titleFamily,
    titleHierarchy,
    decorativeInitial,
    ...typoRest
  } = spec.typographyDNA;
  const typographyDNA = {
    ...typoRest,
    ...(emitTitleFamily ? { titleFamily } : {}),
    ...(rendersCriticalText(spec) ? { titleHierarchy } : {}),
    ...(decorativeInitial != null ? { decorativeInitial } : {}),
  };
  // Every page in this path bakes its own text into the image (the cover is the
  // sole exception and uses the dedicated assembleCoverPrompt — it never reaches
  // here). The single, strongest text-fidelity statement lives HERE and nowhere else.
  const bodySection = rendersCriticalText(spec)
    ? [
        'PAGE BODY — render every block below IN ORDER, as its type ("heading" = bold serif section heading, "subheading" = smaller bold heading, "paragraph" = body prose).',
        'Render the provided text EXACTLY: do not add, remove, translate, summarize, or reorder any words. The text is already plain — never print the block labels, the words "type"/"text", braces, or any markdown (#/*/_).',
        `TEXT SIZE — set the body text at ${spec.typographyDNA.bodyPt}pt at this trim (about ${spec.typographyDNA.bodyMeasureChars ?? 70} characters per line). This is the MAXIMUM size: NEVER render the body text larger than ${spec.typographyDNA.bodyPt}pt, and never enlarge it to fill empty space. If ALL the text does not fit inside the safe content area at ${spec.typographyDNA.bodyPt}pt, REDUCE the size — down to the smallest still-clearly-readable book size — until every line fits inside the safe content area. The text only ever sizes DOWN to fit, never UP. Keeping every line inside the safe content area outranks the text size.`,
        '```json',
        JSON.stringify(spec.pageText.bodyBlocks, null, 2),
        '```',
      ]
    : [
        'TEXT POLICY — render no readable text for this page role.',
        'Keep typography-safe and reference-safe regions calm and naturally integrated into the artwork. Never draw a blank card, panel, label, frame, or cutout.',
      ];

  // Continuation/compacted pages carry the SAME subject as the entry opener, but
  // must not reprint the opener's portrait — each page should teach something new.
  const continuationStudy =
    spec.pageType === 'CONTINUATION' || spec.pageType === 'COMPACTED'
      ? [
          'CONTINUATION STUDY — this page continues an entry whose subject already received its main field-guide portrait on the opening page. Do NOT repeat that portrait\'s pose, angle, or composition. Instead depict the SAME subject from a DIFFERENT, complementary perspective that adds new understanding: a different behavior, a habitat or environmental context, a life stage, movement, an anatomical or structural detail, track/sign, or an interaction with its ecosystem. Keep the exact same illustration style, palette, and scientific accuracy as this edition\'s established look — only the chosen study and viewpoint change, so a reader turning the page learns something new rather than seeing the same picture twice.',
          '',
        ]
      : [];

  return [
    promptHeader(spec),
    '',
    block('TYPOGRAPHY DNA', typographyDNA),
    '',
    block('ILLUSTRATION DNA — subject', spec.illustrationDNA.subject),
    '',
    ...continuationStudy,
    'ILLUSTRATION DNA — master style:',
    spec.illustrationDNA.masterStyleBlock.trim(),
    '',
    block('PAGE GEOMETRY (inches)', spec.layoutGeometry),
    '',
    block('READING-FIELD GEOMETRY (inches)', spec.readingFieldGeometry),
    '',
    ...(rendersCriticalText(spec) ? [block('PAGE TEXT — title', spec.pageText.title), ''] : []),
    ...bodySection,
    '',
    block('DECORATIVE ELEMENTS', spec.decorativeElements),
    '',
    // Badge context + badge-safe zones are NOT sent to the model (operator
    // decision): badges are stamped deterministically by print-prep in a fixed
    // bottom-right corner, so the model never needs to know about them.
    hardConstraints(spec),
    '',
    HARD_NEGATIVES,
  ].join('\n');
}
