/**
 * Stage 6 — page HTML generator.
 *
 * What it does: builds the HTML/CSS document Paged.js paginates into a print page.
 * Typography, colors, and trim all come from project config (never hardcoded).
 * The art slot is a clean placeholder for the text-fit preview pass; the real,
 * text-free illustration is dropped in for the final pass. ALL text on the page
 * (title, scientific name, body, any future labels) is typeset here by the layout
 * engine — never baked into the generated image.
 */

import type { LayoutTemplateId, PageManifest, ProjectConfig } from '@wildlands/shared';
import type { PageGeometry } from './page-geometry.js';
import { LAYOUT_PROFILES, getLayoutProfile, type ArtSlot } from './layout-profiles.js';

export interface RenderHtmlOptions {
  geometry: PageGeometry;
  /** Data URI for the illustration; omit for a preview placeholder. */
  imageDataUri?: string;
  /** Paged.js polyfill source; omit to produce browser-free HTML (e.g. for tests). */
  polyfillJs?: string;
  chapterLabel?: string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Minimal inline markdown -> HTML, applied AFTER escaping (so tags are safe). */
export function inlineMarkdown(escaped: string): string {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<span class="mono">$1</span>');
}

function fmt(text: string): string {
  return inlineMarkdown(escapeHtml(text.trim()));
}

/**
 * Render entry body markdown into book-quality HTML: section headings, bullet
 * ID-checklists (core to field guides), and paragraphs, with inline bold/italic.
 * Processed line-by-line so a heading immediately followed by a list is handled.
 */
function bodyToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let listItems: string[] = [];
  let paragraph: string[] = [];

