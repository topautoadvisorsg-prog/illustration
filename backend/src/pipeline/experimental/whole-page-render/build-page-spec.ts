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
import { assembleIllustrationDna, toRoman, WILDLANDS_STANDARD } from '../../publishing-standard/index.js';
import { stripReadingFieldMetadata } from '../../subject-badges/extract-badges.js';
import { markdownToBlocks, blocksToPlainText } from './markdown-blocks.js';
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
  badgeContext?: { hazard: string[]; region: string; source: string };
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
  // KNOWN v1.0 LIMITATION: only LAYOUT_13_FEATURE_BANNER openers get the full
  // CHAPTER hierarchy + badges. An opener on another layout (e.g. P002 on
  // LAYOUT_4_DANGER_WARNING) currently falls through to INTERIOR — no kicker,
  // numeral, or badges. Surfaced in the P002 render. Broadening this to "any
  // pageRole === 'opener'" is a flagged decision, not a silent change.
  if (pageRow.pageRole === 'opener' && layout === 'LAYOUT_13_FEATURE_BANNER') {
    return 'CHAPTER_OPENER';
  }
  return 'INTERIOR';
}

/**
 * Decorative elements per the Wild Lands Publishing Standard. Family is always
 * Botanical Pinecone (`WILDLANDS_STANDARD.ornaments.family`). Chapter openers
 * get top+bottom swags; other page types get a bottom swag only.
 *
 * Standard v1.1: `badges` is ALWAYS empty here — badges are deterministic
 * stamped overlays (print-prep), never model-drawn. The badge VALUES travel in
 * `spec.badgeContext` as mood-only context. Emitting badges here would
 * contradict the prompt's "do not draw badges" hard constraint.
 */
function buildDecorativeElements(pageType: WholePageSpec['pageType']): DecorativeElementsDTO {
  if (pageType === 'CHAPTER_OPENER') {
    return {
      topRule: { kind: WILDLANDS_STANDARD.ornaments.family + ':top_swag', position: 'above_illustration' },
      bottomRule: { kind: WILDLANDS_STANDARD.ornaments.family + ':bottom_swag', position: 'below_body' },
      badges: [],
    };
  }
  return {
    topRule: null,
    bottomRule: { kind: WILDLANDS_STANDARD.ornaments.family + ':bottom_swag', position: 'below_body' },
    badges: [],
  };
}

export function buildPageSpec(input: BuildPageSpecInput): WholePageSpec {
  // `config` stays on the input for callers/back-compat but is no longer read
  // here: Illustration DNA now comes from the Standard, not project config.
  const { pageRow, geometry, allocation, entryTitle, imageSubject } = input;
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

  // Strip the metadata header, then parse markdown → typed plain-text blocks.
  const bodyBlocks = markdownToBlocks(stripReadingFieldMetadata(pageRow.readingFieldText ?? ''));

  const dropCap =
    pageType === 'CHAPTER_OPENER' && bodyBlocks.length > 0
      ? (bodyBlocks.find((b) => b.type === 'paragraph')?.text.charAt(0).toUpperCase() ?? null) || null
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
      // Bleed is owned by the resolved geometry (Rule Zero) — never hardcoded.
      bleedIn: geometry.bleedIn,
    },
    readingFieldGeometry: rfGeometry,
    typographyDNA: {
      ...EXPERIMENT_TYPOGRAPHY_DNA,
      // Drop-cap governance (SPEC_GEOMETRY_RECONCILIATION §3): the drop-cap
      // surround is authoritative on `dropCap`. When there is no drop-cap
      // (every interior/continuation page), emit NOTHING about it — otherwise
      // the model draws an illuminated initial on pages that should have none.
      decorativeInitial: dropCap ? EXPERIMENT_TYPOGRAPHY_DNA.decorativeInitial : null,
      // For non-chapter-openers we don't enforce a fixed title hierarchy.
      titleHierarchy:
        pageType === 'CHAPTER_OPENER'
          ? ['CHAPTER', toRoman(pageRow.chapterNumber), entryTitle.toUpperCase()]
          : [],
    },
    illustrationDNA: {
      // Standard v1.2: Illustration DNA comes from the single authority (the
      // Standard), assembled with PALETTE-token colours — NOT the legacy
      // free-text masterStyleBlockText config blob (which carried contradictory
      // paper/text/composition rules from the dead clean-art pipeline).
      masterStyleBlock: assembleIllustrationDna(),
      subject: subjectPackage,
    },
    pageText: {
      title:
        pageType === 'CHAPTER_OPENER'
          ? {
              kicker: 'CHAPTER',
              number: toRoman(pageRow.chapterNumber),
              name: entryTitle.toUpperCase(),
            }
          : { kicker: '', number: '', name: '' },
      // Strip the manuscript metadata header (binomial + hazard markers), then
      // parse markdown into typed plain-text blocks — the model never sees a
      // markdown character (no `###`/`**` can bleed onto the page).
      body: blocksToPlainText(bodyBlocks),
      bodyBlocks,
      dropCap,
    },
    decorativeElements: buildDecorativeElements(pageType),
    badgeContext: input.badgeContext ?? { hazard: ['NONE'], region: 'GENERAL', source: 'GENERAL_REFERENCE' },
  };
}
