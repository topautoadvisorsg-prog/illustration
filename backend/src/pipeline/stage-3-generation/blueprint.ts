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

const COLORS = {
  bg: '#ECE4CF', // parchment field
  image: '#2E6FB0', // IMAGE_PRIORITY_ZONE — blue
  support: '#7B57A6', // OPTIONAL_SUPPORTING_IMAGE_ZONE — purple
  text: '#5FA85B', // TEXT_SAFE_ZONE — green
  title: '#E0A92E', // TITLE_ZONE — yellow
} as const;

function rectSvg(z: PlanningZone, fill: string, opacity = 0.85): string {
  return `<rect x="${z.xPct}%" y="${z.yPct}%" width="${z.widthPct}%" height="${z.heightPct}%" fill="${fill}" fill-opacity="${opacity}" rx="8" />`;
}

/** Build the blueprint SVG: parchment field with color-coded zone rectangles. */
export function buildBlueprintSvg(alloc: LayoutAllocation, widthPx: number, heightPx: number): string {
  const parts: string[] = [`<rect width="100%" height="100%" fill="${COLORS.bg}"/>`];
  // Draw illustration zones first, then text-safe, then title on top.
  for (const z of alloc.imagePriorityZones) {
    parts.push(rectSvg(z, z.role === 'supporting-art' ? COLORS.support : COLORS.image));
  }
  for (const z of alloc.textSafeZones) parts.push(rectSvg(z, COLORS.text));
  for (const z of alloc.typographyZones) parts.push(rectSvg(z, COLORS.title));
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
 * Instruction appended to the locked prompt when a blueprint is attached. Tells the
 * image agent to treat the blueprint as a composition map (not content to copy) and
 * to keep the text/title zones calm — the operator-approved wording.
 */
export const BLUEPRINT_COMPOSITION_INSTRUCTION = [
  'COMPOSITION MAP — a layout blueprint image is attached.',
  'Use the attached layout blueprint as the composition map.',
  'Create the illustration only inside the IMAGE_PRIORITY_ZONE (blue regions) and the optional supporting image zones (purple regions).',
  'Keep the TEXT_SAFE_ZONE (green region) visually calm, low-contrast, parchment-like, and free of important subject matter.',
  'Keep the TITLE_ZONE (yellow region) calm enough for typography.',
  'The blueprint defines composition ONLY — do NOT reproduce its flat colors, boxes, rectangles, or rounded corners; render the natural illustration within those regions so the page reads as one continuous artwork.',
  'Do not generate words, letters, labels, captions, page numbers, or readable text.',
].join(' ');
