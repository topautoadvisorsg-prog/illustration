/**
 * Stage 1.5 — Manifest Generation.
 *
 * What it does: reads the stored manuscript ONCE via Claude and produces book,
 * chapter, and page manifests, then persists them and seeds `pages` rows.
 * After this stage the full manuscript is never loaded again.
 *
 * Input: projectId + manuscript markdown + project config.
 * Output: { totalChapters, totalEntries, totalPages, totalImagesNeeded } and
 *          persisted manifests + pages.
 *
 * Run locally (Phase 1.5):
 *   POST /api/projects/{id}/manifests
 */

import { createHash } from 'node:crypto';
import {
  ManifestGenerationResultSchema,
  type BookManifest,
  type ChapterManifest,
  type ManifestGenerationResult,
  type PageManifest,
  type ProjectConfig,
} from '@wildlands/shared';
import { callStructured } from '../../services/claude/claude.js';
import { persistManifests, type PageSeed } from '../../db/repositories/manifests.repo.js';
import { logger } from '../../lib/logger.js';
import {
  assertUsableManuscriptOutline,
  parseManuscriptOutline,
  validateGeneratedChaptersAgainstOutline,
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

const SYSTEM_PROMPT = `You are the manifest planner for an illustrated field-guide book pipeline.
You read a complete manuscript written in Markdown and break it into a structured plan.

Manuscript structure:
- A level-1 heading ("# CHAPTER N — TITLE") starts a chapter.
- A level-2 heading ("## ENTRY NAME ...") starts an entry. Each entry becomes ONE page.
- Level-3 headings ("### SECTION") are sections within an entry's body.

For every entry produce:
- entryTitle: the entry's display name (e.g. "Chanterelle").
- scientificName: the italicised binomial if present, else omit.
- category: a short tag if the heading carries one (e.g. "EDIBLE", "TOXIC"), else omit.
- contentType: the educational page type, one of: SPECIES_PROFILE, ANIMAL_PROFILE,
  COMPARISON, MULTI_SPECIES_COMPARISON, IDENTIFICATION_GUIDE, DIAGNOSTIC_DIAGRAM,
  CHAPTER_OPENER, HABITAT_OVERVIEW, PROGRESSION_STUDY, CUTAWAY_ILLUSTRATION,
  SIDEBAR_FEATURE, REFERENCE_PAGE, WARNING_PAGE, BOTANICAL_PLATE, TERRAIN_ANALYSIS,
  FIELD_NOTES_PAGE, ENCYCLOPEDIA_ENTRY. Use SPECIES_PROFILE/ANIMAL_PROFILE for a normal
  single-organism entry; WARNING_PAGE only when the subject itself is toxic/dangerous.
- imageSubject: a concise, literal description of what the single illustration for this
  page should depict — the organism/subject only, no style words. One sentence.
- bodyMarkdown: the full body text of the entry, preserving its section headings.
- layoutTemplate: choose the best fit from the allowed list; default LAYOUT_1_STANDARD.

Rules:
- Preserve chapter numbers exactly as written in the manuscript.
- Do not invent entries. Every "##" heading is exactly one entry.
- Do not summarise or shorten bodyMarkdown — copy it faithfully.
- Return your answer ONLY through the emit_manifest tool.`;

// Hand-written JSON Schema mirror of ManifestGenerationResultSchema for the tool.
const LAYOUT_TEMPLATES = [
  'LAYOUT_1_STANDARD',
  'LAYOUT_2_TEXT_HEAVY',
  'LAYOUT_3_ILLUSTRATION_DOMINANT',
  'LAYOUT_4_DANGER_WARNING',
  'LAYOUT_5_CHAPTER_OPENER',
  'LAYOUT_6_BACK_MATTER',
  'LAYOUT_7_SCATTERED_VIGNETTES',
  'LAYOUT_8_MARGIN_ILLUSTRATION',
  'LAYOUT_9_DIAGNOSTIC_DIAGRAM',
  'LAYOUT_10_FULL_PAGE_PLATE',
  'LAYOUT_11_CONTINUOUS_LANDSCAPE_SPREAD',
  'LAYOUT_12_DIAGNOSTIC_DIAGRAM',
  'LAYOUT_13_FEATURE_BANNER',
  'LAYOUT_14_SIDEBAR_FEATURE',
  'LAYOUT_15_PROGRESSION_STUDY',
  'LAYOUT_16_CUTAWAY_FEATURE',
];

const TOOL_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    bookTitle: { type: 'string' },
    chapters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          chapterNumber: { type: 'integer', minimum: 1 },
          chapterTitle: { type: 'string' },
          entries: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                entryTitle: { type: 'string' },
                scientificName: { type: 'string' },
                category: { type: 'string' },
                contentType: {
                  type: 'string',
                  enum: [
                    'SPECIES_PROFILE', 'ANIMAL_PROFILE', 'COMPARISON', 'MULTI_SPECIES_COMPARISON',
                    'IDENTIFICATION_GUIDE', 'DIAGNOSTIC_DIAGRAM', 'CHAPTER_OPENER', 'HABITAT_OVERVIEW',
                    'PROGRESSION_STUDY', 'CUTAWAY_ILLUSTRATION', 'SIDEBAR_FEATURE', 'REFERENCE_PAGE',
                    'WARNING_PAGE', 'BOTANICAL_PLATE', 'TERRAIN_ANALYSIS', 'FIELD_NOTES_PAGE', 'ENCYCLOPEDIA_ENTRY',
                  ],
                },
                imageSubject: { type: 'string' },
                layoutTemplate: { type: 'string', enum: LAYOUT_TEMPLATES },
                bodyMarkdown: { type: 'string' },
              },
              required: ['entryTitle', 'imageSubject', 'bodyMarkdown'],
            },
          },
        },
        required: ['chapterNumber', 'chapterTitle', 'entries'],
      },
    },
  },
  required: ['bookTitle', 'chapters'],
};

