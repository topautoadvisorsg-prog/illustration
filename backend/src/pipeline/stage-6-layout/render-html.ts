/**
 * Stage 6 — page HTML generator (full-page-artwork model).
 *
 * What it does: builds the HTML/CSS document Paged.js paginates into a print page.
 * The image IS the page — painted full-bleed on `.pagedjs_sheet` via
 * `artworkSheetCss`. Title + body overlay the artwork in the reserved text-safe
 * zone (no boxes, no cards). Planning preview (no image yet) renders a
 * three-zone overlay (image-priority / typography / text-safe). All text-on-page
 * is typeset here by the layout engine — never baked into the image.
 * Typography, colors, and trim come from project config.
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
  /* Legacy .art-placeholder / .art-slot CSS removed: nothing references them
     anymore in the full-page-artwork model. The artwork lives on .pagedjs_sheet
     via artworkSheetCss; planning uses the three-zone .planning-zones overlay. */`;
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
    if (/^([-*_]\s*){3,}$/.test(line)) {
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

// (Legacy `artSlotPositionCss` and `artSlotSizeStyle` removed in the full-page-
// artwork migration. The full-page model paints artwork on `.pagedjs_sheet` via
// `artworkSheetCss`; no per-slot figure/box CSS is needed anymore.)

/** Short human label for the layout's image-priority position (planning preview only). */
function layoutPriorityLabel(template: LayoutTemplateId): string {
  const profile = getLayoutProfile(template);
  switch (profile.artSlot) {
    case 'TOP_BAND': return 'top of page';
    case 'BOTTOM_BAND': return 'bottom of page';
    case 'FLOAT_LEFT': return 'left side';
    case 'FLOAT_RIGHT':
    case 'SIDEBAR_RIGHT': return 'right side';
    case 'SCATTERED': return 'scattered studies across the page';
    case 'CENTER_WRAP': return 'center of page';
    case 'FULL_PAGE':
    default: return 'across the whole page';
  }
}

// ─── Full-page artwork model ───────────────────────────────────────────────
// The generated image is the PAGE artwork (full bleed), not a box. Layout
// percentage + image-priority edge define WHERE the text-safe zone sits, not the image
// size. The placeholder is a planning-only text-exclusion marker.

function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || '#F5EDD6').replace('#', '').trim();
  const v = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  return [parseInt(v.slice(0, 2), 16) || 245, parseInt(v.slice(2, 4), 16) || 237, parseInt(v.slice(4, 6), 16) || 214];
}
function paperRgba(paper: string, a: number): string {
  const [r, g, b] = hexToRgb(paper);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
type PriorityEdge = 'top' | 'bottom' | 'left' | 'right' | 'full' | 'center';
function priorityEdgeFor(slot: ArtSlot): PriorityEdge {
  switch (slot) {
    case 'TOP_BAND': return 'top';
    case 'BOTTOM_BAND': return 'bottom';
    case 'FLOAT_LEFT': return 'left';
    case 'FLOAT_RIGHT':
    case 'SIDEBAR_RIGHT': return 'right';
    case 'FULL_PAGE': return 'full';
    default: return 'center';
  }
}
/**
 * Phase 1 — HARD-LOCK zone enforcement (compositor level, deterministic).
 *
 * The image is still painted on the sheet, but we stack edge-aware PARCHMENT mask
 * gradients ABOVE it so the TEXT-SAFE zone and a feathered TITLE halo resolve to
 * clean parchment regardless of what the image model painted. Artwork stays visible
 * only in the IMAGE-PRIORITY zone; the boundary is a soft feather, not a hard box —
 * so the page still reads as one continuous illustration. The mask is derived purely
 * from the layout edge + coverage (which match the zone rectangles in
 * layout-director), so it is identical every render and never relies on the model
 * obeying a "keep this area calm" instruction.
 */
const LOCK_ALPHA = 0.97; // near-opaque parchment over the text-safe zone (text reads clean)
const FEATHER_PCT = 7; // soft transition width at the artwork↔parchment boundary
/** Build the text-safe parchment mask gradient for one edge (image on `edge`, text opposite). */
function textSafeMaskGradient(edge: PriorityEdge, imagePct: number, paper: string): string {
  const clear = paperRgba(paper, 0);
  const lock = paperRgba(paper, LOCK_ALPHA);
  const b = Math.max(0, Math.min(100, imagePct));
  const lo = (n: number) => Math.max(0, Math.min(100, n));
  switch (edge) {
    case 'top': // image top, text lower band
      return `linear-gradient(to bottom, ${clear} 0%, ${clear} ${lo(b - FEATHER_PCT)}%, ${lock} ${lo(b + FEATHER_PCT)}%, ${lock} 100%)`;
    case 'bottom': { // image bottom, text upper band
      const t = 100 - b;
      return `linear-gradient(to bottom, ${lock} 0%, ${lock} ${lo(t - FEATHER_PCT)}%, ${clear} ${lo(t + FEATHER_PCT)}%, ${clear} 100%)`;
    }
    case 'left': // image left, text right column
      return `linear-gradient(to right, ${clear} 0%, ${clear} ${lo(b - FEATHER_PCT)}%, ${lock} ${lo(b + FEATHER_PCT)}%, ${lock} 100%)`;
    case 'right': { // image right, text left column
      const t = 100 - b;
      return `linear-gradient(to right, ${lock} 0%, ${lock} ${lo(t - FEATHER_PCT)}%, ${clear} ${lo(t + FEATHER_PCT)}%, ${clear} 100%)`;
    }
    case 'center': // central subject, calm lower text band
      return `linear-gradient(to bottom, ${clear} 0%, ${clear} 54%, ${paperRgba(paper, 0.95)} 66%, ${paperRgba(paper, 0.95)} 100%)`;
    case 'full': // hero plate, only a small calm caption band at the very bottom
    default:
      return `linear-gradient(to bottom, ${clear} 0%, ${clear} 76%, ${paperRgba(paper, 0.82)} 88%, ${paperRgba(paper, 0.82)} 100%)`;
  }
}
/**
 * Sheet background = full-page artwork with the TEXT-SAFE zone and TITLE halo
 * hard-locked to clean parchment via stacked, feathered parchment masks. Layer order
 * (first paints on top): title halo → text-safe mask → artwork.
 */
function artworkSheetCss(selector: string, dataUri: string, paper: string, slot: ArtSlot, imagePct: number): string {
  const edge = priorityEdgeFor(slot);
  const textMask = textSafeMaskGradient(edge, imagePct, paper);
  // TITLE hard lock: a soft elliptical parchment halo behind the title band (top
  // ~12%), feathering to transparent — guarantees the heading reads on calm
  // parchment without a hard card/panel edge.
  const titleHalo = `radial-gradient(ellipse 72% 15% at 50% 12%, ${paperRgba(paper, 0.92)} 0%, ${paperRgba(paper, 0.92)} 52%, ${paperRgba(paper, 0)} 100%)`;
  return `${selector} { background-image: ${titleHalo}, ${textMask}, url("${dataUri}") !important; background-size: 100% 100%, 100% 100%, cover !important; background-position: center, center, center !important; background-repeat: no-repeat, no-repeat, no-repeat !important; }`;
}
/** Spacer that drops the body panel into the text-safe zone, clearing the image-priority area. */
function bodyZoneSpacer(slot: ArtSlot, coverage: number, geometry: PageGeometry): string {
  const th = geometry.textHeightIn;
  const edge = priorityEdgeFor(slot);
  if (edge === 'top') return `height:${Math.round(Math.max(0.28, Math.min(0.6, coverage)) * th * 100) / 100}in;`;
  if (edge === 'full') return `height:${Math.round(0.74 * th * 100) / 100}in;`;
  return 'height:0.12in;';
}
/**
 * Body-panel side style — keeps text off the image side ONLY on the first sheet
 * of the entry. On continuation pages there is no image to defer to, so the body
 * should use the full text frame. Returns CSS rules scoped per sheet position so
 * Paged.js applies the right one to the right page automatically.
 */
function bodyPanelSideCss(slot: ArtSlot): string {
  const edge = priorityEdgeFor(slot);
  if (edge === 'left') {
    return `.pagedjs_first_page .text-panel { margin-left: 46%; }`;
  }
  if (edge === 'right') {
    return `.pagedjs_first_page .text-panel { margin-right: 46%; }`;
  }
  return '';
}
/**
 * Shared CSS for the full-page artwork model. The artwork IS the page (painted on
 * the sheet). The TITLE sits on the art, bold with a paper halo so it is readable.
 * The BODY sits on a near-opaque paper panel so small text is always legible. Text
 * on the image is allowed when readable — never a hard ban, never lost on busy art.
 */
function fullPageArtworkCss(t: Typography, c: Palette): string {
  return `.pagedjs_pagebox, .pagedjs_area { background: transparent !important; }
  .entry-title { position: relative; z-index: 2; font-weight: 700; text-shadow: 0 0 8px ${c.paper}, 0 0 8px ${c.paper}, 0 0 14px ${c.paper}, 0 2px 3px rgba(0,0,0,0.35); }
  .scientific-name { position: relative; z-index: 2; text-shadow: 0 0 8px ${c.paper}, 0 0 8px ${c.paper}; }
  .art-spacer { width: 100%; }
  /* Continuation Visual Identity (Layer 3): every non-opening sheet of the entry
     carries a subtle ornamental treatment so a continuation page never reads as
     blank parchment. Two horizontal rules + corner ornaments framed by accent
     color; ZERO content cost (pure CSS). Applies to sheets that are NOT the
     first sheet of the entry. Overridden when real artwork paints the sheet. */
  .pagedjs_sheet:not(.pagedjs_first_page)::before {
    content: ""; position: absolute; pointer-events: none; z-index: 0;
    top: 0.55in; left: 0.7in; right: 0.7in; height: 0.6in;
    border-top: 0.6pt solid ${c.accent};
    border-bottom: 0.4pt solid ${c.accent};
    opacity: 0.42;
  }
  .pagedjs_sheet:not(.pagedjs_first_page)::after {
    content: "❦"; position: absolute; pointer-events: none; z-index: 0;
    left: 0; right: 0; bottom: 0.5in; text-align: center;
    color: ${c.accent}; opacity: 0.5;
    font-family: var(--font-display); font-size: 14pt; letter-spacing: 0.2em;
  }
  /* When real artwork is painted on the sheet, suppress the ornamental
     treatment — the artwork itself is the visual identity. */
  .pagedjs_sheet.has-artwork::before,
  .pagedjs_sheet.has-artwork::after { content: none; }
  /* Text sits DIRECTLY on the artwork in the reserved text-safe zone. The image
     model now paints that zone as a calm, light parchment field (see the TEXT-SAFE
     ZONE brief), so NO scrim, card, or panel background is drawn here — only a tight
     per-glyph paper halo gives the letters crisp edges. The halo hugs each glyph; it
     is not a rectangle. If a page ever reads poorly, fix the artwork's calm zone in
     the prompt — do NOT reintroduce a panel, gradient, or translucent block. */
  .text-panel { position: relative; z-index: 2; padding: 0 2pt; background: transparent; }
  .text-panel p, .text-panel li, .text-panel h3, .text-panel strong, .text-panel .section-header, .text-panel .section-body { text-shadow: 0 0 2px ${c.paper}, 0 0 4px ${c.paper}, 0 0 6px ${c.paper}; }
  /* Planning preview (no image yet): three-zone overlay teaches "the page IS artwork".
     Outlines only — never a filled box. Labels float at the edges; the page stays paper-clean. */
  .planning-zones { position: relative; box-sizing: border-box; width: 100%; page-break-inside: avoid; margin-bottom: 14pt; }
  .planning-zones .pz-zone { box-sizing: border-box; width: 100%; border: 1.5px dashed ${c.accent}; padding: 10pt 12pt; margin-bottom: 8pt; color: ${c.accent}; font-family: var(--font-display); font-size: ${t.captionPt}pt; line-height: 1.35; background: transparent; }
  .planning-zones .pz-zone strong { font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; font-style: normal; display: block; margin-bottom: 2pt; }
  .planning-zones .pz-zone em { font-style: italic; opacity: 0.85; }
  .planning-zones .pz-caption { margin-top: 6pt; text-align: center; font-family: var(--font-display); font-style: italic; font-size: ${t.captionPt}pt; color: ${c.accent}; opacity: 0.8; }`;
}

/**
 * Three-zone planning overlay — replaces the legacy single beige rectangle.
 * Communicates the full-page-artwork model to the operator: the page IS artwork;
 * these zones only mark where each kind of content is allowed. Outlined only,
 * never filled — the page must read as paper, not as a box.
 */
function planningZonesHtml(template: LayoutTemplateId): string {
  const profile = getLayoutProfile(template);
  const priority = layoutPriorityLabel(template);
  const imagePct = Math.round(profile.artAreaFraction * 100);
  const textPct = Math.max(0, 100 - imagePct);
  return `<div class="planning-zones">
    <div class="pz-zone">
      <strong>Image-Priority Zone — ${escapeHtml(priority)} (~${imagePct}%)</strong>
      <em>Where the strongest visual content lives in the artwork (mountains, wildlife, terrain, focal subject).</em>
    </div>
    <div class="pz-zone">
      <strong>Typography Zone</strong>
      <em>The title sits directly on the artwork. Composition keeps it readable.</em>
    </div>
    <div class="pz-zone">
      <strong>Text-Safe Zone (~${textPct}%)</strong>
      <em>The calm region the image generator reserves for body text. Text sits on the artwork — not in a paper card.</em>
    </div>
    <p class="pz-caption">Planning preview · The page IS artwork. These zones only mark where content is allowed.</p>
  </div>`;
}

interface EntryArtInput {
  entryTitle: string;
  scientificName?: string;
  bodyMarkdown: string;
  layoutTemplate: LayoutTemplateId;
  imageDataUri?: string;
}

/**
 * One entry as full-page artwork (the image IS the page) with a bold readable
 * title over the art and the body on a readable paper panel in the text-safe
 * zone. Returns the article markup + the sheet CSS that paints the artwork
 * (continuation pages reuse the same artwork — rule i).
 */
function buildEntryArticle(
  page: EntryArtInput,
  geometry: PageGeometry,
  c: Palette,
  pageName: string,
  perEntry: boolean,
  anchorId?: string,
): { article: string; css: string } {
  const profile = getLayoutProfile(page.layoutTemplate);
  const danger = page.layoutTemplate === 'LAYOUT_4_DANGER_WARNING' ? ' is-danger' : '';
  const idAttr = anchorId ? ` id="${anchorId}"` : '';
  const scientific = page.scientificName ? `<p class="scientific-name">${escapeHtml(page.scientificName)}</p>` : '';
  const title = `<h1 class="entry-title">${escapeHtml(page.entryTitle)}</h1>`;
  const panelCss = bodyPanelSideCss(profile.artSlot);
  const spacer = `<div class="art-spacer" style="${bodyZoneSpacer(profile.artSlot, profile.artAreaFraction, geometry)}"></div>`;

  if (page.imageDataUri) {
    const sheetSel = perEntry ? `.pagedjs_${pageName}_page .pagedjs_sheet` : '.pagedjs_sheet';
    const register = perEntry ? `@page ${pageName} {}\n  ` : '';
    const pageAttr = perEntry ? ` style="page: ${pageName};"` : '';
    const article = `<article class="book-page art-page arch-${profile.artSlot}${danger}"${idAttr}${pageAttr}>
  ${title}
  ${spacer}
  <div class="text-panel">${scientific}${bodyToHtml(page.bodyMarkdown)}</div>
