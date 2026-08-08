/**
 * TYPESET BOOK — deterministic interior typesetting (Paged.js).
 *
 * The second render track. Body pages are real typeset text, not AI page
 * images: the PDF keeps live, searchable, vector type. Used by any book whose
 * production profile sets `bodyRenderTrack: 'typeset'`.
 *
 * ─── WHY PAGED.JS BREAKS THE PAGES, NOT PAGINATION V1 ─────────────────────
 * Pagination v1 splits text with a character-grid estimate because the AI
 * renderer must know a page's exact text BEFORE it spends on an image. A
 * typeset book has no such constraint, and using the estimate would produce a
 * page count that disagrees with the rendered PDF. Here the renderer is the
 * authority: Paged.js flows the whole book and we read the real page count back.
 *
 * Nothing here is book-specific. Trim, margins, and typography come from
 * ProjectConfig; structure comes from the manuscript's own headings.
 */

import type { ProjectConfig, TrimSize } from '@wildlands/shared';

// ── Geometry ────────────────────────────────────────────────────────────────

export interface TypesetMargins {
  topIn: number;
  bottomIn: number;
  /** Outer edge (fore-edge). */
  outsideIn: number;
  /** Inner edge (binding). Larger than outside; KDP scales it with page count. */
  gutterIn: number;
}

/**
 * Default interior margins for a text-first book.
 *
 * The gutter must grow with page count (KDP's requirement) — 0.625in covers the
 * 151–300pp band, which is where a normal trade book lands. Callers with a known
 * final page count should pass their own.
 */
export function typesetMarginsForTrim(trim: TrimSize): TypesetMargins {
  const compact = trim.widthIn <= 6;
  return compact
    ? { topIn: 0.625, bottomIn: 0.625, outsideIn: 0.5, gutterIn: 0.625 }
    : { topIn: 0.75, bottomIn: 0.75, outsideIn: 0.625, gutterIn: 0.75 };
}

// ── Manuscript structure ────────────────────────────────────────────────────

export interface TypesetSection {
  kind: 'chapter' | 'front' | 'back';
  /** Chapter number when the heading declared one. */
  number: number | null;
  title: string;
  bodyLines: string[];
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Inline emphasis, applied AFTER escaping so nothing can inject markup. */
function inlineMarkdown(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+?)\*/g, '$1<em>$2</em>');
}

/**
 * Split a manuscript into typesettable sections using its own headings.
 *
 *   `# Chapter N` followed by `## Title`  -> chapter (title from the H2)
 *   `# FRONT MATTER` / `# BACK MATTER`    -> matter, each following H2 a section
 *   `###` / `####`                        -> subheads inside a section
 *   `---`                                 -> scene break
 *
 * The manuscript's own title block is dropped: a title page is generated matter,
 * not manuscript prose, so typesetting it here would duplicate it later.
 */
export function parseTypesetSections(markdown: string): TypesetSection[] {
  const out: TypesetSection[] = [];
  let current: TypesetSection | null = null;
  let pendingChapter: number | null = null;
  let matter: 'front' | 'back' | null = null;
  /** True once a chapter or matter marker has appeared — see the bare-H1 rule. */
  let seenStructure = false;

  for (const raw of markdown.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);

    if (h1) {
      const t = h1[1]!.trim();
      const ch = t.match(/^chapter\s+(\d+)/i);
      if (ch) { pendingChapter = Number(ch[1]); matter = null; seenStructure = true; current = null; continue; }
      if (/^front\s+matter$/i.test(t)) { matter = 'front'; seenStructure = true; current = null; continue; }
      if (/^back\s+matter$/i.test(t)) { matter = 'back'; seenStructure = true; current = null; continue; }
      // A bare H1 BEFORE any chapter or matter marker is the manuscript's own
      // title block. It must not become a typeset section: the title page is
      // generated matter, so typesetting the prose here would duplicate it and
      // push every chapter two pages later. After structure has started, a bare
      // H1 is a real standalone section and is kept.
      if (!seenStructure) { pendingChapter = null; current = null; continue; }
      current = { kind: matter ?? 'front', number: null, title: t, bodyLines: [] };
      out.push(current);
      pendingChapter = null;
      continue;
    }

    if (h2) {
      current = {
        kind: pendingChapter !== null ? 'chapter' : (matter ?? 'front'),
        number: pendingChapter,
        title: h2[1]!.trim(),
        bodyLines: [],
      };
      out.push(current);
      pendingChapter = null;
      continue;
    }

    if (current) current.bodyLines.push(line);
  }
  return out;
}

