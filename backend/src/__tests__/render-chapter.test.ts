import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { ProjectConfigSchema } from '@wildlands/shared';
import { buildChapterHtml, type ChapterPageRender } from '../pipeline/stage-6-layout/render-html.js';
import { computePageGeometry, PT_PER_INCH } from '../pipeline/stage-6-layout/page-geometry.js';
import { preflightBook, stitchPdfs } from '../pipeline/stage-7-pdf-compile/stitch-book.js';

// Pin trim to 8.5x11 so the hardcoded page-size constants/assertions below stay valid.
const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'The Wildlands',
  authorName: 'The Wildlands',
  trimSize: { widthIn: 8.5, heightIn: 11, bleedIn: 0.125 },
});
const geometry = computePageGeometry(config.trimSize);

const pages: ChapterPageRender[] = [
  { entryTitle: 'Chanterelle', scientificName: 'Cantharellus spp.', layoutTemplate: 'LAYOUT_1_STANDARD', bodyMarkdown: '### What it is\nGolden edible.' },
  { entryTitle: 'Death Cap', scientificName: 'Amanita phalloides', layoutTemplate: 'LAYOUT_4_DANGER_WARNING', bodyMarkdown: '### Warning\nDeadly poisonous.' },
];

describe('buildChapterHtml', () => {
  it('renders every page of the chapter in one document', () => {
    const html = buildChapterHtml(pages, config, { chapterNumber: 1, chapterTitle: 'Fungi' }, { geometry });
    expect((html.match(/class="book-page/g) || []).length).toBe(2);
    expect(html).toContain('Chanterelle');
    expect(html).toContain('Death Cap');
    expect(html).toContain('page-break-after: always');
  });

  it('tags each page with its architecture and flags danger pages', () => {
    const html = buildChapterHtml(pages, config, { chapterNumber: 1, chapterTitle: 'Fungi' }, { geometry });
    expect(html).toContain('arch-FLOAT_LEFT'); // LAYOUT_1 + LAYOUT_4 both float-left
    expect(html).toContain('is-danger'); // the Death Cap page
    expect(html).toContain('size: 8.625in 11.25in;');
  });

  it('paints full-page artwork when an image is supplied, a planning exclusion marker when not', () => {
    const withArt = buildChapterHtml(
      [{ ...pages[0]!, imageDataUri: 'data:image/png;base64,AAAA' }],
      config,
      { chapterNumber: 1, chapterTitle: 'Fungi' },
      { geometry },
    );
    // Image fills its bleed zone as a real <img>; text is separate (not on the image).
    expect(withArt).toContain('<img src="data:image/png;base64,AAAA"');
    expect(withArt).toContain('class="page-art"');
    const placeholder = buildChapterHtml([pages[0]!], config, { chapterNumber: 1, chapterTitle: 'Fungi' }, { geometry });
    expect(placeholder).toContain('IMAGE ZONE');
  });
});

// Build a single-page PDF of a given size for stitch/preflight tests.
async function makePdf(widthPt: number, heightPt: number, pageCount = 1): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([widthPt, heightPt]);
  return Buffer.from(await doc.save());
}

const W = (8.5 + 0.125) * PT_PER_INCH; // 621
const H = (11 + 0.125 * 2) * PT_PER_INCH; // 810

describe('stitchPdfs + preflightBook', () => {
  it('stitches chapter PDFs into one book in order', async () => {
    const a = await makePdf(W, H, 2);
    const b = await makePdf(W, H, 3);
    const { pdf, pageCount } = await stitchPdfs([a, b]);
    expect(pageCount).toBe(5);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('throws when there is nothing to stitch', async () => {
    await expect(stitchPdfs([])).rejects.toThrow(/No chapter PDFs/);
  });

  it('passes preflight when every page matches trim+bleed', async () => {
    const book = await makePdf(W, H, 4);
    const report = await preflightBook(book, config.trimSize, 4);
    expect(report.passed).toBe(true);
    expect(report.offSizePages).toHaveLength(0);
    expect(report.expectedPageWidthPt).toBe(621);
    expect(report.expectedPageHeightPt).toBe(810);
  });

  it('blocks preflight on a wrong-size page (KDP would reject)', async () => {
    const wrong = await makePdf(612, 792, 1); // US Letter, not the bleed page size
    const report = await preflightBook(wrong, config.trimSize);
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.code === 'page_size_mismatch')).toBe(true);
    expect(report.offSizePages).toContain(1);
  });

  it('warns (not blocks) on page-count drift from the manifest estimate', async () => {
    const book = await makePdf(W, H, 6);
    const report = await preflightBook(book, config.trimSize, 5);
    expect(report.passed).toBe(true);
    expect(report.issues.some((i) => i.code === 'page_count_drift' && i.severity === 'WARNING')).toBe(true);
  });
});
