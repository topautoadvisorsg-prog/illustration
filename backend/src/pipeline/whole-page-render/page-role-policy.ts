import type { LayoutTemplateId, ProjectConfig } from '@wildlands/shared';
import type { PageRow } from '../../db/repositories/pagination.repo.js';
import type { WholePageSpec } from './types.js';

export type WholePageRole = WholePageSpec['pageType'];

export interface PageRolePolicy {
  pageType: WholePageRole;
  layoutTemplate: LayoutTemplateId;
  title: { kicker: string; number: string; name: string };
  entryTitle: string;
  imageSubject: string;
  allowsEmptyBody: boolean;
  renderBodyText: boolean;
}

function resolvedTitle(config: ProjectConfig): string {
  return config.publishing.title ?? config.title;
}

function resolvedSubtitle(config: ProjectConfig): string {
  return config.publishing.subtitle ?? config.subtitle ?? '';
}

function resolvedAuthor(config: ProjectConfig): string {
  const authors = config.publishing.authors;
  return authors?.length ? authors.join(', ') : config.authorName;
}

function frontMatterType(row: PageRow): string {
  return ((row as { frontMatterType?: string | null }).frontMatterType ?? '').toUpperCase();
}

// The Introduction welcomes the reader into the WHOLE New England wilderness, so its
// continuation pages rotate through foundational ecosystem themes (one per page,
// distinct) rather than repeating a single forest texture. Indexed by the page's
// numeric key so each intro continuation gets its own theme deterministically.
const INTRO_FIELD_THEMES = [
  'a mature bull moose standing in a misty New England wetland at dawn — reeds, still dark water, spruce-lined shore',
  'an old-growth stand of towering white pine and red spruce, shafts of light through the high canopy, deep mossy forest floor',
  'a close naturalist study of native New England plants and fungi — ferns, mosses, trilliums, and woodland mushrooms on the forest floor',
  'New England mountain terrain and bare granite ridgelines under a wide sky, layered blue ridges receding into haze',
  'a New England river, lake, and beaver wetland alive with wildlife — a wading heron, still reflections, a spruce-and-birch shoreline',
  'seasonal New England wilderness atmosphere — autumn hardwoods giving way to the first snow, low transitional light through bare and evergreen trees',
];

function introContinuationSubject(row: PageRow, subtitle: string): string {
  const digits = row.pageKey.match(/(\d+)/);
  const n = digits ? Number.parseInt(digits[1]!, 10) : 0;
  const theme = INTRO_FIELD_THEMES[n % INTRO_FIELD_THEMES.length]!;
  return `Atmospheric Cinematic Naturalist FIELD framing the introduction reading text — ${theme}${
    subtitle ? `, in the ${subtitle} wilderness` : ''
  }. Painterly museum-quality vintage-naturalist illustration with rich but calm pigment, set into the page margins and behind the reading area as an enveloping environmental setting that draws the reader into the world of the book before Chapter 1. CRITICAL READABILITY: keep the central reading column clean, light, and high-contrast so the body text stays clearly legible at about 11pt — the illustration envelops and frames the text, it is NEVER a busy hero scene laid over the words. Match the weight and finish of the book's body continuation pages.`;
}

export function inferWholePageRole(row: PageRow, layoutTemplate: LayoutTemplateId): WholePageRole {
  const section = (row as { section?: string | null }).section ?? 'BODY';
  if (section !== 'BODY') {
    switch (frontMatterType(row)) {
      case 'HALF_TITLE':
      case 'TITLE_PAGE':
        return 'TITLE_PAGE';
      case 'INTRODUCTION':
        return 'INTRO_OPENER';
      // Introduction CONTINUATION pages (2..n) are text-first like a body
      // continuation — a subtle naturalist field behind the reading text, never
      // a hero plate. Only the first intro page (INTRODUCTION) is the plate.
      case 'INTRODUCTION_CONT':
        return 'CONTINUATION';
      case 'ABOUT_AUTHOR':
        return 'AUTHOR_PAGE';
      case 'ABOUT_SERIES':
      case 'RESOURCES':
        return 'SERIES_PAGE';
      case 'GLOSSARY':
        return 'GLOSSARY_ORNAMENT';
      case 'INDEX':
        return 'INDEX_ORNAMENT';
      case 'COPYRIGHT_PAGE':
        return 'COPYRIGHT_PAGE';
      case 'CONTENTS':
        return 'CONTENTS';
      default:
        return 'INTERIOR';
    }
  }

  if (row.pageRole === 'continuation') return 'CONTINUATION';
  if (row.pageRole === 'compacted') return 'COMPACTED';
  if (row.pageRole === 'opener' && layoutTemplate === 'LAYOUT_13_FEATURE_BANNER') {
    return 'CHAPTER_OPENER';
  }
  return 'INTERIOR';
}

