/**
 * Stage 1.5 - Manifest Generation.
 *
 * What it does: reads the stored manuscript structure once, produces book,
 * chapter, and page manifests, then persists them and seeds `pages` rows.
 * After this stage the full manuscript is never loaded again.
 *
 * Input: projectId + manuscript markdown + project config.
 * Output: { totalChapters, totalEntries, totalPages, totalImagesNeeded } and
 *          persisted manifests + pages.
 *
 * Run locally:
 *   POST /api/projects/{id}/manifests
 */

import { createHash } from 'node:crypto';
import {
  ManifestGenerationResultSchema,
  type BookManifest,
  type ChapterManifest,
  type ContentType,
  type GeneratedEntry,
  type LayoutTemplateId,
  type ManifestGenerationResult,
  type PageManifest,
  type ProjectConfig,
} from '@wildlands/shared';
import { persistManifests, type PageSeed } from '../../db/repositories/manifests.repo.js';
import { logger } from '../../lib/logger.js';
import {
  assertUsableManuscriptOutline,
  parseManuscriptOutline,
  validateGeneratedChaptersAgainstOutline,
  type ManuscriptChapterOutline,
  type ManuscriptEntryOutline,
  type ManuscriptOutline,
} from '../stage-1-ingestion/parse-manuscript-outline.js';

export interface GenerateManifestsInput {
  projectId: string;
  manuscriptMarkdown: string;
  config: ProjectConfig;
}

export interface GenerateManifestsResult {
  totalChapters: number;
  totalEntries: number;
  totalPages: number;
  totalImagesNeeded: number;
  manifestsWritten: number;
  pagesWritten: number;
}

