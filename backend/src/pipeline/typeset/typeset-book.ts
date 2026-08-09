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
import { bundledFontCss } from './font-assets.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V1 } from './layout-standards/educational-nonfiction-v1.js';
import { resolveTypesetDesign } from './layout-standards/resolve-design.js';
import type {
  AlertPanelPolicy,
  ChapterLabelFormat,
  ChapterTakeawayPolicy,
  TerminalMicroSectionPolicy,
  TypesetLayoutStandard,
} from './layout-standards/types.js';

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

/** Escape a value for use inside a CSS string literal (content: "..."). */
const cssString = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

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
const SCENE_BREAK = '<p class="scene-break">* * *</p>';

function bodyToHtml(
  lines: string[],
  micro?: TerminalMicroSectionPolicy,
  takeaway?: ChapterTakeawayPolicy,
  alert?: AlertPanelPolicy,
): string {
  const html: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  /** Which kind of list is open. Switching kind closes the previous one. */
  let listKind: 'ul' | 'ol' | null = null;
  let quote: string[] = [];
  let flushNext = true;

  const closeList = (): void => {
    if (!list.length) return;
    const tag = listKind === 'ol' ? 'ol' : 'ul';
    html.push(`<${tag}>${list.map((li) => `<li>${inlineMarkdown(li)}</li>`).join('')}</${tag}>`);
    list = [];
    listKind = null;
    flushNext = false;
  };
  /**
   * Markdown blockquotes become a styled callout.
   *
   * Without this branch a "> " line fell through to a normal paragraph and the
   * marker printed as a literal ">" mid-sentence — visible on p7 of NO ONE TOLD
   * ME THAT, and in every chapter, because these asides recur throughout.
   * Blank-line-separated runs inside one quote stay separate paragraphs.
   */
  const closeQuote = (): void => {
    if (!quote.length) return;
    const lines = [...quote];
    // A callout whose FIRST SOURCE LINE is entirely bold is a labelled callout:
    // that line is its label and belongs on its own line, with the quote
    // starting beneath. This must be checked on the raw line, not on the joined
    // paragraph — Markdown lazy continuation merges consecutive quote lines
    // into one paragraph, so by then the label is buried mid-sentence and the
    // rendered page runs "LABEL quote body..." together on one line.
    let label = '';
    const first = lines[0]?.trim() ?? '';
    const m = /^\*\*(.+)\*\*$/.exec(first);
    if (m) {
      label = `<p class="callout-label">${inlineMarkdown(m[1]!)}</p>`;
      lines.shift();
    }
    const body = lines
      .join('\n')
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean)
      .map((p) => `<p>${inlineMarkdown(p)}</p>`)
      .join('');
    html.push(`<blockquote class="callout">${label}${body}</blockquote>`);
    quote = [];
    flushNext = true;
  };
  const closePara = (): void => {
    if (!para.length) return;
    html.push(`<p${flushNext ? ' class="first"' : ''}>${inlineMarkdown(para.join(' '))}</p>`);
    para = [];
    flushNext = false;
  };

  for (const line of lines) {
    const t = line.trim();
    // A blank line inside a quote is a paragraph break, not the end of it.
    if (!t) {
      if (quote.length) { quote.push(''); continue; }
      // A blank line between list items does NOT end the list — Markdown calls
      // that a "loose" list, and this manuscript writes numbered steps both
      // ways. Closing here split one list of steps into several stray
      // paragraphs. The list is closed by the first line that is not an item.
      if (list.length) { closePara(); continue; }
      closeList(); closePara(); continue;
    }
    const bq = t.match(/^>\s?(.*)$/);
    if (bq) { closeList(); closePara(); quote.push(bq[1] ?? ''); continue; }
    closeQuote();
    if (/^-{3,}$/.test(t) || /^\*\s*\*\s*\*$/.test(t)) {
      closeList(); closePara();
      // A scene break separates two passages. Two in a row separate nothing
      // from nothing, so collapse them. This manuscript uses a DOUBLE rule as a
      // structural marker before every chapter heading and a single rule as a
      // real scene break, and rendering both literally printed pairs of stray
      // asterisk rows at the end of sections.
      if (html[html.length - 1] !== SCENE_BREAK) html.push(SCENE_BREAK);
      flushNext = true;
      continue;
    }
    const h4 = t.match(/^####\s+(.*)$/);
    if (h4) { closeList(); closePara(); html.push(`<h4>${inlineMarkdown(h4[1]!)}</h4>`); flushNext = true; continue; }
    const h3 = t.match(/^###\s+(.*)$/);
    if (h3) { closeList(); closePara(); html.push(`<h3>${inlineMarkdown(h3[1]!)}</h3>`); flushNext = true; continue; }
    const bullet = t.match(/^[-*]\s+(.*)$/);
    // Ordered steps: "1. text" / "2) text". Without this branch the numerals
    // printed as literal text mid-paragraph and the steps ran together — 63
    // numbered lists in this manuscript rendered that way.
    const numbered = bullet ? null : t.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const kind: 'ul' | 'ol' = bullet ? 'ul' : 'ol';
      if (listKind && listKind !== kind) closeList();
      listKind = kind;
      closePara();
      list.push((bullet ?? numbered)![1]!);
      continue;
    }
    closeList();
    para.push(t);
  }
  closeQuote(); closeList(); closePara();
  // Drop scene breaks left at the very end of a section. Nothing follows them,
  // so they separate nothing — and because the next section starts on a fresh
  // page anyway, they orphan onto a near-empty page carrying only asterisks
  // (this is what left page 4 blank but for two rows of them).
  while (html.length && html[html.length - 1] === SCENE_BREAK) html.pop();

  // Recognised alert headings become boxed panels. Done before the takeaway and
  // micro-section passes so those see the final element list. A panel runs to
  // the next heading or the end of the section, which is where these blocks
  // end: bullets followed by a closing paragraph that belongs with them.
  if (alert?.enabled && alert.headings.length) {
    const isAlert = (h: string): boolean =>
      h.startsWith('<h3') &&
      alert.headings.some((a) => a.toLowerCase() === h.replace(/<[^>]+>/g, '').trim().toLowerCase());
    for (let i = html.length - 1; i >= 0; i -= 1) {
      if (!isAlert(html[i]!)) continue;
      let end = i + 1;
      while (end < html.length && !html[end]!.startsWith('<h3') && !html[end]!.startsWith('<h4')) end += 1;
      const label = html[i]!.replace(/<[^>]+>/g, '').trim();
      const inner = html.slice(i + 1, end).join('\n');
      html.splice(i, end - i, `<aside class="alert-panel"><p class="alert-label">${escapeHtml(label)}</p>${inner}</aside>`);
    }
  }

  // A recognised closing beat becomes the takeaway component: compact, kept
  // whole, and kept WITH the chapter content before it. Checked before the
  // generic micro-section rule because it is the more specific treatment.
  if (takeaway?.enabled && takeaway.headings.length) {
    const lastH3 = html.map((h) => h.startsWith('<h3')).lastIndexOf(true);
    if (lastH3 >= 0 && lastH3 < html.length - 1) {
      const headingText = (html[lastH3] ?? '').replace(/<[^>]+>/g, '').trim();
      const isTakeaway = takeaway.headings.some(
        (h) => h.toLowerCase() === headingText.toLowerCase(),
      );
      if (isTakeaway) {
        const label =
          takeaway.labelTransform === 'uppercase' ? headingText.toUpperCase() : headingText;
        const rest = html.splice(lastH3 + 1).join('\n');
        html.splice(lastH3, 1);
        html.push(
          `<div class="takeaway"><p class="takeaway-label">${escapeHtml(label)}</p>${rest}</div>`,
        );
        return html.join('\n');
      }
    }
  }

  // Wrap a terminal micro-section so it stays whole and gets one chance to fit
  // on the page it starts from. See TerminalMicroSectionPolicy.
  if (micro?.enabled) {
    const lastH3 = html.map((h) => h.startsWith('<h3')).lastIndexOf(true);
    if (lastH3 >= 0 && lastH3 < html.length - 1) {
      const tail = html.slice(lastH3 + 1);
      const words = tail
        .join(' ')
        .replace(/<[^>]+>/g, ' ')
        .split(/\s+/)
        .filter(Boolean).length;
      if (words > 0 && words <= micro.maxWords) {
        const unit = html.splice(lastH3).join('\n');
        html.push(`<div class="tail-unit">${unit}</div>`);
      }
    }
  }
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
   * The pinned layout standard. Omitted only by older callers and tests, which
   * fall back to the educational-nonfiction v1 design — the design those
   * callers were written against, so their output is unchanged.
   */
  layoutStandard?: TypesetLayoutStandard;
  /**
   * Start every section on a right-hand page (premium convention). Costs a blank
   * verso whenever a section ends on a recto — roughly 10% of the page count on
   * a book of short chapters, so it is a deliberate operator choice.
   */
  chaptersStartRecto?: boolean;
}