export function defaultLayoutForRole(pageType: WholePageRole): LayoutTemplateId {
  switch (pageType) {
    // The title page is a display/ceremonial composition (short centered text,
    // big negative space) — the new LAYOUT_TITLE_DISPLAY, not the dense
    // reading-field LAYOUT_D used by glossary/index/copyright/contents.
    case 'TITLE_PAGE':
      return 'LAYOUT_TITLE_DISPLAY';
    // The copyright page is fine print, not a full reading page: a small block
    // anchored low on a calm illustrated field (LAYOUT_FINE_PRINT).
    case 'COPYRIGHT_PAGE':
      return 'LAYOUT_FINE_PRINT';
    // Glossary & Index are dense reference pages — two-column reference layout.
    case 'GLOSSARY_ORNAMENT':
    case 'INDEX_ORNAMENT':
      return 'LAYOUT_REFERENCE';
    case 'AUTHOR_PAGE':
    case 'SERIES_PAGE':
    case 'CONTENTS':
      return 'LAYOUT_D_PURE_TEXT';
    case 'INTRO_OPENER':
      return 'LAYOUT_5_CHAPTER_OPENER';
    case 'COVER_WRAP':
      return 'LAYOUT_A_ILLUSTRATION';
    default:
      return 'LAYOUT_1_STANDARD';
  }
}

export function roleAllowsEmptyBody(pageType: WholePageRole): boolean {
  return (
    pageType === 'COVER_WRAP' ||
    pageType === 'TITLE_PAGE' ||
    pageType === 'GLOSSARY_ORNAMENT' ||
    pageType === 'INDEX_ORNAMENT'
  );
}

export function roleRendersBodyText(pageType: WholePageRole): boolean {
  return pageType !== 'COVER_WRAP' && pageType !== 'GLOSSARY_ORNAMENT' && pageType !== 'INDEX_ORNAMENT';
}