  const flushList = () => {
    if (listItems.length) {
      out.push(`<ul class="id-list">${listItems.map((li) => `<li>${fmt(li)}</li>`).join('')}</ul>`);
      listItems = [];
    }
  };
  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p class="section-body">${fmt(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      flushParagraph();
      continue;
    }
    const heading = line.match(/^(#{2,6})\s+(.*)$/);
    if (heading) {
      flushList();
      flushParagraph();
      out.push(`<h3 class="section-header">${fmt(heading[2]!)}</h3>`);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      listItems.push(bullet[1]!);
      continue;
    }
    // A level-1 heading (entry title) is rendered separately; strip the marker.
    flushList();
    paragraph.push(line.replace(/^#\s+/, ''));
  }
  flushList();
  flushParagraph();
  return out.join('\n');
}

/** Positioning only (float direction / block / margins) — size comes from coverage. */
function artSlotPositionCss(slot: ArtSlot): string {
  switch (slot) {
    case 'FLOAT_LEFT':
      return 'float:left;margin:0 18pt 10pt 0;';
    case 'FLOAT_RIGHT':
      return 'float:right;margin:0 0 10pt 18pt;';
    case 'TOP_BAND':
      return 'display:block;margin:0 0 14pt 0;';
    case 'BOTTOM_BAND':
      return 'display:block;margin:14pt 0 0 0;';
    case 'FULL_PAGE':
      return 'display:block;margin:0;';
    case 'SIDEBAR_RIGHT':
      return 'float:right;margin:0 0 10pt 18pt;';
    case 'SCATTERED':
      return 'float:left;margin:0 14pt 8pt 0;';
    case 'CENTER_WRAP':
      return 'display:block;margin:0 auto 10pt auto;';
    default:
      return 'float:left;margin:0 18pt 10pt 0;';
  }
}

/**
 * Inline size for the art slot, scaled to the layout's COVERAGE (image share of
 * the page) so the reserved zone matches the final proportions even before any
 * illustration exists.
 *   - full-width bands/plate: width 100%, height = coverage x text-frame height.
 *   - tall sidebar: width = coverage of the column over near-full height.
 *   - floats / scattered / centered: a balanced box whose area ~= coverage.
 */
function artSlotSizeStyle(slot: ArtSlot, coverage: number, frameHeightIn: number): string {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  if (slot === 'TOP_BAND' || slot === 'BOTTOM_BAND' || slot === 'FULL_PAGE') {
    return `width:100%;height:${Math.max(0.8, round2(coverage * frameHeightIn))}in;`;
  }
  if (slot === 'SIDEBAR_RIGHT') {
    const widthPct = Math.min(60, Math.max(18, Math.round((coverage / 0.95) * 100)));
    return `width:${widthPct}%;height:${round2(frameHeightIn * 0.95)}in;`;
  }
  // floats / scattered / center-wrap: balanced rectangle with area ~= coverage.
  const frac = Math.sqrt(Math.max(0.01, coverage));
  return `width:${Math.round(frac * 100)}%;height:${round2(frac * frameHeightIn)}in;`;
}

/** Build the standalone HTML document for one page. */
export function buildPageHtml(page: PageManifest, config: ProjectConfig, opts: RenderHtmlOptions): string {
  const { geometry } = opts;
  const profile = getLayoutProfile(page.layoutTemplate);
  const t = config.typography;
  const c = config.colorPalette;
  const m = geometry.margins;

  const art = opts.imageDataUri
    ? `<img src="${opts.imageDataUri}" alt="${escapeHtml(page.entryTitle)}">`
    : `<div class="art-placeholder">PREVIEW · ART SLOT (${escapeHtml(page.layoutTemplate)})</div>`;

  const scientific = page.scientificName
    ? `<p class="scientific-name">${escapeHtml(page.scientificName)}</p>`
    : '';

  const polyfill = opts.polyfillJs ? `<script>${opts.polyfillJs}</script>` : '';
  const chapterLabel = opts.chapterLabel ? escapeHtml(opts.chapterLabel) : `Chapter ${page.chapterNumber}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(page.entryTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  @page {
    size: ${geometry.pageWidthIn}in ${geometry.pageHeightIn}in;
    margin: ${m.topIn}in ${m.rightIn}in ${m.bottomIn}in ${m.gutterIn}in;
    background: ${c.paper};
    @bottom-center { content: "· " counter(page) " ·"; font-family: '${t.bodyFont}', serif; font-size: 9pt; color: ${c.ink}; }
    @top-left { content: "${chapterLabel}"; font-family: '${t.bodyFont}', serif; ${t.smallCaps ? 'font-variant: small-caps;' : ''} font-size: 8.5pt; color: ${c.accent}; letter-spacing: 0.08em; }
  }
  html, body { background: ${c.paper}; margin: 0; padding: 0; }
  body { font-family: '${t.bodyFont}', serif; color: ${c.ink}; font-size: ${t.bodyPt}pt; line-height: ${t.lineHeight}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .entry-title { font-family: '${t.headingFont}', serif; font-weight: 700; font-size: 24pt; text-transform: uppercase; letter-spacing: 0.02em; margin: 0 0 4pt 0; color: ${c.ink}; }
  .scientific-name { font-style: italic; font-size: 13pt; color: ${c.accent}; margin: 0 0 16pt 0; }
  .art-slot { ${artSlotPositionCss(profile.artSlot)} page-break-inside: avoid; }
  .art-placeholder { width: 100%; height: 100%; min-height: 2.4in; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: #E8D9B0; outline: 1px dashed ${c.accent}; outline-offset: -4px; font-style: italic; font-size: 8pt; color: ${c.accent}; }
  .art-slot img { width: 100%; height: 100%; object-fit: cover; display: block; -webkit-mask-image: radial-gradient(ellipse at center, black 60%, transparent 100%); mask-image: radial-gradient(ellipse at center, black 60%, transparent 100%); }
  .section-header { ${t.smallCaps ? 'font-variant: small-caps;' : ''} font-weight: 600; font-size: ${t.bodyPt}pt; letter-spacing: 0.08em; margin: 8pt 0 2pt 0; color: ${c.ink}; }
  .section-body { margin: 0 0 6pt 0; text-align: justify; hyphens: auto; }
  .id-list { margin: 4pt 0 6pt 0; padding-left: 14pt; }
  .id-list li { margin: 0 0 2pt 0; text-align: left; }
  .mono { font-family: 'Courier New', monospace; font-size: 0.92em; }
  ${page.layoutTemplate === 'LAYOUT_4_DANGER_WARNING' ? `.entry-title{color:${c.warning};} body{border-left:4pt solid ${c.warning};padding-left:10pt;}` : ''}
</style>
</head>
<body>
  <h1 class="entry-title">${escapeHtml(page.entryTitle)}</h1>
  ${scientific}
  <figure class="art-slot" style="${artSlotSizeStyle(profile.artSlot, profile.artAreaFraction, geometry.textHeightIn)}">${art}</figure>
  ${bodyToHtml(page.bodyMarkdown)}
  ${polyfill}
</body>
</html>`;
}

export interface ChapterPageRender {
  entryTitle: string;
  scientificName?: string;
  bodyMarkdown: string;
  layoutTemplate: LayoutTemplateId;
  /** Data URI of the approved/upscaled art; omit for a clean placeholder slot. */
  imageDataUri?: string;
}

export interface ChapterRenderInfo {
  chapterNumber: number;
  chapterTitle: string;
}

export interface ChapterHtmlOptions {
  geometry: PageGeometry;
  polyfillJs?: string;
}

/** Per-architecture art-slot CSS, scoped to a `.arch-<NAME>` page wrapper. */
function scopedArtSlotCss(slot: ArtSlot): string {
  return `.arch-${slot} .art-slot{ ${artSlotPositionCss(slot)} }`;
}

/**
 * Build ONE HTML document containing every page of a chapter, so Paged.js
 * paginates the whole chapter in a single render pass (chapter-by-chapter keeps
 * memory bounded on long books). Each page carries its own architecture via an
 * `.arch-*` wrapper class. Pages with no image get the clean placeholder slot, so
 * a chapter renders today even before real illustrations exist.
 */
export function buildChapterHtml(
  pages: ChapterPageRender[],
  config: ProjectConfig,
  chapter: ChapterRenderInfo,
  opts: ChapterHtmlOptions,
): string {
  const { geometry } = opts;
  const t = config.typography;
  const c = config.colorPalette;
  const m = geometry.margins;
  const chapterLabel = escapeHtml(`Chapter ${chapter.chapterNumber} — ${chapter.chapterTitle}`);

  // Emit scoped CSS for every architecture so any page in the chapter renders.
  const archCss = (Object.values(LAYOUT_PROFILES).map((p) => p.artSlot) as ArtSlot[])
    .filter((slot, i, arr) => arr.indexOf(slot) === i)
    .map(scopedArtSlotCss)
    .join('\n  ');

  const pagesHtml = pages
    .map((page) => {
      const profile = getLayoutProfile(page.layoutTemplate);
      const danger = page.layoutTemplate === 'LAYOUT_4_DANGER_WARNING' ? ' is-danger' : '';
      const art = page.imageDataUri
        ? `<img src="${page.imageDataUri}" alt="${escapeHtml(page.entryTitle)}">`
        : `<div class="art-placeholder">PREVIEW · ART SLOT (${escapeHtml(page.layoutTemplate)})</div>`;
      const scientific = page.scientificName
        ? `<p class="scientific-name">${escapeHtml(page.scientificName)}</p>`
        : '';
      return `<article class="book-page arch-${profile.artSlot}${danger}">
  <h1 class="entry-title">${escapeHtml(page.entryTitle)}</h1>
  ${scientific}
  <figure class="art-slot" style="${artSlotSizeStyle(profile.artSlot, profile.artAreaFraction, geometry.textHeightIn)}">${art}</figure>
  ${bodyToHtml(page.bodyMarkdown)}
</article>`;
    })
    .join('\n');

  const polyfill = opts.polyfillJs ? `<script>${opts.polyfillJs}</script>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${chapterLabel}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  @page {
    size: ${geometry.pageWidthIn}in ${geometry.pageHeightIn}in;
    margin: ${m.topIn}in ${m.rightIn}in ${m.bottomIn}in ${m.gutterIn}in;
    background: ${c.paper};
    @bottom-center { content: "· " counter(page) " ·"; font-family: '${t.bodyFont}', serif; font-size: 9pt; color: ${c.ink}; }
    @top-left { content: "${chapterLabel}"; font-family: '${t.bodyFont}', serif; ${t.smallCaps ? 'font-variant: small-caps;' : ''} font-size: 8.5pt; color: ${c.accent}; letter-spacing: 0.08em; }
  }
  html, body { background: ${c.paper}; margin: 0; padding: 0; }
  body { font-family: '${t.bodyFont}', serif; color: ${c.ink}; font-size: ${t.bodyPt}pt; line-height: ${t.lineHeight}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .book-page { page-break-after: always; }
  .book-page:last-child { page-break-after: auto; }
  .entry-title { font-family: '${t.headingFont}', serif; font-weight: 700; font-size: 24pt; text-transform: uppercase; letter-spacing: 0.02em; margin: 0 0 4pt 0; color: ${c.ink}; }
  .scientific-name { font-style: italic; font-size: 13pt; color: ${c.accent}; margin: 0 0 16pt 0; }
  ${archCss}
  .art-slot { page-break-inside: avoid; }
  .art-placeholder { width: 100%; height: 100%; min-height: 2.4in; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: #E8D9B0; outline: 1px dashed ${c.accent}; outline-offset: -4px; font-style: italic; font-size: 8pt; color: ${c.accent}; }
  .art-slot img { width: 100%; height: 100%; object-fit: cover; display: block; -webkit-mask-image: radial-gradient(ellipse at center, black 60%, transparent 100%); mask-image: radial-gradient(ellipse at center, black 60%, transparent 100%); }
  .section-header { ${t.smallCaps ? 'font-variant: small-caps;' : ''} font-weight: 600; font-size: ${t.bodyPt}pt; letter-spacing: 0.08em; margin: 8pt 0 2pt 0; color: ${c.ink}; }
  .section-body { margin: 0 0 6pt 0; text-align: justify; hyphens: auto; }
  .id-list { margin: 4pt 0 6pt 0; padding-left: 14pt; }
  .id-list li { margin: 0 0 2pt 0; text-align: left; }
  .mono { font-family: 'Courier New', monospace; font-size: 0.92em; }
  .is-danger .entry-title { color: ${c.warning}; }
  .is-danger { border-left: 4pt solid ${c.warning}; padding-left: 10pt; }
</style>
</head>
<body>
${pagesHtml}
${polyfill}
</body>
</html>`;
}
