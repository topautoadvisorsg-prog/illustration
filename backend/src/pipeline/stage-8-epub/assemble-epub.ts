/**
 * Stage 8 — EPUB model assembler (PURE).
 *
 * Turns the existing structured book data (real page text + entry/chapter
 * structure + metadata) into an ordered list of EPUB chapters (title + XHTML).
 * No I/O, no image spend — read-only transformation, fully unit-testable.
 *
 * Reflow model (SPEC_EPUB_EXPORT.md): pages are a PRINT concept. For Kindle we
 * regroup pages back into entries (opener + its continuations, by entryKey) and
 * concatenate their `readingFieldText` into one flowing section. The body is
 * cleaned with the SAME helpers print uses (stripReadingFieldMetadata strips the
 * binomial/hazard header; markdownToBlocks yields typed plain-text blocks) so the
 * eBook text matches the book. The baked full-page renders are NOT used — their
 * text is fused into pixels and would duplicate the reflowed copy.
 */

import { markdownToBlocks, type BodyBlock } from '../whole-page-render/markdown-blocks.js';
import { extractBinomial, stripReadingFieldMetadata } from '../subject-badges/extract-badges.js';

export interface EpubMeta {
  title: string;
  subtitle?: string;
  authors: string[];
  publisher?: string;
  language: string;
  description?: string;
  isbn?: string;
  series?: string;
  /** Alt text for the cover image (accessibility). */
  coverAlt: string;
}

/** Minimal page shape the assembler needs (subset of the `pages` row). */
export interface EpubSourcePage {
  pageKey: string;
  chapterNumber: number;
  plannedPageNumber: number;
  section: string; // FRONT_MATTER | BODY | BACK_MATTER
  frontMatterType?: string | null;
  entryKey?: string | null;
  pageRole: string; // opener | continuation | compacted
  readingFieldText?: string | null;
  spineOrder?: number | null;
}

export interface EpubAssembleInput {
  meta: EpubMeta;
  /** chapterNumber → chapter title (from CHAPTER manifests). */
  chapterTitles: Map<number, string>;
  /** entryKey → entry title (from PAGE manifests). */
  entryTitles: Map<string, string>;
  pages: EpubSourcePage[];
}

export type EpubChapterKind = 'TITLE' | 'COPYRIGHT' | 'INTRODUCTION' | 'BODY' | 'GLOSSARY' | 'ABOUT';

/** A single navigable entry inside a body chapter — the unit the operator clicks
 *  through in the in-console preview, and where a future hero illustration lands. */
export interface EpubEntry {
  title: string;
  scientificName?: string;
  /** Body XHTML (headings + paragraphs), excludes the <h2> title + sci line. */
  bodyHtml: string;
  words: number;
  /** Where a hero illustration WILL appear once hero-image mode ships. */
  heroPlacement: 'BEFORE_TITLE';
  /** v1: heroes are not generated/embedded yet, so this is always false for now. */
  heroIncluded: boolean;
}

/** One EPUB chapter = one XHTML file. `content` is a body fragment (no <html>). */
export interface EpubChapter {
  title: string;
  content: string;
  /** Front matter before the TOC (title page, copyright). */
  beforeToc?: boolean;
  /** Section classification for the preview UI. */
  kind: EpubChapterKind;
  /** Present for BODY chapters: the structured entries (click-through + image plan). */
  entries?: EpubEntry[];
}

/** What images the EPUB contains and where future hero images will go — so image
 *  placement is never invisible in the operator preview. */
export interface ImagePlan {
  /** Set by the I/O layer (build-epub) once the cover is resolved. */
  coverIncluded: boolean;
  /** v1 = OFF (text-only interior). Future = ON (one hero per entry). */
  heroMode: 'OFF' | 'ON';
  /** Where each hero will appear in the entry once enabled. */
  plannedHeroPlacement: 'BEFORE_ENTRY_TITLE';
  /** Count of body entries that will receive a hero (currently omitted in v1). */
  entriesAwaitingHero: number;
}

export interface EpubModel {
  chapters: EpubChapter[];
  imagePlan: ImagePlan;
  stats: {
    chapters: number;
    bodyChapters: number;
    entries: number;
    words: number;
    skipped: string[]; // page kinds intentionally dropped (e.g. INDEX, CONTENTS)
    omittedImages: number; // interior images not yet included (future hero illustrations)
    warnings: string[]; // content issues the operator should see before exporting
  };
}

