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

import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { EPub, type Options } from 'epub-gen-memory';
import { and, eq, inArray } from 'drizzle-orm';
import { ProjectConfigSchema, type ProjectConfig, type PageIllustration } from '@wildlands/shared';
import { getDb } from '../../db/client.js';
import { manifests } from '../../db/schema/index.js';
import { getProject } from '../../db/repositories/projects.repo.js';
import {
  getEntryMetaByKeys,
  listPaginatedPagesForProject,
} from '../../db/repositories/pagination.repo.js';
import { listEntriesForProject } from '../../db/repositories/entries.repo.js';
import { getProjectStorage } from '../../services/storage/project-storage.js';
import { assembleEpubModel, type EpubMeta, type EpubModel, type EpubSourcePage, type HeroAssembleInput, type HeroRef } from './assemble-epub.js';
import { loadHeroPlan } from './hero-plan.js';
import { assembleTypesetEpubModel, type EpubFigure } from './assemble-typeset-epub.js';
import { toRoman } from '../publishing-standard/index.js';

/** Minimal reader-theme-friendly CSS — relative units only (no fixed px) so
 *  Kindle reflow is never broken. The device controls fonts/colors. */
const EPUB_CSS = [
  // NOTHING MAY BE WIDER THAN THE SCREEN, at any reader font size.
  //
  // A reflowable book is read at whatever size its reader has chosen, and the
  // accessibility settings go a long way up. At 250% on a 320px phone the word
  // "INTRODUCTION" alone is 512px wide, and a single unbreakable word pushes the
  // whole document sideways — every line of that chapter then needs a horizontal
  // swipe to finish. Allowing a break inside a word as a LAST RESORT costs
  // nothing at ordinary sizes, where no break is ever needed. Measured across
  // all 24 documents at 320 and 375px, at 100/150/200/250%.
  'body { overflow-wrap: break-word; }',
  'h1, h2, h3, h4, h5, h6 { overflow-wrap: break-word; word-break: break-word; }',
  'h1 { font-size: 1.6em; margin: 1em 0 0.3em; }',
  'h2 { font-size: 1.3em; margin: 1.2em 0 0.2em; }',
  'h3 { font-size: 1.1em; margin: 1em 0 0.2em; }',
  'h4 { font-size: 1em; font-weight: bold; margin: 0.8em 0 0.2em; }',
  // ORPHAN CONTROL — a heading/sub-heading must never strand at the bottom of a
  // Kindle screen away from the text it introduces. break-after:avoid glues each
  // heading to the block that follows it, so it rolls to the next screen WITH its
  // paragraph; break-inside:avoid stops a heading from splitting. Reflowable, so
  // this fixes every device/font-size at once (no per-"page" edits possible).
  'h1, h2, h3, h4, h5, h6 { page-break-after: avoid; break-after: avoid; -webkit-column-break-after: avoid; page-break-inside: avoid; break-inside: avoid; }',
  'p { margin: 0 0 0.7em; line-height: 1.5; }',
  // Keep the scientific-name byline with its entry title (never split the two).
  'p.sci { font-style: italic; margin: 0 0 0.8em; page-break-before: avoid; break-before: avoid; }',
  'p.subtitle { font-size: 1.1em; font-style: italic; }',
  'p.author { font-size: 1.1em; margin-top: 1em; }',
  'section.entry { margin: 0 0 1.5em; }',
  // EVERY image is capped at the column width, not just the classed ones.
  //
  // `img.hero` and `img.figimg` each carried their own max-width and the bare
  // element had none, so a plate emitted without one of those classes fell back
  // to its intrinsic size. A 1067px-wide engraving on a 375px phone rendered at
  // 1067px and pushed the page 700px wide — every line of that chapter needing a
  // horizontal swipe to finish. Kindle's own reader happens to constrain images
  // and hid it; a standards-compliant renderer does not, and neither EPUBCheck
  // nor Kindle Previewer flags it, because it is valid markup that simply looks
  // wrong. The blanket rule comes FIRST so the specific rules still win.
  'img { max-width: 100%; height: auto; }',
  // Chapter-end and divider plates: their own screen space, centred.
  'div.plate { margin: 1.2em 0; text-align: center; page-break-inside: avoid; break-inside: avoid; }',
  'div.plate img { display: block; margin: 0 auto; max-height: 85vh; width: auto; }',
  // Hero illustrations: responsive, centered. max-height caps a tall plate so its
  // header (and the first lines) always have room on the SAME screen instead of
  // the title being shoved to the next page. height:auto keeps the aspect ratio.
  'img.hero { display: block; max-width: 100%; max-height: 85vh; height: auto; width: auto; margin: 0.5em auto 0.8em; }',
  // hero--break: this entry's illustration opens its OWN screen (Kindle honors
  // page-break-before reliably; it ignores keep-together rules half the time). The
  // header flows directly beneath it, so image + heading always land together.
  // Applied to every entry EXCEPT the first in a chapter (that flows under the
  // chapter title), so chapter-opener headings are never stranded.
  'img.hero--break { margin-top: 0; page-break-before: always; break-before: page; }',
  // ── typeset (Track B) elements ────────────────────────────
  // Everything below is sized in em/%, never px: a reflowable file is read at
  // whatever size the reader has chosen, and a fixed measurement fights that.
  'figure.fig { margin: 1em 0; text-align: center; page-break-inside: avoid; break-inside: avoid; }',
  'img.figimg { max-width: 100%; height: auto; margin: 0 auto; }',
  'p.caption { font-size: 0.9em; font-style: italic; margin: 0.4em 0 0; text-align: center; }',
  // The scene break. The print edition centres an ornament between paragraphs
  // and this is its reflowable equivalent: spaced, not ruled, so it cannot be
  // mistaken for a chapter division on a small screen.
  'p.ornament { text-align: center; margin: 1.4em 0; letter-spacing: 0.5em; }',
  'p.disclaimer { font-size: 0.9em; }',
  'p.series { font-size: 0.95em; margin-top: 1.5em; }',
  // Tables reflow badly by nature; keep them readable rather than pretty. The
  // 100% width lets a device shrink columns instead of clipping them.
  'table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 0.9em; }',
  // Cells may break INSIDE a word as a last resort.
  //
  // "width: 100%" only lets a device shrink columns down to their minimum
  // content width, which is the longest unbreakable word in the column. At the
  // reader's default size that is comfortably under a phone's measure; at 200%
  // it is not, and the two-column and three-column tables pushed the page 157px
  // wide, then 287px at 250% — every line of that chapter needing a sideways
  // swipe because of one table. Allowing a word to break rescues it at every
  // size and changes nothing at the default, where no break is needed. Measured
  // at 100/150/200/250% before and after.
  'th, td { border: 1px solid #999; padding: 0.35em 0.5em; vertical-align: top; ' +
    'overflow-wrap: break-word; word-break: break-word; }',
  'th { font-weight: bold; }',
  // A table too wide to be a grid on a phone, set as labelled records instead.
  // Sized in em so it follows the reader's chosen text size like everything else.
  "div.stacked-table { margin: 1em 0; }",
  "div.stk-unit { margin: 0 0 1em; padding: 0 0 0.6em; border-bottom: 1px solid #bbb; page-break-inside: avoid; break-inside: avoid; }",
  "p.stk-lead { font-weight: bold; margin: 0 0 0.3em; }",
  "p.stk-field { margin: 0 0 0.2em; text-indent: 0; }",
  "span.stk-label { font-weight: bold; }",
  'blockquote { margin: 1em 1.5em; font-style: italic; }',
  // The callout, the reflowable equivalent of the print edition's ruled aside.
  // Indented from the left with a rule rather than boxed: a box on a phone is
  // mostly border, and a reader may be at any font size.
  'blockquote.callout { margin: 1.1em 0; padding-left: 0.9em; border-left: 2px solid currentColor; ' +
    'font-style: italic; page-break-inside: avoid; break-inside: avoid; }',
  'blockquote.callout p { margin: 0; }',
  'blockquote.callout p + p { margin-top: 0.5em; }',
  // The label sits on its own line with the aside beneath it, upright against
  // the italic body so it reads as a heading and not as the first sentence.
  'p.callout-label { font-style: normal; font-weight: 600; margin: 0 0 0.4em; }',
  'ul, ol { margin: 0 0 0.8em 1.2em; padding-left: 1em; }',
  'li { margin: 0 0 0.35em; }',
  'code { font-family: monospace; font-size: 0.95em; }',
].join('\n');

