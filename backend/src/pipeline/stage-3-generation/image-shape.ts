/**
 * Layout-aware image generation shape hints.
 *
 * The renderer can crop safely only when the generated image's aspect roughly
 * matches the layout's intended image-priority zone shape. This map keeps Stage 3
 * from forcing a portrait source into a wide-banner or landscape composition.
 */

import type { LayoutTemplateId } from '@wildlands/shared';
import { getLayoutProfile, type ArtSlot } from '../stage-6-layout/layout-profiles.js';
import type { ImageSize } from '../../services/openai/openai.js';

export type ImageShape = 'landscape' | 'portrait' | 'square';

export interface LayoutImageShape {
  shape: ImageShape;
  size: ImageSize;
  description: string;
  clearZoneInstruction: string;
}

const SHAPE_SIZE: Record<ImageShape, ImageSize> = {
  landscape: '1536x1024',
  portrait: '1024x1536',
  square: '1024x1024',
};

const CLEAR_ZONE_BY_SHAPE: Record<ImageShape, string> = {
  landscape:
    'Compose as full-page artwork with a wide horizontal image-priority zone. Keep the text-safe zone calm and low-detail so educational typography can overlay the artwork without fighting it.',
  portrait:
    'Compose as vertical full-page artwork. Keep the configured side or lower text-safe zone visually calm so educational text can overlay the artwork cleanly.',
  square:
    'Compose as flexible full-page reference artwork. Keep clean negative space around studies so captions and educational text can overlay the artwork in the text-safe zone.',
};

const SHAPE_BY_SLOT: Record<ArtSlot, ImageShape> = {
  FLOAT_LEFT: 'portrait',
  FLOAT_RIGHT: 'portrait',
  TOP_BAND: 'landscape',
  BOTTOM_BAND: 'landscape',
  FULL_PAGE: 'portrait',
  SIDEBAR_RIGHT: 'portrait',
  SCATTERED: 'square',
  CENTER_WRAP: 'square',
  // Layout C 25% corner variants are small square vignettes.
  CORNER_TOP_LEFT: 'square',
  CORNER_TOP_RIGHT: 'square',
  CORNER_BOTTOM_LEFT: 'square',
  CORNER_BOTTOM_RIGHT: 'square',
  // Centered title block on a portrait page — thin ornaments top and bottom.
  TITLE_BLOCK: 'portrait',
  // Fine print sits low on a portrait page over a calm illustrated field.
  FINE_PRINT_BOTTOM: 'portrait',
  // Two-column reference page on a portrait page over a calm illustrated field.
  REFERENCE_COLUMNS: 'portrait',
};

export const LAYOUT_IMAGE_SHAPES: Record<LayoutTemplateId, ImageShape> = {
  LAYOUT_1_STANDARD: 'portrait',
  LAYOUT_2_TEXT_HEAVY: 'portrait',
  LAYOUT_3_ILLUSTRATION_DOMINANT: 'portrait',
  LAYOUT_4_DANGER_WARNING: 'square',
  LAYOUT_5_CHAPTER_OPENER: 'landscape',
  LAYOUT_6_BACK_MATTER: 'square',
  LAYOUT_7_SCATTERED_VIGNETTES: 'square',
  LAYOUT_8_MARGIN_ILLUSTRATION: 'portrait',
  LAYOUT_9_DIAGNOSTIC_DIAGRAM: 'square',
  LAYOUT_10_FULL_PAGE_PLATE: 'portrait',
  LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD: 'landscape',
  LAYOUT_12_DIAGNOSTIC_DIAGRAM: 'landscape',
  LAYOUT_13_FEATURE_BANNER: 'landscape',
  LAYOUT_14_SIDEBAR_FEATURE: 'portrait',
  LAYOUT_15_PROGRESSION_STUDY: 'landscape',
  LAYOUT_16_CUTAWAY_FEATURE: 'landscape',
  // ─── Simplified families ──────────────────────────────────────────────
  LAYOUT_A_TEXT: 'square', // tiny decoration if any — shape mostly irrelevant
  LAYOUT_A_ILLUSTRATION: 'portrait',
  LAYOUT_B_IMAGE_TOP: 'landscape',
  LAYOUT_B_IMAGE_BOTTOM: 'landscape',
  LAYOUT_B_IMAGE_LEFT: 'portrait',
  LAYOUT_B_IMAGE_RIGHT: 'portrait',
  LAYOUT_C_CORNER_TOP_LEFT: 'square',
  LAYOUT_C_CORNER_TOP_RIGHT: 'square',
  LAYOUT_C_CORNER_BOTTOM_LEFT: 'square',
  LAYOUT_C_CORNER_BOTTOM_RIGHT: 'square',
  LAYOUT_D_PURE_TEXT: 'square', // no image — placeholder for the Record completeness
  LAYOUT_TITLE_DISPLAY: 'portrait', // centered title block, thin top/bottom ornaments
  LAYOUT_FINE_PRINT: 'portrait', // low fine-print block over a calm illustrated field
  LAYOUT_REFERENCE: 'portrait', // two-column reference (glossary/index) over a calm field
};

export function imageShapeForLayout(template: LayoutTemplateId): LayoutImageShape {
  const profile = getLayoutProfile(template);
  const shape = LAYOUT_IMAGE_SHAPES[template] ?? SHAPE_BY_SLOT[profile.artSlot] ?? 'portrait';
  return {
    shape,
    size: SHAPE_SIZE[shape],
    description: `${shape} image for ${profile.artSlot} image-priority zone`,
    clearZoneInstruction: CLEAR_ZONE_BY_SHAPE[shape],
  };
}

export function appendImageShapeInstruction(prompt: string, shape: LayoutImageShape): string {
  return [
    prompt.trim(),
    `LAYOUT FULL-PAGE ARTWORK SHAPE: ${shape.description}. Generate at ${shape.size} so the artwork matches the page composition and avoids obvious cropping.`,
    `LAYOUT TEXT-SAFE / IMAGE-PRIORITY GUIDANCE: ${shape.clearZoneInstruction}`,
  ].join('\n\n');
}
