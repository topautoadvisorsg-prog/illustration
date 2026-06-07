/**
 * Stage 1.8 — Text-In-Reading-Field Preview HTML builder.
 *
 * Produces the HTML string for ONE printed page. The HTML shows the operator
 * exactly the text that will live inside the actual Reading Field, at the
 * actual typography, on the actual page geometry — but with NO illustration.
 * The image-priority zone is rendered as a small italic placeholder
 * ("Image: <subject>") so the operator knows what will fill it later.
 *
 * No image API spend, no Chromium needed for this module. Render-preview.ts
 * is the next layer that pipes this HTML through Paged.js + Chromium → PDF.
 */

import type { ProjectConfig } from '@wildlands/shared';
import { computePageGeometry } from '../stage-6-layout/page-geometry.js';
import type { PaginatedPage } from '../stage-1.75-pagination/types.js';
import { safeCssColor, safeCssFontName } from './css-safety.js';

/** Hard-coded safe fallbacks used when a project config string fails the
 *  CSS-safety check. Picked to be visually obvious (so an operator notices a
 *  sanitization fallback) while still rendering a readable preview. */
const FALLBACK = {
  paper: '#faf6ee',
  ink: '#2a2419',
  accent: '#8b6b3a',
  bodyFont: 'Georgia',
  headingFont: 'Georgia',
  captionFont: 'Georgia',
};