export interface BuildEpubResult {
  buffer: Buffer;
  model: EpubModel;
  meta: EpubMeta;
  coverEmbedded: boolean;
  fileName: string;
  /** 'entries' = sourced from the first-class entries layer; 'manifests' = fallback. */
  entrySource: 'entries' | 'manifests';
}

/** Resolve the EPUB metadata block from project + config.publishing (fallbacks
 *  to the project's own title/subtitle/author). */
function resolveMeta(project: NonNullable<Awaited<ReturnType<typeof getProject>>>): EpubMeta {
  const config = ProjectConfigSchema.parse(project.config);
  const pub = config.publishing;
  const title = pub.title || project.title;
  const subtitle = pub.subtitle || project.subtitle || undefined;
  const authors = pub.authors && pub.authors.length ? pub.authors : [project.authorName];
  // Branding is "<Series> — Series <Roman>" (matches the cover, e.g. "THE
  // WILDLANDS — SERIES I"), NOT "Volume N".
  const seriesName = pub.series
    ? pub.series.volumeNumber
      ? `${pub.series.name} — Series ${toRoman(pub.series.volumeNumber)}`
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
  /** Whether entry titles/order came from the entries layer or fell back to manifests. */
  entrySource: 'entries' | 'manifests';
}

/**
 * Resolve the manuscript's inline figures (`![alt](name)`) into temp files the
 * packer can read.
 *
 * Encoded BOTH ways and the smaller kept. The book mixes 4.6 MB photographic
 * plates with 96 KB vector-drawn charts, and one codec is wrong for one of them:
 * JPEG smears the hairlines of a chart, PNG stores a photograph at ten times the
 * size it needs. Trying both and measuring costs a few hundred milliseconds and
 * removes the judgement call entirely.
 *
 * Capped at 1400px on the long edge — above that a Kindle downsamples on the
 * device anyway, and the bytes are pure download weight.
 */
