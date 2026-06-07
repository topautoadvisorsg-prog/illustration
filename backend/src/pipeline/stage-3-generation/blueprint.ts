/**
 * Stage 3 — layout blueprint image.
 *
 * Renders a page's layout zones (from the deterministic LayoutAllocation) into a
 * color-coded composition map PNG. This blueprint is handed to the image agent as a
 * REFERENCE so it composes the illustration into the correct regions and leaves the
 * text-safe zone calm — at generation time. The blueprint is a guide only: it carries
 * NO manuscript text and the model is told never to reproduce its flat colors/boxes.
 *
 * Colors match the operator's reference diagram + the prompt legend below.
 */

import sharp from 'sharp';
import type { LayoutAllocation, PlanningZone } from '../stage-6-layout/layout-director.js';

// Standardized blueprint palette (RED / BLUE / ORANGE). TITLE folds into RED (it is
// also a text zone). These colors exist ONLY in the blueprint — never in the page.
const COLORS = {
  bg: '#ECE4CF', // parchment field
  image: '#2E6FB0', // BLUE — PRIMARY_IMAGE_ZONE
  support: '#E08A2E', // ORANGE — SUPPORTING_IMAGE_ZONE
  text: '#C0392B', // RED — TEXT_SAFE_ZONE (title folds in)
} as const;

function rectSvg(z: PlanningZone, fill: string, opacity = 0.85): string {
  return `<rect x="${z.xPct}%" y="${z.yPct}%" width="${z.widthPct}%" height="${z.heightPct}%" fill="${fill}" fill-opacity="${opacity}" rx="8" />`;
}

/** Build the blueprint SVG: parchment field with RED / BLUE / ORANGE zone rectangles. */
export function buildBlueprintSvg(alloc: LayoutAllocation, widthPx: number, heightPx: number): string {
  const parts: string[] = [`<rect width="100%" height="100%" fill="${COLORS.bg}"/>`];
  // BLUE = primary image, ORANGE = supporting image, RED = text-safe + title.
  for (const z of alloc.imagePriorityZones) {
    parts.push(rectSvg(z, z.role === 'supporting-art' ? COLORS.support : COLORS.image));
  }
  for (const z of alloc.textSafeZones) parts.push(rectSvg(z, COLORS.text));
  for (const z of alloc.typographyZones) parts.push(rectSvg(z, COLORS.text)); // title folds into RED
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">${parts.join('')}</svg>`;
}

/** Rasterize the blueprint SVG to a PNG buffer at the given page pixel size. */
export async function renderBlueprintPng(
  alloc: LayoutAllocation,
  widthPx: number,
  heightPx: number,
): Promise<{ png: Buffer; svg: string }> {
  const svg = buildBlueprintSvg(alloc, widthPx, heightPx);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return { png, svg };
}

/**
 * The blueprint legend (RED / BLUE / ORANGE). The lean prompt already carries the
 * COMPOSITION + LAYOUT RULES sections, so this is no longer appended at generation —
 * it is surfaced in the Inspector so the operator can read the blueprint's meaning.
 */
export const BLUEPRINT_COMPOSITION_INSTRUCTION = [
  'A layout blueprint image is attached as the composition map. The whole page is ONE continuous illustrated page.',
  'BLUE regions = PRIMARY_IMAGE_ZONE — the primary subject and the environmental scene; concentrate the strongest detail here.',
  'ORANGE regions = SUPPORTING_IMAGE_ZONE — small naturalist specimen studies placed directly on the page (no cards, sticky notes, boxes, frames, or colored/yellow backgrounds).',
  'RED regions = READING_FIELD_ZONE (and title) — a calm, open, low-detail parchment area for later typography; keep it clear of important subject matter. It is not a box.',
  'The illustration must open organically into the Reading Field: let the artwork dissolve into it through mist, light sky, pale terrain, calm water, paper tone, or atmospheric fade — no hard edge, seam, or rectangle.',
  'The blueprint defines composition ONLY — do not reproduce its flat colors, boxes, rectangles, or rounded corners; render one natural illustration across the whole page.',
  'Do not generate words, letters, labels, captions, page numbers, or readable text.',
].join(' ');
