/**
 * Stage 8 — Kindle EPUB builder (I/O orchestrator).
 *
 * READ-ONLY against existing book data. Loads the project, its paginated pages
 * (real reading text), the chapter + entry titles, and the cover asset; builds
 * the reflowable EPUB model (assemble-epub.ts) and packs it with
 * `epub-gen-memory`. No re-render, no image spend, no writes to pages/renders/
 * print files. The print pipeline is untouched.
 *
 * Images: v1 embeds the COVER only (with alt text). Entry illustrations are
 * intentionally omitted — the only available art is the baked full-page renders
 * (text fused into pixels), which would duplicate the reflowed copy. The model
 * leaves a hook for clean per-entry art when it exists.
 */

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { EPub, type Options } from 'epub-gen-memory';
import { and, eq, inArray } from 'drizzle-orm';
import { ProjectConfigSchema } from '@wildlands/shared';
import { getDb } from '../../db/client.js';
import { manifests } from '../../db/schema/index.js';
import { getProject } from '../../db/repositories/projects.repo.js';
import {
  getEntryMetaByKeys,
  listPaginatedPagesForProject,
} from '../../db/repositories/pagination.repo.js';
import { getProjectStorage } from '../../services/storage/project-storage.js';
import { assembleEpubModel, type EpubMeta, type EpubModel, type EpubSourcePage } from './assemble-epub.js';

/** Minimal reader-theme-friendly CSS — relative units only (no fixed px) so
 *  Kindle reflow is never broken. The device controls fonts/colors. */
const EPUB_CSS = [
  'h1 { font-size: 1.6em; margin: 1em 0 0.3em; }',
  'h2 { font-size: 1.3em; margin: 1.2em 0 0.2em; }',
  'h3 { font-size: 1.1em; margin: 1em 0 0.2em; }',
  'h4 { font-size: 1em; font-weight: bold; margin: 0.8em 0 0.2em; }',
  'p { margin: 0 0 0.7em; line-height: 1.5; }',
  'p.sci { font-style: italic; margin: 0 0 0.8em; }',
  'p.subtitle { font-size: 1.1em; font-style: italic; }',
  'p.author { font-size: 1.1em; margin-top: 1em; }',
  'section.entry { margin: 0 0 1.5em; }',
].join('\n');

export interface BuildEpubResult {
  buffer: Buffer;
  model: EpubModel;
  meta: EpubMeta;
  coverEmbedded: boolean;
  fileName: string;
}

/** Resolve the EPUB metadata block from project + config.publishing (fallbacks
 *  to the project's own title/subtitle/author). */
function resolveMeta(project: NonNullable<Awaited<ReturnType<typeof getProject>>>): EpubMeta {
  const config = ProjectConfigSchema.parse(project.config);
  const pub = config.publishing;
  const title = pub.title || project.title;
  const subtitle = pub.subtitle || project.subtitle || undefined;
  const authors = pub.authors && pub.authors.length ? pub.authors : [project.authorName];
  const seriesName = pub.series
    ? pub.series.volumeNumber
      ? `${pub.series.name} — Volume ${pub.series.volumeNumber}`
      : pub.series.name
    : undefined;
  const description = pub.bookDescription?.blurb || subtitle;
  const coverAlt = [title, pub.coverDescription].filter(Boolean).join(' — ').slice(0, 140);
  return {
    title,
    subtitle,
    authors,
    publisher: pub.publisher?.imprint,
    language: pub.language || 'en',
    description,
    isbn: pub.isbn?.ebook,
    series: seriesName,
    coverAlt,
  };
}

function fileNameFor(title: string): string {
  const safe = title.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
  return `${safe || 'BOOK'}_KINDLE.epub`;
}

export interface ProjectEpubModel {
  model: EpubModel;
  meta: EpubMeta;
  coverAssetPath?: string;
  fileName: string;
}

/**
 * Assemble the EPUB MODEL for a project WITHOUT packing the .epub — read-only,
 * cheap, no zip. Powers the in-console preview (structure + text + image plan +
 * report). `buildKindleEpub` reuses this then packs the bytes.
 */