export interface PreviewPageHtmlInput {
  page: PaginatedPage;
  config: ProjectConfig;
  /** Paged.js polyfill source. Omit to produce browser-free HTML for tests. */
  polyfillJs?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Lightweight markdown -> HTML for the Reading Field body. Handles paragraphs,
 *  `## headings` (the kind injected at soft-break), and inline **bold** / *em*. */
function bodyToHtml(markdown: string): string {
  if (!markdown.trim()) {
    return '<p class="rf-empty">(no body text)</p>';
  }
  const blocks = markdown.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return blocks
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      // ## Heading (the format injected by the flow engine at soft-break).
      const heading = trimmed.match(/^##\s+(.*)$/m);
      if (heading) {
        return `<h3 class="rf-heading">${inlineMarkdown(escapeHtml(heading[1]!))}</h3>`;
      }
      // Code fences — render as monospace preformatted text.
      if (/^```/.test(trimmed)) {
        const inner = trimmed.replace(/^```\s*\n?/, '').replace(/```$/, '');
        return `<pre class="rf-code">${escapeHtml(inner)}</pre>`;
      }
      return `<p class="rf-body">${inlineMarkdown(escapeHtml(trimmed))}</p>`;
    })
    .filter((s) => s)
    .join('\n');
}

function inlineMarkdown(escaped: string): string {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<span class="mono">$1</span>');
}

/** Hex color for the visible dashed border that frames the Reading Field in
 *  the preview only. The print render's Reading Field is invisible — operators
 *  just see typography on parchment. */
const READING_FIELD_GUIDE_COLOR = '#b4541f';

function fontLinkTags(safeFonts: { heading: string; body: string; caption: string }): string {
  const families = Array.from(
    new Set([safeFonts.heading, safeFonts.body, safeFonts.caption].filter(Boolean)),
  );
  if (families.length === 0) return '';
  const weights = 'ital,wght@0,400;0,500;0,600;0,700;1,400';
  const query = families.map((f) => `family=${f.replace(/\s+/g, '+')}:${weights}`).join('&');
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${query}&display=swap" rel="stylesheet">`;
}

/** Title text shown in the title band — includes "(continued)" for continuations
 *  and a "+ N more" hint for compacted pages. */
function titleBandText(page: PaginatedPage): string {
  if (page.pageRole === 'continuation') {
    return `${page.entryTitle} (continued)`;
  }
  if (page.pageRole === 'compacted' && page.compactedEntryKeys) {
    const extra = page.compactedEntryKeys.length - 1;
    return extra > 0 ? `${page.entryTitle} + ${extra} more` : page.entryTitle;
  }
  return page.entryTitle;
}

/**
 * Build the complete HTML document for a single preview page.
 *
 * Layout strategy: each PaginatedPage carries the layout director's zones
 * (textSafeZones, imagePriorityZones, typographyZones) in page-percent
 * coordinates. We absolute-position one `<div>` per zone inside a relatively-
 * positioned `.page-container`. The whole page sits on parchment; the Reading
 * Field is framed with a dashed orange border so the operator can SEE where
 * text is placed (the dashed border is preview-only, not in the print render).
 */
export function buildPreviewPageHtml(input: PreviewPageHtmlInput): string {
  const { page, config } = input;
  const geometry = computePageGeometry(config.trimSize);
  const t = config.typography;
  const c = config.colorPalette;

  // Sanitize every config-derived CSS value before interpolation.
  // ProjectConfigSchema does not constrain these to valid CSS, so a
  // malicious or malformed palette/font would otherwise inject arbitrary CSS.
  const safe = {
    paper: safeCssColor(c.paper, FALLBACK.paper),
    ink: safeCssColor(c.ink, FALLBACK.ink),
    accent: safeCssColor(c.accent, FALLBACK.accent),
    bodyFont: safeCssFontName(t.bodyFont, FALLBACK.bodyFont),
    headingFont: safeCssFontName(t.headingFont, FALLBACK.headingFont),
    captionFont: safeCssFontName(t.captionFont, FALLBACK.captionFont),
  };

  const bodyHtml = bodyToHtml(page.readingFieldText);
  const titleText = escapeHtml(titleBandText(page));
  const imageLabel = escapeHtml(page.imageSubject ?? `(no image — ${page.pageRole})`);

  // Title band — placement comes from typographyZones[0] if present, otherwise
  // a sensible default at the top.
  const titleZone = page.zones.typographyZones[0] ?? {
    xPct: 5,
    yPct: 3,
    widthPct: 90,
    heightPct: 8,
  };

  // Image area — first image-priority zone, or fall back to a quarter-page
  // marker so the operator at least sees that an image would go somewhere.
  const imageZone = page.zones.imagePriorityZones[0] ?? {
    xPct: 5,
    yPct: 65,
    widthPct: 40,
    heightPct: 30,
  };

  const readingFields = page.zones.textSafeZones.length > 0
    ? page.zones.textSafeZones
    : [{ xPct: 5, yPct: 15, widthPct: 90, heightPct: 75 }];

  const titleStyle = absoluteStyle(titleZone);
  const imageStyle = absoluteStyle(imageZone);

  const polyfill = input.polyfillJs ? `<script>${input.polyfillJs}</script>` : '';

  const stamp = `page ${page.plannedPageNumber} · ${escapeHtml(page.pageKey)} · ${escapeHtml(page.pageRole)} · ${escapeHtml(page.fitStatus)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Preview — ${escapeHtml(page.entryTitle)} (page ${page.plannedPageNumber})</title>
${fontLinkTags({ heading: safe.headingFont, body: safe.bodyFont, caption: safe.captionFont })}
<style>
  @page {
    size: ${geometry.pageWidthIn}in ${geometry.pageHeightIn}in;
    margin: 0;
    background: ${safe.paper};
    @bottom-center {
      content: "${stamp}";
      font-family: '${safe.captionFont}', Georgia, serif;
      font-size: ${t.captionPt}pt;
      color: ${safe.accent};
    }
  }
  html, body {
    background: ${safe.paper};
    margin: 0;
    padding: 0;
    color: ${safe.ink};
    font-family: '${safe.bodyFont}', Georgia, serif;
    font-size: ${t.bodyPt}pt;
    line-height: ${t.lineHeight};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page-container {
    position: relative;
    width: ${geometry.pageWidthIn}in;
    height: ${geometry.pageHeightIn}in;
  }
  .title-band {
    font-family: '${safe.headingFont}', Georgia, serif;
    font-weight: 600;
    font-size: ${t.entryTitlePt}pt;
    color: ${safe.ink};
    text-transform: uppercase;
    letter-spacing: 0.04em;
    overflow: hidden;
  }
  .reading-field {
    border: 1.5pt dashed ${READING_FIELD_GUIDE_COLOR};
    padding: 6pt 8pt;
    overflow: hidden;
    box-sizing: border-box;
  }
  .reading-field .rf-heading {
    font-family: '${safe.headingFont}', Georgia, serif;
    font-weight: 600;
    font-size: ${t.sectionHeadingPt}pt;
    letter-spacing: 0.04em;
    margin: 10pt 0 4pt 0;
    color: ${safe.ink};
  }
  .reading-field .rf-body {
    margin: 0 0 8pt 0;
    text-align: left;
    hyphens: auto;
  }
  .reading-field .rf-code {
    font-family: 'Courier New', monospace;
    font-size: ${t.bodyPt * 0.85}pt;
    background: rgba(0,0,0,0.04);
    padding: 4pt;
    white-space: pre-wrap;
  }
  .reading-field .rf-empty {
    color: ${safe.accent};
    font-style: italic;
  }
  .image-zone {
    background: repeating-linear-gradient(
      45deg,
      rgba(0,0,0,0.04),
      rgba(0,0,0,0.04) 6pt,
      rgba(0,0,0,0.07) 6pt,
      rgba(0,0,0,0.07) 12pt
    );
    border: 0.75pt solid ${safe.accent};
    color: ${safe.accent};
    font-family: '${safe.captionFont}', Georgia, serif;
    font-style: italic;
    font-size: ${t.captionPt}pt;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 8pt;
    box-sizing: border-box;
  }
  .mono { font-family: 'Courier New', monospace; font-size: 0.92em; }
</style>
</head>
<body>
  <div class="page-container">
    <div class="title-band" style="${titleStyle}">${titleText}</div>
    <div class="image-zone" style="${imageStyle}">Image: ${imageLabel}</div>
${readingFields
  .map(
    (zone, i) =>
      `    <div class="reading-field" data-rf-index="${i}" style="${absoluteStyle(zone)}">${bodyHtml}</div>`,
  )
  .join('\n')}
  </div>
  ${polyfill}
</body>
</html>`;
}

function absoluteStyle(zone: { xPct: number; yPct: number; widthPct: number; heightPct: number }): string {
  return `position:absolute; left:${zone.xPct}%; top:${zone.yPct}%; width:${zone.widthPct}%; height:${zone.heightPct}%;`;
}
