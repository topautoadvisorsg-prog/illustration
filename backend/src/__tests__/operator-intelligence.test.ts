import { describe, expect, it } from 'vitest';
import type { ChapterManifest, PageManifest, ProjectConfig } from '@wildlands/shared';
import type { ProjectImageLibraryRow } from '../db/repositories/images.repo.js';
import type { PageRow } from '../db/repositories/manifests.repo.js';
import { evaluateChapterIntelligence } from '../services/operator-intelligence/operator-intelligence.js';
import { buildServer } from '../server.js';

const chapter: ChapterManifest = {
  chapterNumber: 1,
  chapterTitle: 'The Bones of the Land',
  pageKeys: ['CH01_P001', 'CH01_P002'],
};

const pageManifests: PageManifest[] = [
  {
    pageId: 'CH01_P001',
    chapterNumber: 1,
    pageNumber: 1,
    entryTitle: 'The Bones of the Land',
    layoutTemplate: 'LAYOUT_1_STANDARD',
    imageSubject: 'granite outcrop',
    bodyMarkdown: 'Page body.',
    warnings: [],
  },
  {
    pageId: 'CH01_P002',
    chapterNumber: 1,
    pageNumber: 2,
    entryTitle: 'Glacial Erratics',
    layoutTemplate: 'LAYOUT_1_STANDARD',
    imageSubject: 'boulder field',
    bodyMarkdown: 'Page body.',
    warnings: [],
  },
];

function pageRow(pageKey: string, overrides: Partial<PageRow> = {}): PageRow {
  return {
    id: `${pageKey}-row`,
    projectId: 'project-id',
    manifestId: `${pageKey}-manifest`,
    pageKey,
    chapterNumber: 1,
    plannedPageNumber: Number(pageKey.slice(-3)),
    layoutTemplate: 'LAYOUT_1_STANDARD',
    imagePrompt: `Prompt for ${pageKey}`,
    imagePromptSha256: `hash-${pageKey}`,
    status: 'PLANNED',
    createdAt: new Date('2026-06-03T00:00:00.000Z'),
    updatedAt: new Date('2026-06-03T00:00:00.000Z'),
    ...overrides,
  } as PageRow;
}

function imageRow(page: PageRow, status: ProjectImageLibraryRow['image']['status']): ProjectImageLibraryRow {
  return {
    image: {
      id: `${page.pageKey}-image`,
      pageId: page.id,
      version: 1,
      prompt: `Prompt for ${page.pageKey}`,
      promptSha256: `hash-${page.pageKey}`,
      generatedPath: `images/${page.pageKey}.png`,
      upscaledPath: null,
      dpiW: null,
      dpiH: null,
      widthPx: 1024,
      heightPx: 1024,
      active: true,
      status,
      createdAt: new Date('2026-06-03T00:00:00.000Z'),
      updatedAt: new Date('2026-06-03T00:00:00.000Z'),
    },
    page: {
      id: page.id,
      pageKey: page.pageKey,
      chapterNumber: page.chapterNumber,
      plannedPageNumber: page.plannedPageNumber,
      layoutTemplate: page.layoutTemplate,
      status: page.status,
      imagePromptSha256: page.imagePromptSha256,
    },
    manifestContent: {},
  };
}

const layoutApproval: ProjectConfig['layoutApprovals'][string] = {
  status: 'APPROVED',
  chapterNumber: 1,
  approvedAt: '2026-06-03T00:00:00.000Z',
  approvedBy: 'operator',
  pageKeys: ['CH01_P001', 'CH01_P002'],
  promptSha256ByPage: {
    CH01_P001: 'hash-CH01_P001',
    CH01_P002: 'hash-CH01_P002',
  },
  textFitSummary: {
    pages: 2,
    fits: 2,
    tight: 0,
    overflow: 0,
    underfilled: 0,
  },
};

describe('Operator Intelligence chapter evaluator', () => {
  it('blocks image spend when the layout gate is not approved', () => {
    const result = evaluateChapterIntelligence({
      chapter,
      pageManifests,
      pageRows: [pageRow('CH01_P001'), pageRow('CH01_P002')],
      imageRows: [],
      textFitPersisted: false,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.nextAction).toContain('approve the chapter layout');
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'BLOCKER',
          category: 'LAYOUT',
          scope: 'CHAPTER',
        }),
      ]),
    );
  });

  it('surfaces page-level image review work after layout approval', () => {
    const first = pageRow('CH01_P001');
    const second = pageRow('CH01_P002');
    const result = evaluateChapterIntelligence({
      chapter,
      pageManifests,
      pageRows: [first, second],
      imageRows: [imageRow(first, 'REVIEW')],
      layoutApproval,
      textFitPersisted: true,
    });

    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.summary).toMatchObject({
      pages: 2,
      layoutApproved: true,
      pagesWithImages: 1,
      pagesWithApprovedImages: 0,
      missingImages: 1,
      unapprovedImages: 1,
    });
    expect(result.findings.map((finding) => finding.pageKey)).toContain('CH01_P002');
    expect(result.findings.some((finding) => finding.category === 'TEXT_FIT')).toBe(false);
  });

  it('registers the project chapter intelligence route without database access at boot', async () => {
    const app = await buildServer();
    try {
      expect(
        app.hasRoute({
          method: 'GET',
          url: '/api/projects/:id/chapters/:chapterNumber/operator-intelligence',
        }),
      ).toBe(true);
    } finally {
      await app.close();
    }
  });
});
