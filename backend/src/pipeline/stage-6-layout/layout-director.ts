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
  /** Whether the page actually has a heading/title. Default true. When false, a
   *  pure-text layout drops the empty title band and raises its reading field
   *  (copyright / continuation / compacted pages have no title). */
  hasTitle?: boolean;
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

export type PlanningZoneRole = 'body' | 'caption' | 'title' | 'section-title' | 'primary-art' | 'supporting-art' | 'background-art';
export type PlanningZoneShape = 'rect' | 'organic' | 'path';

/**
 * The four kinds of page region the Layout Director distinguishes. The whole point
 * of this vocabulary: long-form reading text and short overlay text are NOT the same
 * and must not be treated as one generic "text-safe" area.
 *
 * - image-priority      Strong focal artwork. The primary subject lives here.
 * - background-field    The calm, low-detail illustrated field covering the WHOLE page.
 *                       It is what makes the page read as one continuous illustration
 *                       (paper grain, soft atmosphere, faint texture) rather than blank
 *                       paper. Strong detail belongs in image-priority; this stays quiet,
 *                       so reading-field text MAY sit over it (it never competes).
 * - reading-field       Long-form body text. Lives on a calm parchment field that the
 *                       artwork OPENS INTO (organic transition, never a pasted block).
 *                       Coordinates with image-priority but never competes/overlaps it.
 * - overlay-typography  Short text (title, label, caption, callout, specimen note).
 *                       MAY sit over artwork because it is short.
 * - supporting-study    Small natural-history specimen studies. Rendered directly on
 *                       the page like a museum plate — never as cards/tiles/colored blocks.
 */
export type RegionType = 'image-priority' | 'background-field' | 'reading-field' | 'overlay-typography' | 'supporting-study';

function regionTypeForRole(role: PlanningZoneRole): RegionType {
  switch (role) {
    case 'primary-art':
      return 'image-priority';
    case 'background-art':
      return 'background-field';
    case 'supporting-art':
      return 'supporting-study';
    case 'body':
      return 'reading-field';
    case 'title':
    case 'section-title':
    case 'caption':
      return 'overlay-typography';
  }
}

export interface PlanningZone {
  id: string;
  role: PlanningZoneRole;
  /** Coarse classification used to keep reading text and overlay text from being conflated. */
  regionType: RegionType;
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
  /** All page regions, each tagged with its RegionType. Canonical classified output. */
  regions: PlanningZone[];
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
    case 'CORNER_TOP_LEFT':
      return { imagePlacement: 'small top-left corner accent study (~25% of the composition)', textPlacement: 'body text owns the page: a column beside the accent, then the full lower block' };
    case 'CORNER_TOP_RIGHT':
      return { imagePlacement: 'small top-right corner accent study (~25% of the composition)', textPlacement: 'body text owns the page: a column beside the accent, then the full lower block' };
    case 'CORNER_BOTTOM_LEFT':
      return { imagePlacement: 'small bottom-left corner accent study (~25% of the composition)', textPlacement: 'body text owns the page: the full upper block, then a column beside the accent' };
    case 'CORNER_BOTTOM_RIGHT':
      return { imagePlacement: 'small bottom-right corner accent study (~25% of the composition)', textPlacement: 'body text owns the page: the full upper block, then a column beside the accent' };
    case 'TITLE_BLOCK':
      return {
        imagePlacement: 'a subtle full-page illustrated field — aged parchment, delicate botanical atmosphere, faint naturalist textures kept calm and low-contrast — with thin decorative ornament bands at the very top and bottom edges; the centered title block sits cleanly within this field',
        textPlacement: 'a compact, vertically-centered text block (a few short lines) over the calm centre of the illustrated field, with generous open space above and below',
      };
    case 'FINE_PRINT_BOTTOM':
      return {
        imagePlacement: 'a subtle full-page illustrated field — calm, low-contrast aged parchment with delicate botanical atmosphere and faint naturalist textures — framed by thin decorative ornament bands at the very top and bottom edges; the field owns the open space above the fine print',
        textPlacement: 'a SMALL block of quiet fine print anchored LOW on the page (lower third), small restrained type centered horizontally, with the calm illustrated field filling all the space above it',
      };
    case 'REFERENCE_COLUMNS':
      return {
        imagePlacement: 'a subtle full-page illustrated field — calm, low-contrast aged parchment with faint botanical atmosphere — framed by thin decorative ornament bands at the very top and bottom edges; it sits quietly BEHIND the two reference columns',
        textPlacement: 'a heading at the top, then the entries flow in TWO balanced columns of smaller but comfortable reference type (read down the left column, then continue down the right). Dense and orderly, like a real field-guide glossary/index — never a single wide block, never cramped',
      };
    default:
      return { imagePlacement: 'left-side image-priority zone within the full-page artwork', textPlacement: 'body text uses the calm right-side text-safe zone, then continues below' };
  }
}

