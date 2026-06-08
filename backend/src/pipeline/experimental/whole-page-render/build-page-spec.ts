/**
 * Whole-page render experiment — build the JSON page specification.
 *
 * Pure builder: takes the persisted paginated page + project config + entry
 * meta + the LayoutAllocation and returns a `WholePageSpec`. No I/O, no
 * randomness, no side effects.
 *
 * The spec is the contract between the experiment and the image model: every
 * piece of information needed to render a finished page lives here.
 */

import type { LayoutTemplateId, PageManifest, ProjectConfig } from '@wildlands/shared';
import type { PageRow } from '../../../db/repositories/pagination.repo.js';
import type { LayoutAllocation, PlanningZone } from '../../stage-6-layout/layout-director.js';
import type { PageGeometry } from '../../stage-6-layout/page-geometry.js';
import { deriveSubjectPackage } from '../../stage-2-planner/plan-pages.js';
import {
  EXPERIMENT_READING_FIELD_WIDENING_PCT,
  EXPERIMENT_TYPOGRAPHY_DNA,
} from './typography-dna.js';
import type {
  DecorativeElementsDTO,
  ReadingFieldGeometryDTO,
  WholePageSpec,
} from './types.js';

export interface BuildPageSpecInput {
  pageRow: PageRow;
  config: ProjectConfig;
  geometry: PageGeometry;
  allocation: LayoutAllocation;
  entryTitle: string;
  imageSubject: string;
}

/** Pick the largest text-safe zone — the actual reading field for this layout. */
function pickReadingFieldZone(allocation: LayoutAllocation): PlanningZone | null {
  const candidates = allocation.textSafeZones.filter((z) => z.role === 'body');
  if (candidates.length === 0) return allocation.textSafeZones[0] ?? null;
  return candidates.reduce((best, z) =>
    z.widthPct * z.heightPct > best.widthPct * best.heightPct ? z : best,
  );
}

function pctToIn(pct: number, totalIn: number): number {
  return Math.round((pct / 100) * totalIn * 100) / 100;
}

function inferReadingFieldAnchor(zone: PlanningZone | null): ReadingFieldGeometryDTO['anchor'] {
  if (!zone) return 'CENTER';
  if (zone.yPct >= 50) return 'BOTTOM';
  if (zone.yPct + zone.heightPct <= 50) return 'TOP';
  if (zone.xPct >= 50) return 'RIGHT';
  if (zone.xPct + zone.widthPct <= 50) return 'LEFT';
  return 'CENTER';
}

function inferPageType(layout: LayoutTemplateId, pageRow: PageRow): WholePageSpec['pageType'] {
  if (pageRow.pageRole === 'continuation') return 'CONTINUATION';
  if (pageRow.pageRole === 'compacted') return 'COMPACTED';
  // Chapter openers are the first page of a chapter; we treat layout 13 banner
  // or any opener at plannedPageNumber == chapter start as opener for this
  // experiment. The conservative test: pageRole opener + layout has top art.
  if (pageRow.pageRole === 'opener' && layout === 'LAYOUT_13_FEATURE_BANNER') {
    return 'CHAPTER_OPENER';
  }
  return 'INTERIOR';
}

/**
 * Decorative elements for the v1 experiment. The CH01_P001 baseline carries
 * botanical pinecone rules + Forest/Mountain badges; we hand the same to the
 * image model. Other pages get bottom rule only.
 */
function buildDecorativeElements(pageType: WholePageSpec['pageType']): DecorativeElementsDTO {
  if (pageType === 'CHAPTER_OPENER') {
    return {
      topRule: { kind: 'botanical_pinecone_swag', position: 'above_illustration' },
      bottomRule: { kind: 'botanical_pinecone_swag', position: 'below_body' },
      badges: [
        { label: 'FOREST', icon: 'evergreen_tree', ring: 'forest_green' },
        { label: 'MOUNTAIN', icon: 'mountain_peaks', ring: 'ochre' },
      ],
    };
  }
  return {
    topRule: null,
    bottomRule: { kind: 'botanical_pinecone_swag', position: 'below_body' },
    badges: [],
  };
}

