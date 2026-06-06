/**
 * Stage 6 - deterministic Layout Director.
 *
 * This is the book-designer agent in code: it decides how much of the opening
 * page belongs to image vs. text, where those zones sit, and whether the copy
 * should continue across additional text pages. It does not generate images.
 */

import type { LayoutTemplateId } from '@wildlands/shared';
import type { PageGeometry } from './page-geometry.js';
import { getLayoutProfile, type ArtSlot } from './layout-profiles.js';

const AVG_CHAR_WIDTH_EM = 0.45;
const TITLE_OVERHEAD_LINES = 3;
const LINES_PER_SECTION_HEADER = 1;

export interface LayoutDirectorInput {
  bodyMarkdown: string;
  layoutTemplate: LayoutTemplateId;
  geometry: PageGeometry;
  bodyPt: number;
  lineHeight: number;
}

/** Position of the image-priority zone on the page (where focal visual content lives). */
export type ImagePriorityEdge = ArtSlot;

export interface ImagePriorityZone {
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
  recommendedWidthPx: number;
  recommendedHeightPx: number;
  bleedPaddingPx: number;
  aspectRatio: string;
  overlaySafeArea: string;
}

export type PlanningZoneRole = 'body' | 'caption' | 'title' | 'section-title' | 'primary-art' | 'supporting-art';
export type PlanningZoneShape = 'rect' | 'organic' | 'path';

export interface PlanningZone {
  id: string;
  role: PlanningZoneRole;
  shape: PlanningZoneShape;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  instruction: string;
}

export interface LayoutAllocation {
  /** Position of the image-priority zone (the strong-content edge of the artwork). */
  priorityEdge: ImagePriorityEdge;
  /** Geometry of the image-priority zone within the full-page artwork. */
  imagePriorityZone: ImagePriorityZone;
  /** Where body/caption text may sit directly on the artwork. */
  textSafeZones: PlanningZone[];
  /** Where titles/headings may overlay the artwork. */
  typographyZones: PlanningZone[];
  /** Where focal visual detail should live inside the full-page artwork. */
  imagePriorityZones: PlanningZone[];
  imagePlacement: string;
  textPlacement: string;
  openingPageImagePercent: number;
  openingPageTextPercent: number;
  continuationPageImagePercent: number;
  continuationPageTextPercent: number;
  estimatedRenderedPages: number;
  wordsPerOpeningPage: number;
  wordsPerContinuationPage: number;
  notes: string[];
  /** @deprecated Use `priorityEdge`. Kept for back-compat with older consumers. */
  architecture: ArtSlot;
  /** @deprecated Use `imagePriorityZone`. Kept for back-compat with older consumers. */
  artBox: ImagePriorityZone;
}

