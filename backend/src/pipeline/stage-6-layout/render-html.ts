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

type Typography = ProjectConfig['typography'];
type Palette = ProjectConfig['colorPalette'];

/**
 * Build the Google Fonts stylesheet URL from whatever fonts the project config
 * specifies (display, body, caption) — so changing the typeface in config
 * actually loads it, instead of being hardcoded to one family.
 */
export function googleFontsHref(t: Typography): string {
  const families = Array.from(
    new Set([t.headingFont, t.bodyFont, t.captionFont].map((f) => f.trim()).filter(Boolean)),
  );
  const weights = 'ital,wght@0,400;0,500;0,600;0,700;1,400';
  const query = families.map((f) => `family=${f.replace(/\s+/g, '+')}:${weights}`).join('&');
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

/** The <head> font tags, driven by config. */
function fontLinkTags(t: Typography): string {
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${googleFontsHref(t)}" rel="stylesheet">`;
}

/** The @page margin boxes (running header + page number) — uses the Label role. */
function pageBoxesCss(t: Typography, c: Palette, chapterLabel: string): string {
  const sc = t.smallCaps ? 'font-variant: small-caps;' : '';
  return `@bottom-center { content: "· " counter(page) " ·"; font-family: '${t.headingFont}', serif; font-size: ${t.labelPt}pt; color: ${c.ink}; }
    @top-left { content: "${chapterLabel}"; font-family: '${t.headingFont}', serif; ${sc} font-size: ${t.labelPt}pt; color: ${c.accent}; letter-spacing: 0.08em; }`;
}

/**
 * Shared, role-based typography CSS. Single source of truth for both the single
 * page and full-chapter renderers, so every role (entry/section/body/caption/
 * label) is consistent and driven by config rather than scattered literals.
 */
function typographyStyleBlock(t: Typography, c: Palette): string {
  const sc = t.smallCaps ? 'font-variant: small-caps;' : '';
  return `:root {
    --font-display: '${t.headingFont}', Georgia, 'Times New Roman', serif;
    --font-body: '${t.bodyFont}', Georgia, 'Times New Roman', serif;
    --font-caption: '${t.captionFont}', Georgia, serif;
  }
  html, body { background: ${c.paper}; margin: 0; padding: 0; }
  body { font-family: var(--font-body); color: ${c.ink}; font-size: ${t.bodyPt}pt; line-height: ${t.lineHeight}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .entry-title { font-family: var(--font-display); font-weight: 600; font-size: ${t.entryTitlePt}pt; text-transform: uppercase; letter-spacing: 0.02em; margin: 0 0 4pt 0; color: ${c.ink}; }
  .scientific-name { font-family: var(--font-body); font-style: italic; font-size: ${t.subsectionHeadingPt}pt; color: ${c.accent}; margin: 0 0 16pt 0; }
  .section-header { font-family: var(--font-display); ${sc} font-weight: 600; font-size: ${t.sectionHeadingPt}pt; letter-spacing: 0.06em; margin: 8pt 0 2pt 0; color: ${c.ink}; }
  .section-body { font-family: var(--font-body); margin: 0 0 6pt 0; text-align: left; hyphens: auto; }
  .id-list { margin: 4pt 0 6pt 0; padding-left: 14pt; }
  .id-list li { margin: 0 0 2pt 0; text-align: left; }
  .caption { font-family: var(--font-body); font-style: italic; font-size: ${t.captionPt}pt; color: ${c.accent}; }
  .mono { font-family: 'Courier New', monospace; font-size: 0.92em; }
  .art-placeholder { width: 100%; height: 100%; min-height: 2.4in; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: #E8D9B0; outline: 1px dashed ${c.accent}; outline-offset: -4px; font-family: var(--font-display); font-style: italic; font-size: ${t.captionPt}pt; color: ${c.accent}; }
  .art-slot { box-sizing: border-box; overflow: hidden; background: rgba(245, 237, 214, 0.5); border-radius: 2pt; }
  .art-slot img { width: 100%; height: 100%; object-fit: cover; display: block; }`;
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
 * PRESENTATION size for the rendered illustration. This is deliberately separate
 * from the planning coverage: the layout's coverage reserves space for text flow,
 * but the IMAGE itself is rendered at book scale so it has real visual impact
 * (a dominant plate, a wide band, a half-page float) — never shrunk into a tiny
 * placeholder. Text still flows beside/below the art, so readability is preserved.
 */
function artSlotSizeStyle(
  slot: ArtSlot,
  coverage: number,
  geometry: PageGeometry,
  hasImage: boolean,
): string {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const fh = geometry.textHeightIn;
  const m = geometry.margins;
  // Bleed (negative margins out to the physical page edge) is PRESENTATION — it
  // applies only once a real image exists. The PLANNING placeholder stays a clean
  // in-page reserved zone (text flows around it) so the operator can review the
  // layout / text-fit before any artwork is generated.
  const top = hasImage ? `-${m.topIn}in` : '0';
  const fore = hasImage ? `-${m.rightIn}in` : '0';
  const bottom = hasImage ? `-${m.bottomIn}in` : '0';
  const spine = hasImage ? `-${m.gutterIn}in` : '0';
  switch (slot) {
    case 'FULL_PAGE':
      // Dominant plate that bleeds top + both sides; title/caption sits below.
      return `display:block;width:auto;height:${round2(fh * 0.72)}in;margin:${top} ${fore} 12pt ${spine};`;
    case 'TOP_BAND':
      // Full-bleed banner: runs off the top and both side edges; text flows below.
      return `display:block;width:auto;height:${round2(Math.max(0.45, coverage) * fh)}in;margin:${top} ${fore} 14pt ${spine};`;
    case 'BOTTOM_BAND':
      return `display:block;width:auto;height:${round2(Math.max(0.45, coverage) * fh)}in;margin:14pt ${fore} ${bottom} ${spine};`;
    case 'SIDEBAR_RIGHT':
      // Tall image column bleeding off the top + fore-edge; body runs on the left.
      return `float:right;width:48%;height:${round2(fh * 0.98)}in;margin:${top} ${fore} 10pt 18pt;`;
    case 'CENTER_WRAP':
      return `display:block;width:72%;height:${round2(Math.max(0.45, coverage) * fh)}in;margin:0 auto 10pt auto;`;
    case 'SCATTERED':
      return `float:left;width:42%;height:${round2(0.34 * fh)}in;margin:0 14pt 8pt 0;`;
    case 'FLOAT_RIGHT':
      // Half-page float bleeding off the fore-edge; text wraps to the left.
      return `float:right;width:48%;height:${round2(Math.max(0.5, coverage) * fh)}in;margin:0 ${fore} 10pt 18pt;`;
    case 'FLOAT_LEFT':
    default:
      // Half-page float bleeding off the spine-edge; text wraps to the right.
      return `float:left;width:48%;height:${round2(Math.max(0.5, coverage) * fh)}in;margin:0 18pt 10pt ${spine};`;
  }
}

function artPlaceholderLabel(template: LayoutTemplateId): string {
  const profile = getLayoutProfile(template);
  if (profile.artAreaFraction <= 0.15) return 'PREVIEW - CORNER / EDGE ART SLOT';
  if (profile.artSlot === 'TOP_BAND') return 'PREVIEW - TOP ILLUSTRATION BAND';
  if (profile.artSlot === 'SIDEBAR_RIGHT') return 'PREVIEW - SIDE ILLUSTRATION SLOT';
  if (profile.artSlot === 'SCATTERED') return 'PREVIEW - STUDY / VIGNETTE SLOTS';
  if (profile.artSlot === 'FULL_PAGE') return 'PREVIEW - FULL PLATE ART SLOT';
  return 'PREVIEW - ART SLOT';
}

/** Build the standalone HTML document for one page. */
export function buildPageHtml(page: PageManifest, config: ProjectConfig, opts: RenderHtmlOptions): string {
  const { geometry } = opts;
  const profile = getLayoutProfile(page.layoutTemplate);
  const t = config.typography;
  const c = config.colorPalette;
  const m = geometry.margins;

  let art = opts.imageDataUri
    ? `<img src="${opts.imageDataUri}" alt="${escapeHtml(page.entryTitle)}">`
    : `<div class="art-placeholder">PREVIEW · ART SLOT (${escapeHtml(page.layoutTemplate)})</div>`;

  if (!opts.imageDataUri) {
    art = `<div class="art-placeholder">${escapeHtml(artPlaceholderLabel(page.layoutTemplate))}<br>${escapeHtml(page.layoutTemplate)}</div>`;
  }

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
${fontLinkTags(t)}
<style>
  @page {
    size: ${geometry.pageWidthIn}in ${geometry.pageHeightIn}in;
    margin: ${m.topIn}in ${m.rightIn}in ${m.bottomIn}in ${m.gutterIn}in;
    background: ${c.paper};
    ${pageBoxesCss(t, c, chapterLabel)}
  }
  ${typographyStyleBlock(t, c)}
  .art-slot { ${artSlotPositionCss(profile.artSlot)} page-break-inside: avoid; }
  ${page.layoutTemplate === 'LAYOUT_4_DANGER_WARNING' ? `.entry-title{color:${c.warning};} body{border-left:4pt solid ${c.warning};padding-left:10pt;}` : ''}
</style>
</head>
<body>
  <h1 class="entry-title">${escapeHtml(page.entryTitle)}</h1>
  ${scientific}
  <figure class="art-slot" style="${artSlotSizeStyle(profile.artSlot, profile.artAreaFraction, geometry, Boolean(opts.imageDataUri))}">${art}</figure>
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
  /** Draw trim/cut guides on each page (operator proof view; off for clean export). */
  proofGuides?: boolean;
}

/**
 * Proof-only CSS: a dashed trim/cut line inset by the bleed, plus corner crop
 * marks, drawn on each Paged.js sheet. Shows the operator where the page is cut
 * and which outer band is bleed. NOT included in the production/export PDF.
 */
function proofGuidesCss(geometry: PageGeometry): string {
  const b = geometry.bleedIn;
  return `
  .pagedjs_sheet { position: relative; }
  .pagedjs_sheet::after {
    content: ""; position: absolute; top: ${b}in; right: ${b}in; bottom: ${b}in; left: ${b}in;
    border: 0.5pt dashed #c0392b; pointer-events: none; z-index: 2147483646;
  }
  .pagedjs_sheet .crop-mark { display: none; }`;
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
      let art = page.imageDataUri
        ? `<img src="${page.imageDataUri}" alt="${escapeHtml(page.entryTitle)}">`
        : `<div class="art-placeholder">PREVIEW · ART SLOT (${escapeHtml(page.layoutTemplate)})</div>`;
      if (!page.imageDataUri) {
        art = `<div class="art-placeholder">${escapeHtml(artPlaceholderLabel(page.layoutTemplate))}<br>${escapeHtml(page.layoutTemplate)}</div>`;
      }
      const scientific = page.scientificName
        ? `<p class="scientific-name">${escapeHtml(page.scientificName)}</p>`
        : '';
      return `<article class="book-page arch-${profile.artSlot}${danger}">
  <h1 class="entry-title">${escapeHtml(page.entryTitle)}</h1>
  ${scientific}
  <figure class="art-slot" style="${artSlotSizeStyle(profile.artSlot, profile.artAreaFraction, geometry, Boolean(page.imageDataUri))}">${art}</figure>
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
${fontLinkTags(t)}
<style>
  @page {
    size: ${geometry.pageWidthIn}in ${geometry.pageHeightIn}in;
    margin: ${m.topIn}in ${m.rightIn}in ${m.bottomIn}in ${m.gutterIn}in;
    background: ${c.paper};
    ${pageBoxesCss(t, c, chapterLabel)}
  }
  ${typographyStyleBlock(t, c)}
  .book-page { page-break-after: always; }
  .book-page:last-child { page-break-after: auto; }
  ${opts.proofGuides ? proofGuidesCss(geometry) : ''}
  ${archCss}
  .art-slot { page-break-inside: avoid; }
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

// ─── Book assembly (front matter + chapters + back matter, single render) ──────

export interface BookChapter {
  chapterNumber: number;
  chapterTitle: string;
  pages: ChapterPageRender[];
}

export interface BookAssemblyInput {
  /** Optional introduction text (markdown) pulled from the manuscript front matter. */
  introMarkdown?: string;
  /** Optional glossary text (markdown) pulled from the manuscript back matter. */
  glossaryMarkdown?: string;
  chapters: BookChapter[];
}

function slugifyId(s: string, fallback: string): string {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base || fallback;
}

/** One entry article (chapter body page). Mirrors buildChapterHtml's per-entry markup. */
function entryArticleHtml(page: ChapterPageRender, geometry: PageGeometry, anchorId?: string): string {
  const profile = getLayoutProfile(page.layoutTemplate);
  const danger = page.layoutTemplate === 'LAYOUT_4_DANGER_WARNING' ? ' is-danger' : '';
  const art = page.imageDataUri
    ? `<img src="${page.imageDataUri}" alt="${escapeHtml(page.entryTitle)}">`
    : `<div class="art-placeholder">${escapeHtml(artPlaceholderLabel(page.layoutTemplate))}<br>${escapeHtml(page.layoutTemplate)}</div>`;
  const scientific = page.scientificName ? `<p class="scientific-name">${escapeHtml(page.scientificName)}</p>` : '';
  const idAttr = anchorId ? ` id="${anchorId}"` : '';
  return `<article class="book-page arch-${profile.artSlot}${danger}"${idAttr}>
  <h1 class="entry-title">${escapeHtml(page.entryTitle)}</h1>
  ${scientific}
  <figure class="art-slot" style="${artSlotSizeStyle(profile.artSlot, profile.artAreaFraction, geometry, Boolean(page.imageDataUri))}">${art}</figure>
  ${bodyToHtml(page.bodyMarkdown)}
</article>`;
}

/**
 * Build the COMPLETE book as one HTML document: cover-less interior with front
 * matter (title, copyright, table of contents, introduction) → chapters → back
 * matter (glossary, index, colophon). Rendered in a single Paged.js pass so page
 * numbers are continuous and the TOC/index page references are filled
 * automatically via `target-counter` (they always match the printed footers).
 */
export function buildBookHtml(input: BookAssemblyInput, config: ProjectConfig, opts: ChapterHtmlOptions): string {
  const { geometry } = opts;
  const t = config.typography;
  const c = config.colorPalette;
  const m = geometry.margins;
  const year = new Date().getFullYear();
  const bookTitle = escapeHtml(config.title);
  const subtitle = config.subtitle ? escapeHtml(config.subtitle) : '';
  const author = escapeHtml(config.authorName);

  const archCss = (Object.values(LAYOUT_PROFILES).map((p) => p.artSlot) as ArtSlot[])
    .filter((slot, i, arr) => arr.indexOf(slot) === i)
    .map(scopedArtSlotCss)
    .join('\n  ');

  // Tag each chapter's first entry (#chap-N) and every entry (#entry-K) so the
  // TOC and index can reference real page numbers via target-counter.
  let entryCounter = 0;
  const indexItems: { title: string; id: string }[] = [];
  const chaptersHtml = input.chapters
    .map((chapter) =>
      chapter.pages
        .map((page, pageIdx) => {
          entryCounter += 1;
          const entryId = `entry-${entryCounter}`;
          const anchorId = pageIdx === 0 ? `chap-${chapter.chapterNumber}` : entryId;
          indexItems.push({ title: page.entryTitle, id: anchorId });
          return entryArticleHtml(page, geometry, anchorId);
        })
        .join('\n'),
    )
    .join('\n');

  const tocRows = input.chapters
    .map(
      (chapter) =>
        `<a class="toc-row" href="#chap-${chapter.chapterNumber}"><span class="toc-title">${escapeHtml(
          `${chapter.chapterNumber}. ${chapter.chapterTitle.replace(/^chapter\s+\d+\s*[—–:-]?\s*/i, '')}`,
        )}</span><span class="dots"></span><span class="toc-page" data-ref="#chap-${chapter.chapterNumber}"></span></a>`,
    )
    .join('\n');

  const indexRows = [...indexItems]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(
      (it) =>
        `<a class="index-row" href="#${it.id}"><span>${escapeHtml(it.title)}</span><span class="dots"></span><span class="index-page" data-ref="#${it.id}"></span></a>`,
    )
    .join('\n');

  const introHtml = input.introMarkdown?.trim()
    ? `<section class="fm-page intro"><h1 class="section-title">Introduction</h1>${bodyToHtml(input.introMarkdown)}</section>`
    : '';
  const glossaryHtml = input.glossaryMarkdown?.trim()
    ? `<section class="bm-page glossary"><h1 class="section-title">Glossary</h1>${bodyToHtml(input.glossaryMarkdown)}</section>`
    : '';

  const polyfill = opts.polyfillJs ? `<script>${opts.polyfillJs}</script>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${bookTitle}</title>
${fontLinkTags(t)}
<style>
  @page {
    size: ${geometry.pageWidthIn}in ${geometry.pageHeightIn}in;
    margin: ${m.topIn}in ${m.rightIn}in ${m.bottomIn}in ${m.gutterIn}in;
    background: ${c.paper};
    ${pageBoxesCss(t, c, bookTitle)}
  }
  @page :first { @top-left { content: ""; } @bottom-center { content: ""; } }
  ${typographyStyleBlock(t, c)}
  ${archCss}
  .book-page, .fm-page, .bm-page { page-break-after: always; }
  .art-slot { page-break-inside: avoid; }
  .is-danger .entry-title { color: ${c.warning}; }
  .is-danger { border-left: 4pt solid ${c.warning}; padding-left: 10pt; }
  .title-page { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; min-height: 8in; page-break-after: always; }
  .title-page .book-title { font-family: var(--font-display); font-weight: 600; font-size: ${t.bookTitlePt}pt; line-height: 1.05; margin: 0; color: ${c.ink}; }
  .title-page .subtitle { font-family: var(--font-display); font-style: italic; font-size: ${t.chapterTitlePt}pt; color: ${c.accent}; margin: 14pt 0 0; }
  .title-page .author { font-family: var(--font-display); font-size: ${t.sectionHeadingPt}pt; letter-spacing: 0.12em; text-transform: uppercase; margin-top: 40pt; color: ${c.ink}; }
  .copyright { display: flex; flex-direction: column; justify-content: flex-end; min-height: 8in; page-break-after: always; font-family: var(--font-body); font-size: ${t.captionPt}pt; color: ${c.ink}; }
  .copyright p { margin: 0 0 6pt; }
  .section-title { font-family: var(--font-display); font-weight: 600; font-size: ${t.chapterTitlePt}pt; text-transform: uppercase; letter-spacing: 0.02em; margin: 0 0 14pt; color: ${c.ink}; }
  .toc-row, .index-row { display: flex; align-items: baseline; text-decoration: none; color: ${c.ink}; font-family: var(--font-body); font-size: ${t.bodyPt}pt; margin: 5pt 0; }
  .toc-title { white-space: nowrap; overflow: hidden; }
  .dots { flex: 1; margin: 0 4pt; border-bottom: 1px dotted ${c.accent}; transform: translateY(-3pt); }
  .toc-page::after { content: target-counter(attr(data-ref), page); }
  .index-page::after { content: target-counter(attr(data-ref), page); }
  .index { column-count: 2; column-gap: 24pt; }
  .index .index-row { break-inside: avoid; }
</style>
</head>
<body>
  <section class="title-page">
    <h1 class="book-title">${bookTitle}</h1>
    ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
    <p class="author">${author}</p>
  </section>
  <section class="copyright">
    <p>${bookTitle}${subtitle ? ` — ${subtitle}` : ''}</p>
    <p>Copyright © ${year} ${author}. All rights reserved.</p>
    <p>No part of this book may be reproduced without written permission.</p>
    <p>First edition, ${year}.</p>
  </section>
  <section class="fm-page toc"><h1 class="section-title">Table of Contents</h1>${tocRows}</section>
  ${introHtml}
  ${chaptersHtml}
  ${glossaryHtml}
  <section class="bm-page index-section"><h1 class="section-title">Index</h1><div class="index">${indexRows}</div></section>
  <section class="bm-page colophon"><h1 class="section-title">About</h1><p class="section-body">${author} — ${bookTitle}. Produced with The Wildlands Publishing Platform.</p></section>
  ${polyfill}
</body>
</html>`;
}

/** Paper thickness per interior page (inches). KDP white paper ≈ 0.002252"/page. */
const PAGE_THICKNESS_IN = 0.002252;

export interface CoverDimensions {
  fullWidthIn: number;
  fullHeightIn: number;
  spineIn: number;
}

/** KDP full-wrap cover dimensions for a given interior page count. */
export function computeCoverDimensions(config: ProjectConfig, pageCount: number): CoverDimensions {
  const trim = config.trimSize;
  const spineIn = Math.max(0.06, pageCount * PAGE_THICKNESS_IN);
  return {
    fullWidthIn: trim.widthIn * 2 + spineIn + trim.bleedIn * 2,
    fullHeightIn: trim.heightIn + trim.bleedIn * 2,
    spineIn,
  };
}

/**
 * Build a print-ready full-wrap cover (back panel | spine | front panel) at KDP
 * dimensions, with the spine width derived from the interior page count. A clean
 * typographic cover — front title/author, spine text, back blurb + barcode zone.
 */
export function buildCoverHtml(config: ProjectConfig, pageCount: number, opts: { polyfillJs?: string }): string {
  const t = config.typography;
  const c = config.colorPalette;
  const dims = computeCoverDimensions(config, pageCount);
  const bookTitle = escapeHtml(config.title);
  const subtitle = config.subtitle ? escapeHtml(config.subtitle) : '';
  const author = escapeHtml(config.authorName);
  const polyfill = opts.polyfillJs ? `<script>${opts.polyfillJs}</script>` : '';
  const round = (n: number) => Math.round(n * 1000) / 1000;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${bookTitle} — Cover</title>
${fontLinkTags(t)}
<style>
  @page { size: ${round(dims.fullWidthIn)}in ${round(dims.fullHeightIn)}in; margin: 0; }
  html, body { margin: 0; padding: 0; }
  .cover { display: flex; width: ${round(dims.fullWidthIn)}in; height: ${round(dims.fullHeightIn)}in; background: ${c.paper}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .panel { box-sizing: border-box; height: 100%; padding: ${round(config.trimSize.bleedIn + 0.4)}in; }
  .back { width: ${round(config.trimSize.widthIn + config.trimSize.bleedIn)}in; display: flex; flex-direction: column; justify-content: space-between; }
  .back .blurb { font-family: var(--font-body); font-size: ${t.bodyPt}pt; color: ${c.ink}; line-height: 1.4; }
  .back .barcode { align-self: flex-end; width: 2in; height: 1.2in; background: #fff; border: 1px solid #999; display: flex; align-items: center; justify-content: center; font-family: var(--font-body); font-size: 8pt; color: #555; }
  .spine { width: ${round(dims.spineIn)}in; background: ${c.accent}; display: flex; align-items: center; justify-content: center; }
  .spine .spine-text { writing-mode: vertical-rl; transform: rotate(180deg); font-family: var(--font-display); font-weight: 600; font-size: ${Math.min(t.sectionHeadingPt, Math.max(8, dims.spineIn * 40))}pt; color: ${c.paper}; white-space: nowrap; letter-spacing: 0.04em; }
  .front { width: ${round(config.trimSize.widthIn + config.trimSize.bleedIn)}in; background: ${c.accent}; color: ${c.paper}; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .front .book-title { font-family: var(--font-display); font-weight: 600; font-size: ${t.bookTitlePt}pt; line-height: 1.05; margin: 0; }
  .front .subtitle { font-family: var(--font-display); font-style: italic; font-size: ${t.chapterTitlePt}pt; margin: 16pt 0 0; opacity: 0.92; }
  .front .author { font-family: var(--font-display); font-size: ${t.sectionHeadingPt}pt; letter-spacing: 0.12em; text-transform: uppercase; margin-top: 48pt; }
</style>
</head>
<body>
  <div class="cover">
    <div class="panel back">
      <div class="blurb">${subtitle || bookTitle}</div>
      <div class="barcode">ISBN barcode area</div>
    </div>
    <div class="panel spine"><span class="spine-text">${bookTitle} &nbsp;·&nbsp; ${author}</span></div>
    <div class="panel front">
      <h1 class="book-title">${bookTitle}</h1>
      ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
      <p class="author">${author}</p>
    </div>
  </div>
  ${polyfill}
</body>
</html>`;
}