function refinedPlacement(slot: ArtSlot, imagePercent: number): { imagePlacement: string; textPlacement: string } {
  if (slot === 'FULL_PAGE') {
    if (imagePercent >= 90) {
      return {
        imagePlacement: 'the ENTIRE page is one full-canvas illustration, edge to edge',
        textPlacement: 'no separate text zone — any title or caption is rendered into the illustration itself',
      };
    }
    if (imagePercent <= 8) {
      return {
        imagePlacement: 'a SUBTLE full-page illustrated field — calm, low-contrast aged parchment with soft atmosphere and faint naturalist texture across the whole page (never blank paper) — framed by thin decorative ornament bands at the very top and bottom edges. Keep it quiet: no bold subject illustration, this stays a restful text page',
        textPlacement: 'a single calm reading field for the body text, sitting over the subtle field between the edge ornaments',
      };
    }
  }
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
  return { id, role, regionType: regionTypeForRole(role), shape, xPct: round(xPct), yPct: round(yPct), widthPct: round(widthPct), heightPct: round(heightPct), instruction };
}

// Page-composition constants (percent of the text frame).
// A calm TITLE BAND is reserved across the top; the title overlays it as Type-B
// overlay typography. ALL focal image detail and reading fields start BELOW it
// (FOCAL_TOP), so the title never sits over the concentrated-detail image zone.
const TITLE_BAND_Y = 4;
const TITLE_BAND_H = 11;
const FOCAL_TOP = 18; // image-priority + reading-field start here, under the title band
const BOTTOM = 94; // leave a calm bottom margin
const GUTTER = 5; // hard separation between image-priority and reading-field — never share a strip
const clampN = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function titleBand(): PlanningZone {
  return zone(
    'title-main',
    'title',
    6,
    TITLE_BAND_Y,
    88,
    TITLE_BAND_H,
    'Title/heading overlays a CALM top band. Keep this band low-detail and open (save parchment) so the title reads; do not concentrate focal artwork here.',
  );
}

/** The subtle, low-detail illustrated field that covers the WHOLE page so no
 *  area reads as blank paper. Drawn UNDER the focal art / ornaments / text in the
 *  blueprint, and (being calm) exempt from the reading-field vs image-priority
 *  invariant. Used by illustration-bearing layouts; pure-text/reference pages
 *  stay clean paper. */
function backgroundField(): PlanningZone {
  return zone(
    'illustration-field',
    'background-art',
    0,
    0,
    100,
    100,
    'SUBTLE FULL-PAGE ILLUSTRATED FIELD — the ENTIRE page is one continuous, low-contrast illustration (soft paper grain, gentle atmosphere, faint naturalist texture) so no region reads as blank. Concentrate STRONG detail only in the focal image zones; keep this field quiet everywhere else, especially beneath the reading field so the text stays legible.',
  );
}

/** Slots whose composition is a focal subject + reading field — these read as
 *  one continuous illustrated page, so they carry a background illustration
 *  field. Pure-text (LAYOUT_D) and full-canvas plates are handled separately. */
const BACKGROUND_FIELD_SLOTS = new Set<ArtSlot>([
  'TOP_BAND',
  'BOTTOM_BAND',
  'FLOAT_LEFT',
  'FLOAT_RIGHT',
  'SIDEBAR_RIGHT',
  'SCATTERED',
  'CENTER_WRAP',
  'CORNER_TOP_LEFT',
  'CORNER_TOP_RIGHT',
  'CORNER_BOTTOM_LEFT',
  'CORNER_BOTTOM_RIGHT',
]);