/**
 * Section body -> HTML.
 *
 * Paragraph indent convention: the FIRST paragraph of a section, and the first
 * after any subhead or scene break, is flush left; the rest are indented. The
 * indent marks continuation, so it is wrong wherever nothing precedes.
 */
function bodyToHtml(lines: string[]): string {
  const html: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let flushNext = true;

  const closeList = (): void => {
    if (!list.length) return;
    html.push(`<ul>${list.map((li) => `<li>${inlineMarkdown(li)}</li>`).join('')}</ul>`);
    list = [];
    flushNext = false;
  };
  const closePara = (): void => {
    if (!para.length) return;
    html.push(`<p${flushNext ? ' class="first"' : ''}>${inlineMarkdown(para.join(' '))}</p>`);
    para = [];
    flushNext = false;
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) { closeList(); closePara(); continue; }
    if (/^-{3,}$/.test(t) || /^\*\s*\*\s*\*$/.test(t)) {
      closeList(); closePara();
      html.push('<p class="scene-break">* * *</p>');
      flushNext = true;
      continue;
    }
    const h4 = t.match(/^####\s+(.*)$/);
    if (h4) { closeList(); closePara(); html.push(`<h4>${inlineMarkdown(h4[1]!)}</h4>`); flushNext = true; continue; }
    const h3 = t.match(/^###\s+(.*)$/);
    if (h3) { closeList(); closePara(); html.push(`<h3>${inlineMarkdown(h3[1]!)}</h3>`); flushNext = true; continue; }
    const li = t.match(/^[-*]\s+(.*)$/);
    if (li) { closePara(); list.push(li[1]!); continue; }
    closeList();
    para.push(t);
  }
  closeList(); closePara();
  return html.join('\n');
}

// ── Document ────────────────────────────────────────────────────────────────

export interface TypesetHtmlInput {
  sections: TypesetSection[];
  config: ProjectConfig;
  margins?: TypesetMargins;
  /** Paged.js polyfill source. Omit for a browser-free HTML string (tests). */
  polyfillJs?: string;
  /**
   * Start every section on a right-hand page (premium convention). Costs a blank
   * verso whenever a section ends on a recto — roughly 10% of the page count on
   * a book of short chapters, so it is a deliberate operator choice.
   */
  chaptersStartRecto?: boolean;
}

export function buildTypesetHtml(input: TypesetHtmlInput): string {
  const { sections, config } = input;
  const trim = config.trimSize;
  const m = input.margins ?? typesetMarginsForTrim(trim);
  const t = config.typography;
  const title = config.publishing?.title ?? config.title;
  const recto = input.chaptersStartRecto !== false;

  // The classic drop: the chapter heading begins about a third down the text
  // block, leaving white space above it.
  const sinkIn = ((trim.heightIn - m.topIn - m.bottomIn) / 3).toFixed(3);

  const body = sections
    .map((s, i) => {
      const label = s.kind === 'chapter' && s.number !== null ? `Chapter ${s.number}` : '';
      return `<section class="tsec ${s.kind}" id="tsec-${i}" data-title="${escapeHtml(s.title)}" data-label="${escapeHtml(label)}" data-kind="${s.kind}">
  <header class="opener">
    ${label ? `<p class="kicker">${escapeHtml(label)}</p>` : ''}
    <h2>${escapeHtml(s.title)}</h2>
  </header>
  ${bodyToHtml(s.bodyLines)}
</section>`;
    })
    .join('\n');

  const fontQuery = [t.headingFont, t.bodyFont]
    .map((f) => `family=${f.replace(/\s+/g, '+')}:ital,wght@0,400;0,500;0,600;1,400`)
    .join('&');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${fontQuery}&display=swap" rel="stylesheet">
<style>
/* Trim with ZERO bleed: a text interior has nothing running to the edge.
   Margins are MIRRORED — gutter inside, smaller margin at the fore-edge. */
@page { size: ${trim.widthIn}in ${trim.heightIn}in; margin: ${m.topIn}in ${m.outsideIn}in ${m.bottomIn}in ${m.gutterIn}in; }
@page :left {
  margin-left: ${m.outsideIn}in; margin-right: ${m.gutterIn}in;
  @top-left { content: string(booktitle); font-family: '${t.bodyFont}', serif; font-variant: small-caps; font-size: ${t.labelPt}pt; letter-spacing: .06em; }
  @bottom-center { content: counter(page); font-family: '${t.bodyFont}', serif; font-size: ${t.captionPt + 1}pt; }
}
@page :right {
  margin-left: ${m.gutterIn}in; margin-right: ${m.outsideIn}in;
  @top-right { content: string(sectitle); font-family: '${t.bodyFont}', serif; font-variant: small-caps; font-size: ${t.labelPt}pt; letter-spacing: .06em; }
  @bottom-center { content: counter(page); font-family: '${t.bodyFont}', serif; font-size: ${t.captionPt + 1}pt; }
}
/* A chapter-opening page carries no running head — only the drop folio. */
@page opener { @top-left { content: none; } @top-right { content: none; } }

html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body {
  font-family: '${t.bodyFont}', Georgia, serif;
  font-size: ${t.bodyPt}pt; line-height: ${t.lineHeight};
  text-align: justify; hyphens: auto; -webkit-hyphens: auto;
  orphans: 2; widows: 2;
}
.booktitle-src { string-set: booktitle "${escapeHtml(title)}"; }

.tsec { ${recto ? 'break-before: recto;' : 'break-before: page;'} page: opener; string-set: sectitle attr(data-title); }
.tsec > .opener { padding-top: ${sinkIn}in; margin-bottom: 2em; text-align: center; break-after: avoid; }
.kicker { font-family: '${t.headingFont}', sans-serif; font-size: ${t.labelPt + 1.5}pt; letter-spacing: .22em;
  text-transform: uppercase; margin: 0 0 .5em; text-align: center; }
.tsec > .opener h2 { font-family: '${t.headingFont}', sans-serif; font-weight: 500;
  font-size: ${Math.round(t.bodyPt * 1.6)}pt; line-height: 1.15; margin: 0; text-align: center; }

p { margin: 0; text-indent: 1.2em; }
p.first { text-indent: 0; }
h3 { font-family: '${t.headingFont}', sans-serif; font-weight: 500; font-size: ${t.sectionHeadingPt}pt;
  letter-spacing: .04em; margin: 1.15em 0 .35em; text-align: left; break-after: avoid; break-inside: avoid; }
h4 { font-family: '${t.bodyFont}', serif; font-style: italic; font-weight: 600; font-size: ${t.subsectionHeadingPt}pt;
  margin: 1em 0 .3em; text-align: left; break-after: avoid; }
ul { margin: .5em 0 .6em; padding-left: 1.4em; }
li { margin: 0 0 .18em; text-align: left; }
.scene-break { text-indent: 0; text-align: center; margin: .9em 0; letter-spacing: .5em;
  break-after: avoid; break-inside: avoid; }
</style></head>
<body>
<div class="booktitle-src"></div>
${body}
${input.polyfillJs ? `<script>${input.polyfillJs}</script>` : ''}
</body></html>`;
}

// ── Report shape returned to the console ────────────────────────────────────

export interface TypesetSectionStart {
  title: string;
  label: string;
  kind: string;
  page: number | null;
}

export interface TypesetReport {
  totalPages: number;
  sectionStarts: TypesetSectionStart[];
  /** Pages whose content box reports vertical overflow (real clipping risk). */
  verticalOverflowPages: number[];
  /** Pages that are effectively empty — recto-start parity blanks. */
  blankPages: number[];
  trim: { widthIn: number; heightIn: number };
  marginsIn: TypesetMargins;
  bodyPt: number;
  lineHeight: number;
}
