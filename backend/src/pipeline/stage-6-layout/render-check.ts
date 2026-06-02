/**
 * Stage 6 — production render smoke test.
 *
 * What it does: renders a single hardcoded sample page to a real PDF via
 * Puppeteer + Paged.js, with placeholder art and no DB dependency. This is the
 * fastest way to confirm Chromium + Paged.js actually work on the deployed host
 * and to produce a first visible PDF.
 */

import { ProjectConfigSchema, type PageManifest } from '@wildlands/shared';
import { computePageGeometry } from './page-geometry.js';
import { buildPageHtml, buildChapterHtml, type ChapterPageRender } from './render-html.js';
import { isChromiumAvailable, loadPagedPolyfill, renderHtmlToPdf } from './render-pdf.js';

const SAMPLE_PAGE: PageManifest = {
  pageId: 'CH01_P001',
  chapterNumber: 1,
  pageNumber: 1,
  entryTitle: 'Chanterelle',
  scientificName: 'Cantharellus spp.',
  category: 'EDIBLE',
  layoutTemplate: 'LAYOUT_1_STANDARD',
  imageSubject: 'golden chanterelle mushroom',
  bodyMarkdown: [
    '### What it is',
    'One of the most prized edible wild mushrooms in the world — a mycorrhizal species that forms symbiotic relationships with oak, hemlock, and birch.',
    '',
    '### How to identify',
    '- **Cap:** 1–5 inches, golden to deep egg-yolk yellow, wavy lobed margin.',
    '- **Stem:** solid, tapering downward, same color as the cap.',
    '- **False gills:** blunt, shallow, forking ridges that run down the stem.',
    '- **Smell:** distinctly fruity — apricot is the classic comparison.',
    '',
    '### Where & when',
    'Mid-summer through early fall, after a soaking rain, in mixed hardwood forests on mossy ground.',
  ].join('\n'),
  warnings: [],
};

export { isChromiumAvailable };

export interface RenderCheckResult {
  pdf: Buffer;
  totalPages: number;
  bytes: number;
}

export async function renderSamplePagePdf(): Promise<RenderCheckResult> {
  const config = ProjectConfigSchema.parse({ volume: 1, title: 'The Wildlands', authorName: 'The Wildlands' });
  const geometry = computePageGeometry(config.trimSize);
  const polyfillJs = await loadPagedPolyfill();
  const html = buildPageHtml(SAMPLE_PAGE, config, {
    geometry,
    polyfillJs,
    chapterLabel: 'CHAPTER 1 — SAMPLE',
  });
  const { buffer, totalPages } = await renderHtmlToPdf(html, geometry);
  return { pdf: buffer, totalPages, bytes: buffer.byteLength };
}

const SAMPLE_CHAPTER: ChapterPageRender[] = [
  {
    entryTitle: 'Chanterelle',
    scientificName: 'Cantharellus spp.',
    layoutTemplate: 'LAYOUT_1_STANDARD',
    bodyMarkdown: SAMPLE_PAGE.bodyMarkdown,
  },
  {
    entryTitle: 'Chanterelle vs Jack-o-Lantern',
    scientificName: 'Omphalotus illudens',
    layoutTemplate: 'LAYOUT_4_DANGER_WARNING',
    bodyMarkdown:
      '### Telling them apart\nThe edible chanterelle has blunt false-gill ridges; the toxic jack-o-lantern has true, knife-thin gills.\n\n### Key differences\n- **False gills vs true gills** — the single most reliable check.\n- **Habit:** chanterelles grow from soil; jack-o-lanterns grow in clusters on wood.',
  },
  {
    entryTitle: 'Oak',
    scientificName: 'Quercus spp.',
    layoutTemplate: 'LAYOUT_14_SIDEBAR_FEATURE',
    bodyMarkdown:
      '### What it is\nA keystone hardwood of the eastern forest, supporting hundreds of species.\n\n### How to identify\n- **Leaves:** lobed, alternate.\n- **Bark:** deeply ridged with age.\n- **Acorns:** the definitive feature.',
  },
];

/** Render a multi-page SAMPLE chapter (no DB) — proves chapter pagination in prod. */
export async function renderSampleChapterPdf(): Promise<RenderCheckResult> {
  const config = ProjectConfigSchema.parse({ volume: 1, title: 'The Wildlands', authorName: 'The Wildlands' });
  const geometry = computePageGeometry(config.trimSize);
  const polyfillJs = await loadPagedPolyfill();
  const html = buildChapterHtml(
    SAMPLE_CHAPTER,
    config,
    { chapterNumber: 1, chapterTitle: 'Forest Floor (Sample)' },
    { geometry, polyfillJs },
  );
  const { buffer, totalPages } = await renderHtmlToPdf(html, geometry);
  return { pdf: buffer, totalPages, bytes: buffer.byteLength };
}
