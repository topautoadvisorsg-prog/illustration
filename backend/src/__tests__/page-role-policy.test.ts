import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';
import type { PageRow } from '../db/repositories/pagination.repo.js';
import {
  buildPageRolePolicy,
  isWholePageAiAllowedForRow,
  roleAllowsEmptyBody,
} from '../pipeline/experimental/whole-page-render/page-role-policy.js';

const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'The Wild Lands',
  subtitle: 'New England',
  authorName: 'The Wildlands',
});

function row(frontMatterType: string): PageRow {
  return {
    id: `00000000-0000-0000-0000-${frontMatterType.padEnd(12, '0').slice(0, 12)}`,
    projectId: '00000000-0000-0000-0000-000000000001',
    manifestId: null,
    pageKey: `FM_${frontMatterType}`,
    chapterNumber: 1,
    plannedPageNumber: 1,
    layoutTemplate: null,
    imagePrompt: null,
    imagePromptSha256: null,
    status: 'PLANNED',
    createdAt: new Date(),
    updatedAt: new Date(),
    entryKey: null,
    partN: null,
    totalParts: null,
    pageRole: 'opener',
    carriesSubject: false,
    compactedEntryKeys: null,
    readingFieldText: null,
    readingFieldChars: null,
    readingFieldWords: null,
    fitStatus: 'PENDING',
    previewApproved: false,
    previewApprovedAt: null,
    previewApprovedBy: null,
    section: 'FRONT_MATTER',
    frontMatterType,
    spineOrder: 1,
    pageLabel: null,
  } as unknown as PageRow;
}

describe('PageRole policy', () => {
  it('maps supported front/back matter rows into WholePageSpec roles', () => {
    expect(buildPageRolePolicy(row('TITLE_PAGE'), config).pageType).toBe('TITLE_PAGE');
    expect(buildPageRolePolicy(row('INTRODUCTION'), config).pageType).toBe('INTRO_OPENER');
    expect(buildPageRolePolicy(row('GLOSSARY'), config).pageType).toBe('GLOSSARY_ORNAMENT');
    expect(buildPageRolePolicy(row('INDEX'), config).pageType).toBe('INDEX_ORNAMENT');
  });

  it('allows text-free ornament generation for glossary and index roles', () => {
    expect(isWholePageAiAllowedForRow(row('GLOSSARY'))).toBe(true);
    expect(isWholePageAiAllowedForRow(row('INDEX'))).toBe(true);
    expect(roleAllowsEmptyBody('GLOSSARY_ORNAMENT')).toBe(true);
    expect(roleAllowsEmptyBody('INDEX_ORNAMENT')).toBe(true);
  });
});
