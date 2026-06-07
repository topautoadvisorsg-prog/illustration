/**
 * Demo / proof script — NOT a vitest test.
 *
 * Runs paginateProject() against two synthetic PAGE manifests and prints the
 * full result so a human (or this commit's checkpoint) can eyeball the output
 * without spinning up the full backend. Invoke with:
 *
 *   node --import tsx src/pipeline/stage-1.75-pagination/__tests__/samples.demo.ts
 *
 * Behind the PAGINATION_V1_ENABLED feature flag: this script imports the
 * orchestrator directly, so the flag is irrelevant for the demo.
 */

import { ProjectConfigSchema, type PageManifest } from '@wildlands/shared';
import { paginateProject } from '../paginate.js';

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

const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'The Wildlands',
  authorName: 'Demo',
});

const longBody = Array.from({ length: 20 }, (_, i) =>
  `Paragraph ${i + 1}. ` + 'word '.repeat(80) + '.',
).join('\n\n');

const shortBody = 'A short single paragraph about a black bear at the edge of the forest.';

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
    entryTitle: 'White-tailed Deer',
    contentType: 'ANIMAL_PROFILE',
    imageSubject: 'a white-tailed deer in spring',
    bodyMarkdown: shortBody,
  }),
];

const result = paginateProject({ entries, config });

console.log('--- SAMPLE 1: long entry (Black Bear, ~1600 words) ---');
const bearPages = result.pages.filter(
  (p) => p.entryKey === 'CH01_P010' || p.compactedEntryKeys?.includes('CH01_P010'),
);
for (const p of bearPages) {
  console.log({
    pageKey: p.pageKey,
    pageRole: p.pageRole,
    partN: p.partN,
    totalParts: p.totalParts,
    layoutTemplate: p.layoutTemplate,
    carriesSubject: p.carriesSubject,
    imageSubject: p.imageSubject,
    compactedEntryKeys: p.compactedEntryKeys,
    readingFieldChars: p.readingFieldChars,
    readingFieldWords: p.readingFieldWords,
    fitStatus: p.fitStatus,
    readingFieldTextPreview: p.readingFieldText.slice(0, 120) + '...',
  });
}

console.log('\n--- SAMPLE 2: short entry (White-tailed Deer, ~14 words) ---');
const deerPages = result.pages.filter(
  (p) => p.entryKey === 'CH01_P011' || p.compactedEntryKeys?.includes('CH01_P011'),
);
for (const p of deerPages) {
  console.log({
    pageKey: p.pageKey,
    pageRole: p.pageRole,
    partN: p.partN,
    totalParts: p.totalParts,
    layoutTemplate: p.layoutTemplate,
    carriesSubject: p.carriesSubject,
    imageSubject: p.imageSubject,
    compactedEntryKeys: p.compactedEntryKeys,
    readingFieldChars: p.readingFieldChars,
    readingFieldWords: p.readingFieldWords,
    fitStatus: p.fitStatus,
    readingFieldText: p.readingFieldText,
  });
}

console.log('\n--- SUMMARY ---');
console.log(result.summary);
console.log('warnings:', result.warnings);
