/**
 * EXPERIMENT-ONLY helper library for the prompt-optimization test
 * (backend/experiments/prompt-optimization/). Not part of production.
 *
 * Slices the REAL assembled_prompt text for pageKey CH01_P007_c4 (Canadian
 * Rockies project) into named sections using unique anchor substrings, so
 * every prompt variant is built from verbatim production text rather than
 * hand-retyped copies. Then assembles 5 experimental variants (A-E) plus
 * exposes the untouched control text.
 */

export interface Sections {
  header: string;
  typographyDna: string;
  illustrationSubject: string;
  continuationStudy: string;
  masterStyle: string;
  pageGeometry: string;
  readingField: string;
  pageTitle: string;
  bodyIntro3Lines: string; // the 3 instruction lines before the body JSON
  bodyRenderLine: string;
  bodyVerbatimLine: string;
  bodySpellLine: string;
  bodyTextSizeLine: string;
  bodyJson: string; // ```json ... ``` block only
  decorativeElements: string;
  hcIntro: string; // "HARD CONSTRAINTS — not negotiable:"
  hcBullets: string[]; // 9 bullets, each starting with the bullet text (no leading "- ")
  hardNegatives: string;
}

function must(idx: number, label: string): number {
  if (idx === -1) throw new Error(`Anchor not found while slicing control prompt: ${label}`);
  return idx;
}

export function sliceControlPrompt(text: string): Sections {
  const iTypo = must(text.indexOf('TYPOGRAPHY DNA\n```json'), 'TYPOGRAPHY DNA');
  const iIllusSubj = must(text.indexOf('ILLUSTRATION DNA — subject\n```json'), 'ILLUSTRATION DNA — subject');
  const iContinuation = must(text.indexOf('CONTINUATION STUDY —'), 'CONTINUATION STUDY');
  const iMasterStyleLabel = must(text.indexOf('ILLUSTRATION DNA — master style:\n'), 'ILLUSTRATION DNA — master style');
  const iPageGeom = must(text.indexOf('PAGE GEOMETRY (inches)\n```json'), 'PAGE GEOMETRY');
  const iReadingField = must(text.indexOf('READING-FIELD GEOMETRY (inches)\n```json'), 'READING-FIELD GEOMETRY');
  const iPageTitle = must(text.indexOf('PAGE TEXT — title\n```json'), 'PAGE TEXT — title');
  const iBodyLabel = must(text.indexOf('PAGE BODY — render every block'), 'PAGE BODY');
  const iDecor = must(text.indexOf('DECORATIVE ELEMENTS\n```json'), 'DECORATIVE ELEMENTS');
  const iHcIntro = must(text.indexOf('HARD CONSTRAINTS — not negotiable:'), 'HARD CONSTRAINTS');
  const iHardNeg = must(text.indexOf('HARD NEGATIVES — never:'), 'HARD NEGATIVES');

  const header = text.slice(0, iTypo).trim();
  const typographyDna = text.slice(iTypo, iIllusSubj).trim();
  const illustrationSubject = text.slice(iIllusSubj, iContinuation).trim();
  const continuationStudy = text.slice(iContinuation, iMasterStyleLabel).trim();
  const masterStyle = text.slice(iMasterStyleLabel, iPageGeom).trim();
  const pageGeometry = text.slice(iPageGeom, iReadingField).trim();
  const readingField = text.slice(iReadingField, iPageTitle).trim();
  const pageTitle = text.slice(iPageTitle, iBodyLabel).trim();
  const bodySection = text.slice(iBodyLabel, iDecor).trim();
  const decorativeElements = text.slice(iDecor, iHcIntro).trim();
  const hcSection = text.slice(iHcIntro, iHardNeg).trim();
  const hardNegatives = text.slice(iHardNeg).trim();

  // Split bodySection into its 3 instruction lines + the json block.
  const bodyJsonStart = bodySection.indexOf('```json');
  const bodyInstrBlock = bodySection.slice(0, bodyJsonStart).trim();
  const bodyJson = bodySection.slice(bodyJsonStart).trim();
  const bodyInstrLines = bodyInstrBlock.split('\n').filter(Boolean);
  // Lines are: [0] "PAGE BODY — render every block below IN ORDER..." (label/intro),
  // [1] "Render the provided text EXACTLY..." (verbatim rule),
  // [2] "SPELL EVERY WORD LETTER-FOR-LETTER..." (spelling rule),
  // [3] "TEXT SIZE — ..." (sizing rule).
  if (bodyInstrLines.length !== 4) {
    throw new Error(`Expected 4 body instruction lines, found ${bodyInstrLines.length}:\n${bodyInstrBlock}`);
  }
  const [bodyLabelLine, bodyVerbatimOnly, bodySpellOnly, bodyTextSizeOnly] = bodyInstrLines;
  const bodyRenderLine = `${bodyLabelLine}\n${bodyVerbatimOnly}`;
  const bodyVerbatimLine = bodyVerbatimOnly;
  const bodySpellLine = bodySpellOnly;
  const bodyTextSizeLine = bodyTextSizeOnly;

  // Split hcSection ("HARD CONSTRAINTS — not negotiable:\n- ...\n- ...") into bullets.
  const afterIntro = hcSection.slice('HARD CONSTRAINTS — not negotiable:'.length).trim();
  const hcBullets = afterIntro
    .split(/\n(?=- )/)
    .map((b) => b.replace(/^- /, '').trim())
    .filter(Boolean);

  return {
    header,
    typographyDna,
    illustrationSubject,
    continuationStudy,
    masterStyle,
    pageGeometry,
    readingField,
    pageTitle,
    bodyIntro3Lines: bodyInstrBlock,
    bodyRenderLine,
    bodyVerbatimLine,
    bodySpellLine,
    bodyTextSizeLine,
    bodyJson,
    decorativeElements,
    hcIntro: 'HARD CONSTRAINTS — not negotiable:',
    hcBullets,
    hardNegatives,
  };
}