/**
 * Paged.js completion signal — MUST be injected before the polyfill script.
 *
 * The renderer used to decide pagination had finished by watching the page
 * count stop changing for 1.5s. That is a plateau, not an ending: Paged.js goes
 * quiet between chunks, and a render that had reached page 31 of a 155-page book
 * could be accepted as complete and then reported as "0 overflow". Same input,
 * different answers on consecutive runs.
 *
 * The polyfill takes `window.PagedConfig.after`, which it awaits exactly once
 * after `previewer.preview()` resolves. That is the library telling us it is
 * done, so completion is now a fact rather than an inference.
 */
export const PAGED_DONE_HOOK = `<script>
window.PagedConfig = {
  auto: true,
  after: function (flow) {
    window.__wlTypesetDone = {
      total: (flow && flow.total) || document.querySelectorAll('.pagedjs_page').length
    };
  }
};
</script>`;

/** Browser-side predicate: has Paged.js reported completion? */
export const TYPESET_DONE_JS = `!!window.__wlTypesetDone`;

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/**
 * Spell a chapter number in words: 1 -> "One", 21 -> "Twenty-One".
 *
 * CHAPTER_BOOK_STANDARD.md §3 specifies the heading block as "Chapter One", not
 * "Chapter 1". Anything outside 1–99 keeps the numeral rather than inventing a
 * spelling, so an odd manuscript degrades to the old behaviour instead of
 * producing nonsense.
 */