async function resolveFiguresForExport(
  projectId: string,
  markdown: string,
): Promise<Map<string, EpubFigure>> {
  const figures = new Map<string, EpubFigure>();
  const storage = getProjectStorage();
  const dir = join(tmpdir(), `wl-figs-${projectId}`);
  mkdirSync(dir, { recursive: true });

  for (const m of markdown.matchAll(/^!\[([^\]]*)\]\(([^)]+)\)(?:\{(\d{1,3})%\})?\s*$/gm)) {
    const alt = (m[1] ?? '').trim();
    const name = m[2]!.trim();
    const widthPct = m[3] ? Number(m[3]) : undefined;
    if (figures.has(name)) continue;
    try {
      const bytes = await storage.readProjectFile([projectId, 'illustrations', name].join('/'));
      const base = sharp(bytes, { density: 300 }).resize({
        width: 1400,
        height: 1400,
        fit: 'inside',
        withoutEnlargement: true,
      });
      const [asPng, asJpeg] = await Promise.all([
        base.clone().png({ compressionLevel: 9 }).toBuffer(),
        base.clone().jpeg({ quality: 82, chromaSubsampling: '4:4:4' }).toBuffer(),
      ]);
      const usePng = asPng.length <= asJpeg.length;
      const file = join(dir, `${name.replace(/[^a-zA-Z0-9]+/g, '_')}.${usePng ? 'png' : 'jpg'}`);
      writeFileSync(file, usePng ? asPng : asJpeg);
      figures.set(name, {
        src: pathToFileURL(file).href,
        // Alt text carries the caption's markdown; strip it so a screen reader
        // does not read asterisks aloud.
        alt: alt.replace(/[*`]/g, ''),
        widthPct,
      });
    } catch {
      // Left unresolved on purpose. The assembler reports it as a MISSING figure
      // and the operator sees it in the build report, rather than the figure
      // quietly not being in the shipped file.
    }
  }
  return figures;
}

/**
 * The stamped print plates, re-bound to SECTIONS for the reflowable edition.
 *
 * `config.illustrations` keys art by the stable block id it is stamped onto in
 * the PDF. A block id resolves to a PAGE, and an ebook has no pages, so that
 * mapping cannot be carried over — which is why an illustrated book exported
 * with `heroesEmbedded: 0` and nobody noticed until the file was opened.
 *
 * The bridge is `PageIllustration.subject`, written at stamping time, which
 * names what each plate is FOR. Matching on that gives the ebook the same five
 * plates against the same five structural places, with no second copy of the
 * art and no second decision about where it belongs.
 *
 * Sized for screens rather than for paper: a 2048px plate is pointless on a
 * phone and costs download. Anything that fails to resolve is reported by the
 * assembler rather than silently dropped.
 */
async function resolveSectionPlatesForExport(
  projectId: string,
  config: ProjectConfig,
): Promise<Map<string, EpubFigure>> {
  const out = new Map<string, EpubFigure>();
  const illustrations = config.illustrations ?? {};
  if (Object.keys(illustrations).length === 0) return out;

  const storage = getProjectStorage();
  const dir = join(tmpdir(), `wl-plates-${projectId}`);
  mkdirSync(dir, { recursive: true });

  /** Plate subject -> the section title it belongs under in the ebook. */
  const SUBJECT_TO_SECTION: Array<[RegExp, string, string]> = [
    [/part 1/i, 'PART 1 — BEFORE YOU GO', 'A trail leading into old-growth forest beneath a mountain wall'],
    [/part 2/i, 'PART 2 — THE SEVEN PARKS', 'A range of peaks rising in receding planes above a conifer treeline'],
    [/part 3/i, "PART 3 — AFTER YOU'RE HOOKED", 'A trail cresting a ridge toward distant mountain ranges'],
    [/grand canyon/i, 'Grand Canyon', 'A desert canyon of layered rock seen from a high rim'],
    [/rocky mountain/i, 'Rocky Mountain', 'A high alpine ridge of broken granite above the treeline'],
  ];

  for (const art of Object.values(illustrations) as PageIllustration[]) {
    const subject = art.subject ?? '';
    const match = SUBJECT_TO_SECTION.find(([re]) => re.test(subject));
    if (!match) continue;
    const [, sectionTitle, alt] = match;
    try {
      const bytes = await storage.readProjectFile(art.approvedAssetPath);
      const web = await sharp(bytes, { density: 300 })
        .resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, chromaSubsampling: '4:4:4' })
        .toBuffer();
      const file = join(dir, `${sectionTitle.replace(/[^a-zA-Z0-9]+/g, '_')}.jpg`);
      writeFileSync(file, web);
      out.set(sectionTitle.trim().toLowerCase(), { src: pathToFileURL(file).href, alt });
    } catch {
      // Unresolved on purpose: the assembler reports it as MISSING rather than
      // the plate quietly not being in the shipped file.
    }
  }
  return out;
}

/**
 * Assemble the EPUB MODEL for a project WITHOUT packing the .epub — read-only,
 * cheap, no zip. Powers the in-console preview (structure + text + image plan +
 * report). `buildKindleEpub` reuses this then packs the bytes.
 */
export async function assembleProjectModel(
  projectId: string,
  opts: { verifyCover?: boolean; heroes?: HeroAssembleInput } = {},
): Promise<ProjectEpubModel> {
  const project = await getProject(projectId);
  if (!project) throw new Error(`project_not_found:${projectId}`);
  const meta = resolveMeta(project);

  // Pages (real reading text) + chapter titles + entry titles.
  const pageRows = await listPaginatedPagesForProject(projectId);

  /* ── TRACK B: a TYPESET book keeps its text in the manuscript, not in pages ──
     `paginated_pages` is the Track A layout table. A book built by
     `buildTypesetInterior` reflows its Markdown through Paged.js and never fills
     that table, so an empty result here is not an error — it means this project
     is the other kind of book, and its text has to be read from the manuscript.

     Before this branch existed the export ran on happily with zero pages and
     produced a 3.6 KB EPUB containing the generated title page and nothing else,
     reporting success. Missing text now takes a DIFFERENT path rather than
     silently producing an empty book. */
  if (pageRows.length === 0 && project.manuscriptPath) {
    const markdown = (await getProjectStorage().readProjectFile(project.manuscriptPath)).toString('utf8');
    const figures = await resolveFiguresForExport(projectId, markdown);
    const typesetConfig = ProjectConfigSchema.parse(project.config);
    const sectionFigures = await resolveSectionPlatesForExport(projectId, typesetConfig);
    const model = assembleTypesetEpubModel({
      markdown,
      meta,
      config: typesetConfig,
      figures,
      sectionFigures,
    });
    const coverAssetPath = ProjectConfigSchema.parse(project.config).publishing.coverAssetPath;
    if (opts.verifyCover === false) {
      model.imagePlan.coverIncluded = Boolean(coverAssetPath);
    } else if (!coverAssetPath) {
      model.stats.warnings.push(
        'No cover image is set — the EPUB will export WITHOUT a cover. Set publishing.coverAssetPath, ' +
          'or pass a cover explicitly to buildKindleEpub.',
      );
    }
    return { model, meta, coverAssetPath, fileName: fileNameFor(meta.title), entrySource: 'manifests' };
  }
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

  // Phase A: read from the first-class ENTRIES layer when it's been backfilled.
  // Entry titles, chapter titles, and scientific names are sourced from the entry
  // objects instead of re-derived from manifests. Output is preserved because the
  // entries were backfilled from those same manifests; falls back to manifests when
  // no entries exist (e.g. a project not yet backfilled).
  const entryRows = await listEntriesForProject(projectId);
  let scientificNames: Map<string, string> | undefined;
  let entrySource: 'entries' | 'manifests' = 'manifests';
  if (entryRows.length > 0) {
    entrySource = 'entries';
    scientificNames = new Map();
    for (const e of entryRows) {
      if (e.entryTitle) entryTitles.set(e.entryKey, e.entryTitle);
      if (e.chapterTitle) chapterTitles.set(e.chapterNumber, e.chapterTitle);
      if (e.scientificName) scientificNames.set(e.entryKey, e.scientificName);
    }
  }

  const model = assembleEpubModel({ meta, chapterTitles, entryTitles, pages, scientificNames, heroes: opts.heroes });
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
  return { model, meta, coverAssetPath, fileName: fileNameFor(meta.title), entrySource };
}

/** Resolve the hero plan into temp files for export: read each Kindle-optimized
 *  JPEG from storage, write it to a per-project temp dir, and hand the assembler
 *  a file:// URL. epub-gen-memory reads those URLs from the chapter content and
 *  bundles the bytes into the .epub. Returns undefined when no heroes are imported
 *  (the EPUB then builds text-only, exactly as before). */
async function resolveHeroesForExport(projectId: string): Promise<HeroAssembleInput | undefined> {
  const plan = await loadHeroPlan(projectId);
  if (plan.entries.size === 0 && plan.sections.size === 0 && !plan.frontispiece) return undefined;
  const storage = getProjectStorage();
  const dir = join(tmpdir(), `wl-heroes-${projectId}`);
  mkdirSync(dir, { recursive: true });
  const toRef = async (heroId: string, kindleKey: string, alt: string): Promise<HeroRef> => {
    const bytes = await storage.readProjectFile(kindleKey);
    const f = join(dir, `hero_${heroId}.jpg`);
    writeFileSync(f, bytes);
    return { src: pathToFileURL(f).href, alt };
  };
  const entries = new Map<string, HeroRef>();
  for (const [entryKey, h] of plan.entries) entries.set(entryKey, await toRef(h.heroId, h.kindleKey, h.alt));
  const sections = new Map<string, HeroRef>();
  for (const [label, h] of plan.sections) sections.set(label, await toRef(h.heroId, h.kindleKey, h.alt));
  const frontispiece = plan.frontispiece
    ? await toRef(plan.frontispiece.heroId, plan.frontispiece.kindleKey, plan.frontispiece.alt)
    : undefined;
  return { entries, sections, frontispiece };
}

export interface BuildKindleEpubOptions {
  /**
   * A cover supplied by the caller, used INSTEAD of `publishing.coverAssetPath`.
   *
   * Exists because a print wrap built outside the platform — by a one-shot
   * script, on an approved master the operator chose — never lands in
   * `coverAssetPath`, and an ebook with no cover is not shippable. Accepts the
   * full landscape wrap or an already-portrait front panel; the crop below
   * handles both. Passing this does not write anything back to the project.
   */
  coverImage?: Buffer;
}

/** Build the Kindle EPUB for a project. Returns the bytes + a build report. */
export async function buildKindleEpub(
  projectId: string,
  options: BuildKindleEpubOptions = {},
): Promise<BuildEpubResult> {
  // verifyCover:false — this path reads + resizes the cover below and finalizes
  // coverIncluded from the actual embed, so no need to pre-read it here too.
  const heroes = await resolveHeroesForExport(projectId);
  const { model, meta, coverAssetPath, fileName, entrySource } = await assembleProjectModel(projectId, { verifyCover: false, heroes });

  // Cover — Kindle wants a PORTRAIT front cover (~1600x2560), NOT the landscape
  // print wrap. The stored cover asset is the full wrap (back | spine | front);
  // `fit:cover, position:right` extracts the rightmost portrait region — i.e. the
  // front panel — for any standard left-to-right wrap, and merely fits an
  // already-portrait source. Output a clean 1600x2560 JPEG. Then write to a temp
  // file and hand epub-gen-memory a file:// URL (Node path read).
  let coverFileUrl: string | undefined;
  let coverEmbedded = false;
  const coverSource = options.coverImage ? 'caller' : coverAssetPath ? 'project' : 'none';
  if (coverSource !== 'none') {
    try {
      const raw = options.coverImage ?? (await getProjectStorage().readProjectFile(coverAssetPath!));
      const cm = await sharp(raw).metadata();
      const cw = cm.width ?? 0;
      const ch = cm.height ?? 0;
      const targetRatio = 1600 / 2560; // 0.625 portrait
      const cropW = Math.round(ch * targetRatio);
      // Pull the window slightly off the right bleed edge so the front-panel
      // subject (e.g. the title + animal) isn't clipped at its left edge.
      const rightInset = Math.round(cw * 0.04);
      const left = cw - cropW - rightInset;
      /* A caller that already supplied the exact target is not second-guessed.

         The two branches below are HEURISTICS for a cover of unknown shape: the
         first guesses where the front panel is in a landscape wrap, the second
         crops a portrait image toward its right edge. Neither is right when the
         caller has cut the front panel itself from known geometry — that path
         handed in a 1707x2560 panel and the right-biased `fit:'cover'` quietly
         took 107px off its LEFT edge, moving the composition 0.36in. */
      const alreadyTarget = cw === 1600 && ch === 2560;
      const resized = alreadyTarget
        ? raw
        : await (cw > ch && cropW > 0 && left >= 0
            ? // Landscape wrap → extract the front (right) panel, then scale to 1600x2560.
              sharp(raw).extract({ left, top: 0, width: cropW, height: ch }).resize(1600, 2560)
            : // Already portrait / not a wrap → fit the portrait box (front-biased right).
              sharp(raw).resize(1600, 2560, { fit: 'cover', position: 'right' })
          )
            .jpeg({ quality: 88 })
            .toBuffer();
      const tmp = join(tmpdir(), `wl-cover-${projectId}.jpg`);
      writeFileSync(tmp, resized);
      coverFileUrl = pathToFileURL(tmp).href;
      coverEmbedded = true;
    } catch (err) {
      // Cover is best-effort: a missing/unreadable cover must not fail the export.
      coverFileUrl = undefined;
      coverEmbedded = false;
      // eslint-disable-next-line no-console
      console.warn(`[epub] cover not embedded (source: ${coverSource}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const epubOptions: Options = {
    title: meta.title,
    author: meta.authors,
    /* EPUBCheck REJECTS an empty publisher, and this template emits the element
       unconditionally: with nothing set, the package document carried
       `<dc:publisher></dc:publisher>` and failed validation with RSC-005 twice.
       The same value also fills `dc:rights`, which read "Copyright (c) 2026 by "
       with the name simply missing off the end.

       So fall back to the author. That is not an invented imprint — a KDP title
       with no publisher of its own IS published by its author, and Amazon lists
       it that way. Set `publishing.publisher.imprint` to override. */
    publisher: meta.publisher || meta.authors.join(', '),
    description: meta.description,
    lang: meta.language,
    cover: coverFileUrl,
    tocTitle: 'Contents',
    version: 3,
    // OFF: each chapter now renders its own <h1> inside content (assemble-epub),
    // so the frontispiece can be image-only with no heading printed over the art.
    prependChapterTitles: false,
    css: EPUB_CSS,
  };

  // Reflect the ACTUAL cover outcome in the model's image plan.
  model.imagePlan.coverIncluded = coverEmbedded;

  // Use the EPub class (named export) rather than the default function: under
  // some ESM loaders the CJS default export isn't unwrapped to a callable.
  const epubDoc = await new EPub(epubOptions, model.chapters).render();
  const buffer = await epubDoc.genEpub();
  return { buffer, model, meta, coverEmbedded, fileName, entrySource };
}