function zonePlanFor(slot: ArtSlot, imagePercent: number, hasTitle = true): Pick<LayoutAllocation, 'textSafeZones' | 'typographyZones' | 'imagePriorityZones'> {
  const title = titleBand();
  switch (slot) {
    case 'TOP_BAND': {
      const imgH = clampN(imagePercent, 26, 48);
      const imgY = FOCAL_TOP;
      const textY = imgY + imgH + GUTTER;
      return {
        typographyZones: [title],
        imagePriorityZones: [zone('image-priority-top', 'primary-art', 0, imgY, 100, imgH, 'Concentrate focal visual detail in the upper artwork band; below it the artwork opens into a calm reading field.')],
        textSafeZones: [zone('reading-field-lower', 'body', 8, textY, 84, Math.max(20, BOTTOM - textY), 'Readable long-form reading field: the artwork opens/dissolves into a calm parchment field here. Organic transition, never a panel, box, card, or pasted block.', 'organic')],
      };
    }
    case 'BOTTOM_BAND': {
      const imgH = clampN(imagePercent, 26, 48);
      const imgY = 100 - imgH;
      return {
        typographyZones: [title],
        imagePriorityZones: [zone('image-priority-bottom', 'primary-art', 0, imgY, 100, imgH, 'Concentrate focal visual detail in the lower artwork band; above it the artwork opens into a calm reading field.')],
        textSafeZones: [zone('reading-field-upper', 'body', 8, FOCAL_TOP, 84, Math.max(20, imgY - GUTTER - FOCAL_TOP), 'Readable long-form reading field on a calm parchment field the artwork dissolves into. No box, card, or pasted block.', 'organic')],
      };
    }
    case 'FLOAT_LEFT': {
      const imgW = clampN(imagePercent, 40, 58);
      const textX = imgW + GUTTER;
      return {
        typographyZones: [title],
        imagePriorityZones: [zone('image-priority-left', 'primary-art', 0, FOCAL_TOP, imgW, BOTTOM - FOCAL_TOP, 'Focal subject lives along the left while the full page stays one illustration; it opens into the reading field to its right.')],
        textSafeZones: [zone('reading-field-right', 'body', textX, FOCAL_TOP, Math.max(32, 94 - textX), BOTTOM - FOCAL_TOP, 'Readable long-form reading field: a calm parchment column the artwork dissolves into at the seam. No hard edge, panel, or card.', 'organic')],
      };
    }
    case 'FLOAT_RIGHT':
    case 'SIDEBAR_RIGHT': {
      const imgW = clampN(imagePercent, 40, 58);
      const imgX = 100 - imgW;
      return {
        typographyZones: [title],
        imagePriorityZones: [zone('image-priority-right', 'primary-art', imgX, FOCAL_TOP, imgW, BOTTOM - FOCAL_TOP, 'Focal subject lives along the right while the full page stays one illustration; it opens into the reading field to its left.')],
        textSafeZones: [zone('reading-field-left', 'body', 6, FOCAL_TOP, Math.max(32, imgX - GUTTER - 6), BOTTOM - FOCAL_TOP, 'Readable long-form reading field: a calm parchment column the artwork dissolves into at the seam. No hard edge, panel, or card.', 'organic')],
      };
    }
    case 'CORNER_TOP_LEFT':
    case 'CORNER_TOP_RIGHT':
    case 'CORNER_BOTTOM_LEFT':
    case 'CORNER_BOTTOM_RIGHT': {
      // P2a — 25 % accent family (LAYOUT_C, operator-approved rebuild).
      // A small specimen study holds ONE corner; text owns the rest of the
      // page in an L: a column beside the accent plus a full-width block on
      // the other half. Accent ≈ 44 × 36 of the usable area ≈ 25 % of the
      // composition — a true accent, never competing with the text.
      const accW = clampN(imagePercent * 1.8, 38, 46); // ~44 % width
      const accH = 34; // ~36 % of usable height
      const onTop = slot === 'CORNER_TOP_LEFT' || slot === 'CORNER_TOP_RIGHT';
      const onLeft = slot === 'CORNER_TOP_LEFT' || slot === 'CORNER_BOTTOM_LEFT';
      const accX = onLeft ? 4 : 96 - accW;
      const accY = onTop ? FOCAL_TOP : BOTTOM - accH;
      const corner = `${onTop ? 'top' : 'bottom'}-${onLeft ? 'left' : 'right'}`;
      // Column beside the accent (same rows), block on the opposite half.
      const colX = onLeft ? accX + accW + GUTTER : 6;
      const colW = Math.max(30, (onLeft ? 94 - colX : accX - GUTTER - 6));
      const blockY = onTop ? accY + accH + GUTTER : FOCAL_TOP;
      const blockH = onTop ? BOTTOM - blockY : accY - GUTTER - FOCAL_TOP;
      return {
        typographyZones: [title],
        imagePriorityZones: [
          zone(
            `image-accent-${corner}`,
            'primary-art',
            accX,
            accY,
            accW,
            accH,
            `Small ${corner} specimen accent (~25 % of the composition) — a single naturalist study (mushroom, leaf, feather, track, tool, botanical detail) rendered directly on the page like a museum plate. It supports the text; it never dominates. No card, frame, or colored block.`,
          ),
        ],
        textSafeZones: [
          zone(
            `reading-field-beside-${corner}`,
            'body',
            colX,
            accY,
            colW,
            accH,
            'Readable long-form reading field beside the accent study: calm parchment, organic transition at the seam. No box, panel, or card.',
            'organic',
          ),
          zone(
            `reading-field-main-${corner}`,
            'body',
            6,
            blockY,
            88,
            Math.max(20, blockH),
            'Primary reading field: a calm, full-measure parchment block. The accent study stays in its corner; the artwork dissolves into this field, never a hard edge.',
            'organic',
          ),
        ],
      };
    }
    case 'TITLE_BLOCK':
      // Display / ceremonial composition (LAYOUT_TITLE_DISPLAY): a compact,
      // vertically-centered text block with GENEROUS negative space, framed by
      // extremely thin edge ornaments. For very short text — title, dedication,
      // epigraph, quote, special notes. Not a reading field.
      return {
        // The centered title block is Type-B OVERLAY display typography sitting
        // over the illustrated field — NOT a long-form reading field. Classified
        // as overlay-typography so it is (correctly) exempt from the reading-field
        // vs image-priority invariant, and painted RED in the blueprint.
        typographyZones: [
          zone('display-text-block', 'caption', 14, 35, 72, 26, 'COMPACT CENTERED TITLE BLOCK (display typography, NOT a paragraph reading field): a few short lines — title largest in engraved serif caps, then any subordinate lines — stacked and VERTICALLY CENTERED over the calm centre of the field. Keep that centre low-contrast so the text stays legible.', 'organic'),
        ],
        imagePriorityZones: [
          // Background illustrated field: the whole page is a subtle illustrated
          // environment, NOT blank paper. Drawn first; ornaments + title sit on top.
          zone('illustration-field', 'background-art', 0, 0, 100, 100, 'SUBTLE FULL-PAGE ILLUSTRATED FIELD — the entire page is a soft, low-contrast illustrated environment: aged parchment, delicate botanical atmosphere, faint pressed-leaf / fern / pine textures, gentle vintage paper grain. Keep it quiet and atmospheric so the centered title block stays the focal point; never busy, never a hard subject scene.'),
          zone('ornament-top', 'supporting-art', 18, 0.5, 64, 3, 'Extremely thin decorative top-EDGE ornament ONLY (a hairline engraved botanical band hugging the top edge). Never overlap the centered text block.'),
          zone('ornament-bottom', 'supporting-art', 18, 96, 64, 3, 'Extremely thin decorative bottom-EDGE ornament ONLY (a hairline engraved botanical band hugging the bottom edge). Never overlap the centered text block.'),
        ],
        textSafeZones: [],
      };
    case 'FINE_PRINT_BOTTOM':
      // Fine-print page (LAYOUT_FINE_PRINT: copyright / colophon / edition
      // notice). A SMALL block of fine print anchored LOW on the page; the calm
      // illustrated field owns the open space above it, framed by thin edge
      // ornaments. Not a full reading field — a quiet legal/credits footer.
      return {
        typographyZones: [],
        imagePriorityZones: [
          backgroundField(),
          zone('ornament-top', 'supporting-art', 12, 0.5, 76, 3, 'Extremely thin decorative top-EDGE ornament ONLY (a hairline engraved botanical band hugging the top edge). Never overlap the fine-print block.'),
          zone('ornament-bottom', 'supporting-art', 12, 96, 76, 3, 'Extremely thin decorative bottom-EDGE ornament ONLY (a hairline engraved botanical band hugging the bottom edge). Never overlap the fine-print block.'),
        ],
        textSafeZones: [
          zone('fine-print-block', 'body', 16, 72, 68, 18, 'SMALL FINE-PRINT BLOCK anchored low on the page (copyright / edition notice): a few lines of small, quiet legal/credits type, centered horizontally in the lower third. The calm illustrated field owns ALL the open space ABOVE it. Keep the type small and restrained — fine print, never a large reading field, never a heading.', 'organic'),
        ],
      };
    case 'REFERENCE_COLUMNS':
      // Reference page (LAYOUT_REFERENCE: glossary, index). A heading + TWO
      // dense reading columns of smaller reference type, over the same calm
      // illustrated field + thin edge ornaments. Same Wildlands DNA — only the
      // text geometry changes (two columns instead of one full field).
      return {
        typographyZones: [title],
        imagePriorityZones: [
          backgroundField(),
          zone('ornament-top', 'supporting-art', 12, 0.5, 76, 3, 'Extremely thin decorative top-EDGE ornament ONLY (a hairline engraved botanical band hugging the top edge). Never overlap the heading or the columns.'),
          zone('ornament-bottom', 'supporting-art', 12, 96, 76, 3, 'Extremely thin decorative bottom-EDGE ornament ONLY (a hairline engraved botanical band hugging the bottom edge). Never overlap the columns.'),
        ],
        textSafeZones: [
          zone('reading-column-left', 'body', 6, 18, 42, 72, 'LEFT reading column of a TWO-COLUMN reference page (glossary / index): dense entries set in smaller but comfortable reference type, flowing top-to-bottom, then continuing in the right column. A calm parchment column over the subtle field — no panel, box, or card.', 'organic'),
          zone('reading-column-right', 'body', 52, 18, 42, 72, 'RIGHT reading column of the TWO-COLUMN reference page: the entries continue here from the left column, same smaller reference type. A calm parchment column over the subtle field — no panel, box, or card.', 'organic'),
        ],
      };
    case 'SCATTERED':
      // Supporting studies snap to the page corners/edges (no dead gaps); the reading
      // field is a calm parchment column that does not overlap any study.
      return {
        typographyZones: [title],
        imagePriorityZones: [
          zone('image-priority-study-a', 'primary-art', 4, FOCAL_TOP, 34, 26, 'Primary specimen study, top-left corner — rendered like a museum plate directly on the page, not a card.'),
          zone('image-priority-study-b', 'supporting-art', 62, FOCAL_TOP, 34, 22, 'Supporting specimen study, top-right corner — a natural-history study on the page, no card/tile/colored block.'),
          zone('image-priority-study-c', 'supporting-art', 4, 70, 30, 24, 'Supporting specimen study, bottom-left corner — a natural-history study on the page, no card/tile/colored block.'),
        ],
        textSafeZones: [zone('reading-field-path', 'body', 38, 48, 58, 40, 'Readable long-form reading field: a calm parchment field flowing between the studies. No filled panel or card.', 'path')],
      };
    case 'CENTER_WRAP':
      return {
        typographyZones: [title],
        imagePriorityZones: [zone('image-priority-center', 'primary-art', 22, FOCAL_TOP + 2, 56, 40, 'Central focal subject with calm surrounding artwork that opens into the reading field below.')],
        textSafeZones: [zone('reading-field-lower', 'body', 10, 64, 80, BOTTOM - 64, 'Readable long-form reading field on a calm parchment field the artwork dissolves into. No box, card, or panel.', 'organic')],
      };
    case 'FULL_PAGE':
    default: {
      // Layout Audit 1 — the FULL_PAGE slot is shared by two OPPOSITE intents,
      // so the zone plan must honor the profile's image fraction, not the slot.
      if (imagePercent >= 90) {
        // FULL ILLUSTRATION (LAYOUT_A_ILLUSTRATION / LAYOUT_10). The ENTIRE
        // page is one illustration, edge to edge. No reserved text/title zones
        // and no carved-out margins — the AI renders any title/caption INTO the
        // illustration and owns all negative space.
        return {
          typographyZones: [],
          imagePriorityZones: [zone('image-priority-full-canvas', 'primary-art', 0, 0, 100, 100, 'FULL-CANVAS illustration: the artwork fills the entire page, edge to edge. Render any title or caption INTO the illustration yourself; reserve no separate text panel, margin, band, or carved-out zone.')],
          textSafeZones: [],
        };
      }
      if (imagePercent <= 8) {
        // PURE TEXT (LAYOUT_D_PURE_TEXT: continuation, compacted, copyright,
        // glossary, index, contents…). A calm reading field with only thin
        // decorative edge ornaments — visual continuity, NOT a subject plate.
        // Ornaments sit at the very top/bottom edges, EXTREMELY THIN — they may
        // touch the text zones but must never overlap them (operator fix).
        const ornaments = [
          zone('ornament-top', 'supporting-art', 12, 0.5, 76, 3, 'Extremely thin decorative top-EDGE ornament ONLY (a hairline engraved botanical band hugging the top edge) — visual continuity, never a subject illustration. Keep it a thin strip; never overlap the title or the reading field.'),
          zone('ornament-bottom', 'supporting-art', 12, 96, 76, 3, 'Extremely thin decorative bottom-EDGE ornament ONLY (a hairline engraved botanical band hugging the bottom edge) — visual continuity, never a subject illustration. Keep it a thin strip; never overlap the reading field.'),
        ];
        // Titled pages (glossary/index/contents) reserve a top title band.
        // Titleless pages (copyright/continuation/compacted) drop the empty band
        // and raise the reading field so the text starts near the top edge.
        if (hasTitle) {
          return {
            typographyZones: [title],
            imagePriorityZones: ornaments,
            textSafeZones: [zone('reading-field-full', 'body', 6, 18, 88, 72, 'Large uninterrupted reading field: a calm parchment text column filling the page between the edge ornaments. Text-first page — no subject illustration, no panels, no cards.', 'organic')],
          };
        }
        return {
          typographyZones: [],
          imagePriorityZones: ornaments,
          textSafeZones: [zone('reading-field-full', 'body', 6, 6, 88, 84, 'Single calm reading field with NO title band: the body text begins near the top edge and flows down one calm parchment column between the thin edge ornaments. Text-first page — no heading, no subject illustration, no panels, no cards.', 'organic')],
        };
      }
      // IMAGE-DOMINANT OPENER (the "empty space becomes illustration" path, used
      // for an underfilled entry opener at ~78% art): the whole page is one
      // illustration — strong focal art fills the upper page and dissolves into a
      // COMPACT calm reading field in the lower page that holds the short entry
      // text. No blank paper, no baked-in body text. (The ≥90% branch above is the
      // separate full-canvas plate; ≤8% is pure text.)
      return {
        typographyZones: [title],
        imagePriorityZones: [zone('image-priority-hero', 'primary-art', 0, FOCAL_TOP, 100, Math.max(34, 70 - FOCAL_TOP), 'Strong focal illustration filling the upper page; it opens and dissolves into a calm reading field below. The entire page is one continuous illustration — never leave blank paper.')],
        textSafeZones: [zone('reading-field-hero', 'body', 8, 72, 84, 22, 'Compact calm reading field the artwork dissolves into across the lower page; comfortably holds the short entry text at body size. Organic transition into the art — never a panel, box, card, or pasted block.', 'organic')],
      };
    }
  }
}

