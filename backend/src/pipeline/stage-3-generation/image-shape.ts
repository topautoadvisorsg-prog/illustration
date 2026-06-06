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
    'Compose as a wide horizontal image. Keep the lower text area calm and low-detail so educational typography can sit below or beside the art without fighting the image.',
  portrait:
    'Compose as a vertical page-oriented image. Keep one side or lower portion visually calm so educational text can be placed cleanly by the layout engine.',
  square:
    'Compose as a flexible square reference study. Keep clean negative space around the studies so captions and educational text can be placed outside the artwork.',
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
    `LAYOUT IMAGE SHAPE: ${shape.description}. Generate at ${shape.size} so the subject matches the page composition and avoids obvious cropping.`,
    `LAYOUT CLEAR ZONE: ${shape.clearZoneInstruction}`,
  ].join('\n\n');
}
