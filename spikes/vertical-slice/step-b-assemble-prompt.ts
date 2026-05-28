/**
 * Spike 2 Step B — Assemble Image Generation Prompt
 *
 * Deterministically combines:
 *   - Master Style Block (active version for brand)
 *   - Subject from page manifest
 *   - Annotations from page manifest
 *   - Layout hint
 *   - Warning elements if danger page
 *   - Negative rules from style block
 *
 * No Claude call. Pure string assembly.
 *
 * This step needs NO API keys.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PageManifest } from './step-a-load-manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const MAX_PROMPT_CHARS = 4000;

const LAYOUT_HINTS: Record<string, string> = {
  LAYOUT_1_STANDARD:
    'The illustration occupies the upper-left quadrant of an imaginary page, with text flowing around it. The subject is single and centered within its quadrant.',
  LAYOUT_2_TEXT_HEAVY:
    'The illustration is small — top-left corner only, ~15% of page area. Minimal, jewel-like.',
  LAYOUT_3_ILLUSTRATION_DOMINANT:
    'The illustration is large and visually striking, occupying the right two-thirds of the imaginary page and fading softly into the parchment on the left.',
  LAYOUT_4_DANGER_WARNING:
    'Two comparison subjects side by side in the upper area: the toxic species and its safe look-alike. Composition is comparison-focused.',
  LAYOUT_5_CHAPTER_OPENER:
    'A cinematic landscape painting filling the top half of the page — sweeping, atmospheric, with depth and distance. No specific subject; this is the setting.',
  LAYOUT_6_BACK_MATTER:
    'Two-panel comparison layout: safe species on the left, toxic look-alike on the right, with equal weight.',
  LAYOUT_7_SCATTERED_VIGNETTES:
    'Three small organic vignettes scattered across the page asymmetrically — each showing a different facet of the subject (e.g., track patterns in different gaits).',
  LAYOUT_8_MARGIN_ILLUSTRATION:
    'One tall narrow illustration running down the full right margin of the page — used for vertical subjects like trees.',
  LAYOUT_9_DIAGNOSTIC_DIAGRAM:
    '2–3 precise scientific diagrams in the upper half — identification-focused, labeled with hand-lettered field notes.',
};

interface StyleBlock {
  positive: string;
  negative: string;
}

async function loadActiveStyleBlock(brand: string): Promise<StyleBlock> {
  if (brand !== 'THE_WILDLANDS') {
    throw new Error(`No style block available for brand ${brand} in v1.`);
  }
  const filePath = path.join(REPO_ROOT, 'backend/master-style-blocks/THE_WILDLANDS_v1.md');
  const md = await readFile(filePath, 'utf8');

  // Extract the verbatim code blocks under "MASTER STYLE BLOCK" and "NEGATIVE RULES".
  const positiveMatch = md.match(/## MASTER STYLE BLOCK — v1[^\n]*\n+```\n([\s\S]+?)\n```/);
  const negativeMatch = md.match(/## NEGATIVE RULES — v1[^\n]*\n+```\n([\s\S]+?)\n```/);
  if (!positiveMatch?.[1] || !negativeMatch?.[1]) {
    throw new Error('Failed to extract style block sections — check master-style-blocks/THE_WILDLANDS_v1.md');
  }
  return {
    positive: positiveMatch[1].trim(),
    negative: negativeMatch[1].trim(),
  };
}

export interface AssembledPrompt {
  prompt: string;
  charCount: number;
  overLimit: boolean;
  layoutHint: string;
}

export async function stepB_assemblePrompt(manifest: PageManifest): Promise<AssembledPrompt> {
  const style = await loadActiveStyleBlock(manifest.brand);
  const layoutHint = LAYOUT_HINTS[manifest.layout_template] ?? '';

  const annotationLine =
    manifest.illustration.annotations.length > 0
      ? manifest.illustration.annotations.map((a) => `"${a}"`).join(', ')
      : 'none';

  const warningLine =
    manifest.illustration.warning && manifest.illustration.warning_subject
      ? `WARNING ELEMENT: A subtle, secondary depiction of "${manifest.illustration.warning_subject}" placed unobtrusively for contrast.`
      : 'WARNING ELEMENT: none.';

  const prompt = [
    style.positive,
    '',
    `SUBJECT: ${manifest.illustration.subject}`,
    '',
    `LAYOUT: ${layoutHint}`,
    '',
    `ANNOTATIONS ON IMAGE (short hand-lettered field notes only, no full sentences, placed unobtrusively near the subject): ${annotationLine}`,
    '',
    warningLine,
    '',
    style.negative,
  ].join('\n');

  return {
    prompt,
    charCount: prompt.length,
    overLimit: prompt.length > MAX_PROMPT_CHARS,
    layoutHint,
  };
}

// Standalone runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const { stepA_loadManifest } = await import('./step-a-load-manifest.js');
  try {
    const manifest = await stepA_loadManifest();
    const result = await stepB_assemblePrompt(manifest);
    // eslint-disable-next-line no-console
    console.log(`✓ Step B — assembled prompt (${result.charCount} chars, overLimit=${result.overLimit})`);
    if (result.overLimit) {
      // eslint-disable-next-line no-console
      console.error('  WARN: prompt exceeds 4000 chars — gpt-image-1 will reject.');
    }
    // eslint-disable-next-line no-console
    console.log('\n--- BEGIN PROMPT ---\n');
    // eslint-disable-next-line no-console
    console.log(result.prompt);
    // eslint-disable-next-line no-console
    console.log('\n--- END PROMPT ---\n');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`✗ Step B — ${(e as Error).message}`);
    process.exit(1);
  }
}
