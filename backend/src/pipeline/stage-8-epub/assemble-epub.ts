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

/** One EPUB chapter = one XHTML file. `content` is a body fragment (no <html>). */
export interface EpubChapter {
  title: string;
  content: string;
  /** Front matter before the TOC (title page, copyright). */
  beforeToc?: boolean;
}

export interface EpubModel {
  chapters: EpubChapter[];
  stats: {
    chapters: number;
    bodyChapters: number;
    entries: number;
    words: number;
    skipped: string[]; // page kinds intentionally dropped (e.g. INDEX, CONTENTS)
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

/** Render one entry (opener + continuations already concatenated) to XHTML. */
function entryHtml(title: string, rawText: string): { html: string; words: number } {
  const binomial = extractBinomial(rawText) ?? undefined;
  const cleaned = stripReadingFieldMetadata(rawText);
  const blocks = markdownToBlocks(cleaned);
  const parts: string[] = [`<h2>${escapeXml(title)}</h2>`];
  if (binomial) parts.push(`<p class="sci"><em>${escapeXml(binomial)}</em></p>`);
  parts.push(blocksToHtml(blocks));
  return { html: parts.join('\n'), words: wordCount(cleaned) };
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
  let totalWords = 0;
  let entryCount = 0;

  // ── 1. Title page (synthesized from metadata; beforeToc) ──
  // The EPUB packer prepends the chapter `title` as the page <h1>, so the title
  // is NOT repeated in `content` here (that double-rendered it). Publisher lives
  // on the copyright page, not the title page.
  chapters.push({
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
    chapters.push({ beforeToc: true, title: 'Copyright', content: blocksToHtml(blocks) });
  }

  // ── 3. Introduction (INTRODUCTION + INTRODUCTION_CONT, grouped & ordered) ──
  const intro = front
    .filter((p) => (p.frontMatterType ?? '').startsWith('INTRODUCTION'))
    .sort(bySpineThenKey);
  if (intro.length) {
    const text = joinPageText(intro);
    const blocks = markdownToBlocks(stripReadingFieldMetadata(text));
    chapters.push({ title: 'Introduction', content: blocksToHtml(blocks) });
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
    const parts: string[] = [];
    for (const key of order) {
      const grp = groups.get(key)!;
      const title = entryTitles.get(key) || entryTitles.get(grp[0]!.pageKey) || '';
      const raw = joinPageText(grp);
      if (!raw && !title) continue;
      const { html, words } = entryHtml(title || 'Untitled', raw);
      parts.push(`<section class="entry">${html}</section>`);
      totalWords += words;
      entryCount += 1;
    }
    if (parts.length) {
      chapters.push({
        title: chapterTitles.get(chNum) || `Chapter ${chNum}`,
        content: parts.join('\n'),
      });
      bodyChapters += 1;
    }
  }

  // ── 5. Back matter: Glossary (keep), Index (skip), About the Series (keep) ──
  const glossary = back.filter((p) => p.frontMatterType === 'GLOSSARY').sort(bySpineThenKey);
  if (glossary.length) {
    const blocks = markdownToBlocks(stripReadingFieldMetadata(joinPageText(glossary)));
    chapters.push({ title: 'Glossary', content: blocksToHtml(blocks) });
  }
  const about = back.filter((p) => p.frontMatterType === 'ABOUT_SERIES').sort(bySpineThenKey);
  if (about.length) {
    const blocks = markdownToBlocks(stripReadingFieldMetadata(joinPageText(about)));
    chapters.push({ title: 'About the Series', content: blocksToHtml(blocks) });
  }
  for (const p of back) {
    const t = p.frontMatterType ?? '';
    if (BACK_MATTER_SKIP.has(t)) skipped.add(t);
  }

  return {
    chapters,
    stats: {
      chapters: chapters.length,
      bodyChapters,
      entries: entryCount,
      words: totalWords,
      skipped: [...skipped],
    },
  };
}