function countSectionHeaders(markdown: string): number {
  const matches = markdown.match(/^#{2,6}\s+/gm);
  return matches ? matches.length : 0;
}

function stripMarkdownForLayout(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .trim();
}

function countWordsForLayout(plainText: string): number {
  if (!plainText) {
    return 0;
  }
  return plainText.split(/\s+/).filter(Boolean).length;
}

function placementFor(slot: ArtSlot): { imagePlacement: string; textPlacement: string } {
  switch (slot) {
    case 'FLOAT_LEFT':
      return { imagePlacement: 'left-side image-priority zone within the full-page artwork', textPlacement: 'body text uses the calm right-side text-safe zone, then continues below' };
    case 'FLOAT_RIGHT':
      return { imagePlacement: 'right-side image-priority zone within the full-page artwork', textPlacement: 'body text uses the calm left-side text-safe zone, then continues below' };
    case 'TOP_BAND':
      return { imagePlacement: 'upper image-priority zone within one full-page artwork', textPlacement: 'body text sits in the calmer lower text-safe zone' };
    case 'BOTTOM_BAND':
      return { imagePlacement: 'lower image-priority zone within one full-page artwork', textPlacement: 'body text sits in the calmer upper text-safe zone' };
    case 'FULL_PAGE':
      return { imagePlacement: 'full-page image-priority artwork', textPlacement: 'minimal caption or title text only in small calm overlay zones' };
    case 'SIDEBAR_RIGHT':
      return { imagePlacement: 'tall right-side image-priority zone within the full-page artwork', textPlacement: 'running body text uses the calm left-side text-safe zone' };
    case 'SCATTERED':
      return { imagePlacement: 'scattered image-priority study zones inside the full-page artwork', textPlacement: 'text uses the calm reading path between studies' };
    case 'CENTER_WRAP':
      return { imagePlacement: 'central image-priority zone inside the full-page artwork', textPlacement: 'text uses calm surrounding and lower text-safe zones' };
    default:
      return { imagePlacement: 'left-side image-priority zone within the full-page artwork', textPlacement: 'body text uses the calm right-side text-safe zone, then continues below' };
  }
}

function refinedPlacement(slot: ArtSlot, imagePercent: number): { imagePlacement: string; textPlacement: string } {
  if (imagePercent <= 15 && (slot === 'FLOAT_LEFT' || slot === 'FLOAT_RIGHT')) {
    const side = slot === 'FLOAT_LEFT' ? 'upper-left' : 'upper-right';
    return {
      imagePlacement: `small ${side} image-priority zone for pine boughs, tracks, specimen details, or other quiet marginal art`,
      textPlacement: 'body text owns the calm text-safe zone across most of the artwork',
    };
  }
  return placementFor(slot);
}

function estimateWordsForChars(charCapacity: number): number {
  // Field-guide prose averages roughly 6 chars per word including spaces.
  return Math.max(1, Math.floor(charCapacity / 6));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function aspectRatio(widthPx: number, heightPx: number): string {
  const divisor = gcd(widthPx, heightPx);
  return `${Math.round(widthPx / divisor)}:${Math.round(heightPx / divisor)}`;
}

function imagePriorityZoneFor(slot: ArtSlot, coverage: number, geometry: PageGeometry): ImagePriorityZone {
  const frameW = geometry.textWidthIn;
  const frameH = geometry.textHeightIn;
  let xIn = 0;
  let yIn = 0;
  let widthIn = frameW;
  let heightIn = Math.max(0.8, coverage * frameH);

  if (slot === 'FLOAT_LEFT' || slot === 'FLOAT_RIGHT' || slot === 'SCATTERED' || slot === 'CENTER_WRAP') {
    const frac = Math.sqrt(Math.max(0.01, coverage));
    widthIn = frac * frameW;
    heightIn = frac * frameH;
    xIn = slot === 'FLOAT_RIGHT' ? frameW - widthIn : 0;
  } else if (slot === 'SIDEBAR_RIGHT') {
    widthIn = Math.min(frameW * 0.6, Math.max(frameW * 0.18, (coverage / 0.95) * frameW));
    heightIn = frameH * 0.95;
    xIn = frameW - widthIn;
  } else if (slot === 'BOTTOM_BAND') {
    yIn = frameH - heightIn;
  } else if (slot === 'FULL_PAGE') {
    widthIn = geometry.pageWidthIn;
    heightIn = geometry.pageHeightIn;
    xIn = -geometry.margins.gutterIn;
    yIn = -geometry.margins.topIn;
  }

  const recommendedWidthPx = Math.ceil(widthIn * 300);
  const recommendedHeightPx = Math.ceil(heightIn * 300);
  const bleedPaddingPx = Math.ceil(geometry.bleedIn * 300);

  return {
    xIn: round2(xIn),
    yIn: round2(yIn),
    widthIn: round2(widthIn),
    heightIn: round2(heightIn),
    recommendedWidthPx,
    recommendedHeightPx,
    bleedPaddingPx,
    aspectRatio: aspectRatio(recommendedWidthPx, recommendedHeightPx),
    overlaySafeArea:
      slot === 'FULL_PAGE' || slot === 'TOP_BAND'
        ? 'Leave calm negative space for layout-typeset title/caption overlays; render no text in the image.'
        : 'Concentrate focal visual content in this zone while keeping the text-safe zone calm; render no text in the image.',
  };
}

function zone(id: string, role: PlanningZoneRole, xPct: number, yPct: number, widthPct: number, heightPct: number, instruction: string, shape: PlanningZoneShape = 'rect'): PlanningZone {
  const round = (n: number) => Math.round(n * 10) / 10;
  return { id, role, shape, xPct: round(xPct), yPct: round(yPct), widthPct: round(widthPct), heightPct: round(heightPct), instruction };
}

function zonePlanFor(slot: ArtSlot, imagePercent: number): Pick<LayoutAllocation, 'textSafeZones' | 'typographyZones' | 'imagePriorityZones'> {
  const textPct = Math.max(0, 100 - imagePercent);
  const title = zone(
    'title-main',
    'title',
    9,
    6,
    82,
    14,
    'Overlay title/heading sits directly on the artwork; composition should provide calm value contrast and negative space.',
  );

  switch (slot) {
    case 'TOP_BAND':
      return {
        typographyZones: [title],
        imagePriorityZones: [zone('image-priority-top', 'primary-art', 0, 0, 100, imagePercent, 'Concentrate focal visual detail in the upper artwork zone; frame the text-safe zone naturally.')],
        textSafeZones: [zone('text-safe-lower', 'body', 10, Math.max(28, imagePercent), 80, Math.max(28, textPct), 'Reserve calm, low-detail artwork for readable body text. Do not draw a panel, box, card, or empty cutout.', 'organic')],
      };
    case 'BOTTOM_BAND':
      return {
        typographyZones: [title],
        imagePriorityZones: [zone('image-priority-bottom', 'primary-art', 0, Math.max(35, textPct), 100, imagePercent, 'Concentrate focal visual detail in the lower artwork zone; keep upper body area calm.')],
        textSafeZones: [zone('text-safe-upper', 'body', 10, 22, 80, Math.max(30, textPct - 8), 'Reserve calm upper artwork for readable body text. No boxes or paper panels.', 'organic')],
      };
    case 'FLOAT_LEFT':
      return {
        typographyZones: [title],
        imagePriorityZones: [zone('image-priority-left', 'primary-art', 0, 12, Math.max(18, imagePercent), 58, 'Focal visual detail lives along the left side while the full page remains one illustration.')],
        textSafeZones: [zone('text-safe-right', 'body', Math.min(46, imagePercent + 8), 24, Math.max(44, textPct - 8), 58, 'Keep the right/lower artwork calm for body text; artwork remains visible under text.', 'organic')],
      };
    case 'FLOAT_RIGHT':
    case 'SIDEBAR_RIGHT':
      return {
        typographyZones: [title],
        imagePriorityZones: [zone('image-priority-right', 'primary-art', Math.max(52, textPct), 12, Math.max(18, imagePercent), 72, 'Focal visual detail lives along the right side while the full page remains one illustration.')],
        textSafeZones: [zone('text-safe-left', 'body', 8, 24, Math.min(62, textPct), 60, 'Keep the left artwork calm for body text; no box, card, or hard separation.', 'organic')],
      };
    case 'SCATTERED':
      return {
        typographyZones: [title],
        imagePriorityZones: [
          zone('image-priority-study-a', 'primary-art', 6, 18, 30, 24, 'First study/focal visual detail zone.'),
          zone('image-priority-study-b', 'supporting-art', 58, 28, 30, 24, 'Second study/focal visual detail zone.'),
          zone('image-priority-study-c', 'supporting-art', 12, 62, 26, 22, 'Third study/focal visual detail zone.'),
        ],
        textSafeZones: [zone('text-safe-path', 'body', 34, 48, 52, 36, 'Maintain a calm flowing reading path between studies; no filled panel.', 'path')],
      };
    case 'CENTER_WRAP':
      return {
        typographyZones: [title],
        imagePriorityZones: [zone('image-priority-center', 'primary-art', 24, 24, 52, 38, 'Central focal visual detail with calm surrounding artwork.')],
        textSafeZones: [zone('text-safe-lower', 'body', 12, 64, 76, 26, 'Reserve calm lower artwork for readable body text.', 'organic')],
      };
    case 'FULL_PAGE':
    default:
      return {
        typographyZones: [title],
        imagePriorityZones: [zone('image-priority-full', 'primary-art', 0, 0, 100, 100, 'The whole page is artwork; focal detail can occupy the full composition while respecting small overlay zones.')],
        textSafeZones: [zone('text-safe-caption', 'caption', 12, 78, 76, 12, 'Small calm caption/notes zone only; no large body text panel.', 'organic')],
      };
  }
}

export function directLayout(input: LayoutDirectorInput): LayoutAllocation {
  const profile = getLayoutProfile(input.layoutTemplate);
  const plainText = stripMarkdownForLayout(input.bodyMarkdown);
  const wordCount = countWordsForLayout(plainText);
  const plainCharCount = plainText.length;

  const charsPerLine = Math.max(1, Math.floor(input.geometry.textWidthPt / (AVG_CHAR_WIDTH_EM * input.bodyPt)));
  const lineBoxPt = input.bodyPt * input.lineHeight;
  const totalLines = Math.max(1, Math.floor(input.geometry.textHeightPt / lineBoxPt));
  const headerLines = countSectionHeaders(input.bodyMarkdown) * LINES_PER_SECTION_HEADER;
  const openingLines = Math.max(1, Math.floor((totalLines - TITLE_OVERHEAD_LINES - headerLines) * profile.textAreaFactor));
  const continuationLines = Math.max(1, totalLines - Math.ceil(headerLines / 2));

  const openingCapacityChars = charsPerLine * openingLines;
  const continuationCapacityChars = charsPerLine * continuationLines;
  const remainingChars = Math.max(0, plainCharCount - openingCapacityChars);
  const continuationPages = remainingChars === 0 ? 0 : Math.ceil(remainingChars / continuationCapacityChars);
  const estimatedRenderedPages = Math.max(1, 1 + continuationPages);
  const imagePercent = Math.round(profile.artAreaFraction * 100);
  const textPercent = Math.max(0, 100 - imagePercent);
  const placement = refinedPlacement(profile.artSlot, imagePercent);
  const imagePriorityZone = imagePriorityZoneFor(profile.artSlot, profile.artAreaFraction, input.geometry);
  const zonePlan = zonePlanFor(profile.artSlot, imagePercent);
  const notes: string[] = [];

  if (estimatedRenderedPages > 1) {
    notes.push(`Copy spans about ${estimatedRenderedPages} rendered pages; art is reserved on the opening page, continuation pages are text-led.`);
  }
  if (profile.textLight && wordCount > estimateWordsForChars(openingCapacityChars)) {
    notes.push('This is a text-light/plate layout with too much copy; choose a more text-led architecture.');
  }
  if (!profile.textLight && imagePercent <= 15 && wordCount > estimateWordsForChars(openingCapacityChars)) {
    notes.push('Long-form entry: small supporting image, body text owns the continuation flow.');
  }

  return {
    // New zone vocabulary (primary).
    priorityEdge: profile.artSlot,
    imagePriorityZone,
    textSafeZones: zonePlan.textSafeZones,
    typographyZones: zonePlan.typographyZones,
    imagePriorityZones: zonePlan.imagePriorityZones,
    imagePlacement: placement.imagePlacement,
    textPlacement: placement.textPlacement,
    // Back-compat aliases (deprecated; consumers should migrate to the names above).
    architecture: profile.artSlot,
    artBox: imagePriorityZone,
    openingPageImagePercent: imagePercent,
    openingPageTextPercent: textPercent,
    continuationPageImagePercent: 0,
    continuationPageTextPercent: 100,
    estimatedRenderedPages,
    wordsPerOpeningPage: estimateWordsForChars(openingCapacityChars),
    wordsPerContinuationPage: estimateWordsForChars(continuationCapacityChars),
    notes,
  };
}
