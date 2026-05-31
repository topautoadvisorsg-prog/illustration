/**
 * Deterministic manuscript outline parser.
 *
 * What it does: scans Markdown headings locally before any LLM call so the
 * pipeline has stable chapter/entry IDs, word counts, source lines, and
 * structural warnings.
 * Input: raw Markdown manuscript.
 * Output: parsed outline used for validation and Stage 2 planning signals.
 */

export interface ManuscriptSectionOutline {
  title: string;
  lineStart: number;
}

export interface ManuscriptEntryOutline {
  title: string;
  slug: string;
  lineStart: number;
  lineEnd: number;
  startOffset: number;
  endOffset: number;
  wordCount: number;
  bodyMarkdown: string;
  sections: ManuscriptSectionOutline[];
}

export interface ManuscriptChapterOutline {
  chapterNumber: number;
  title: string;
  slug: string;
  lineStart: number;
  lineEnd: number;
  entries: ManuscriptEntryOutline[];
}

export interface ManuscriptOutline {
  chapters: ManuscriptChapterOutline[];
  totalEntries: number;
  totalWords: number;
  warnings: string[];
}

interface Heading {
  level: number;
  title: string;
  line: number;
  offset: number;
}

export interface GeneratedOutlineEntry {
  entryTitle: string;
}

export interface GeneratedOutlineChapter {
  chapterNumber: number;
  chapterTitle: string;
  entries: GeneratedOutlineEntry[];
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'untitled';
}

function countWords(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/[#>*_~|`-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function parseChapterNumber(title: string, fallback: number): number {
  const match = title.match(/\bchapter\s+(\d+)\b/i) ?? title.match(/^(\d+)\b/);
  return match ? Number(match[1]) : fallback;
}

function collectHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  let offset = 0;
  let inFence = false;
  const lines = markdown.split(/\n/);

  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      offset += line.length + 1;
      return;
    }

    if (inFence) {
      offset += line.length + 1;
      return;
    }

    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (match) {
      const marker = match[1];
      const title = match[2];
      if (!marker || !title) return;
      headings.push({
        level: marker.length,
        title: title.trim(),
        line: index + 1,
        offset,
      });
    }
    offset += line.length + 1;
  });

  return headings;
}

export function parseManuscriptOutline(markdown: string): ManuscriptOutline {
  const headings = collectHeadings(markdown);
  const warnings: string[] = [];
  const chapterHeadings = headings.filter((heading) => heading.level === 1);
  const chapters: ManuscriptChapterOutline[] = [];

  if (chapterHeadings.length === 0) {
    warnings.push('NO_CHAPTERS_DETECTED: expected at least one level-1 chapter heading.');
  }

  headings
    .filter((heading) => heading.level > 3)
    .forEach((heading) => {
      warnings.push(`DEEP_HEADING_IGNORED: line ${heading.line} uses h${heading.level} (${heading.title}).`);
    });

  chapterHeadings.forEach((chapterHeading, chapterIndex) => {
    const nextChapter = chapterHeadings[chapterIndex + 1];
    const chapterEndOffset = nextChapter ? nextChapter.offset - 1 : markdown.length;
    const chapterEndLine = nextChapter ? nextChapter.line - 1 : markdown.split(/\n/).length;
    const chapterNumber = parseChapterNumber(chapterHeading.title, chapterIndex + 1);
    const chapterScopedHeadings = headings.filter(
      (heading) => heading.offset > chapterHeading.offset && heading.offset < chapterEndOffset,
    );
    const entryHeadings = chapterScopedHeadings.filter((heading) => heading.level === 2);

    if (entryHeadings.length === 0) {
      warnings.push(`CHAPTER_WITHOUT_ENTRIES: chapter ${chapterNumber} has no level-2 entries.`);
    }

    const entries = entryHeadings.map((entryHeading, entryIndex): ManuscriptEntryOutline => {
      const nextEntry = entryHeadings[entryIndex + 1];
      const entryEndOffset = nextEntry ? nextEntry.offset - 1 : chapterEndOffset;
      const entryEndLine = nextEntry ? nextEntry.line - 1 : chapterEndLine;
      const entryHeadingLine = markdown.slice(entryHeading.offset).split('\n', 1)[0] ?? '';
      const bodyStart = entryHeading.offset + entryHeadingLine.length + 1;
      const bodyMarkdown = markdown.slice(bodyStart, entryEndOffset).trim();
      const sections = chapterScopedHeadings
        .filter((heading) => heading.level === 3 && heading.offset > entryHeading.offset && heading.offset < entryEndOffset)
        .map((heading) => ({ title: heading.title, lineStart: heading.line }));

      if (!bodyMarkdown) {
        warnings.push(`EMPTY_ENTRY_BODY: ${entryHeading.title} at line ${entryHeading.line} has no body text.`);
      }

      return {
        title: entryHeading.title,
        slug: slugify(entryHeading.title),
        lineStart: entryHeading.line,
        lineEnd: entryEndLine,
        startOffset: entryHeading.offset,
        endOffset: entryEndOffset,
        wordCount: countWords(bodyMarkdown),
        bodyMarkdown,
        sections,
      };
    });

    chapters.push({
      chapterNumber,
      title: chapterHeading.title,
      slug: slugify(chapterHeading.title),
      lineStart: chapterHeading.line,
      lineEnd: chapterEndLine,
      entries,
    });
  });

  const allEntries = chapters.flatMap((chapter) => chapter.entries);
  return {
    chapters,
    totalEntries: allEntries.length,
    totalWords: allEntries.reduce((sum, entry) => sum + entry.wordCount, 0),
    warnings,
  };
}

