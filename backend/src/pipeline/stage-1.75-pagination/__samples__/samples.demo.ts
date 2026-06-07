/**
 * Demo / proof script — NOT a vitest test.
 *
 * Runs paginateProject() against three synthetic PAGE manifests (one long, one
 * short, one pair of short adjacent SPECIES_PROFILE entries that should compact)
 * and prints the full result so a human can eyeball the output without
 * spinning up the full backend. Invoke with:
 *
 *   corepack yarn tsx src/pipeline/stage-1.75-pagination/__samples__/samples.demo.ts
 *
 * Lives in `__samples__/` (not `__tests__/`) so vitest skips it AND so
 * contributors don't mistake it for a real test.
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

// Two very short adjacent species profiles — both should land on the same
// compacted page if soft-break and capacity allow.
const tinyA = 'Brief identification notes for the red squirrel.';
const tinyB = 'Brief identification notes for the gray squirrel.';

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
  makeEntry({
    pageId: 'CH01_P012',
    chapterNumber: 1,
    pageNumber: 12,
    entryTitle: 'Red Squirrel',
    contentType: 'SPECIES_PROFILE',
    imageSubject: 'a red squirrel on a pine branch',
    bodyMarkdown: tinyA,
  }),
  makeEntry({
    pageId: 'CH01_P013',
    chapterNumber: 1,
    pageNumber: 13,
    entryTitle: 'Gray Squirrel',
    contentType: 'SPECIES_PROFILE',
    imageSubject: 'a gray squirrel in oak woods',
    bodyMarkdown: tinyB,
  }),
];

const result = paginateProject({ entries, config });

function printPage(p: typeof result.pages[number], includeFullText = false): void {
  console.log({
    plannedPageNumber: p.plannedPageNumber,
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
    textSafeZoneCount: p.zones.textSafeZones.length,
    readingFieldText: includeFullText ? p.readingFieldText : p.readingFieldText.slice(0, 140) + '...',
  });
}

console.log('--- SAMPLE 1: long entry (Black Bear, ~1600 words) — continuation chain ---');
for (const p of result.pages.filter((p) => p.entryKey === 'CH01_P010' || p.compactedEntryKeys?.includes('CH01_P010'))) {
  printPage(p);
}

console.log('\n--- SAMPLE 2: short entry (White-tailed Deer, ~14 words) ---');
for (const p of result.pages.filter((p) => p.entryKey === 'CH01_P011' || p.compactedEntryKeys?.includes('CH01_P011'))) {
  printPage(p, true);
}

console.log('\n--- SAMPLE 3: compacted page (Red Squirrel + Gray Squirrel) ---');
for (const p of result.pages.filter((p) => p.compactedEntryKeys && p.compactedEntryKeys.includes('CH01_P012'))) {
  printPage(p, true);
}

console.log('\n--- ALL PAGES — planned page numbers ---');
for (const p of result.pages) {
  console.log(`  page ${p.plannedPageNumber}: ${p.pageKey} (${p.pageRole}) — ${p.entryTitle}`);
}

console.log('\n--- SUMMARY ---');
console.log(result.summary);
console.log('warnings:', result.warnings);
