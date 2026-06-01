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

import type { PageManifest, ProjectConfig } from '@wildlands/shared';
import type { PageGeometry } from './page-geometry.js';
import { getLayoutProfile, type ArtSlot } from './layout-profiles.js';

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

/** Render the entry body markdown into simple HTML (headings + paragraphs). */
function bodyToHtml(markdown: string): string {
  const blocks = markdown.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const heading = block.match(/^(#{2,6})\s+(.*)$/);
      if (heading) {
        return `<h3 class="section-header">${escapeHtml(heading[2]!.trim())}</h3>`;
      }
      const text = block.replace(/^#{1}\s+/, '');
      return `<p class="section-body">${escapeHtml(text.replace(/\s+/g, ' ').trim())}</p>`;
    })
    .join('\n');
}

function artSlotCss(slot: ArtSlot): string {
  switch (slot) {
    case 'FLOAT_LEFT':
      return '.art-slot{float:left;width:45%;margin:0 18pt 10pt 0;}';
    case 'FLOAT_RIGHT':
      return '.art-slot{float:right;width:48%;margin:0 0 10pt 18pt;}';
    case 'TOP_BAND':
      return '.art-slot{display:block;width:100%;height:3.4in;margin:0 0 14pt 0;}';
    case 'BOTTOM_BAND':
      return '.art-slot{display:block;width:100%;height:3.4in;margin:14pt 0 0 0;}';
    case 'FULL_PAGE':
      return '.art-slot{display:block;width:100%;height:9in;margin:0;}';
    case 'SIDEBAR_RIGHT':
      return '.art-slot{float:right;width:32%;height:6.5in;margin:0 0 10pt 18pt;}';
    case 'SCATTERED':
      return '.art-slot{float:left;width:30%;margin:0 14pt 8pt 0;}';
    default:
      return '.art-slot{float:left;width:45%;margin:0 18pt 10pt 0;}';
  }
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
  ${artSlotCss(profile.artSlot)}
  .art-slot { page-break-inside: avoid; }
  .art-placeholder { width: 100%; height: 100%; min-height: 2.4in; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: #E8D9B0; outline: 1px dashed ${c.accent}; outline-offset: -4px; font-style: italic; font-size: 8pt; color: ${c.accent}; }
  .art-slot img { width: 100%; height: 100%; object-fit: cover; display: block; -webkit-mask-image: radial-gradient(ellipse at center, black 60%, transparent 100%); mask-image: radial-gradient(ellipse at center, black 60%, transparent 100%); }
  .section-header { ${t.smallCaps ? 'font-variant: small-caps;' : ''} font-weight: 600; font-size: ${t.bodyPt}pt; letter-spacing: 0.08em; margin: 8pt 0 2pt 0; color: ${c.ink}; }
  .section-body { margin: 0 0 6pt 0; text-align: justify; hyphens: auto; }
  ${page.layoutTemplate === 'LAYOUT_4_DANGER_WARNING' ? `.entry-title{color:${c.warning};} body{border-left:4pt solid ${c.warning};padding-left:10pt;}` : ''}
</style>
</head>
<body>
  <h1 class="entry-title">${escapeHtml(page.entryTitle)}</h1>
  ${scientific}
  <figure class="art-slot">${art}</figure>
  ${bodyToHtml(page.bodyMarkdown)}
  ${polyfill}
</body>
</html>`;
}