export async function assembleProjectModel(
  projectId: string,
  opts: { verifyCover?: boolean } = {},
): Promise<ProjectEpubModel> {
  const project = await getProject(projectId);
  if (!project) throw new Error(`project_not_found:${projectId}`);
  const meta = resolveMeta(project);

  // Pages (real reading text) + chapter titles + entry titles.
  const pageRows = await listPaginatedPagesForProject(projectId);
  const pages: EpubSourcePage[] = pageRows.map((p) => ({
    pageKey: p.pageKey,
    chapterNumber: p.chapterNumber,
    plannedPageNumber: p.plannedPageNumber,
    section: p.section,
    frontMatterType: p.frontMatterType,
    entryKey: p.entryKey,
    pageRole: p.pageRole,
    readingFieldText: p.readingFieldText,
    spineOrder: p.spineOrder,
  }));

  const db = getDb();
  const chapterManifests = await db
    .select({ content: manifests.content })
    .from(manifests)
    .where(and(eq(manifests.projectId, projectId), eq(manifests.kind, 'CHAPTER')));
  const chapterTitles = new Map<number, string>();
  for (const m of chapterManifests) {
    const c = m.content as { chapterNumber?: number; chapterTitle?: string };
    if (typeof c.chapterNumber === 'number' && c.chapterTitle) chapterTitles.set(c.chapterNumber, c.chapterTitle);
  }

  const entryKeys = [...new Set(pages.map((p) => p.entryKey ?? p.pageKey))];
  const entryMeta = await getEntryMetaByKeys(projectId, entryKeys);
  const entryTitles = new Map<string, string>();
  for (const [k, v] of entryMeta) if (v.entryTitle) entryTitles.set(k, v.entryTitle);

  const model = assembleEpubModel({ meta, chapterTitles, entryTitles, pages });
  const coverAssetPath = ProjectConfigSchema.parse(project.config).publishing.coverAssetPath;

  // Cover status must be TRUTHFUL before export: a path existing is not enough —
  // actually read the file so the preview can't claim a cover that won't embed.
  // The export path (buildKindleEpub) reads + resizes the cover itself, so it
  // passes verifyCover:false to skip the redundant read.
  if (opts.verifyCover === false) {
    model.imagePlan.coverIncluded = Boolean(coverAssetPath); // finalized at pack time
  } else if (!coverAssetPath) {
    model.imagePlan.coverIncluded = false;
    model.stats.warnings.push('No cover image is set — the EPUB will export WITHOUT a cover. Generate the cover in Step 7 · Render & Review.');
  } else {
    try {
      const bytes = await getProjectStorage().readProjectFile(coverAssetPath);
      if (!bytes || bytes.length === 0) throw new Error('empty file');
      model.imagePlan.coverIncluded = true;
    } catch (err) {
      model.imagePlan.coverIncluded = false;
      model.stats.warnings.push(
        `Cover image is set but could NOT be read (${coverAssetPath}: ${err instanceof Error ? err.message : String(err)}) — ` +
          'the EPUB will export WITHOUT a cover. Regenerate the cover in Step 7 · Render & Review before exporting.',
      );
    }
  }
  return { model, meta, coverAssetPath, fileName: fileNameFor(meta.title) };
}

/** Build the Kindle EPUB for a project. Returns the bytes + a build report. */
export async function buildKindleEpub(projectId: string): Promise<BuildEpubResult> {
  // verifyCover:false — this path reads + resizes the cover below and finalizes
  // coverIncluded from the actual embed, so no need to pre-read it here too.
  const { model, meta, coverAssetPath, fileName } = await assembleProjectModel(projectId, { verifyCover: false });

  // Cover — read from storage, resize to <=1600px wide (Kindle practical cap),
  // write to a temp file and hand epub-gen-memory a file:// URL (Node path read).
  let coverFileUrl: string | undefined;
  let coverEmbedded = false;
  if (coverAssetPath) {
    try {
      const storage = getProjectStorage();
      const raw = await storage.readProjectFile(coverAssetPath);
      const resized = await sharp(raw).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      const tmp = join(tmpdir(), `wl-cover-${projectId}.jpg`);
      writeFileSync(tmp, resized);
      coverFileUrl = pathToFileURL(tmp).href;
      coverEmbedded = true;
    } catch (err) {
      // Cover is best-effort: a missing/unreadable cover must not fail the export.
      coverFileUrl = undefined;
      coverEmbedded = false;
      // eslint-disable-next-line no-console
      console.warn(`[epub] cover not embedded (${coverAssetPath}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const options: Options = {
    title: meta.title,
    author: meta.authors,
    publisher: meta.publisher,
    description: meta.description,
    lang: meta.language,
    cover: coverFileUrl,
    tocTitle: 'Contents',
    version: 3,
    prependChapterTitles: true,
    css: EPUB_CSS,
  };

  // Reflect the ACTUAL cover outcome in the model's image plan.
  model.imagePlan.coverIncluded = coverEmbedded;

  // Use the EPub class (named export) rather than the default function: under
  // some ESM loaders the CJS default export isn't unwrapped to a callable.
  const epubDoc = await new EPub(options, model.chapters).render();
  const buffer = await epubDoc.genEpub();
  return { buffer, model, meta, coverEmbedded, fileName };
}