function pageKey(chapterNumber: number, pageInChapter: number): string {
  return `CH${String(chapterNumber).padStart(2, '0')}_P${String(pageInChapter).padStart(3, '0')}`;
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/[*_~#>|`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function signalText(chapter: ManuscriptChapterOutline, entry: ManuscriptEntryOutline): string {
  return `${chapter.title}\n${entry.title}\n${entry.bodyMarkdown.slice(0, 1600)}`.toLowerCase();
}

function cleanDisplayTitle(title: string): string {
  return stripMarkdown(title)
    .replace(/^\d+\.\s*/, '')
    .replace(/\s*\|.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractScientificName(entry: ManuscriptEntryOutline): string | undefined {
  const candidate = `${entry.title}\n${entry.bodyMarkdown.slice(0, 360)}`;
  const match = candidate.match(/\*\(?([A-Z][a-z]+(?:\s+(?:[a-z][a-z.-]+|spp\.|var\.)){1,4})\)?\*/);
  return match?.[1];
}

function inferCategory(chapter: ManuscriptChapterOutline, entry: ManuscriptEntryOutline): string | undefined {
  const text = signalText(chapter, entry);

  if (
    /(deadly|toxic|poisonous|venomous|danger level|lyme disease|tick-borne|tick borne|rabies|anaphylaxis|hypothermia|river crossing|extreme weather|spruce trap)/.test(
      text,
    )
  ) {
    return 'DANGER';
  }
  if (/\bedible\b/.test(text)) return 'EDIBLE';
  if (/\bmedicinal\b/.test(text)) return 'MEDICINAL';
  if (/\bexpert review required\b/.test(text)) return 'EXPERT_REVIEW_REQUIRED';
  if (/(protocol|code|first aid|safety|survival)/.test(text)) return 'REFERENCE';
  return undefined;
}

function isDangerEntry(chapter: ManuscriptChapterOutline, entry: ManuscriptEntryOutline, category?: string): boolean {
  if (category === 'DANGER') return true;
  const text = signalText(chapter, entry);
  return /(deadly|toxic|poisonous|venomous|lyme disease|tick-borne|tick borne|hypothermia|river crossing|extreme weather|spruce trap|rabies|anaphylaxis)/.test(
    text,
  );
}

function inferContentType(
  chapter: ManuscriptChapterOutline,
  entry: ManuscriptEntryOutline,
  category?: string,
): ContentType {
  const text = signalText(chapter, entry);
  const title = entry.title.toLowerCase();

  if (isDangerEntry(chapter, entry, category)) return 'WARNING_PAGE';
  if (/(glossary|index|reference|protocol|code|first aid|survival priorities|decision framework)/.test(text)) return 'REFERENCE_PAGE';
  if (/(compare|comparison|look-alike|look alike| vs |versus|similar species)/.test(text)) return 'COMPARISON';
  if (/(life cycle|growth stage|seasonal sequence|progression|development over time)/.test(text)) return 'PROGRESSION_STUDY';
  if (/(cutaway|cut away|cross-section|cross section|strata|glacial inheritance|layered)/.test(text)) return 'CUTAWAY_ILLUSTRATION';
  if (/(tracks & sign|tracks and sign|track|scat|signs)/.test(text)) return 'FIELD_NOTES_PAGE';
  if (/(diagram|diagnostic|identify|identification|how to identify|major features)/.test(title)) return 'DIAGNOSTIC_DIAGRAM';
  if (chapter.chapterNumber === 1 || chapter.chapterNumber === 6) {
    if (/(zone|habitat|forest|wetland|boreal|alpine|hardwood)/.test(text)) return 'HABITAT_OVERVIEW';
    return 'TERRAIN_ANALYSIS';
  }
  if (chapter.chapterNumber === 2) return 'ANIMAL_PROFILE';
  if (chapter.chapterNumber >= 3 && chapter.chapterNumber <= 5) return 'SPECIES_PROFILE';
  if (chapter.chapterNumber >= 7) return 'REFERENCE_PAGE';
  return 'ENCYCLOPEDIA_ENTRY';
}

function chooseManifestTemplate(contentType: ContentType, wordCount: number): LayoutTemplateId {
  switch (contentType) {
    case 'WARNING_PAGE':
    case 'COMPARISON':
    case 'MULTI_SPECIES_COMPARISON':
      return 'LAYOUT_4_DANGER_WARNING';
    case 'REFERENCE_PAGE':
      return wordCount > 620 ? 'LAYOUT_2_TEXT_HEAVY' : 'LAYOUT_6_BACK_MATTER';
    case 'FIELD_NOTES_PAGE':
      return 'LAYOUT_7_SCATTERED_VIGNETTES';
    case 'DIAGNOSTIC_DIAGRAM':
    case 'IDENTIFICATION_GUIDE':
      return 'LAYOUT_12_DIAGNOSTIC_DIAGRAM';
    case 'HABITAT_OVERVIEW':
      return wordCount > 180 ? 'LAYOUT_13_FEATURE_BANNER' : 'LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD';
    case 'TERRAIN_ANALYSIS':
      return 'LAYOUT_13_FEATURE_BANNER';
    case 'PROGRESSION_STUDY':
      return 'LAYOUT_15_PROGRESSION_STUDY';
    case 'CUTAWAY_ILLUSTRATION':
      return 'LAYOUT_16_CUTAWAY_FEATURE';
    case 'BOTANICAL_PLATE':
      return 'LAYOUT_10_FULL_PAGE_PLATE';
    case 'SIDEBAR_FEATURE':
      return 'LAYOUT_14_SIDEBAR_FEATURE';
    case 'CHAPTER_OPENER':
      return 'LAYOUT_5_CHAPTER_OPENER';
    case 'ANIMAL_PROFILE':
    case 'SPECIES_PROFILE':
      if (wordCount > 900) return 'LAYOUT_14_SIDEBAR_FEATURE';
      if (wordCount > 650) return 'LAYOUT_8_MARGIN_ILLUSTRATION';
      if (wordCount > 420) return 'LAYOUT_2_TEXT_HEAVY';
      if (wordCount < 180) return 'LAYOUT_3_ILLUSTRATION_DOMINANT';
      return 'LAYOUT_1_STANDARD';
    case 'ENCYCLOPEDIA_ENTRY':
    default:
      return 'LAYOUT_2_TEXT_HEAVY';
  }
}

function imageSubjectFor(
  entry: ManuscriptEntryOutline,
  contentType: ContentType,
  scientificName?: string,
): string {
  const title = cleanDisplayTitle(entry.title);
  const subject = scientificName ? `${title} (${scientificName})` : title;

  switch (contentType) {
    case 'WARNING_PAGE':
      return `field-guide safety illustration for ${subject}`;
    case 'HABITAT_OVERVIEW':
      return `${subject} in the New England wilderness landscape`;
    case 'TERRAIN_ANALYSIS':
      return `New England terrain feature: ${subject}`;
    case 'CUTAWAY_ILLUSTRATION':
      return `cutaway illustration of ${subject}`;
    case 'PROGRESSION_STUDY':
      return `seasonal or staged progression of ${subject}`;
    case 'FIELD_NOTES_PAGE':
      return `field signs and small visual notes for ${subject}`;
    case 'REFERENCE_PAGE':
      return `small supporting wilderness illustration for ${subject}`;
    default:
      return subject;
  }
}

function buildEntryManifest(chapter: ManuscriptChapterOutline, entry: ManuscriptEntryOutline): GeneratedEntry {
  const scientificName = extractScientificName(entry);
  const category = inferCategory(chapter, entry);
  const contentType = inferContentType(chapter, entry, category);
  return {
    entryTitle: entry.title,
    scientificName,
    category,
    contentType,
    imageSubject: imageSubjectFor(entry, contentType, scientificName),
    layoutTemplate: chooseManifestTemplate(contentType, entry.wordCount),
    bodyMarkdown: entry.bodyMarkdown,
  };
}

export function buildDeterministicManifestResult(outline: ManuscriptOutline, config: ProjectConfig): ManifestGenerationResult {
  return ManifestGenerationResultSchema.parse({
    bookTitle: config.title,
    chapters: outline.chapters.map((chapter) => ({
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title,
      entries: chapter.entries.map((entry) => buildEntryManifest(chapter, entry)),
    })),
  });
}

export async function generateManifests(input: GenerateManifestsInput): Promise<GenerateManifestsResult> {
  logger.info({ projectId: input.projectId }, 'Stage 1.5: generating deterministic manifests');

  const outline = parseManuscriptOutline(input.manuscriptMarkdown);
  assertUsableManuscriptOutline(outline);

  const result = buildDeterministicManifestResult(outline, input.config);
  validateGeneratedChaptersAgainstOutline(result.chapters, outline);

  const chapterManifests: ChapterManifest[] = [];
  const pageManifests: Array<{ externalId: string; content: PageManifest }> = [];
  const pageSeeds: PageSeed[] = [];
  let runningPageNumber = 0;
  let totalEntries = 0;

  for (const chapter of result.chapters) {
    const pageKeys: string[] = [];
    let pageInChapter = 0;
    for (const entry of chapter.entries) {
      pageInChapter += 1;
      runningPageNumber += 1;
      totalEntries += 1;
      const key = pageKey(chapter.chapterNumber, pageInChapter);
      pageKeys.push(key);

      const page: PageManifest = {
        pageId: key,
        projectId: input.projectId,
        chapterNumber: chapter.chapterNumber,
        pageNumber: runningPageNumber,
        entryTitle: entry.entryTitle,
        scientificName: entry.scientificName,
        category: entry.category,
        contentType: entry.contentType,
        layoutTemplate: entry.layoutTemplate,
        imageSubject: entry.imageSubject,
        bodyMarkdown: entry.bodyMarkdown,
        warnings: [],
      };
      pageManifests.push({ externalId: key, content: page });
      pageSeeds.push({
        pageKey: key,
        chapterNumber: chapter.chapterNumber,
        plannedPageNumber: runningPageNumber,
        layoutTemplate: entry.layoutTemplate,
        imagePrompt: null,
      });
    }
    chapterManifests.push({
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.chapterTitle,
      pageKeys,
    });
  }

  const book: BookManifest = {
    bookTitle: result.bookTitle,
    totalChapters: result.chapters.length,
    totalEntries,
    totalPages: runningPageNumber,
    totalImagesNeeded: runningPageNumber,
    chapters: result.chapters.map((c) => ({
      chapterNumber: c.chapterNumber,
      chapterTitle: c.chapterTitle,
      entryCount: c.entries.length,
    })),
  };

  const persisted = await persistManifests({
    projectId: input.projectId,
    book,
    chapters: chapterManifests,
    pageManifests,
    pageSeeds,
  });

  logger.info(
    { projectId: input.projectId, ...persisted, totalPages: runningPageNumber },
    'Stage 1.5: manifests persisted',
  );

  return {
    totalChapters: book.totalChapters,
    totalEntries: book.totalEntries,
    totalPages: book.totalPages,
    totalImagesNeeded: book.totalImagesNeeded,
    manifestsWritten: persisted.manifestsWritten,
    pagesWritten: persisted.pagesWritten,
  };
}

/** Unused param kept for signature stability; sha not needed downstream yet. */
export function manuscriptSha(markdown: string): string {
  return createHash('sha256').update(markdown, 'utf8').digest('hex');
}
