import fs from 'node:fs';
import path from 'node:path';
import { assertUsableManuscriptOutline, parseManuscriptOutline } from '../src/pipeline/stage-1-ingestion/parse-manuscript-outline.js';

const manuscriptPath = process.argv[2];

if (!manuscriptPath) {
  console.error('Usage: yarn workspace @wildlands/backend audit:manuscript <path-to-manuscript.md>');
  process.exit(2);
}

const absolutePath = path.resolve(manuscriptPath);
const markdown = fs.readFileSync(absolutePath, 'utf8');
const outline = parseManuscriptOutline(markdown);

assertUsableManuscriptOutline(outline);

const duplicateChapterNumbers = new Map<number, number>();
for (const chapter of outline.chapters) {
  duplicateChapterNumbers.set(chapter.chapterNumber, (duplicateChapterNumbers.get(chapter.chapterNumber) ?? 0) + 1);
}

const duplicateEntries = outline.chapters.flatMap((chapter) => {
  const seen = new Map<string, number>();
  for (const entry of chapter.entries) {
    seen.set(entry.slug, (seen.get(entry.slug) ?? 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([slug, count]) => ({ chapter: chapter.chapterNumber, slug, count }));
});

const veryShortEntries = outline.chapters.flatMap((chapter) =>
  chapter.entries
    .filter((entry) => entry.wordCount < 40)
    .map((entry) => ({ chapter: chapter.chapterNumber, title: entry.title, words: entry.wordCount, line: entry.lineStart })),
);

const report = {
  manuscriptPath: absolutePath,
  chapters: outline.chapters.length,
  entries: outline.totalEntries,
  words: outline.totalWords,
  warnings: outline.warnings,
  duplicateChapterNumbers: [...duplicateChapterNumbers.entries()]
    .filter(([, count]) => count > 1)
    .map(([chapterNumber, count]) => ({ chapterNumber, count })),
  duplicateEntries,
  veryShortEntries,
  chapterSummary: outline.chapters.map((chapter) => ({
    chapterNumber: chapter.chapterNumber,
    title: chapter.title,
    entries: chapter.entries.length,
    words: chapter.entries.reduce((sum, entry) => sum + entry.wordCount, 0),
    firstEntries: chapter.entries.slice(0, 8).map((entry) => entry.title),
  })),
};

console.log(JSON.stringify(report, null, 2));

if (outline.warnings.length > 0 || report.duplicateChapterNumbers.length > 0 || duplicateEntries.length > 0) {
  process.exit(1);
}
