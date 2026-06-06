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

export interface LayoutAllocation {
  /** Position of the image-priority zone (the strong-content edge of the artwork). */
  priorityEdge: ImagePriorityEdge;
  /** Geometry of the image-priority zone within the full-page artwork. */
  imagePriorityZone: ImagePriorityZone;
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
      return { imagePlacement: 'left floating art block', textPlacement: 'title and body wrap to the right, then continue below' };
    case 'FLOAT_RIGHT':
      return { imagePlacement: 'right floating art block', textPlacement: 'title and body wrap to the left, then continue below' };
    case 'TOP_BAND':
      return { imagePlacement: 'wide image band above the text', textPlacement: 'body text flows below the band' };
    case 'BOTTOM_BAND':
      return { imagePlacement: 'wide image band below the text', textPlacement: 'body text flows above the band' };
    case 'FULL_PAGE':
      return { imagePlacement: 'full-page plate area', textPlacement: 'minimal caption or title text only' };
    case 'SIDEBAR_RIGHT':
      return { imagePlacement: 'tall right-side image column', textPlacement: 'running body column on the left' };
    case 'SCATTERED':
      return { imagePlacement: 'small scattered study/vignette zones', textPlacement: 'text wraps through the open reading path' };
    case 'CENTER_WRAP':
      return { imagePlacement: 'centered image with surrounding negative space', textPlacement: 'text wraps around and below the centered image' };
    default:
      return { imagePlacement: 'left floating art block', textPlacement: 'title and body wrap to the right, then continue below' };
  }
}

function refinedPlacement(slot: ArtSlot, imagePercent: number): { imagePlacement: string; textPlacement: string } {
  if (imagePercent <= 15 && (slot === 'FLOAT_LEFT' || slot === 'FLOAT_RIGHT')) {
    const side = slot === 'FLOAT_LEFT' ? 'upper-left' : 'upper-right';
    return {
      imagePlacement: `small ${side} corner or edge illustration, suitable for pine boughs, tracks, specimen details, or other quiet marginal art`,
      textPlacement: 'body text owns the page and wraps around the small supporting illustration',
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
