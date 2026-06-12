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

export function inferWholePageRole(row: PageRow, layoutTemplate: LayoutTemplateId): WholePageRole {
  const section = (row as { section?: string | null }).section ?? 'BODY';
  if (section !== 'BODY') {
    switch (frontMatterType(row)) {
      case 'HALF_TITLE':
      case 'TITLE_PAGE':
        return 'TITLE_PAGE';
      case 'INTRODUCTION':
        return 'INTRO_OPENER';
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
    case 'TITLE_PAGE':
    case 'AUTHOR_PAGE':
    case 'SERIES_PAGE':
    case 'GLOSSARY_ORNAMENT':
    case 'INDEX_ORNAMENT':
    case 'COPYRIGHT_PAGE':
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
  const title = resolvedTitle(config);
  const subtitle = resolvedSubtitle(config);
  const author = resolvedAuthor(config);

  switch (pageType) {
    case 'TITLE_PAGE':
      return {
        pageType,
        layoutTemplate,
        title: { kicker: subtitle, number: '', name: title.toUpperCase() },
        entryTitle: title,
        imageSubject: `Refined title-page ornament for ${title}${subtitle ? `, ${subtitle}` : ''}; author/imprint line: ${author}`,
        allowsEmptyBody: true,
        renderBodyText: false,
      };
    case 'INTRO_OPENER':
      return {
        pageType,
        layoutTemplate,
        title: { kicker: '', number: '', name: 'INTRODUCTION' },
        entryTitle: 'Introduction',
        imageSubject: 'Quiet threshold into New England wilderness: morning mist, spruce forest, granite stones, trail edge, distant mountains, river or lake light',
        allowsEmptyBody: false,
        renderBodyText: true,
      };
    case 'AUTHOR_PAGE':
      return {
        pageType,
        layoutTemplate,
        title: { kicker: '', number: '', name: 'ABOUT THE AUTHOR' },
        entryTitle: 'About the Author',
        imageSubject: 'Restrained naturalist author-page ornament: notebook, compass, pressed fern, pine sprig, New England field-journal atmosphere',
        allowsEmptyBody: false,
        renderBodyText: true,
      };
    case 'SERIES_PAGE': {
      // Same role + text-first layout, but Sources and Series are distinct
      // pages — only the subject + heading differ (production model). RESOURCES
      // = Sources / Further Reading (citations, trust); ABOUT_SERIES = the
      // series brand page.
      const isSources = frontMatterType(row) === 'RESOURCES';
      return {
        pageType,
        layoutTemplate,
        title: { kicker: '', number: '', name: isSources ? 'SOURCES & FURTHER READING' : 'THE WILD LANDS SERIES' },
        entryTitle: isSources ? 'Sources & Further Reading' : 'The Wild Lands Series',
        imageSubject: isSources
          ? 'Sources / further-reading page edge ornament only: thin engraved botanical corner details framing a calm citations/references text block; quiet and scholarly'
          : 'Wild Lands series-page ornament: field map, pine, granite, compass, aged parchment — brands the book as part of the series',
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
        imageSubject: 'Copyright-page edge ornament only: thin engraved botanical corner details framing a calm centered text block; quiet, restrained',
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
        imageSubject: 'Table-of-contents edge ornament only: thin engraved botanical corner details outside the contents listing and its page numbers',
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
    'ABOUT_AUTHOR',
    'ABOUT_SERIES',
    'RESOURCES',
    'GLOSSARY',
    'INDEX',
    'COPYRIGHT_PAGE',
    'CONTENTS',
  ].includes(frontMatterType(row));
}
