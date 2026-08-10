/**
 * Assembly of a TYPESET book (Track B).
 *
 * The regression these cover: assembleBook consumed approved raster page
 * renders unconditionally, so a finished typeset book — one PDF, no page rows —
 * was blocked for "missing" every page of a book that was complete. The other
 * half is that the finished PDF must reach storage BYTE FOR BYTE; re-encoding
 * it would destroy the live text, the embedded fonts and the stamped art.
 *
 * No DB, no network, no spend: the typesetter and the storage layer are stubbed.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const project = { id: 'p1', config: {} as Record<string, unknown> };
const written: { path: string[]; bytes: Buffer }[] = [];
const exportRows: Record<string, unknown>[] = [];

let profileTrack = 'typeset';
let interior = {
  pdf: Buffer.from('%PDF-1.7 finished typeset interior'),
  pageCount: 154,
  report: { verticalOverflowPages: [] as number[] },
  stampedIllustrations: [{ blockId: 'b1', page: 152 }],
  orphanedIllustrations: [] as { blockId: string; reason: string }[],
};

vi.mock('../db/repositories/projects.repo.js', () => ({
  getProject: vi.fn(async () => project),
}));
vi.mock('../db/repositories/pagination.repo.js', () => ({
  // A typeset book genuinely has none. If assembly ever reads these again for a
  // typeset book, the empty result is what used to block the export.
  listPaginatedPagesForProject: vi.fn(async () => []),
}));
vi.mock('../db/repositories/whole-page-render.repo.js', () => ({
  listBookReadyRenders: vi.fn(async () => []),
}));
vi.mock('../db/repositories/exports.repo.js', () => ({
  recordExport: vi.fn(async (row: Record<string, unknown>) => { exportRows.push(row); }),
}));
vi.mock('../services/storage/project-storage.js', () => ({
  getProjectStorage: () => ({
    writeProjectFile: async (_id: string, path: string[], bytes: Buffer) => {
      written.push({ path, bytes });
      return { relativePath: path.join('/') };
    },
    readProjectFile: async () => Buffer.alloc(0),
  }),
}));
vi.mock('../pipeline/production-profiles/registry.js', () => ({
  getProductionProfile: () => ({ id: 'bw-educational-nonfiction', bodyRenderTrack: profileTrack }),
}));
vi.mock('../pipeline/typeset/build-typeset-interior.js', () => ({
  buildTypesetInterior: vi.fn(async () => interior),
  TypesetInputMissingError: class extends Error {},
}));

const { assembleBook } = await import('../pipeline/book-assembly/assemble-book.js');

const baseConfig = {
  volume: 1,
  title: 'NO ONE TOLD ME THAT',
  authorName: 'Nolan Whitlow',
  trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
  productionProfileId: 'bw-educational-nonfiction',
};

beforeEach(() => {
  written.length = 0;
  exportRows.length = 0;
  profileTrack = 'typeset';
  project.config = { ...baseConfig };
  interior = {
    pdf: Buffer.from('%PDF-1.7 finished typeset interior'),
    pageCount: 154,
    report: { verticalOverflowPages: [] },
    stampedIllustrations: [{ blockId: 'b1', page: 152 }],
    orphanedIllustrations: [],
  };
});

describe('assembleBook — typeset track', () => {
  it('exports a finished typeset book that has no page rows at all', async () => {
    const report = await assembleBook('p1');

    expect(report.blocked).toBe(false);
    expect(report.finalPageCount).toBe(154);
    expect(report.assembledPages).toBe(154);
    expect(report.frontMatter).toBe('included');
    expect(report.interiorPdfPath).toBeTruthy();
    expect(exportRows[0]?.status).toBe('READY');
  });

  it('stores the typesetter PDF byte for byte', async () => {
    await assembleBook('p1');
    expect(written).toHaveLength(1);
    expect(written[0]?.bytes.equals(interior.pdf)).toBe(true);
  });

  it('blocks on vertical overflow rather than shipping a clipped page', async () => {
    interior.report.verticalOverflowPages = [88];
    const report = await assembleBook('p1');

    expect(report.blocked).toBe(true);
    expect(report.interiorPdfPath).toBeNull();
    expect(report.missing.join(' ')).toContain('88');
    expect(written).toHaveLength(0);
    expect(exportRows[0]?.status).toBe('FAILED');
  });

  it('blocks on an illustration that could not be placed', async () => {
    interior.orphanedIllustrations = [{ blockId: 'b9', reason: 'anchor block is not in this render' }];
    const report = await assembleBook('p1');

    expect(report.blocked).toBe(true);
    expect(report.missing.join(' ')).toContain('b9');
  });

  it('blocks when the cover was built for a different page count', async () => {
    project.config = {
      ...baseConfig,
      publishing: {
        coverAssetPath: 'covers/wrap.png',
        coverSync: {
          builtForPageCount: 163,
          generatedAt: '2026-08-01T00:00:00.000Z',
          spineIn: 0.408,
        },
      },
    };
    const report = await assembleBook('p1');

    expect(report.coverStale).toBe(true);
    expect(report.blocked).toBe(true);
    expect(report.warnings.join(' ')).toMatch(/out of date/i);
  });

  it('leaves the rendered-page track on its original path', async () => {
    profileTrack = 'ai-whole-page';
    const report = await assembleBook('p1');

    // No page rows and no renders — the page-render assembler's own verdict,
    // not the typeset one. Proves the branch is chosen by track, not by data.
    expect(report.expectedPages).toBe(0);
    expect(report.frontMatter).toBe('absent');
  });
});