/** Axis-aligned overlap test for two planning zones (percent rects). */
function zonesOverlap(a: PlanningZone, b: PlanningZone): boolean {
  return (
    a.xPct < b.xPct + b.widthPct &&
    b.xPct < a.xPct + a.widthPct &&
    a.yPct < b.yPct + b.heightPct &&
    b.yPct < a.yPct + a.heightPct
  );
}

/**
 * Hard invariant: a Reading Field must never overlap an Image-Priority zone. The two
 * coordinate (sit side by side, the art opens into the field) but never compete. Title/
 * caption are Type-B OVERLAY typography and are allowed to sit over artwork, so they are
 * exempt. Returns the list of violating pairs (empty when the layout is clean).
 */
export function readingFieldImageConflicts(plan: Pick<LayoutAllocation, 'textSafeZones' | 'imagePriorityZones'>): string[] {
  const conflicts: string[] = [];
  const readingFields = plan.textSafeZones.filter((z) => z.regionType === 'reading-field');
  const imageZones = plan.imagePriorityZones.filter((z) => z.regionType === 'image-priority');
  for (const rf of readingFields) {
    for (const img of imageZones) {
      if (zonesOverlap(rf, img)) {
        conflicts.push(`${rf.id} overlaps ${img.id}`);
      }
    }
  }
  return conflicts;
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
  // A titleless page (copyright/continuation/compacted) drops the empty title
  // band and raises its reading field; titled pages keep their heading band.
  const hasTitle = input.hasTitle !== false;

  // ── Wild Lands design principle: empty space becomes illustration, not dead
  // paper. ── A titled entry OPENER whose text barely fills the page must NOT
  // reserve a half-page text column that ends up blank. When the opener page is
  // underfilled, hand the unused real estate back to the artwork: the whole page
  // becomes one continuous illustration with the short text in a compact,
  // integrated reading field. Titleless pages (continuation/compacted) are never
  // affected; pure-text (D) and full plates are excluded by the fraction guard.
  // Permanent across every Wild Lands volume — not a per-book exception.
  const OPENER_LOW_FILL = 0.55;
  const OPENER_SHORT_CHARS = 1100; // ~180 words — genuinely short copy in absolute terms
  const isUnderfilledOpener =
    hasTitle &&
    profile.artAreaFraction > 0.08 &&
    profile.artAreaFraction < 0.9 &&
    plainCharCount > 0 &&
    plainCharCount < OPENER_SHORT_CHARS &&
    plainCharCount < openingCapacityChars * OPENER_LOW_FILL;
  const artSlotEff: ArtSlot = isUnderfilledOpener ? 'FULL_PAGE' : profile.artSlot;
  const artCoverage = isUnderfilledOpener ? 0.78 : profile.artAreaFraction;

  const imagePercent = Math.round(artCoverage * 100);
  const textPercent = Math.max(0, 100 - imagePercent);
  const placement = refinedPlacement(artSlotEff, imagePercent);
  const imagePriorityZone = imagePriorityZoneFor(artSlotEff, artCoverage, input.geometry);
  const zonePlan = zonePlanFor(artSlotEff, imagePercent, hasTitle);
  // Every page is one continuous illustration: lay a subtle background field
  // UNDER the focal art / text so no region looks blank — including the
  // pure-text pages (a quiet parchment/atmosphere field behind the reading
  // field). Only the full-canvas plate (already 100% art) and TITLE_BLOCK
  // (builds its own field) are excluded.
  const wantsBackgroundField =
    BACKGROUND_FIELD_SLOTS.has(artSlotEff) ||
    (artSlotEff === 'FULL_PAGE' && imagePercent < 90);
  if (wantsBackgroundField) {
    zonePlan.imagePriorityZones = [backgroundField(), ...zonePlan.imagePriorityZones];
  }
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

  // Invariant guard: reading field must never overlap image priority. Geometry is
  // deterministic so this should always be clean; surface a note if it ever regresses.
  const conflicts = readingFieldImageConflicts(zonePlan);
  if (conflicts.length > 0) {
    notes.push(`Layout conflict — reading field overlaps image priority: ${conflicts.join('; ')}`);
  }

  // Canonical classified region list (the four RegionTypes), ordered back-to-front.
  const regions: PlanningZone[] = [...zonePlan.imagePriorityZones, ...zonePlan.textSafeZones, ...zonePlan.typographyZones];

  return {
    // New zone vocabulary (primary).
    priorityEdge: profile.artSlot,
    imagePriorityZone,
    textSafeZones: zonePlan.textSafeZones,
    typographyZones: zonePlan.typographyZones,
    imagePriorityZones: zonePlan.imagePriorityZones,
    regions,
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
