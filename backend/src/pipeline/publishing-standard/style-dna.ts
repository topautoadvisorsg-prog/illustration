/**
 * STYLE DNA REGISTRY — the single resolution point for edition styling.
 *
 * One Book → Many Editions: the manuscript, breakdown, pagination, entries,
 * layouts, subjects, composition, and the shared prompt are identical across
 * editions. The ONLY thing that changes between Color / Black & White / Vintage /
 * Kids is the **Style DNA** resolved here. A new edition is added by REGISTERING a
 * profile below — not by editing prompt assembly.
 *
 * The Color profile sources its values from the LOCKED Standard (`ILLUSTRATION_DNA`
 * + `PALETTE`), so `assembleIllustrationDna()` with no argument is byte-identical to
 * the pre-registry output — the Color edition is the frozen reference standard.
 */
import { ILLUSTRATION_DNA, PALETTE } from './standard.js';

/** A complete, swappable artwork-style profile for one edition. Owns artwork
 *  BEHAVIOUR + the colour MODE + the edition's paper/ink — never subject,
 *  composition, behaviour, or layout (those are shared and inherited). */
export interface StyleDnaProfile {
  id: string;
  label: string;
  // Artwork behaviour (the "master style block" fed to the image model).
  medium: string;
  mood: string;
  referenceArtists: string;
  lineWork: string;
  /** How the LINE ink reads (e.g. "warm sepia" vs "near-black charcoal"). */
  lineInkPhrase: string;
  /** The COLOUR MODE — the single directive that flips Color↔B&W↔Vintage. */
  colorMode: string;
  /** How whites/paper + accents read. */
  whitesPhrase: string;
  naturalistPrecision: string;
  lighting: string;
  paperTexture: string;
  edges: string;
  /** Edition surface palette (paper + ink). Downstream typography/print-prep do
   *  not yet read this per-edition — see the audit notes; today they use the
   *  global PALETTE, which equals the Color profile. */
  palette: { paperHex: string; inkHex: string };
}

// ── Color (current production look). Values come from the LOCKED Standard so the
//    assembled string is identical to before the registry existed. ──
const CINEMATIC_NATURALIST_COLOR: StyleDnaProfile = {
  id: 'cinematic-naturalist-color',
  label: 'Cinematic Naturalist — Color',
  medium: ILLUSTRATION_DNA.medium,
  mood: ILLUSTRATION_DNA.mood,
  referenceArtists: ILLUSTRATION_DNA.referenceArtists,
  lineWork: ILLUSTRATION_DNA.lineWork,
  lineInkPhrase: 'Line colour is the Standard sepia ink.',
  colorMode: ILLUSTRATION_DNA.colorDiscipline,
  whitesPhrase: 'Whites are the parchment paper itself, never bright paper-white. Accents are drawn from the Standard palette.',
  naturalistPrecision: ILLUSTRATION_DNA.naturalistPrecision,
  lighting: ILLUSTRATION_DNA.lighting,
  paperTexture: ILLUSTRATION_DNA.paperTexture,
  edges: ILLUSTRATION_DNA.edgeTreatment,
  palette: { paperHex: PALETTE.parchment.hex, inkHex: PALETTE.ink.hex },
};

// ── Black & White (REGISTERED BUT INERT). Proof that a new edition is pure
//    configuration: no edition references it yet, and the default resolution is
//    still Color, so nothing renders B&W until an Edition selects this id. Shares
//    the SAME subjects/composition/behaviour — only the rendering style differs. ──
const BW_NATURALIST: StyleDnaProfile = {
  id: 'bw-naturalist',
  label: 'Black & White Naturalist',
  medium:
    '19th-century naturalist field-guide illustration rendered as a fine MONOCHROME plate — confident pen-and-ink linework finished with grayscale ink wash and graphite shading, like a hand-pulled vintage steel engraving or lithograph printed in a single ink.',
  mood: ILLUSTRATION_DNA.mood,
  referenceArtists:
    'Thomas Bewick wood engravings, Audubon engraved plates, Ernest Thompson Seton ink studies, and 19th-century steel-engraved field-guide plates.',
  lineWork: ILLUSTRATION_DNA.lineWork,
  lineInkPhrase: 'Line colour is near-black charcoal-grey ink.',
  colorMode:
    'BLACK & WHITE EDITION — render entirely in MONOCHROME: translate every hue to a tonal value, with NO colour whatsoever. Ignore any colour names in the subject description and interpret them purely as tone. A rich, full tonal range from deep near-black shadow to bright paper highlight, built with confident ink wash and engraved cross-hatching/stippling. Never flat grey, never washed-out, never digital.',
  whitesPhrase: 'Whites are the bright paper itself. All accents are pure grayscale tone — never colour.',
  naturalistPrecision: ILLUSTRATION_DNA.naturalistPrecision,
  lighting: 'Soft and directional — as if from a high window in an autumn study.',
  paperTexture: 'Aged fibrous paper with subtle fibers, natural texture, and gentle historical patina.',
  edges: ILLUSTRATION_DNA.edgeTreatment,
  palette: { paperHex: '#F6F2E9', inkHex: '#1B1B1B' },
};

/** The registry. Add an edition look by adding a profile here — nothing else. */
export const STYLE_DNA: Record<string, StyleDnaProfile> = {
  [CINEMATIC_NATURALIST_COLOR.id]: CINEMATIC_NATURALIST_COLOR,
  [BW_NATURALIST.id]: BW_NATURALIST,
};

/** Default = the current production Color look (frozen reference standard). */
export const DEFAULT_STYLE_DNA_ID = CINEMATIC_NATURALIST_COLOR.id;

export function getStyleDna(styleDnaId: string = DEFAULT_STYLE_DNA_ID): StyleDnaProfile {
  return STYLE_DNA[styleDnaId] ?? CINEMATIC_NATURALIST_COLOR;
}

export function listStyleDna(): Array<{ id: string; label: string }> {
  return Object.values(STYLE_DNA).map((p) => ({ id: p.id, label: p.label }));
}

/** Assemble the Illustration-DNA prompt fragment from a Style DNA profile. The
 *  template is shared across editions; only the profile's values change. With the
 *  default (Color) profile this is byte-identical to the pre-registry output. */
export function assembleIllustrationDna(styleDnaId: string = DEFAULT_STYLE_DNA_ID): string {
  const p = getStyleDna(styleDnaId);
  return [
    p.medium,
    `Aesthetic: ${p.mood} Reference points: ${p.referenceArtists}`,
    `LINE WORK: ${p.lineWork} ${p.lineInkPhrase}`,
    `COLOUR: ${p.colorMode} ${p.whitesPhrase}`,
    `DETAIL: ${p.naturalistPrecision}`,
    `LIGHT: ${p.lighting}`,
    `PAPER: ${p.paperTexture}`,
    `EDGES: ${p.edges}`,
  ].join('\n');
}