// ---- Variant builders ----

export function buildControl(text: string): string {
  return text;
}

/** Variant A — consolidated / de-duplicated hard constraints, same order otherwise. */
export function buildVariantA(s: Sections): string {
  const [b1_prodGuides, b2_composition, b3_layer, b4_frames, b5_textSafety, b6_furniture, b7_bottom, b8_top, b9_pose] =
    s.hcBullets;
  void b3_layer;
  void b5_textSafety;

  const mergedTrimSafe =
    'TRIM-SAFE PROTECTED CONTENT (highest priority — outranks everything else): this is a PRINTED book TRIMMED at the edges — anything past the trim is physically CUT OFF. Two layers, two rules. Layer 1, ENVIRONMENTAL ILLUSTRATION (background, sky, foliage, habitat) may and SHOULD bleed off all four edges; that is expected and fine. Layer 2, PROTECTED CONTENT — every word of typography (body, headings, scientific names, captions, page number), the MAIN SUBJECT\'s face/head/eyes/defining features, and any badge/rule/frame/decorative device — must sit ENTIRELY inside the trim-safe area, at least 0.5 inch in from every edge, and may NEVER enter the bleed. Visually CENTER the body-text block in its reading field — never anchored to an edge or drifting toward one. When copy is dense the TEXT sizes down to fit; NEVER shrink, move, or crop the illustration to make room — the illustration stays full-bleed and only the text adapts.';

  const bottomTrimmed =
    'BOTTOM ANCHOR: anchor a REAL illustration across the BOTTOM band of the page, full-width, bleeding off the bottom edge — drawn from THIS page\'s own subject (habitat, tracks, foliage, terrain); it is subject illustration, not a decorative swag or border. This band sits in the bleed and WILL be trimmed, so keep it ATMOSPHERIC and SUPPORTING — never place the main subject, its face, or any essential detail there.';

  const topTrimmed =
    'TOP ANCHOR (mirror of the bottom anchor): the illustration must reach UP and fill the TOP of the page, bleeding off the top edge — typically atmospheric (open sky, high cloud, drifting mist, a distant ridgeline or a high canopy). The top is never left bare, empty parchment. Keep the atmosphere directly behind the title/text CALM and low-contrast so the type stays legible. It sits in the bleed and WILL be trimmed — keep it atmospheric, nothing essential up there.';

  const hc = [
    'HARD CONSTRAINTS — not negotiable:',
    `- ${b1_prodGuides}`,
    `- ${b2_composition}`,
    `- ${mergedTrimSafe}`,
    `- ${b4_frames}`,
    `- ${b6_furniture}`,
    `- ${bottomTrimmed}`,
    `- ${topTrimmed}`,
    `- ${b9_pose}`,
  ].join('\n');

  return [
    s.header,
    '',
    s.typographyDna,
    '',
    s.illustrationSubject,
    '',
    s.continuationStudy,
    '',
    s.masterStyle,
    '',
    s.pageGeometry,
    '',
    s.readingField,
    '',
    s.pageTitle,
    '',
    s.bodyRenderLine,
    s.bodySpellLine,
    s.bodyTextSizeLine,
    s.bodyJson,
    '',
    s.decorativeElements,
    '',
    hc,
    '',
    s.hardNegatives,
  ].join('\n');
}

/** Variant B — text-fidelity instructions moved to the very top of the prompt. */
export function buildVariantB(s: Sections): string {
  const topFidelityBlock = [
    'TEXT FIDELITY (read this first — governs all body text rendered below, before anything else in this prompt):',
    s.bodyRenderLine,
    s.bodySpellLine,
  ].join('\n');

  const hc = [s.hcIntro, ...s.hcBullets.map((b) => `- ${b}`)].join('\n');

  return [
    s.header,
    '',
    topFidelityBlock,
    '',
    s.typographyDna,
    '',
    s.illustrationSubject,
    '',
    s.continuationStudy,
    '',
    s.masterStyle,
    '',
    s.pageGeometry,
    '',
    s.readingField,
    '',
    s.pageTitle,
    '',
    s.bodyTextSizeLine,
    s.bodyJson,
    '',
    s.decorativeElements,
    '',
    hc,
    '',
    s.hardNegatives,
  ].join('\n');
}