function extractChapterRoman(chapterNumber: number): string {
  // Lightweight Roman numeral converter — chapter numbers stay <= 100 for any
  // realistic book; this is intentionally simple.
  const map: Array<[number, string]> = [
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let n = chapterNumber;
  let out = '';
  for (const [val, sym] of map) {
    while (n >= val) {
      out += sym;
      n -= val;
    }
  }
  return out || String(chapterNumber);
}

export function buildPageSpec(input: BuildPageSpecInput): WholePageSpec {
  const { pageRow, config, geometry, allocation, entryTitle, imageSubject } = input;
  const layout = pageRow.layoutTemplate as LayoutTemplateId;
  const pageType = inferPageType(layout, pageRow);

  // Reading-field geometry — convert the textSafeZone (percent of trim) to inches.
  const rfZone = pickReadingFieldZone(allocation);
  const rfGeometry: ReadingFieldGeometryDTO = {
    originIn: {
      x: rfZone ? pctToIn(rfZone.xPct, geometry.trimWidthIn) : 0,
      y: rfZone ? pctToIn(rfZone.yPct, geometry.trimHeightIn) : 0,
    },
    sizeIn: {
      w: rfZone ? pctToIn(rfZone.widthPct, geometry.trimWidthIn) : geometry.trimWidthIn,
      h: rfZone ? pctToIn(rfZone.heightPct, geometry.trimHeightIn) : geometry.trimHeightIn,
    },
    anchor: inferReadingFieldAnchor(rfZone),
    widerThanProductionPct: EXPERIMENT_READING_FIELD_WIDENING_PCT,
  };

  // Subject package — same derivation as production Stage 2 so we test prompt
  // structure, not subject changes.
  const fauxManifest: PageManifest = {
    pageId: pageRow.pageKey,
    chapterNumber: pageRow.chapterNumber,
    pageNumber: pageRow.plannedPageNumber,
    entryTitle,
    imageSubject,
    bodyMarkdown: pageRow.readingFieldText ?? ' ',
    layoutTemplate: layout,
    warnings: [],
  };
  const subjectPackage = deriveSubjectPackage(fauxManifest);

  const dropCap =
    pageType === 'CHAPTER_OPENER' && pageRow.readingFieldText
      ? pageRow.readingFieldText.trim().charAt(0).toUpperCase() || null
      : null;

  return {
    pageType,
    layoutFamily: layout,
    layoutGeometry: {
      trim: { widthIn: geometry.trimWidthIn, heightIn: geometry.trimHeightIn },
      marginsIn: {
        top: geometry.margins.topIn,
        bottom: geometry.margins.bottomIn,
        outside: geometry.margins.rightIn,
        inside: geometry.margins.gutterIn,
      },
      bleedIn: 0.125,
    },
    readingFieldGeometry: rfGeometry,
    typographyDNA: {
      ...EXPERIMENT_TYPOGRAPHY_DNA,
      // For non-chapter-openers we don't enforce a fixed title hierarchy.
      titleHierarchy:
        pageType === 'CHAPTER_OPENER'
          ? ['CHAPTER', extractChapterRoman(pageRow.chapterNumber), entryTitle.toUpperCase()]
          : [],
    },
    illustrationDNA: {
      masterStyleBlock: config.imageGeneration.masterStyleBlockText,
      subject: subjectPackage,
    },
    pageText: {
      title:
        pageType === 'CHAPTER_OPENER'
          ? {
              kicker: 'CHAPTER',
              number: extractChapterRoman(pageRow.chapterNumber),
              name: entryTitle.toUpperCase(),
            }
          : { kicker: '', number: '', name: '' },
      body: pageRow.readingFieldText ?? '',
      dropCap,
    },
    decorativeElements: buildDecorativeElements(pageType),
  };
}