export function assertUsableManuscriptOutline(outline: ManuscriptOutline): void {
  if (outline.chapters.length === 0) {
    throw new Error('NO_CHAPTERS_DETECTED: manuscript must include at least one # chapter heading.');
  }
  if (outline.totalEntries === 0) {
    throw new Error('NO_ENTRIES_DETECTED: manuscript must include at least one ## entry heading.');
  }
}

function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function validateGeneratedChaptersAgainstOutline(
  generatedChapters: GeneratedOutlineChapter[],
  outline: ManuscriptOutline,
): void {
  if (generatedChapters.length !== outline.chapters.length) {
    throw new Error(
      `MANIFEST_OUTLINE_MISMATCH: Claude returned ${generatedChapters.length} chapters; manuscript has ${outline.chapters.length}.`,
    );
  }

  generatedChapters.forEach((chapter, index) => {
    const expected = outline.chapters[index];
    if (!expected) return;

    if (chapter.chapterNumber !== expected.chapterNumber) {
      throw new Error(
        `MANIFEST_OUTLINE_MISMATCH: chapter ${index + 1} expected number ${expected.chapterNumber}; Claude returned ${chapter.chapterNumber}.`,
      );
    }

    if (normalizeTitle(chapter.chapterTitle) !== normalizeTitle(expected.title)) {
      throw new Error(
        `MANIFEST_OUTLINE_MISMATCH: chapter ${expected.chapterNumber} expected title "${expected.title}" but got "${chapter.chapterTitle}".`,
      );
    }

    if (chapter.entries.length !== expected.entries.length) {
      throw new Error(
        `MANIFEST_OUTLINE_MISMATCH: chapter ${expected.chapterNumber} expected ${expected.entries.length} entries; Claude returned ${chapter.entries.length}.`,
      );
    }

    chapter.entries.forEach((entry, entryIndex) => {
      const expectedEntry = expected.entries[entryIndex];
      if (!expectedEntry) return;
      if (normalizeTitle(entry.entryTitle) !== normalizeTitle(expectedEntry.title)) {
        throw new Error(
          `MANIFEST_OUTLINE_MISMATCH: chapter ${expected.chapterNumber} entry ${entryIndex + 1} expected "${expectedEntry.title}" but got "${entry.entryTitle}".`,
        );
      }
    });
  });
}
