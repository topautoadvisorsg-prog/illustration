/**
 * Whole-page render pipeline — build the JSON page specification.
 *
 * Pure builder: takes the persisted paginated page + project config + entry
 * meta + the LayoutAllocation and returns a `WholePageSpec`. No I/O, no
 * randomness, no side effects.
 *
 * The spec is the contract between the pipeline and the image model: every
 * piece of information needed to render a finished page lives here.
 */

import type { PageManifest, ProjectConfig } from '@wildlands/shared';
import { buildSeriesLine, stripLeadingOrdinal } from '@wildlands/shared';
import type { PageRow } from '../../db/repositories/pagination.repo.js';
import type { LayoutAllocation, PlanningZone } from '../stage-6-layout/layout-director.js';
import { REFERENCE_TYPOGRAPHY } from '../stage-6-layout/layout-profiles.js';
import type { PageGeometry } from '../stage-6-layout/page-geometry.js';
import { deriveSubjectPackage } from '../stage-2-planner/plan-pages.js';
import { assembleIllustrationDna, toRoman, WILDLANDS_STANDARD } from '../publishing-standard/index.js';
import { stripReadingFieldMetadata } from '../subject-badges/extract-badges.js';
import { markdownToBlocks, blocksToPlainText } from './markdown-blocks.js';
import { buildPageRolePolicy, type PageRolePolicy } from './page-role-policy.js';
import {
  READING_FIELD_WIDENING_PCT,
  PAGE_TYPOGRAPHY_DNA,
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
  pageRolePolicy?: PageRolePolicy;
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
  if (pageType === 'CHAPTER_OPENER' || pageType === 'INTRO_OPENER') {
    return {
      topRule: { kind: WILDLANDS_STANDARD.ornaments.family + ':top_swag', position: 'above_illustration' },
      bottomRule: { kind: WILDLANDS_STANDARD.ornaments.family + ':bottom_swag', position: 'below_body' },
      badges: [],
    };
  }
  if (pageType === 'TITLE_PAGE') {
    return {
      topRule: { kind: WILDLANDS_STANDARD.ornaments.family + ':hairline_top', position: 'above_title' },
      bottomRule: { kind: WILDLANDS_STANDARD.ornaments.family + ':restrained_bottom_swag', position: 'below_title' },
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
  const { pageRow, geometry, allocation } = input;
  const policy = input.pageRolePolicy ?? buildPageRolePolicy(pageRow, input.config);
  const layout = policy.layoutTemplate;
  const pageType = policy.pageType;
  const entryTitle = stripLeadingOrdinal(input.entryTitle || policy.entryTitle);
  const imageSubject = input.imageSubject || policy.imageSubject;

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
    widerThanProductionPct: READING_FIELD_WIDENING_PCT,
  };

  // Subject package — same derivation as production Stage 2 so we test prompt
  // structure, not subject changes.
  const fauxManifest: PageManifest = {
    pageId: pageRow.pageKey,
    chapterNumber: pageRow.chapterNumber,
    pageNumber: pageRow.plannedPageNumber,
    entryTitle,
    imageSubject,
    bodyMarkdown: policy.renderBodyText ? (pageRow.readingFieldText ?? ' ') : ' ',
    layoutTemplate: layout,
    warnings: [],
  };
  const subjectPackage = deriveSubjectPackage(fauxManifest);

  // Strip the metadata header, then parse markdown → typed plain-text blocks.
  const bodyBlocks = policy.renderBodyText
    ? markdownToBlocks(stripReadingFieldMetadata(pageRow.readingFieldText ?? ''))
    : [];

  const dropCap =
    pageType === 'CHAPTER_OPENER' && bodyBlocks.length > 0
      ? (bodyBlocks.find((b) => b.type === 'paragraph')?.text.charAt(0).toUpperCase() ?? null) || null
      : null;
  const titleHierarchy =
    pageType === 'CHAPTER_OPENER'
      ? ['CHAPTER', toRoman(pageRow.chapterNumber), entryTitle.toUpperCase()]
      : pageType === 'TITLE_PAGE'
        ? [
            policy.title.name,
            policy.title.kicker,
            input.config.publishing.coverDescription,
            input.config.publishing.authors?.length
              ? input.config.publishing.authors.join(', ')
              : input.config.authorName,
            // Same series line as the cover — one source of truth so they can't drift.
            buildSeriesLine(input.config.publishing.series?.name, input.config.volume) ?? undefined,
          ].filter((x): x is string => Boolean(x))
        : pageType === 'INTRO_OPENER'
          ? [policy.title.name]
          : // Entry opener (INTERIOR = a body entry's first page): its section
            // title is the page's identity and renders in the title band. The
            // heading was stripped from the body at breakdown, so this does not
            // duplicate body text. Continuation/compacted pages stay titleless.
            pageType === 'INTERIOR'
            ? [entryTitle.toUpperCase()]
            : [];
  const pageTitle =
    pageType === 'CHAPTER_OPENER'
      ? {
          kicker: 'CHAPTER',
          number: toRoman(pageRow.chapterNumber),
          name: entryTitle.toUpperCase(),
        }
      : pageType === 'TITLE_PAGE' ||
          pageType === 'INTRO_OPENER' ||
          pageType === 'AUTHOR_PAGE' ||
          pageType === 'SERIES_PAGE' ||
          pageType === 'COPYRIGHT_PAGE' ||
          pageType === 'CONTENTS' ||
          // Glossary/Index now render their entries, so they also carry their
          // heading ("GLOSSARY" / "INDEX") from the role policy.
          pageType === 'GLOSSARY_ORNAMENT' ||
          pageType === 'INDEX_ORNAMENT'
        ? policy.title
        : pageType === 'INTERIOR'
          ? { kicker: '', number: '', name: entryTitle.toUpperCase() }
          : { kicker: '', number: '', name: '' };

  // Reference pages (glossary/index) use smaller, two-column reference type so
  // dense entries fit comfortably without overflowing — same serif family, just
  // a smaller point size and narrower per-column measure.
  const referenceType =
    layout === 'LAYOUT_REFERENCE'
      ? {
          bodyPt: REFERENCE_TYPOGRAPHY.bodyPt,
          bodyLineHeight: REFERENCE_TYPOGRAPHY.lineHeight,
          bodyMeasureChars: REFERENCE_TYPOGRAPHY.measureChars,
        }
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
    // F-8 — placement prose from the layout director. The Chapter 1 run
    // proved the blueprint alone is loosely followed (corner accents became
    // full-width bands); these strings put the placement in the prompt text.
    composition: {
      imagePlacement: input.allocation.imagePlacement,
      textPlacement: input.allocation.textPlacement,
    },
    readingFieldGeometry: rfGeometry,
    typographyDNA: {
      ...PAGE_TYPOGRAPHY_DNA,
      ...(referenceType ?? {}),
      // Drop-cap governance (SPEC_GEOMETRY_RECONCILIATION §3): the drop-cap
      // surround is authoritative on `dropCap`. When there is no drop-cap
      // (every interior/continuation page), emit NOTHING about it — otherwise
      // the model draws an illuminated initial on pages that should have none.
      decorativeInitial: dropCap ? PAGE_TYPOGRAPHY_DNA.decorativeInitial : null,
      // For non-chapter-openers we don't enforce a fixed title hierarchy.
      titleHierarchy,
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
      title: pageTitle,
      // Strip the manuscript metadata header (binomial + hazard markers), then
      // parse markdown into typed plain-text blocks — the model never sees a
      // markdown character (no `###`/`**` can bleed onto the page).
      body: blocksToPlainText(bodyBlocks),
      bodyBlocks,
      dropCap,
    },
    decorativeElements: buildDecorativeElements(pageType),
    badgeContext: input.badgeContext ?? { hazard: ['NONE'], region: 'GENERAL', source: 'GENERAL_REFERENCE' },
    // L-7.2 — the AI no longer gets safe-zone constraints. Composition is
    // free; print-prep stamps a small bottom-right cartouche over whatever
    // is rendered there. Empty array signals to every downstream consumer
    // (prompt assembler, blueprint painter, clip helper) that there are no
    // reserved rects on this page. See computeBadgeStackLayout() in
    // print-prep/badge-geometry.ts for the stamping placement.
    badgeSafeZones: [],
  };
}
