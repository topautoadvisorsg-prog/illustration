/**
 * Canonical master style blocks (the "visual DNA") per brand.
 *
 * Why this exists: the prompt assembler injects {MASTER_STYLE_DNA} into every image
 * prompt to keep sequential generations visually cohesive. Previously this text lived
 * only in a markdown doc and the runtime config defaulted to a 5-word stub, so images
 * would have generated with no real style anchor. This module is the single source of
 * truth, version-controlled and wired into project creation.
 *
 * Clean-art rule (v1.1): the image model renders ZERO text. All labels, names,
 * captions, titles, annotations, arrows, and typography are added later by the layout/
 * composition system (Stage 6). The negative rules below forbid any in-image text.
 */

import type { Brand } from '@wildlands/shared';

export interface MasterStyleBlock {
  version: string;
  /** Injected verbatim as {MASTER_STYLE_DNA}: visual DNA + negative rules. */
  text: string;
}

const THE_WILDLANDS_V1_1 = `A single illustration in the style of a 19th-century naturalist's expedition journal — pen-and-ink drawing with warm watercolor wash, rendered on aged cream parchment paper the color of #F5EDD6 with subtle fiber texture and warm amber-ochre patina at the edges.

The aesthetic is Cinematic Naturalist: precise scientific observation softened by painterly, atmospheric warmth — like the field notebooks of John James Audubon, Ernest Thompson Seton, or a 19th century Royal Geographical Society expedition artist. The mood is contemplative, reverent, and grounded in the natural world. It feels collected, hand-bound, kept in a leather satchel.

LINE WORK: confident, expressive pen-and-ink linework in deep sepia-brown (#2C1A0E) and warm sepia (#6B4C2A). Lines have organic variation — sometimes precise and diagnostic, sometimes loose and gestural. Hand-drawn, never mechanical, never traced, never vector.

COLOR: muted, atmospheric watercolor wash applied sparingly. The dominant accents are forest green (#3A5C3A), amber gold (#C8860A), ochre (#B87333), with rare touches of muted red (#8B2020) reserved for danger/warning subjects only. Whites are the warm parchment itself, never bright paper-white. Saturation is restrained — vintage, never neon, never digital, never over-processed.

COMPOSITION: asymmetric and organic placement of the subject on the page. The subject floats on the parchment with negative space breathing around it, never grid-locked, never centered, never symmetrical. Edges of the illustration fade softly into the parchment with no hard border — the wash dissolves naturally into the paper. Light is warm, soft, and directional, as if from a high window in an autumn study.

DETAIL: anatomically accurate to field-guide standard — habitats, gill structure, bark texture, leaf venation, track patterns, and proportional scale are rendered correctly. Naturalist precision is the foundation; the painterly handling is the surface.

PAPER: aged cream parchment #F5EDD6, with subtle fiber, gentle fold creases, and warm shadow patina at the edges. The paper itself is part of the image.

DO NOT include any of the following:
- Photography, photorealism, or photographic lighting.
- Modern digital illustration style, flat vector art, isometric, low-poly, anime, manga, cartoon, or comic-book linework.
- Bright saturated colors, neon, fluorescent, or hyper-real color grading.
- Hard borders, frames, rectangles, ovals, badges, banners, or any geometric containers around the subject.
- Symmetrical, grid-locked, or centered subject placement.
- Pure white backgrounds, plain paper, or screen-white. The background must be the warm parchment described above.
- ANY text whatsoever rendered in the image: no labels, names, captions, titles, headings, paragraphs, scientific names, annotations, hand-lettered field notes, callouts, arrows-with-text, numbers, or page furniture. The illustration must be 100% text-free. All labels, annotations, and typography are added later by the layout/composition system.
- Watermarks, signatures, logos, page numbers, or stock-art tags.
- Multiple unrelated subjects unless the layout explicitly calls for vignettes.
- Anthropomorphized animals, cartoon expressions, or whimsical fantasy elements.`;

const BLOCKS: Record<Brand, MasterStyleBlock> = {
  THE_WILDLANDS: {
    version: 'THE_WILDLANDS_v1.1',
    text: THE_WILDLANDS_V1_1,
  },
};

/** Return the canonical master style block for a brand (falls back to THE_WILDLANDS). */
export function getMasterStyleBlock(brand: Brand): MasterStyleBlock {
  return BLOCKS[brand] ?? BLOCKS.THE_WILDLANDS;
}

/** A config masterStyleBlockText shorter than this is treated as a placeholder/stub. */
export const MIN_REAL_STYLE_BLOCK_CHARS = 400;
