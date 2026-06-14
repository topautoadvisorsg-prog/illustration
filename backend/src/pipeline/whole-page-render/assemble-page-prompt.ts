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

/**
 * DEDICATED cover prompt. The cover is the flagship image — it gets its own
 * lean prompt, NOT the universal page prompt with leftovers. No blueprint, no
 * reading-field coordinates, no badge context, no chapter ornaments, no page
 * geometry block. Information hierarchy (operator-approved):
 *   1. Mission  2. Exact text  3. Composition zones  4. Visual DNA
 *   5. Typography DNA (compressed)  6. Hard negatives
 */
export function assembleCoverPrompt(spec: WholePageSpec): string {
  const cc = spec.coverCopy ?? { title: spec.pageText.title.name };
  const subj = spec.illustrationDNA.subject;
  return [
    // 1. MISSION
    `MISSION — create a complete, FINISHED, publishable collector-edition FULL-WRAP HARDCOVER COVER under the Wild Lands Publishing Standard v${WILDLANDS_STANDARD.version}: one continuous illustration spanning back cover, spine, and front cover. A museum-grade collector's natural-history volume — an object that feels rare, archival, and worthy of preservation. The entire wrap must appear as a SINGLE printed plate where illustration, typography, and ornamentation are inseparable — never artwork with text pasted on top. You render the complete cover — illustration and typography — as one finished image.`,
    '',
    // 2. EXACT TEXT
    'TEXT TO RENDER — these exact words, engraved into the artwork; do not alter, translate, abbreviate, or reorder:',
    '```json',
    JSON.stringify(cc, null, 2),
    '```',
    '',
    // 3. COMPOSITION ZONES
    'COMPOSITION — one continuous full-bleed wrap:',
    `- ${spec.composition.imagePlacement}.`,
    '- FRONT COVER: the title block — title, then subtitle, then the cover-description line — as the engraved focal typography over the strongest part of the scene; the author line lower on the front cover; and, ONLY if a series line is provided in the text, that series line as small engraved caps along the very bottom edge of the front cover.',
    '- SPINE: the title and author as vertical spine typography in the same ink.',
    '- BACK COVER: set the back-cover copy as readable engraved typesetting over calm landscape negative space, in this top-to-bottom hierarchy — first "backCover.mainDescription" as the lead sales paragraph; then, if present, "backCover.insideThisVolume" as a titled "INSIDE THIS VOLUME" feature list (each entry its own line); then, if present, "backCover.authorBio" as a smaller author note near the bottom. Keep the lower-right barcode zone clear.',
    '- Render ONLY the words provided in the text block above; if a field is absent, omit it (do not invent a subtitle, description, author, or series line).',
    '',
    // 4. VISUAL DNA — the heart of the style
    'WILD LANDS VISUAL DNA:',
    spec.illustrationDNA.masterStyleBlock.trim(),
    '',
    `SCENE: ${subj.primary} ${subj.environment}. Mood: ${subj.mood}.`,
    '',
    // 5. TYPOGRAPHY DNA — compressed (the model is not setting a PDF)
    `TYPOGRAPHY: Caslon-class old-style serif (Adobe Caslon, Goudy Old Style, or Garamond) in engraved roman caps — letterpress feel, a slight printed-ink impression, paper grain under the type. Warm sepia ink ${PALETTE.ink.hex} on parchment ${PALETTE.parchment.hex}; never pure black, never a modern sans-serif, never a flat digital label or sticker.`,
    '',
    // 6. HARD NEGATIVES
    'HARD NEGATIVES:',
    '- No photography, photorealism, 3D render, flat vector, low-poly, anime/cartoon, modern UI, infographic styling, gradients, or digital drop-shadows.',
    '- No chapter kicker, chapter ornaments, page numbers, folios, running heads, or badges — this is a cover, not an interior page. (A series "VOLUME" line with a Roman numeral IS allowed when provided in the text above.)',
    '- Do not invent any text beyond the words specified above.',
    '- If the result would not pass as a real collector-edition hardcover wrap on a bookstore shelf, it is wrong.',
  ].join('\n');
}


