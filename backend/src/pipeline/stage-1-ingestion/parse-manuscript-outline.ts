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

function isChapterHeading(title: string): boolean {
  return /^chapter\s+\d+\b/i.test(title.trim());
}

function isCategoryHeading(title: string): boolean {
  const normalized = title
    .toUpperCase()
    .replace(/[—–-].*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return (
    /^SECTION\s+\d+\b/.test(normalized) ||
    /^PART\s+\w+\b/.test(normalized) ||
    normalized.includes('HAZARDS') ||
    [
      'MAMMALS',
      'BIRDS',
      'REPTILES & AMPHIBIANS',
      'INSECTS & ARACHNIDS',
      'EDIBLE PLANTS',
      'MEDICINAL PLANTS',
      'TOXIC & DANGEROUS PLANTS',
      'EDIBLE',
      'DEADLY',
      'SURVIVAL TOPICS',
      'MOST LIKELY EMERGENCIES IN NEW ENGLAND',
      'WILDERNESS FIRST AID ESSENTIALS',
      'DECISION FRAMEWORK',
    ].some((category) => normalized === category || normalized.startsWith(`${category} `))
  );
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
  const explicitChapterHeadings = headings.filter((heading) => heading.level === 1 && isChapterHeading(heading.title));
  const chapterHeadings = explicitChapterHeadings.length > 0
    ? explicitChapterHeadings
    : headings.filter((heading) => heading.level === 1);
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
    const nextTopLevelHeading = headings.find((heading) => heading.level === 1 && heading.offset > chapterHeading.offset);
    const chapterEndOffset = nextTopLevelHeading ? nextTopLevelHeading.offset - 1 : markdown.length;
    const chapterEndLine = nextTopLevelHeading ? nextTopLevelHeading.line - 1 : markdown.split(/\n/).length;
    const chapterNumber = parseChapterNumber(chapterHeading.title, chapterIndex + 1);
    const chapterScopedHeadings = headings.filter(
      (heading) => heading.offset > chapterHeading.offset && heading.offset < chapterEndOffset,
    );
    const h2Headings = chapterScopedHeadings.filter((heading) => heading.level === 2);
    const h3Headings = chapterScopedHeadings.filter((heading) => heading.level === 3);
    const directH3Headings = h3Headings.filter((heading) => {
      const parentH2 = [...h2Headings].reverse().find((h2) => h2.offset < heading.offset);
      return !parentH2 || parentH2.offset < chapterHeading.offset;
    });
    const entryHeadings = [
      ...h2Headings.flatMap((h2) => {
        const nextH2 = h2Headings.find((candidate) => candidate.offset > h2.offset);
        const h2EndOffset = nextH2 ? nextH2.offset - 1 : chapterEndOffset;
        const childH3s = h3Headings.filter((h3) => h3.offset > h2.offset && h3.offset < h2EndOffset);
        const firstChild = childH3s[0];
        const h2Line = markdown.slice(h2.offset).split('\n', 1)[0] ?? '';
        const directBodyStart = h2.offset + h2Line.length + 1;
        const directBodyEnd = firstChild ? firstChild.offset - 1 : h2EndOffset;
        const directBody = markdown.slice(directBodyStart, directBodyEnd).trim();
        const hasDirectBody = countWords(directBody) >= 30;
        const category = isCategoryHeading(h2.title);

        return [
          ...(category ? (hasDirectBody ? [h2] : []) : [h2]),
          ...(category ? childH3s : []),
        ];
      }),
      ...directH3Headings,
    ].filter((heading, index, all) => all.findIndex((candidate) => candidate.offset === heading.offset) === index);

    if (entryHeadings.length === 0) {
      warnings.push(`CHAPTER_WITHOUT_ENTRIES: chapter ${chapterNumber} has no usable entry headings.`);
    }

    const entries = entryHeadings.map((entryHeading, entryIndex): ManuscriptEntryOutline => {
      const nextEntry = entryHeadings.find((candidate, candidateIndex) => candidateIndex > entryIndex && candidate.offset > entryHeading.offset);
      const scopedEndHeading = chapterScopedHeadings.find((heading) => {
        if (heading.offset <= entryHeading.offset) return false;
        if (nextEntry && heading.offset >= nextEntry.offset) return false;
        return heading.level <= entryHeading.level;
      });
      const entryEndOffset = nextEntry ? nextEntry.offset - 1 : chapterEndOffset;
      const bodyEndOffset = scopedEndHeading ? scopedEndHeading.offset - 1 : entryEndOffset;
      const entryEndLine = nextEntry ? nextEntry.line - 1 : chapterEndLine;
      const entryHeadingLine = markdown.slice(entryHeading.offset).split('\n', 1)[0] ?? '';
      const bodyStart = entryHeading.offset + entryHeadingLine.length + 1;
      const bodyMarkdown = markdown.slice(bodyStart, bodyEndOffset).trim();
      const sections = chapterScopedHeadings
        .filter((heading) => heading.level === entryHeading.level + 1 && heading.offset > entryHeading.offset && heading.offset < bodyEndOffset)
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