function outlineForPrompt(outline: ManuscriptOutline): string {
  return outline.chapters
    .map((chapter) => {
      const entries = chapter.entries
        .map((entry) => `  - ${entry.title} (${entry.wordCount} words, line ${entry.lineStart})`)
        .join('\n');
      return `Chapter ${chapter.chapterNumber}: ${chapter.title}\n${entries}`;
    })
    .join('\n\n');
}

function pageKey(chapterNumber: number, pageInChapter: number): string {
  return `CH${String(chapterNumber).padStart(2, '0')}_P${String(pageInChapter).padStart(3, '0')}`;
}

export async function generateManifests(input: GenerateManifestsInput): Promise<GenerateManifestsResult> {
  logger.info({ projectId: input.projectId }, 'Stage 1.5: generating manifests via Claude');

  const outline = parseManuscriptOutline(input.manuscriptMarkdown);
  assertUsableManuscriptOutline(outline);

  const result: ManifestGenerationResult = await callStructured<ManifestGenerationResult>({
    system: SYSTEM_PROMPT,
    user:
      `Project: "${input.config.title}" (volume ${input.config.volume}).\n\n` +
      `Deterministic manuscript outline that must be preserved exactly:\n\n${outlineForPrompt(outline)}\n\n` +
      `Manuscript follows:\n\n${input.manuscriptMarkdown}`,
    toolName: 'emit_manifest',
    toolDescription: 'Emit the structured book plan: chapters, each with its entries.',
    schema: ManifestGenerationResultSchema,
    jsonSchema: TOOL_JSON_SCHEMA,
    maxTokens: 16384,
    projectId: input.projectId,
    operation: 'stage-1.5-manifest',
  });

  validateGeneratedChaptersAgainstOutline(result.chapters, outline);

  // Build page manifests + seeds and the chapter/book summaries.
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
    totalImagesNeeded: runningPageNumber, // one illustration per entry/page in V1
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
