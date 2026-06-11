import type { LayoutTemplateId, ProjectConfig } from '@wildlands/shared';
import type { PageRow } from '../../../db/repositories/pagination.repo.js';
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
  const layoutTemplate = rowLayout ?? defaultLayoutForRole(pageType);
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
    case 'SERIES_PAGE':
      return {
        pageType,
        layoutTemplate,
        title: { kicker: '', number: '', name: frontMatterType(row).replace(/_/g, ' ') || 'SERIES' },
        entryTitle: frontMatterType(row).replace(/_/g, ' ') || 'Series',
        imageSubject: 'Restrained Wild Lands series/resource-page ornament: field map, pine, granite, compass, aged parchment',
        allowsEmptyBody: false,
        renderBodyText: true,
      };
    case 'GLOSSARY_ORNAMENT':
      return {
        pageType,
        layoutTemplate,
        title: { kicker: '', number: '', name: 'GLOSSARY' },
        entryTitle: 'Glossary',
        imageSubject: 'Glossary reference-page edge ornament only: pine needles, fern tips, acorns, tiny naturalist linework outside the two-column reading field',
        allowsEmptyBody: false,
        renderBodyText: false,
      };
    case 'INDEX_ORNAMENT':
      return {
        pageType,
        layoutTemplate,
        title: { kicker: '', number: '', name: 'INDEX' },
        entryTitle: 'Index',
        imageSubject: 'Index reference-page edge ornament only: restrained botanical corner details outside the index entries and page numbers',
        allowsEmptyBody: false,
        renderBodyText: false,
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
  ].includes(frontMatterType(row));
}
