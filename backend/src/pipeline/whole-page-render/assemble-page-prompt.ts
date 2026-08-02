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
import type { BodyBlockDTO, WholePageSpec } from './types.js';

// TEXT-FIDELITY RISK CALLOUT — OpenAI's own gpt-image prompting guidance says to
// spell out long/uncommon words letter-by-letter rather than trust the model to
// copy them verbatim. Long words (>=9 letters) are the model's own documented
// risk threshold; word LENGTH is a generic, page-agnostic proxy we can compute
// from any body text, unlike a hand-curated word list. Applied automatically to
// every page so the fix scales to books we haven't written yet.
function extractRiskyWords(bodyBlocks: BodyBlockDTO[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const block of bodyBlocks) {
    const matches = block.text.match(/[A-Za-z']+/g) ?? [];
    for (const word of matches) {
      const letters = word.replace(/'/g, '');
      const key = letters.toLowerCase();
      if (letters.length >= 9 && !seen.has(key)) {
        seen.add(key);
        out.push(word);
      }
    }
  }
  return out;
}

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
  // Every page on this path bakes its own text, including the cover — there is
  // no separate "publishing engine" step that adds typography afterward (see
  // cover-print.ts, which only upscales the art and embeds it in a PDF).
  if (spec.pageType === 'COVER_WRAP') {
    return [
      `You are rendering a complete, FINISHED, publishable collector-edition cover wrap under the Wild Lands Publishing Standard v${WILDLANDS_STANDARD.version} — a museum-grade, vintage natural-history field guide in an expedition-journal aesthetic.`,
      'It is ONE single, continuous full-bleed illustration across back cover, spine, and front cover, printed from a single plate: typography and illustration share the same parchment, period, and ink — never artwork with text pasted on top, never a blank cover awaiting text.',
      'You bake ALL cover typography — front-cover title/subtitle/author/series, spine title/author, and back-cover copy — directly INTO this artwork yourself, exactly as specified below. Nothing is added after this image is generated.',
      `The page paper is parchment ${PALETTE.parchment.hex}; all ink is warm sepia ${PALETTE.ink.hex} — never pure black, never colored.`,
      'The specification below is authoritative — render it exactly as specified.',
    ].join(' ');
  }
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
      '- COVER ARTWORK: create one continuous full-bleed illustration across back cover, spine, and front cover, and bake the exact typography from PAGE TEXT — cover copy directly into that artwork as engraved book-cover lettering in the same warm sepia ink as the rest of the page — one integrated plate, never artwork with a blank space left for text, never a separate text panel or card.',
      '- FRONT COVER: in the calm upper/central title-safe zone render the title (and subtitle/description line, if present) in stately engraved serif caps; in the smaller lower zone render the author line and series line, if present.',
      '- SPINE: render the title (and author, if it fits) as a vertical strip of type sized to comfortably fit the spine width without crowding the trim.',
      '- BACK COVER: render the back-cover copy as calm body-serif type in the readable negative space of the back panel, in the order given.',
      '- Render every string in PAGE TEXT — cover copy EXACTLY, letter-for-letter: do not add, remove, translate, summarize, paraphrase, or reorder any word, and use only normal upright letters — no garbled, warped, or invented glyphs. Before finishing, PROOFREAD every baked word against PAGE TEXT — cover copy; a cover with even one misspelled or altered word is unusable.',
      '- Keep the lower-right back-cover corner visually quiet and free of typography — Amazon/KDP prints the barcode there after press. Do not render a barcode, ISBN, or price box yourself.',
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
    // NO FRAMES/BORDERS/BANDS — the two overlapping "no border around text" and
    // "no decorative swags/frames" constraints, consolidated into one.
    '- NO FRAMES, BORDERS, OR DECORATIVE BANDS: draw NO line, rule, outline, box, panel edge, or border AROUND the body text or reading area — the text sits DIRECTLY on the parchment like a printed book page, and the illustration opens into the calm parchment where it sits with no hard edge or seam. Likewise add NO top/bottom botanical swags, ornament bands, pinecone garlands, decorative borders, corner flourishes, or framing devices anywhere on the page. Page identity is carried by the illustration, the parchment, and the engraved typography — nothing else.',
    // TEXT SAFETY — the single, consolidated text-protection rule. This is the ONE
    // place that states: text stays inside the safe area (highest priority), the
    // trim physically cuts anything past it, the text is centred in its reading
    // field, and when copy is dense the TEXT sizes down (never the illustration).
    // Previously spread across SAFE CONTENT AREA, TEXT SAFETY, SAFE-ZONE, TEXT
    // CENTERING, and ILLUSTRATION-NEVER-REDUCED — said once now, not five times.
    '- TEXT SAFETY (highest priority — outranks everything else): this is a PRINTED book TRIMMED at the edges, so anything past the trim is physically CUT OFF. Keep EVERY piece of text — body, headings, scientific names, captions, page number — comfortably INSIDE the safe content area with a buffer, never touching, crossing, or crowding the trim edge. Visually CENTER the body-text block in its reading field — never anchored to an edge or drifting toward one. When copy is dense the TEXT sizes down to fit (see TEXT SIZE); NEVER shrink, move, or crop the illustration to make room — the illustration stays full-bleed and the text adapts.',
    // The copyright page legitimately renders copyright text as its body, so do
    // not forbid it there — only forbid the AI from INVENTING such furniture on
    // every other page.
    `- Do not add page numbers, captions, watermarks, signatures, ${spec.pageType === 'COPYRIGHT_PAGE' ? '' : 'copyright text, '}folios, or running heads unless explicitly listed in \`decorativeElements\`.`,
  );
  // BOTTOM-ANCHOR GUARDRAIL (operator) — universal text protection. The image
  // model tends to run body text down to the bottom trim, where it is cut off. A
  // subject-matched illustration anchoring the bottom band forces the text up and
  // away. Subject-matched WITH latitude (the model picks the specific element) and
  // bleed-aware (atmospheric support, not precious detail). Text-bearing pages
  // only — a pure-illustration page has no body text to protect.
  if (rendersCriticalText(spec)) {
    lines.push(
      "- BOTTOM ANCHOR (hard constraint — text protection): anchor a REAL illustration across the BOTTOM band of the page, running full-width and bleeding off the bottom edge. Its purpose is functional: it holds the body text UP and away from the bottom edge so no line of text ever reaches the trim/bleed and gets cut off. Draw this bottom illustration from THIS page's own subject — the species, its habitat, its tracks and sign, foliage, or terrain, whatever fits the entry — you choose the specific element and compose it naturally; it is subject illustration, NOT a decorative swag, ornament band, border, or frame. Render it as ONE continuous illustrated scene, like the rest of the page's artwork — NEVER a collage or grid of separate labeled specimen studies, insets, or vignettes. The illustration carries NO text of any kind: no caption, no label, no scientific name, no italic tag under any element — only the body-text reading field renders words. TWO rules, both absolute: (a) the illustration OWNS the bottom band and the body text STOPS ABOVE it — text must NEVER enter the bottom band or cross the safe line; and (b) this bottom band sits in the bleed and WILL be trimmed at the edge, so keep it ATMOSPHERIC and SUPPORTING — never place the main subject, its face, or any essential detail in it, and put nothing there that cannot survive being cut.",
      // TOP ANCHOR — mirror of the bottom anchor. Without it the top of the page is
      // bare parchment and the title/text drift up against the top safe line. An
      // atmospheric top fills that space and holds the type down and in.
      "- TOP ANCHOR (hard constraint — text protection, MIRROR of the bottom anchor): the illustration must reach UP and fill the TOP of the page, bleeding off the top edge — typically ATMOSPHERIC (open sky, high thin cloud, drifting mist, a distant ridgeline or a high forest canopy), whatever fits THIS page's subject. The top is NEVER left as bare, empty parchment above the title or the text. Its purpose is functional: it holds the title and body text DOWN and IN so no line of type ever drifts up over the top safe line and off the trim. Keep the atmosphere DIRECTLY behind the engraved title and the reading text CALM, light, and low-contrast so the type stays fully legible — the sky OPENS INTO the calm zone where the words sit; it is never a busy scene laid over the type. It sits in the bleed and WILL be trimmed at the top edge — keep it atmospheric and supporting, with nothing essential up there.",
      // SUBJECT POSE (operator) — the main subject must be alive and characterful,
      // not a stiff floating specimen. Latitude: a strong "model" portrait OR a
      // characteristic natural action, model's choice, grounded in real habitat.
      "- SUBJECT POSE — bring the subject to LIFE: depict the page's main subject in a strong, characterful pose that feels alive and grounded in its real habitat — NEVER a stiff museum specimen floating on blank ground. Choose whichever best portrays THIS subject: either (a) a dignified field-guide 'model' pose that clearly shows its key identifying features, OR (b) a natural, characteristic ACTION or behaviour in its element — moving, feeding, hunting, alert, at the water, interacting with its habitat (e.g. a grizzly turning at a river, an eagle on the stoop, a marten mid-branch). Keep it accurate to the species and keep the subject and its defining features (face, head, diagnostic marks) INSIDE the trim-safe area as required above. A calm, dignified portrait is welcome; a lifeless specimen is not.",
    );
  }
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
  //  - `titleHierarchy` (the front-cover title stack) also applies to the cover.
  const emitTitleFamily = spec.pageType === 'CHAPTER_OPENER' || spec.pageType === 'TITLE_PAGE';
  const isCoverWrap = spec.pageType === 'COVER_WRAP';
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
    ...(rendersCriticalText(spec) || isCoverWrap ? { titleHierarchy } : {}),
    ...(decorativeInitial != null ? { decorativeInitial } : {}),
  };
  // Every page in this path bakes its own text into the image, including the
  // cover (see COVER_WRAP handling below) — the single, strongest text-fidelity
  // statement for interior body text lives HERE and nowhere else.
  const riskyWords = rendersCriticalText(spec) ? extractRiskyWords(spec.pageText.bodyBlocks) : [];
  const bodySection = rendersCriticalText(spec)
    ? [
        'PAGE BODY — render every block below IN ORDER, as its type ("heading" = bold serif section heading, "subheading" = smaller bold heading, "paragraph" = body prose).',
        'Render the provided text EXACTLY: do not add, remove, translate, summarize, or reorder any words. The text is already plain — never print the block labels, the words "type"/"text", braces, or any markdown (#/*/_).',
        'SPELL EVERY WORD LETTER-FOR-LETTER exactly as written: do not drop, add, transpose, duplicate, or substitute any letter, and use only normal upright letters — no garbled, warped, superscript, or invented glyphs. Every rendered word must be a correctly spelled copy of the source word. Before finishing, PROOFREAD THE BAKED TEXT AGAINST THE SOURCE BLOCKS BELOW THREE SEPARATE TIMES, word by word — once for missing/added words, once for letter-level spelling, once for duplicated or reordered words. A page with even one misspelled word is unusable and must be corrected before the page is considered finished.',
        `TEXT SIZE — set the body text at ${spec.typographyDNA.bodyPt}pt at this trim (about ${spec.typographyDNA.bodyMeasureChars ?? 70} characters per line). This is the MAXIMUM: never render it larger, and never enlarge it to fill empty space. If the copy does not all fit, size it DOWN to the smallest still-clearly-readable book size until every line fits — the text only ever sizes down, never up. (Placement and the safe area are governed by TEXT SAFETY below.)`,
        '```json',
        JSON.stringify(spec.pageText.bodyBlocks, null, 2),
        '```',
        ...(riskyWords.length > 0
          ? [
              `SPELL-OUT CHECK — these words from the text above are long and easy to mis-key; verify each one letter-by-letter before finishing: ${riskyWords.map((w) => `"${w}" (${w.toUpperCase().split('').join('-')})`).join(', ')}.`,
            ]
          : []),
      ]
    : isCoverWrap
      ? [
          'TEXT POLICY — this page bakes its own cover typography. Render the exact strings in PAGE TEXT — cover copy above, placed per the FRONT COVER / SPINE / BACK COVER constraints below. Keep every other zone of the artwork calm and naturally integrated — never a blank card, panel, label, or cutout waiting for text.',
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
    ...(isCoverWrap && spec.coverCopy ? [block('PAGE TEXT — cover copy (bake exactly, letter-for-letter)', spec.coverCopy), ''] : []),
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