export function buildPageRolePolicy(row: PageRow, config: ProjectConfig): PageRolePolicy {
  const rowLayout = row.layoutTemplate as LayoutTemplateId | null;
  const initialLayout = rowLayout ?? 'LAYOUT_1_STANDARD';
  const pageType = inferWholePageRole(row, initialLayout);
  let layoutTemplate = rowLayout ?? defaultLayoutForRole(pageType);
  // Layout Audit 1 §4 — a continuation page carries NO new subject, so it must
  // not reserve illustration area. Force it to the text-first pure-text layout
  // (large reading field + edge ornaments) regardless of the stored template,
  // which also retires the legacy LAYOUT_2_TEXT_HEAVY it used to inherit.
  if (pageType === 'CONTINUATION') layoutTemplate = 'LAYOUT_D_PURE_TEXT';
  // Copyright is fine print regardless of any layout stored on the row by an
  // earlier breakdown — force the low fine-print block layout.
  if (pageType === 'COPYRIGHT_PAGE') layoutTemplate = 'LAYOUT_FINE_PRINT';
  // Reference sections — Glossary, Index, and Sources (RESOURCES) — are dense
  // two-column reference pages, regardless of any single-column layout an
  // earlier breakdown stored on the row. Sources rides the SERIES_PAGE role
  // (shared with the About-the-Series page) but is reference, not prose.
  if (
    pageType === 'GLOSSARY_ORNAMENT' ||
    pageType === 'INDEX_ORNAMENT' ||
    (pageType === 'SERIES_PAGE' && frontMatterType(row) === 'RESOURCES')
  ) {
    layoutTemplate = 'LAYOUT_REFERENCE';
  }
  const title = resolvedTitle(config);
  const subtitle = resolvedSubtitle(config);
  const author = resolvedAuthor(config);

  // Introduction continuation page — a body-style text page with a SUBTLE
  // naturalist field behind the reading text (no entry meta exists for front
  // matter, so the subject is supplied here). Readability is the priority; the
  // illustration stays subdued so the reader never leaves the book's world.
  if (pageType === 'CONTINUATION' && frontMatterType(row) === 'INTRODUCTION_CONT') {
    return {
      pageType,
      layoutTemplate: 'LAYOUT_D_PURE_TEXT',
      title: { kicker: '', number: '', name: '' },
      entryTitle: 'Introduction',
      imageSubject: introContinuationSubject(row, subtitle),
      allowsEmptyBody: false,
      renderBodyText: true,
    };
  }

  switch (pageType) {
    case 'TITLE_PAGE': {
      // Half-title and the full title page share this role but are NOT the same
      // page. Half-title = a sparse, elegant naturalist VIGNETTE with the title
      // set small. Title page = a premium full-bleed CINEMATIC plate (same DNA
      // and world as the cover) with the full title block set into the scene.
      const isHalfTitle = frontMatterType(row) === 'HALF_TITLE';
      if (isHalfTitle) {
        return {
          pageType,
          // The half-title is NOT a title page — it is a full cinematic ENTRANCE
          // PLATE: the reader's first step into the wilderness before the formal
          // title page. No typography at all (empty title name → empty hierarchy →
          // nothing baked); the page is pure illustration.
          layoutTemplate: 'LAYOUT_A_ILLUSTRATION',
          title: { kicker: '', number: '', name: '' },
          entryTitle: title,
          imageSubject: `Full-bleed cinematic naturalist ENTRANCE PLATE — the reader's first step into the New England wilderness, before the title page. A complete, immersive scene in the book's Cinematic Naturalist DNA: New England boreal forest atmosphere, ancient white pine and spruce, ferns, moss, and fungi across the forest floor, subtle animal tracks or other signs of wildlife, atmospheric mist and natural light, museum-quality field-guide realism${subtitle ? ` of the ${subtitle} wilderness` : ''}. NO text, NO title, NO labels, NO typography anywhere on the page — pure illustration only. A distinct scene from the title page, not a repeat.`,
          allowsEmptyBody: true,
          renderBodyText: false,
        };
      }
      return {
        pageType,
        layoutTemplate: 'LAYOUT_A_ILLUSTRATION',
        title: { kicker: subtitle, number: '', name: title.toUpperCase() },
        entryTitle: title,
        imageSubject: `Premium full-page CINEMATIC title illustration: an atmospheric establishing wilderness scene${subtitle ? ` evoking ${subtitle}` : ''} — the same painterly naturalist world as the cover — with the title block set cleanly into a calm area of the scene. The reader is entering the wilderness before Chapter 1.`,
        allowsEmptyBody: true,
        renderBodyText: false,
      };
    }
    case 'INTRO_OPENER':
      return {
        pageType,
        layoutTemplate,
        title: { kicker: '', number: '', name: 'INTRODUCTION' },
        entryTitle: 'Introduction',
        // Region is data-driven from the book's subtitle/region — never hardcoded.
        imageSubject: `Quiet threshold into the wilderness${subtitle ? ` of ${subtitle}` : ''}: morning mist, forest, rock and trail edge, distant mountains, river or lake light`,
        allowsEmptyBody: false,
        renderBodyText: true,
      };
    case 'AUTHOR_PAGE':
      return {
        pageType,
        layoutTemplate,
        title: { kicker: '', number: '', name: 'ABOUT THE AUTHOR' },
        entryTitle: 'About the Author',
        imageSubject: `Restrained naturalist author-page ornament: notebook, compass, pressed fern, field-journal atmosphere${subtitle ? ` evoking ${subtitle}` : ''}`,
        allowsEmptyBody: false,
        renderBodyText: true,
      };
    case 'SERIES_PAGE': {
      // Same role + text-first layout, but Sources and Series are distinct
      // pages — only the subject + heading differ (production model). RESOURCES
      // = Sources / Further Reading (citations, trust); ABOUT_SERIES = the
      // series brand page.
      const isSources = frontMatterType(row) === 'RESOURCES';
      // Data-driven series page — heading comes from the project's series field,
      // never a hardcoded brand. (RESOURCES rides this role but is Sources copy.)
      const seriesName = (config.publishing.series?.name ?? '').trim();
      // The operator enters the full series name (e.g. "THE WILDLANDS SERIES");
      // use it verbatim as the heading — never append/prepend brand words.
      const seriesHeading = seriesName ? seriesName.toUpperCase() : 'ABOUT THE SERIES';
      return {
        pageType,
        layoutTemplate,
        title: { kicker: '', number: '', name: isSources ? 'SOURCES & FURTHER READING' : seriesHeading },
        entryTitle: isSources ? 'Sources & Further Reading' : (seriesName || 'About the Series'),
        imageSubject: isSources
          ? 'Sources / further-reading page edge ornament only: thin engraved corner details framing a calm citations/references text block; quiet and scholarly'
          : 'Atmospheric Cinematic Naturalist FIELD framing the About-the-Series text — a quiet emblematic New England wilderness vignette (distant layered ridgelines, spruce and white pine, ferns and a calm naturalist motif) enveloping the page margins and background as a premium series brand page that ties the volume to the wider series. CRITICAL READABILITY: keep the central reading column clean, light, and high-contrast so the series text stays clearly legible at about 11pt — the illustration envelops and frames the text, never a busy hero scene over it. Match the weight and finish of the book\'s introduction continuation pages — never a plain text placeholder.',
        allowsEmptyBody: false,
        renderBodyText: true,
      };
    }
    case 'GLOSSARY_ORNAMENT':
      return {
        pageType,
        layoutTemplate,
        title: { kicker: '', number: '', name: 'GLOSSARY' },
        entryTitle: 'Glossary',
        imageSubject: 'Glossary reference-page edge ornament only: pine needles, fern tips, acorns, tiny naturalist linework framing the two-column glossary entries',
        allowsEmptyBody: false,
        renderBodyText: true,
      };
    case 'INDEX_ORNAMENT':
      return {
        pageType,
        layoutTemplate,
        title: { kicker: '', number: '', name: 'INDEX' },
        entryTitle: 'Index',
        imageSubject: 'Index reference-page edge ornament only: restrained botanical corner details framing the index entries and page numbers',
        allowsEmptyBody: false,
        renderBodyText: true,
      };
    case 'COPYRIGHT_PAGE':
      // Text-first page: the AI renders the copyright text (from readingFieldText)
      // with only small edge ornaments. NOTE: exact tokens (ISBN) are AI-rendered
      // here per operator decision — watch for mangling in the render test.
      return {
        pageType,
        layoutTemplate,
        title: { kicker: '', number: '', name: '' },
        entryTitle: 'Copyright',
        imageSubject: 'Subtle full-page illustrated field for a copyright/edition-notice page — calm low-contrast parchment with faint botanical atmosphere and naturalist texture — framed by thin engraved edge ornaments, with a small quiet fine-print block low on the page; restrained and atmospheric',
        allowsEmptyBody: false,
        renderBodyText: true,
      };
    case 'CONTENTS':
      // Text-first table of contents rendered by the AI. NOTE: page numbers are
      // AI-rendered per operator decision — verify them in the render test.
      return {
        pageType,
        layoutTemplate,
        title: { kicker: '', number: '', name: 'CONTENTS' },
        entryTitle: 'Contents',
        imageSubject: 'Table of contents with a subtle decorative wilderness header across the top — a quiet naturalist band (a low distant ridgeline, pines, or a botanical motif) above the listing — and thin engraved edge ornaments; the chapter titles and their page numbers stay clearly legible in a calm reading field below the header. Readability first.',
        allowsEmptyBody: false,
        renderBodyText: true,
      };
    default:
      return {
        pageType,
        layoutTemplate,
        title: { kicker: '', number: '', name: '' },
        entryTitle: row.pageKey,
        imageSubject: row.pageKey,
        allowsEmptyBody: roleAllowsEmptyBody(pageType),
        renderBodyText: roleRendersBodyText(pageType),
      };
  }
}

export function isWholePageAiAllowedForRow(row: PageRow): boolean {
  const section = (row as { section?: string | null }).section ?? 'BODY';
  if (section === 'BODY') return true;
  return [
    'HALF_TITLE',
    'TITLE_PAGE',
    'INTRODUCTION',
    'INTRODUCTION_CONT',
    'ABOUT_AUTHOR',
    'ABOUT_SERIES',
    'RESOURCES',
    'GLOSSARY',
    'INDEX',
    'COPYRIGHT_PAGE',
    'CONTENTS',
  ].includes(frontMatterType(row));
}