function escapeXml(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function blocksToHtml(blocks: BodyBlock[]): string {
  return blocks
    .map((b) => {
      const t = escapeXml(b.text);
      if (b.type === 'heading') return `<h3>${t}</h3>`;
      if (b.type === 'subheading') return `<h4>${t}</h4>`;
      return `<p>${t}</p>`;
    })
    .join('\n');
}

function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Concatenate the reading text of a set of pages (in given order). */
function joinPageText(pages: EpubSourcePage[]): string {
  return pages
    .map((p) => (p.readingFieldText ?? '').trim())
    .filter(Boolean)
    .join('\n\n');
}

/** Order pages by spineOrder when present, else by pageKey (stable, human order). */
function bySpineThenKey(a: EpubSourcePage, b: EpubSourcePage): number {
  const so = (a.spineOrder ?? 0) - (b.spineOrder ?? 0);
  if (so !== 0) return so;
  return a.pageKey.localeCompare(b.pageKey);
}

/** Build one entry (opener + continuations already concatenated) as structured
 *  parts: title, optional scientific name, and the body XHTML. */
function buildEntry(title: string, rawText: string): EpubEntry {
  const binomial = extractBinomial(rawText) ?? undefined;
  const cleaned = stripReadingFieldMetadata(rawText);
  const blocks = markdownToBlocks(cleaned);
  return {
    title,
    scientificName: binomial,
    bodyHtml: blocksToHtml(blocks),
    words: wordCount(cleaned),
    heroPlacement: 'BEFORE_TITLE',
    heroIncluded: false, // v1: no interior hero images yet
  };
}

/** Pack a structured entry into the EPUB XHTML fragment (title + sci + body). */
function entryToXhtml(e: EpubEntry): string {
  const parts = [`<h2>${escapeXml(e.title)}</h2>`];
  if (e.scientificName) parts.push(`<p class="sci"><em>${escapeXml(e.scientificName)}</em></p>`);
  parts.push(e.bodyHtml);
  return `<section class="entry">${parts.join('\n')}</section>`;
}

const FRONT_MATTER_SKIP = new Set(['HALF_TITLE', 'TITLE_PAGE', 'CONTENTS', 'BLANK']);
const BACK_MATTER_SKIP = new Set(['INDEX']); // page-number index is meaningless in reflow

/**
 * Build the ordered EPUB chapter list from structured book data.
 *
 * Order: synthesized Title Page → Copyright → Introduction (grouped) → [TOC] →
 * Body chapters 1..N (each with its entries) → Glossary → About the Series.
 */
export function assembleEpubModel(input: EpubAssembleInput): EpubModel {
  const { meta, chapterTitles, entryTitles, pages } = input;
  const chapters: EpubChapter[] = [];
  const skipped = new Set<string>();
  const warnings: string[] = [];
  let totalWords = 0;
  let entryCount = 0;

  // ── 1. Title page (synthesized from metadata; beforeToc) ──
  // The EPUB packer prepends the chapter `title` as the page <h1>, so the title
  // is NOT repeated in `content` here (that double-rendered it). Publisher lives
  // on the copyright page, not the title page.
  chapters.push({
    kind: 'TITLE',
    beforeToc: true,
    title: meta.title,
    content: [
      meta.subtitle ? `<p class="subtitle">${escapeXml(meta.subtitle)}</p>` : '',
      meta.authors.length ? `<p class="author">${escapeXml(meta.authors.join(', '))}</p>` : '',
      meta.series ? `<p class="series">${escapeXml(meta.series)}</p>` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  });

  const front = pages.filter((p) => p.section === 'FRONT_MATTER');
  const body = pages.filter((p) => p.section === 'BODY');
  const back = pages.filter((p) => p.section === 'BACK_MATTER');

  // ── 2. Copyright (beforeToc) ──
  const copyright = front.filter((p) => p.frontMatterType === 'COPYRIGHT_PAGE').sort(bySpineThenKey);
  if (copyright.length) {
    const text = joinPageText(copyright);
    const blocks = markdownToBlocks(stripReadingFieldMetadata(text));
    chapters.push({ kind: 'COPYRIGHT', beforeToc: true, title: 'Copyright', content: blocksToHtml(blocks) });
  }

  // ── 3. Introduction (INTRODUCTION + INTRODUCTION_CONT, grouped & ordered) ──
  const intro = front
    .filter((p) => (p.frontMatterType ?? '').startsWith('INTRODUCTION'))
    .sort(bySpineThenKey);
  if (intro.length) {
    const text = joinPageText(intro);
    const blocks = markdownToBlocks(stripReadingFieldMetadata(text));
    chapters.push({ kind: 'INTRODUCTION', title: 'Introduction', content: blocksToHtml(blocks) });
    totalWords += wordCount(text);
  }
  for (const p of front) {
    const t = p.frontMatterType ?? '';
    if (FRONT_MATTER_SKIP.has(t)) skipped.add(t);
  }

  // ── 4. Body chapters (1..N), each with its entries ──
  const bodyChapterNums = [...new Set(body.map((p) => p.chapterNumber))].sort((a, b) => a - b);
  let bodyChapters = 0;
  for (const chNum of bodyChapterNums) {
    const chPages = body.filter((p) => p.chapterNumber === chNum).sort((a, b) => a.plannedPageNumber - b.plannedPageNumber);
    // Group consecutive pages into entries by entryKey (preserving first-seen order).
    const order: string[] = [];
    const groups = new Map<string, EpubSourcePage[]>();
    for (const p of chPages) {
      const key = p.entryKey ?? p.pageKey;
      if (!groups.has(key)) { groups.set(key, []); order.push(key); }
      groups.get(key)!.push(p);
    }
    const chapterTitle = chapterTitles.get(chNum) || `Chapter ${chNum}`;
    const entries: EpubEntry[] = [];
    for (const key of order) {
      const grp = groups.get(key)!;
      const title = entryTitles.get(key) || entryTitles.get(grp[0]!.pageKey) || '';
      const raw = joinPageText(grp);
      if (!raw && !title) continue;
      if (!title) warnings.push(`${chapterTitle}: an entry (${key}) has no title — shown as "Untitled".`);
      if (!raw.trim()) warnings.push(`${chapterTitle}: entry "${title || key}" has no body text.`);
      const entry = buildEntry(title || 'Untitled', raw);
      entries.push(entry);
      totalWords += entry.words;
      entryCount += 1;
    }
    if (entries.length) {
      chapters.push({
        kind: 'BODY',
        title: chapterTitle,
        content: entries.map(entryToXhtml).join('\n'),
        entries,
      });
      bodyChapters += 1;
    }
  }

  // ── 5. Back matter: Glossary (keep), Index (skip), About the Series (keep) ──
  const glossary = back.filter((p) => p.frontMatterType === 'GLOSSARY').sort(bySpineThenKey);
  if (glossary.length) {
    const blocks = markdownToBlocks(stripReadingFieldMetadata(joinPageText(glossary)));
    chapters.push({ kind: 'GLOSSARY', title: 'Glossary', content: blocksToHtml(blocks) });
  }
  const about = back.filter((p) => p.frontMatterType === 'ABOUT_SERIES').sort(bySpineThenKey);
  if (about.length) {
    const blocks = markdownToBlocks(stripReadingFieldMetadata(joinPageText(about)));
    chapters.push({ kind: 'ABOUT', title: 'About the Series', content: blocksToHtml(blocks) });
  }
  for (const p of back) {
    const t = p.frontMatterType ?? '';
    if (BACK_MATTER_SKIP.has(t)) skipped.add(t);
  }

  return {
    chapters,
    imagePlan: {
      coverIncluded: false, // set by the I/O layer (build-epub) once the cover is resolved
      heroMode: 'OFF', // v1: text-only interior
      plannedHeroPlacement: 'BEFORE_ENTRY_TITLE',
      entriesAwaitingHero: entryCount,
    },
    stats: {
      chapters: chapters.length,
      bodyChapters,
      entries: entryCount,
      words: totalWords,
      skipped: [...skipped],
      omittedImages: entryCount, // one future hero per entry, none embedded in v1
      warnings,
    },
  };
}