/** Variant C — all non-text hard constraints pulled BEFORE the body; text-fidelity
 * instructions placed immediately before AND immediately after the body JSON. */
export function buildVariantC(s: Sections): string {
  const hc = [s.hcIntro, ...s.hcBullets.map((b) => `- ${b}`)].join('\n');

  const closingReminder =
    'PROOFREAD CHECK (final step before finishing): re-read every rendered word above against the source text one more time, letter by letter. Correct any misspelling now — a misspelled word makes the page unusable.';

  return [
    s.header,
    '',
    s.typographyDna,
    '',
    s.illustrationSubject,
    '',
    s.continuationStudy,
    '',
    s.masterStyle,
    '',
    s.pageGeometry,
    '',
    s.readingField,
    '',
    s.decorativeElements,
    '',
    hc,
    '',
    s.pageTitle,
    '',
    s.bodyRenderLine,
    s.bodySpellLine,
    s.bodyTextSizeLine,
    s.bodyJson,
    '',
    closingReminder,
    '',
    s.hardNegatives,
  ].join('\n');
}

/** Variant D — visual/layout constraints grouped into ONE block, clearly separated
 * from a second consolidated text-fidelity block. Same overall position as control
 * (both blocks still sit after the body, before HARD NEGATIVES) — only the internal
 * grouping/labeling changes, isolating "grouping clarity" from "position". */
export function buildVariantD(s: Sections): string {
  const [b1, b2, b3, b4, b5_textSafety, b6, b7, b8, b9] = s.hcBullets;

  const visualBlock = [
    'HARD CONSTRAINTS — VISUAL & LAYOUT (not negotiable):',
    `- ${b1}`,
    `- ${b2}`,
    `- ${b3}`,
    `- ${b4}`,
    `- ${b6}`,
    `- ${b7}`,
    `- ${b8}`,
    `- ${b9}`,
  ].join('\n');

  const textFidelityBlock = [
    'HARD CONSTRAINTS — TEXT FIDELITY & SAFETY (not negotiable, read together as one topic):',
    `- ${s.bodyVerbatimLine}`,
    `- ${s.bodySpellLine}`,
    `- ${b5_textSafety}`,
  ].join('\n');

  return [
    s.header,
    '',
    s.typographyDna,
    '',
    s.illustrationSubject,
    '',
    s.continuationStudy,
    '',
    s.masterStyle,
    '',
    s.pageGeometry,
    '',
    s.readingField,
    '',
    s.pageTitle,
    '',
    s.bodyTextSizeLine,
    s.bodyJson,
    '',
    s.decorativeElements,
    '',
    visualBlock,
    '',
    textFidelityBlock,
    '',
    s.hardNegatives,
  ].join('\n');
}

/** Words considered spelling-risk: >=9 letters (OpenAI's documented "spell tricky
 * words letter by letter" guidance), plus specific words already observed to fail
 * in the 5-sample control test even though short/common. */
export function extractRiskWords(bodyText: string): string[] {
  const KNOWN_FRAGILE = new Set(['because', 'flooded', 'fiercely', 'clear']);
  const words = bodyText.match(/[A-Za-z]+/g) ?? [];
  const seen = new Set<string>();
  const risk: string[] = [];
  for (const w of words) {
    const lower = w.toLowerCase();
    if (seen.has(lower)) continue;
    if (lower.length >= 9 || KNOWN_FRAGILE.has(lower)) {
      seen.add(lower);
      risk.push(lower);
    }
  }
  return risk;
}

function letterSpell(word: string): string {
  return word.toUpperCase().split('').join('-');
}

/** Variant E — same structure/order as control; adds an explicit spelling-risk
 * callout (per OpenAI's documented guidance: quote/spell out tricky or uncommon
 * words letter-by-letter) placed directly after the body JSON. */
export function buildVariantE(s: Sections, bodyText: string): string {
  const riskWords = extractRiskWords(bodyText);
  const spellList = riskWords.map((w) => `"${w}" → ${letterSpell(w)}`).join('\n');
  const riskBlock = [
    'SPELL-RISK WORD CHECK (apply after rendering the body text): the following words from the body text are common misspelling/letter-transposition failure points. Render each EXACTLY as spelled here, letter for letter — verbatim, no extra characters, no substitutions, no transpositions:',
    spellList,
  ].join('\n');

  const hc = [s.hcIntro, ...s.hcBullets.map((b) => `- ${b}`)].join('\n');

  return [
    s.header,
    '',
    s.typographyDna,
    '',
    s.illustrationSubject,
    '',
    s.continuationStudy,
    '',
    s.masterStyle,
    '',
    s.pageGeometry,
    '',
    s.readingField,
    '',
    s.pageTitle,
    '',
    s.bodyRenderLine,
    s.bodySpellLine,
    s.bodyTextSizeLine,
    s.bodyJson,
    '',
    riskBlock,
    '',
    s.decorativeElements,
    '',
    hc,
    '',
    s.hardNegatives,
  ].join('\n');
}