export function spellChapterNumber(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 99) return String(n);
  if (n < 20) return ONES[n] ?? String(n);
  const tens = TENS[Math.floor(n / 10)] ?? '';
  const ones = ONES[n % 10] ?? '';
  if (!tens) return String(n);
  return ones ? `${tens}-${ones}` : tens;
}

/**
 * The chapter opener's kicker, e.g. "Chapter Twelve". Empty for matter sections.
 *
 * The label is generated in its natural case; rendering it uppercase is a STYLE
 * decision the standard makes via text-transform. Never pre-uppercase here — a
 * standard that wants title case could not undo it.
 */
export function chapterLabel(
  section: Pick<TypesetSection, 'kind' | 'number'>,
  format: ChapterLabelFormat = 'chapter-word',
): string {
  if (section.kind !== 'chapter' || section.number === null) return '';
  if (format === 'none') return '';
  if (format === 'chapter-numeral') return `Chapter ${section.number}`;
  return `Chapter ${spellChapterNumber(section.number)}`;
}

export function buildTypesetHtml(input: TypesetHtmlInput): string {
  const { sections, config } = input;

  // The page design comes from the pinned layout standard; the project supplies
  // only the operator-chosen fields. An explicit `margins` argument still wins,
  // so callers that know the final page count can widen the gutter.
  const standard = input.layoutStandard ?? EDUCATIONAL_NONFICTION_TYPESET_V1;
  const design = resolveTypesetDesign({
    standard,
    config,
    chaptersStartRecto: input.chaptersStartRecto,
  });

  const trim = design.trim;
  const m = input.margins ?? design.margins;
  const t = design.type;
  const para = standard.paragraphs;
  const op = standard.opener;
  const furn = standard.furniture;
  const blocks = standard.blocks;
  const micro = standard.terminalMicroSection;
  const tk = standard.chapterTakeaway;
  const ap = standard.alertPanel;
  const openerAlign = op.centered ? 'center' : 'left';
  const smallCaps = furn.runningHeadSmallCaps ? 'small-caps' : 'normal';
  const folioContent = furn.folio === 'none' ? 'none' : 'counter(page)';
  const title = config.publishing?.title ?? config.title;
  /**
   * The book title is a constant, so it is emitted as a literal string rather
   * than a named string fetched from a hidden element. The named-string route
   * (string-set on an empty div, read back via string(booktitle)) resolved to
   * nothing in the paged pass, which is why versos carried no running head at
   * all. The section title still needs a named string — it changes per chapter.
   */
  const runningHead = (role: 'book-title' | 'section-title' | 'none'): string =>
    role === 'book-title' ? `"${cssString(title)}"` : role === 'section-title' ? 'string(sectitle)' : 'none';
  /**
   * Where a section of each ROLE begins. The operator toggle governs CHAPTERS
   * only; front and back matter keep the standard's policy, because the toggle
   * is about the premium chapter convention and not about whether a two-page
   * back-matter note has earned a blank verso in front of it.
   */
  const startFor = (kind: TypesetSection['kind']): 'recto' | 'page' => {
    if (kind === 'chapter') return design.chaptersStartRecto ? 'recto' : 'page';
    return standard.sectionStart[kind];
  };

  // The classic drop: the chapter heading begins about a third down the text
  // block, leaving white space above it.
  const sinkIn = ((trim.heightIn - m.topIn - m.bottomIn) * op.sinkFraction).toFixed(3);

  const body = sections
    .map((s, i) => {
      const label = chapterLabel(s, op.labelFormat);
      return `<section class="tsec ${s.kind}" id="tsec-${i}" data-title="${escapeHtml(s.title)}" data-label="${escapeHtml(label)}" data-kind="${s.kind}">
  <header class="opener">
    ${label ? `<p class="kicker">${escapeHtml(label)}</p>` : ''}
    <h2>${escapeHtml(s.title)}</h2>
  </header>
  ${bodyToHtml(s.bodyLines, standard.terminalMicroSection, standard.chapterTakeaway, standard.alertPanel)}
</section>`;
    })
    .join('\n');

  // Fonts come from vendored assets so the printed interior is reproducible
  // offline. Only families with no bundled asset fall back to the CDN, and that
  // fallback is a dev convenience — see font-assets.ts.
  const fonts = bundledFontCss([t.headingFont, t.bodyFont]);
  const fontQuery = fonts.missing
    .map((f) => `family=${f.replace(/\s+/g, '+')}:ital,wght@0,400;0,500;0,600;1,400`)
    .join('&');
  const cdnLink = fontQuery
    ? `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${fontQuery}&display=swap" rel="stylesheet">`
    : '<!-- all faces vendored; no external font request -->';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
${cdnLink}
<style>
${fonts.css}
/* Trim with ZERO bleed: a text interior has nothing running to the edge.
   Margins are MIRRORED — gutter inside, smaller margin at the fore-edge. */
@page { size: ${trim.widthIn}in ${trim.heightIn}in; margin: ${m.topIn}in ${m.outsideIn}in ${m.bottomIn}in ${m.gutterIn}in; }
/* Margin boxes declare their own alignment. A margin box is laid out as a block
   inside its slot, so it inherits nothing useful and defaults to flush-left —
   which put the "centred" drop folio hard against the inside margin on every
   page. Alignment is stated explicitly here so folio and running-head placement
   is deterministic rather than a property of whatever the renderer defaults to. */
@page :left {
  margin-left: ${m.outsideIn}in; margin-right: ${m.gutterIn}in;
  @top-left { content: ${runningHead(furn.versoRunningHead)}; font-family: '${t.bodyFont}', serif; font-variant: ${smallCaps}; font-size: ${t.labelPt}pt; letter-spacing: ${furn.runningHeadLetterSpacingEm}em; text-align: left; }
  @bottom-center { content: ${folioContent}; font-family: '${t.bodyFont}', serif; font-size: ${t.captionPt + t.folioPtDelta}pt; text-align: center; width: 100%; }
}
@page :right {
  margin-left: ${m.gutterIn}in; margin-right: ${m.outsideIn}in;
  @top-right { content: ${runningHead(furn.rectoRunningHead)}; font-family: '${t.bodyFont}', serif; font-variant: ${smallCaps}; font-size: ${t.labelPt}pt; letter-spacing: ${furn.runningHeadLetterSpacingEm}em; text-align: right; }
  @bottom-center { content: ${folioContent}; font-family: '${t.bodyFont}', serif; font-size: ${t.captionPt + t.folioPtDelta}pt; text-align: center; width: 100%; }
}
/* A chapter-opening page carries no running head — only the drop folio.
   :first scopes this to the FIRST page of each named-page run, so the rest of
   the chapter keeps its running heads. */
@page opener:first {${furn.suppressRunningHeadOnOpener ? ' @top-left { content: none; } @top-right { content: none; }' : ''}${furn.suppressFolioOnOpener ? ' @bottom-center { content: none; }' : ''} }
${furn.suppressFurnitureOnBlank
  ? `/* A parity blank is not a page of the book. Printing a running head and a
   folio on it advertises the mechanism and reads as a mistake. */
@page :blank { @top-left { content: none; } @top-right { content: none; } @bottom-center { content: none; } }`
  : ''}

/* MARGIN-BOX ALIGNMENT — do not replace this with text-align.
   Paged.js injects margin-box content as a ::after on .pagedjs_margin-content,
   and that pseudo-element computes to display:block. text-align therefore does
   not move it: the folio printed hard against the inside margin on all 155
   pages, and the recto running head sat left instead of right, while every DOM
   probe cheerfully reported "center". Making the content div a flex container
   turns the ::after into a flex item that shrink-wraps, so justify-content
   places it deterministically. */
.pagedjs_margin-content { display: flex; align-items: center; }
.pagedjs_margin-top-left .pagedjs_margin-content,
.pagedjs_margin-bottom-left .pagedjs_margin-content { justify-content: flex-start; }
.pagedjs_margin-top-center .pagedjs_margin-content,
.pagedjs_margin-bottom-center .pagedjs_margin-content { justify-content: center; }
.pagedjs_margin-top-right .pagedjs_margin-content,
.pagedjs_margin-bottom-right .pagedjs_margin-content { justify-content: flex-end; }

html, body { margin: 0; padding: 0; background: #fff; color: #000; }
/* JUSTIFICATION IS SET PER TYPOGRAPHIC ROLE, NEVER INHERITED.
   Body justification leaking into headings stretched "No One Told Me That"
   wall-to-wall and pushed the chapter label's words to opposite margins. It
   also stretched paragraph LAST lines ("make good choices." spread across the
   full measure), which is wrong in any book: a justified paragraph justifies
   its full lines and leaves the last one ragged.
   Every role below therefore declares BOTH text-align AND text-align-last, so
   nothing depends on inheritance or on the renderer's default for last lines.
   Do not remove the text-align-last declarations.
   NOTE: no backticks in this comment — it lives inside a template literal, and
   a stray backtick silently terminates the string and breaks the build. */
body {
  font-family: '${t.bodyFont}', Georgia, serif;
  font-size: ${t.bodyPt}pt; line-height: ${t.lineHeight};
  hyphens: auto; -webkit-hyphens: auto;
  orphans: 2; widows: 2;
  text-align: left; text-align-last: left;
}

/* The whole section carries the named page, and the FIRST page of that run is
   selected with :first for the opener treatment.
   Do not move the named page onto the opener header to "scope" it: the flow
   then returns to the default page context after the header, which forces a
   break and leaves every chapter opener holding nothing but its heading (the
   book grew 155 -> 170 pages that way). Do not put the suppression on the
   unqualified name either: it applies to every page the section spans, which
   silently removed the running heads from the entire book.
   (No backticks in this comment: it lives inside a template literal.) */
.tsec { page: opener; string-set: sectitle attr(data-title); }
/* Section starts are ROLE-AWARE. A chapter opening on a recto is a convention
   worth a blank verso; a two-paragraph back-matter note is not. */
.tsec.front { break-before: ${startFor('front')}; }
.tsec.chapter { break-before: ${startFor('chapter')}; }
.tsec.back { break-before: ${startFor('back')}; }
/* Chapter opener: one centred heading block — "Chapter One" over the title,
   per CHAPTER_BOOK_STANDARD.md §3. Centring is declared on the block AND on
   both children, last line included, so a stretched title cannot come back. */
.tsec > .opener { padding-top: ${sinkIn}in; margin-bottom: ${op.blockMarginBottomEm}em; break-after: avoid;
  text-align: ${openerAlign}; text-align-last: ${openerAlign}; }
.kicker { font-family: '${t.headingFont}', 'Oswald', sans-serif; font-size: ${t.labelPt + t.kickerPtDelta}pt;
  letter-spacing: ${op.labelLetterSpacingEm}em; text-transform: ${op.labelTransform}; margin: 0 0 .5em;
  text-align: ${openerAlign}; text-align-last: ${openerAlign}; white-space: nowrap; }
.tsec > .opener h2 { font-family: '${t.headingFont}', 'Oswald', sans-serif; font-weight: 500;
  font-size: ${Math.round(t.bodyPt * t.chapterTitleScale)}pt; line-height: 1.15; margin: 0;
  text-align: ${openerAlign}; text-align-last: ${openerAlign}; }

/* Body paragraphs are the ONLY justified role, and their last line stays ragged. */
p { margin: 0; text-indent: ${para.indentEm}em; text-align: ${para.justify ? 'justify' : 'left'}; text-align-last: left; }
${para.spacingEm > 0 ? `p + p { margin-top: ${para.spacingEm}em; }\n` : ''}p.first { text-indent: 0; }
h3 { font-family: '${t.headingFont}', 'Oswald', sans-serif; font-weight: 500; font-size: ${t.sectionHeadingPt}pt;
  letter-spacing: .04em; margin: 1.15em 0 .35em; break-after: avoid; break-inside: avoid;
  text-align: left; text-align-last: left; }
h4 { font-family: '${t.bodyFont}', serif; font-style: italic; font-weight: 600; font-size: ${t.subsectionHeadingPt}pt;
  margin: 1em 0 .3em; break-after: avoid; text-align: left; text-align-last: left; }
ul, ol { margin: .5em 0 .6em; padding-left: ${blocks.listIndentEm}em; }
li { margin: 0 0 ${blocks.listItemSpacingEm}em; text-align: left; text-align-last: left;
  text-indent: 0; padding-left: .15em; }
/* Numbered steps keep their own counter; the manuscript's numerals are markup,
   never printed text. */
ol { list-style: decimal; }
ul { list-style: disc; }
.scene-break { text-indent: 0; margin: .9em 0; letter-spacing: ${blocks.sceneBreakLetterSpacingEm}em;
  break-after: avoid; break-inside: avoid; text-align: center; text-align-last: center; }
/* Callout — a Markdown blockquote. Kept on one page: a two-line aside broken
   across a spread reads as two unrelated fragments. */
.callout { margin: ${blocks.callout.marginYEm}em 0; padding-left: ${blocks.callout.paddingLeftEm}em;
  border-left: ${blocks.callout.borderLeftPt}pt solid currentColor; break-inside: avoid;
  font-size: ${(t.bodyPt * blocks.callout.scale).toFixed(2)}pt;${blocks.callout.italic ? ' font-style: italic;' : ''} }
.callout p { text-indent: 0; text-align: left; text-align-last: left; }
.callout p + p { margin-top: .35em; }
/* A callout's label sits on its own line with the quote beneath it. */
.callout-label { font-family: '${t.headingFont}', 'Oswald', sans-serif; font-weight: 600;
  letter-spacing: .04em; margin: 0 0 .3em; break-after: avoid; }
/* Terminal micro-section: kept whole (never strand the heading), with a
   tightened space above as one controlled attempt to fit where it starts. */
.tail-unit { break-inside: avoid; }
.tail-unit h3 { margin-top: ${micro.tightenedMarginTopEm}em; }
/* Alert panel: the book's front matter calls these BOXES, so they are boxes.
   Kept whole — a safety box split across a spread reads as two fragments and
   the second half loses its heading. */
.alert-panel { border: ${ap.borderPt}pt solid currentColor; padding: ${ap.paddingEm}em;
  margin: ${ap.marginYEm}em 0;${ap.keepTogether ? ' break-inside: avoid;' : ''} }
.alert-label { font-family: '${t.headingFont}', 'Oswald', sans-serif; font-weight: 600;
  font-size: ${ap.labelPt}pt; letter-spacing: ${ap.labelLetterSpacingEm}em;
  text-transform: uppercase; margin: 0 0 .45em; text-align: left; text-align-last: left;
  break-after: avoid; }
.alert-panel p { text-indent: 0; }
.alert-panel > p + p { margin-top: .3em; }
.alert-panel ul, .alert-panel ol { margin: .3em 0; }
.alert-panel > ul + p, .alert-panel > ol + p { margin-top: .5em; }
/* Chapter takeaway: the recurring closing beat. break-before: avoid keeps it
   with the chapter content it belongs to instead of opening a near-empty page;
   break-inside: avoid means the label can never be stranded from its sentence. */
.takeaway { margin: ${tk.marginTopEm}em 0 0; break-inside: avoid; break-before: avoid; }
.takeaway-label { font-family: '${t.headingFont}', 'Oswald', sans-serif; font-weight: 600;
  font-size: ${tk.labelPt}pt; letter-spacing: ${tk.labelLetterSpacingEm}em;
  text-transform: ${tk.labelTransform}; margin: 0 0 ${tk.labelGapEm}em;
  text-align: left; text-align-last: left; break-after: avoid; }
.takeaway p { text-indent: 0; }
.takeaway p + p { margin-top: .25em; }
</style></head>
<body>
${body}
${input.polyfillJs ? `${PAGED_DONE_HOOK}\n<script>${input.polyfillJs}</script>` : ''}
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