</article>`;
    // Mark the sheet as having artwork so the continuation ornament suppresses.
    const artworkCss = register
      + artworkSheetCss(sheetSel, page.imageDataUri, c.paper, profile.artSlot, Math.round(profile.artAreaFraction * 100))
      + `\n  ${sheetSel} { /* artwork present */ }\n  ${sheetSel}::before, ${sheetSel}::after { content: none !important; }\n  ${panelCss}`;
    return { article, css: artworkCss };
  }

  // Planning preview: three-zone overlay teaches the full-page-artwork model
  // (image-priority / typography / text-safe). The page background stays paper —
  // no filled rectangle implies "the image goes in a box".
  const zones = planningZonesHtml(page.layoutTemplate);
  const article = `<article class="book-page arch-${profile.artSlot}${danger}"${idAttr}>
  ${title}
  ${zones}
  <div class="text-panel">${scientific}${bodyToHtml(page.bodyMarkdown)}</div>
</article>`;
  return { article, css: panelCss };
}

/** Build the standalone HTML document for one page. */
export function buildPageHtml(page: PageManifest, config: ProjectConfig, opts: RenderHtmlOptions): string {
  const { geometry } = opts;
  const t = config.typography;
  const c = config.colorPalette;
  const m = geometry.margins;

  const { article, css } = buildEntryArticle(
    {
      entryTitle: page.entryTitle,
      scientificName: page.scientificName,
      bodyMarkdown: page.bodyMarkdown,
      layoutTemplate: page.layoutTemplate,
      imageDataUri: opts.imageDataUri,
    },
    geometry,
    c,
    'entrypage',
    false,
  );

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
  ${css}
  ${typographyStyleBlock(t, c)}
  ${fullPageArtworkCss(t, c)}
  ${page.layoutTemplate === 'LAYOUT_4_DANGER_WARNING' ? `.entry-title{color:${c.warning};}` : ''}
</style>
</head>
<body>
  ${article}
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

// (Legacy `scopedArtSlotCss` removed: per-architecture .art-slot CSS no longer
// needed in the full-page-artwork model.)

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

  const built = pages.map((page, i) => buildEntryArticle(page, geometry, c, `entryc${chapter.chapterNumber}e${i}`, true));
  const pagesHtml = built.map((b) => b.article).join('\n');
  const entryCss = built.map((b) => b.css).filter(Boolean).join('\n  ');

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
  ${entryCss}
  ${typographyStyleBlock(t, c)}
  ${fullPageArtworkCss(t, c)}
  .book-page { page-break-after: always; }
  .book-page:last-child { page-break-after: auto; }
  ${opts.proofGuides ? proofGuidesCss(geometry) : ''}
  .is-danger .entry-title { color: ${c.warning}; }
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

/** Book-stitch wrapper: one entry as full-page artwork via the shared builder. */
function bookEntryArticle(
  page: ChapterPageRender,
  geometry: PageGeometry,
  c: Palette,
  pageName: string,
  anchorId?: string,
): { article: string; css: string } {
  return buildEntryArticle(page, geometry, c, pageName, true, anchorId);
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

  // Tag each chapter's first entry (#chap-N) and every entry (#entry-K) so the
  // TOC and index can reference real page numbers via target-counter. Each entry
  // also yields its own @page artwork CSS (collected for the book <style> block).
  let entryCounter = 0;
  const indexItems: { title: string; id: string }[] = [];
  const entryCssChunks: string[] = [];
  const chaptersHtml = input.chapters
    .map((chapter) =>
      chapter.pages
        .map((page, pageIdx) => {
          entryCounter += 1;
          const entryId = `entry-${entryCounter}`;
          const anchorId = pageIdx === 0 ? `chap-${chapter.chapterNumber}` : entryId;
          indexItems.push({ title: page.entryTitle, id: anchorId });
          const pageName = `bookc${chapter.chapterNumber}e${pageIdx}`;
          const built = bookEntryArticle(page, geometry, c, pageName, anchorId);
          if (built.css) entryCssChunks.push(built.css);
          return built.article;
        })
        .join('\n'),
    )
    .join('\n');
  const bookEntryCss = entryCssChunks.join('\n  ');

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
  ${bookEntryCss}
  ${typographyStyleBlock(t, c)}
  ${fullPageArtworkCss(t, c)}
  .book-page, .fm-page, .bm-page { page-break-after: always; }
  .is-danger .entry-title { color: ${c.warning}; }
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
