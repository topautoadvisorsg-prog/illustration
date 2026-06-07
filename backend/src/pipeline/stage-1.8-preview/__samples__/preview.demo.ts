/**
 * Demo / proof script — NOT a vitest test.
 *
 * Paginates a synthetic 2-entry book, then renders the Stage 1.8 preview PDF
 * for each printed page to `tmp/previews/`. Useful for eyeballing the layout
 * before wiring the frontend. Invoke with:
 *
 *   corepack yarn tsx src/pipeline/stage-1.8-preview/__samples__/preview.demo.ts
 *
 * Requires a Chromium executable resolvable via CHROMIUM_PATH or one of the
 * common system paths. The script prints which file each page was written to.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ProjectConfigSchema, type PageManifest } from '@wildlands/shared';
import { paginateProject } from '../../stage-1.75-pagination/paginate.js';
import { renderPreviewPdf } from '../render-preview.js';
import { isChromiumAvailable } from '../../stage-6-layout/render-pdf.js';

function makeEntry(o: Partial<PageManifest>): PageManifest {
  return {
    pageId: 'CH01_P000',
    projectId: 'demo',
    chapterNumber: 1,
    pageNumber: 0,
    entryTitle: 'demo',
    layoutTemplate: 'LAYOUT_1_STANDARD',
    imageSubject: 'demo',
    bodyMarkdown: 'demo',
    warnings: [],
    ...o,
  } as PageManifest;
}

async function main(): Promise<void> {
  if (!isChromiumAvailable()) {
    console.error('No Chromium executable found. Set CHROMIUM_PATH or install one.');
    process.exit(1);
  }

  const config = ProjectConfigSchema.parse({
    volume: 1,
    title: 'The Wildlands',
    authorName: 'Demo',
  });

  const longBody = Array.from({ length: 8 }, (_, i) =>
    `Paragraph ${i + 1}. ` + 'word '.repeat(60) + '.',
  ).join('\n\n');

  const entries: PageManifest[] = [
    makeEntry({
      pageId: 'CH01_P010',
      chapterNumber: 1,
      pageNumber: 10,
      entryTitle: 'Black Bear',
      contentType: 'ANIMAL_PROFILE',
      imageSubject: 'a black bear at the forest edge',
      bodyMarkdown: longBody,
    }),
    makeEntry({
      pageId: 'CH01_P011',
      chapterNumber: 1,
      pageNumber: 11,
      entryTitle: 'Red Squirrel',
      contentType: 'SPECIES_PROFILE',
      imageSubject: 'a red squirrel on a pine branch',
      bodyMarkdown: 'A short profile of the red squirrel in late autumn.',
    }),
  ];

  const result = paginateProject({ entries, config });
  console.log(`Paginated ${entries.length} entries into ${result.pages.length} printed pages.`);

  const outDir = path.resolve(process.cwd(), 'tmp/previews');
  await fs.mkdir(outDir, { recursive: true });

  for (const page of result.pages) {
    console.log(`Rendering ${page.pageKey} (page ${page.plannedPageNumber}, ${page.pageRole})...`);
    const { buffer, totalPages } = await renderPreviewPdf({ page, config });
    const out = path.join(outDir, `${page.pageKey}.pdf`);
    await fs.writeFile(out, buffer);
    console.log(`  wrote ${out} (${buffer.length} bytes, totalPages=${totalPages})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