function promptHeader(_spec: WholePageSpec): string {
  // Every page on this path bakes its own text (the cover is the sole exception
  // and uses assembleCoverPrompt — it never reaches here), so the standard
  // text-rendering header always applies.
  return HEADER;
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
        `- The first paragraph of the body begins with an illuminated drop-cap "${spec.pageText.dropCap}", engraved botanical surround (leaves / vines / pinecone), warm sepia ink, ~3 lines tall, refined and restrained.`,
      );
    }
  }
  if (spec.pageType === 'TITLE_PAGE') {
    const stacked = spec.typographyDNA.titleHierarchy.filter(Boolean);
    lines.push(
      `- TITLE-PAGE typography, baked INTO the artwork as the engraved title block — stacked and centered on calm parchment, in this exact order top to bottom: ${stacked.map((s) => `"${s}"`).join(' / ')}. The title set largest in stately serif caps; the subtitle and description beneath it; the author/imprint line lower; and the final series "VOLUME" line, when present, as small tracked caps at the bottom. All in warm sepia ink, framed by a refined ornament. Render only these lines, in this order; never a pasted label, never modern type.`,
    );
  }
  if (spec.pageType === 'INTERIOR' && spec.pageText.title.name) {
    lines.push(
      `- ENTRY TITLE — render "${spec.pageText.title.name}" as the page's engraved section heading across the calm upper title band: stately serif caps in warm sepia ink, paired with a thin engraved rule. The body text begins BELOW it, inside the reading field. Do NOT repeat this title anywhere inside the body.`,
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
    `- COMPOSITION CONTRACT — image placement: ${spec.composition.imagePlacement}. Text placement: ${spec.composition.textPlacement}. Respect this placement EXACTLY: do not move the artwork to a different region, do not mirror left/right or top/bottom, do not enlarge a small accent into a band or a band into a full page. The attached layout reference image shows the same plan — follow it.`,
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
    decorativeInitial,
    ...typoRest
  } = spec.typographyDNA;
  const typographyDNA = {
    ...typoRest,
    ...(emitTitleFamily ? { titleFamily } : {}),
    ...(decorativeInitial != null ? { decorativeInitial } : {}),
  };
  // Every page in this path bakes its own text into the image (the cover is the
  // sole exception and uses the dedicated assembleCoverPrompt — it never reaches
  // here). The single, strongest text-fidelity statement lives HERE and nowhere else.
  const bodySection = [
    'PAGE BODY — render every block below IN ORDER, as its type ("heading" = bold serif section heading, "subheading" = smaller bold heading, "paragraph" = body prose).',
    'Render the provided text EXACTLY: do not add, remove, translate, summarize, or reorder any words. The text is already plain — never print the block labels, the words "type"/"text", braces, or any markdown (#/*/_).',
    // Legibility floor: pagination already fit this exact amount of text to the
    // reading field at the body size below, so the model must NOT shrink the type
    // to cram — that is what produced cramped pages. The size is the floor.
    `TEXT SIZE — set the body at a comfortable, consistent printed-book reading size (about ${spec.typographyDNA.bodyPt}pt at this trim, roughly ${spec.typographyDNA.bodyMeasureChars ?? 70} characters per line). This exact amount of text was already fit to the reading field at that size — render it at that size and let it fill the field naturally. NEVER shrink the body type below a clearly legible book size to fit more in; the amount of text is correct for the space.`,
    '```json',
    JSON.stringify(spec.pageText.bodyBlocks, null, 2),
    '```',
  ];

  // Continuation/compacted pages carry the SAME subject as the entry opener, but
  // must not reprint the opener's portrait — each page should teach something new.
  const continuationStudy =
    spec.pageType === 'CONTINUATION' || spec.pageType === 'COMPACTED'
      ? [
          'CONTINUATION STUDY — this page continues an entry whose subject already received its main field-guide portrait on the opening page. Do NOT repeat that portrait\'s pose, angle, or composition. Instead depict the SAME subject from a DIFFERENT, complementary perspective that adds new understanding: a different behavior, a habitat or environmental context, a life stage, movement, an anatomical or structural detail, track/sign, or an interaction with its ecosystem. Keep the exact same Cinematic Naturalist style, palette, and scientific accuracy — only the chosen study and viewpoint change, so a reader turning the page learns something new rather than seeing the same picture twice.',
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
    block('PAGE TEXT — title', spec.pageText.title),
    '',
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
