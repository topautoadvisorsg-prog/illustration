/**
 * Whole-page render pipeline — types.
 *
 * The JSON page specification handed to the image model. Production code
 * does NOT import these types. Everything here is scoped to the pipeline.
 */

import type { LayoutTemplateId } from '@wildlands/shared';
import type { BadgeSafeZone } from '../publishing-standard/badge-zones.js';

export interface InchSize {
  widthIn: number;
  heightIn: number;
}

export interface InchPoint {
  x: number;
  y: number;
}

export interface InchBox {
  originIn: InchPoint;
  sizeIn: { w: number; h: number };
}

export interface LayoutGeometryDTO {
  trim: InchSize;
  marginsIn: { top: number; bottom: number; outside: number; inside: number };
  bleedIn: number;
}

export interface ReadingFieldGeometryDTO extends InchBox {
  anchor: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' | 'CENTER';
  widerThanProductionPct: number;
}

export interface TypographyDNA {
  identity: string;
  bodyFamily: string;
  bodyPt: number;
  bodyLineHeight: number;
  bodyMeasureChars: number;
  titleFamily: string;
  titleHierarchy: string[];
  ornaments: string[];
  decorativeInitial: string | null;
  noModernUi: true;
  noInfographic: true;
}

export interface IllustrationDNADTO {
  masterStyleBlock: string;
  subject: {
    primary: string;
    supporting: string[];
    environment: string;
    mood: string;
  };
}

export interface BodyBlockDTO {
  type: 'heading' | 'subheading' | 'paragraph';
  text: string;
}

export interface PageTextDTO {
  title: { kicker: string; number: string; name: string };
  /** Clean plain-text body (markdown stripped) — for source-review + QC. */
  body: string;
  /** Structured blocks the model renders by type — no markdown chars. */
  bodyBlocks: BodyBlockDTO[];
  dropCap: string | null;
}

export interface DecorativeBadge {
  label: string;
  icon: string;
  ring: string;
}

export interface DecorativeRule {
  kind: string;
  position: string;
}

export interface DecorativeElementsDTO {
  topRule: DecorativeRule | null;
  bottomRule: DecorativeRule | null;
  badges: DecorativeBadge[];
}

/** Standard v1.1 — badge metadata passed to the model as CONTEXT ONLY. The
 *  model never draws badges; print-prep stamps them. */
export interface BadgeContextDTO {
  hazard: string[];
  region: string;
  source: string;
}

/** F-8 — explicit composition placement. The Chapter 1 production run proved
 *  the blueprint PNG alone is NOT a reliable layout signal: both corner-accent
 *  pages rendered as full-width bands and a 50/50 page mirrored. These strings
 *  (already computed by the layout director) give the model the placement in
 *  prose, alongside the blueprint's visual signal. */
export interface CompositionDTO {
  imagePlacement: string;
  textPlacement: string;
}

/** Cover typography the AI bakes INTO the full-wrap illustration (operator
 *  decision): title, subtitle, author, and back-cover copy are rendered by the
 *  image model, not an HTML overlay. Only the barcode stays engine-stamped. */
export interface CoverCopyDTO {
  title: string;
  subtitle?: string;
  /** Front-cover descriptive line (e.g. "A Field Guide to ..."). Data-driven. */
  coverDescription?: string;
  author?: string;
  /** "[SERIES NAME] — VOLUME [Roman]", from buildSeriesLine(). Null when no series. */
  seriesLine?: string;
  /** Back-cover copy as three distinct pieces so the model renders the cover
   *  hierarchy correctly (sales paragraph, feature list, author note). */
  backCover?: {
    mainDescription?: string;
    insideThisVolume?: string[];
    authorBio?: string;
  };
}

export interface WholePageSpec {
  pageType:
    | 'CHAPTER_OPENER'
    | 'INTERIOR'
    | 'COMPACTED'
    | 'CONTINUATION'
    | 'COVER_WRAP'
    | 'TITLE_PAGE'
    | 'INTRO_OPENER'
    | 'AUTHOR_PAGE'
    | 'SERIES_PAGE'
    | 'GLOSSARY_ORNAMENT'
    | 'INDEX_ORNAMENT'
    | 'COPYRIGHT_PAGE'
    | 'CONTENTS';
  layoutFamily: LayoutTemplateId;
  layoutGeometry: LayoutGeometryDTO;
  /** F-8 — prose placement contract the model must respect. */
  composition: CompositionDTO;
  readingFieldGeometry: ReadingFieldGeometryDTO;
  typographyDNA: TypographyDNA;
  illustrationDNA: IllustrationDNADTO;
  pageText: PageTextDTO;
  decorativeElements: DecorativeElementsDTO;
  /** Cover-only: typography the AI bakes into the wrap illustration. */
  coverCopy?: CoverCopyDTO;
  /** Badge metadata (context only; never drawn by the model). */
  badgeContext: BadgeContextDTO;
  /** L-7 — reserved rects the model must leave visually clean. Derived from
   *  badgeContext + layoutFamily + canvas via the shared single-source-of-
   *  truth helper `computeBadgeSafeZones()` in publishing-standard. The
   *  print-prep stamper writes badges into the SAME rects, so the AI's
   *  "leave clean" zones and the stamper's "stamp here" zones never drift. */
  badgeSafeZones: BadgeSafeZone[];
}

// Persisted render shape now lives in the DB row (WholePageRenderRow in
// whole-page-render.repo.ts). The old disk-only WholePageRenderResult type
// was removed when the pipeline moved to DB persistence (move #1).
