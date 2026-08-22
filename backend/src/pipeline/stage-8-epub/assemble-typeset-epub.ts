/**
 * Stage 8 — EPUB model for TYPESET (Track B) books.
 *
 * ─── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * `assemble-epub.ts` builds its model from `paginated_pages` — the reading text
 * the Track A pipeline lays out page by page. A typeset book has no such rows.
 * Its interior is produced by `buildTypesetInterior`, which reflows the
 * manuscript Markdown through Paged.js, so the page table is empty by design.
 *
 * Asked to export a Kindle file, the Track A assembler therefore found zero
 * pages, emitted the generated title page and nothing else, and reported
 * success: a 3.6 KB EPUB with one 538-byte content file, no chapters, no cover.
 * Nothing threw. It was not a packing bug — the exporter simply could not see
 * where this kind of book keeps its text.
 *
 * ─── STRUCTURE IS SHARED, PRESENTATION IS NOT ─────────────────────────────────
 * Sections come from `parseTypesetSections`, the SAME parser the print interior
 * uses. That is deliberate: the print edition and the Kindle edition must never
 * disagree about what the chapters are or what order they run in. If a heading
 * convention changes, both move together.
 *
 * The HTML is NOT shared. `bodyToHtml` in the typeset path is built for paper —
 * it draws arrows and warning marks as inline SVG because the vendored print
 * faces have no glyph for them, injects `<wbr>` hyphenation hints, and tags
 * blocks with ids the illustration stamper anchors to. Every one of those is
 * either meaningless or actively harmful in a reflowable file, where the
 * reader's own font and font size decide the line breaks. So this module
 * converts the same Markdown to plain semantic XHTML and lets the device lay it
 * out.
 *
 * ─── THE MANUSCRIPT'S OWN TITLE BLOCK IS DROPPED ──────────────────────────────
 * Line 5 of this manuscript is still `# DIRT RICH`, the pre-rename title. The
 * print interior never shows it because front matter is GENERATED from config
 * and `parseTypesetSections` discards a bare H1 that appears before any chapter
 * or matter marker. This module inherits that behaviour and generates its own
 * title page the same way, from the same config. Reading the block instead would
 * put a dead title on the first screen of the Kindle edition.
 */

import { ProjectConfigSchema, type ProjectConfig } from '@wildlands/shared';
import { parseTypesetSections, plainHeadingText, type TypesetSection } from '../typeset/typeset-book.js';
import { DEFAULT_RIGHTS_STATEMENT } from '../typeset/front-matter.js';
import type { EpubChapter, EpubChapterKind, EpubMeta, EpubModel } from './assemble-epub.js';

/** One resolved inline figure: where the packer can read it, and what to say about it. */
export interface EpubFigure {
  /** `file://` URL epub-gen-memory can fetch, or a data URI. */
  src: string;
  alt: string;
  /** Manuscript width hint (`{70%}`), passed through as a style. */
  widthPct?: number;
}

export interface TypesetEpubInput {
  markdown: string;
  meta: EpubMeta;
  config: ProjectConfig;
  /** Keyed by the asset name written in `![alt](name)`. Missing keys are reported, not guessed. */
  figures?: Map<string, EpubFigure>;
  /**
   * Plates attached to a SECTION rather than to a manuscript image reference,
   * keyed by section title (compared case-insensitively).
   *
   * The print edition stamps its illustrations onto the finished PDF, anchored
   * to block ids, precisely so that placing art cannot move pagination. That
   * leaves the manuscript with no `![...]()` for this exporter to find, so a
   * reflowable build of an illustrated book shipped with none of its
   * illustrations — five approved plates, `heroesEmbedded: 0`.
   *
   * A page anchor means nothing in a file with no pages, so the ebook binds the
   * same art to STRUCTURE instead: a divider gets its divider plate, and a
   * chapter-end plate goes at the end of its chapter.
   */
  sectionFigures?: Map<string, EpubFigure>;
}

const escapeXml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Inline emphasis, applied AFTER escaping so nothing in the manuscript can
 * inject markup. Deliberately narrower than the print path's version: no glyph
 * substitution and no `<wbr>`, because a Kindle renders with the reader's own
 * font, which has the arrow, and breaks its own lines.
 */
function inline(s: string): string {
  return escapeXml(s)
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+?)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

const RULE = /^\s*(-{3,}|_{3,}|\*{3,}|(?:\*\s+){2,}\*)\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d+)[.)]\s+(.*)$/;
const HEADING = /^(#{2,6})\s+(.*)$/;
const FIGURE = /^!\[([^\]]*)\]\(([^)]+)\)(?:\{(\d{1,3})%\})?\s*$/;
const TABLE_ROW = /^\s*\|(.*)\|\s*$/;

const splitRow = (row: string): string[] =>
  row
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());

const isDelimiter = (row: string | undefined): boolean => {
  if (!row) return false;
  const m = row.match(TABLE_ROW);
  if (!m) return false;
  return splitRow(m[1]!).every((c) => /^:?-{2,}:?$/.test(c));
};

/** `:---`, `---:`, `:---:` → CSS text-align. */
const alignOf = (cell: string): string => {
  const l = cell.startsWith(':');
  const r = cell.endsWith(':');
  if (l && r) return 'center';
  if (r) return 'right';
  return 'left';
};

/**
 * A last-resort alt text, derived from the asset's own filename.
 *
 * Seven of this book's nine plates are written `![](name)` with no caption and
 * therefore no alt text. `epub-gen-memory` fills an empty alt with the literal
 * string `image-placeholder`, which a screen reader reads aloud — worse than
 * saying nothing, because it sounds like a build that did not finish.
 *
 * The filename is the pipeline's own label for the picture (`p13-soil-profile`),
 * so this states what the file says it is and nothing more. It is a LABEL, not a
 * description: a plate that carries real information still deserves alt text
 * written by someone who looked at it.
 */
function describeFigure(name: string): string {
  const stem = name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^p\d+[-_]/i, '')
    .replace(/[-_]v\d+$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return stem ? `Illustration: ${stem}` : 'Illustration';
}

export interface BodyHtmlResult {
  html: string;
  words: number;
  figuresUsed: string[];
  missingFigures: string[];
}

/**
 * Markdown body → reflowable XHTML.
 *
 * Block-level only; `inline()` handles the rest. The one non-obvious rule is the
 * horizontal rule: in this manuscript `---` is a SCENE BREAK inside a chapter and
 * a SEPARATOR either side of a heading. Position resolves the ambiguity — rules
 * that touch the start or end of a section are separators and are dropped, and
 * only the ones with text on both sides become the centred ornament the print
 * edition sets.
 */
export function typesetBodyToHtml(
  lines: string[],
  figures: Map<string, EpubFigure> = new Map(),
): BodyHtmlResult {
  const out: string[] = [];
  const figuresUsed: string[] = [];
  const missingFigures: string[] = [];
  let words = 0;

  // Trim leading/trailing blank-or-rule lines so a section never opens or closes
  // on an ornament that was only ever a separator around a heading.
  let lo = 0;
  let hi = lines.length - 1;
  while (lo <= hi && (!lines[lo]!.trim() || RULE.test(lines[lo]!))) lo += 1;
  while (hi >= lo && (!lines[hi]!.trim() || RULE.test(lines[hi]!))) hi -= 1;
  const body = lines.slice(lo, hi + 1);

  /**
   * HEADING DEPTH IS RELATIVE, NOT ABSOLUTE.
   *
   * The chapter title is set as `<h1>`, so an in-body heading has to start at
   * `<h2>`. Mapping `#` counts straight through does not do that: this book's
   * shallowest in-body heading is `###`, which came out as `<h4>` and left the
   * document going h1 → h4 with 83 headings in it and h2 and h3 never used —
   * a skipped level is an accessibility failure and reads as a size jump on a
   * device with no chapter context.
   *
   * So find the shallowest heading depth this section actually uses and pin it
   * to h2, keeping the relative depths beneath it. A section headed `###`/`####`
   * sets h2/h3; one headed `##`/`###` sets the same. The manuscript's choice of
   * marker stops mattering, only its structure does.
   */
  let minHeadingDepth = 7;
  for (const l of body) {
    const m = l.match(HEADING);
    if (m && m[1]!.length < minHeadingDepth) minHeadingDepth = m[1]!.length;
  }

  let para: string[] = [];
  let list: string[] = [];
  let listKind: 'ul' | 'ol' | null = null;
  let quote: string[] = [];

  const countWords = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

  const flushPara = (): void => {
    if (!para.length) return;
    const text = para.join(' ');
    words += countWords(text);
    out.push(`<p>${inline(text)}</p>`);
    para = [];
  };
  const flushList = (): void => {
    if (!list.length || !listKind) return;
    out.push(`<${listKind}>\n${list.join('\n')}\n</${listKind}>`);
    list = [];
    listKind = null;
  };

  /**
   * A run of `>` lines is ONE callout, set the way the print edition sets it.
   *
   * Every `>` line used to become its own `<blockquote><p>`, with whatever it
   * contained passed straight to `inline()`. Two defects came out of that in the
   * shipped ebook, both of them plain on the first phone screen that showed one:
   *
   *   - `> ### SKIP IT / DO THIS INSTEAD` printed its hashes. `inline()` has no
   *     heading branch, and this book writes all sixteen of its skip boxes that
   *     way, so sixteen callouts opened with literal markdown.
   *   - a blank `>` line produced an empty `<blockquote><p></p></blockquote>`,
   *     and a three-line aside came out as three separate boxes instead of one.
   *
   * Deliberately mirrors `closeQuote` in `typeset-book.ts`, rule for rule: a
   * first line that is entirely bold, or a heading, becomes the callout's label
   * on its own line; blank-line-separated runs inside one quote stay separate
   * paragraphs. The two editions have to agree about what a callout is.
   */
  const flushQuote = (): void => {
    if (!quote.length) return;
    const lines = [...quote];
    quote = [];
    const first = lines[0]?.trim() ?? '';
    const m = /^\*\*(.+)\*\*$/.exec(first) ?? /^#{1,4}\s+(.+)$/.exec(first);
    let label = '';
    if (m) {
      label = `<p class="callout-label">${inline(m[1]!.trim())}</p>`;
      words += countWords(m[1]!);
      lines.shift();
    }
    const body = lines
      .join('\n')
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean)
      .map((p) => {
        words += countWords(p);
        return `<p>${inline(p)}</p>`;
      })
      .join('');
    if (!label && !body) return;
    out.push(`<blockquote class="callout">${label}${body}</blockquote>`);
  };

  const flushAll = (): void => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (let i = 0; i < body.length; i += 1) {
    const line = body[i]!.replace(/\s+$/, '');

    if (!line.trim()) {
      // A blank line inside a quote is a paragraph break, not the end of it —
      // the same rule the print edition follows, so a two-paragraph aside stays
      // one callout in both editions.
      if (quote.length) {
        quote.push('');
        continue;
      }
      flushAll();
      continue;
    }

    const fig = line.match(FIGURE);
    if (fig) {
      flushAll();
      const alt = fig[1]!.trim();
      const name = fig[2]!.trim();
      const pct = fig[3] ? Number(fig[3]) : undefined;
      const resolved = figures.get(name);
      if (resolved) {
        figuresUsed.push(name);
        const width = pct ?? resolved.widthPct;
        const style = width ? ` style="width:${width}%"` : '';
        const caption = alt ? `<p class="caption">${inline(alt)}</p>` : '';
        const altText = resolved.alt || alt.replace(/[*`]/g, '').trim() || describeFigure(name);
        out.push(
          `<figure class="fig"><img class="figimg" src="${escapeXml(resolved.src)}" ` +
            `alt="${escapeXml(altText)}"${style} />${caption}</figure>`,
        );
      } else {
        // Reported, never silently dropped and never replaced with a placeholder:
        // a figure that vanished from a shipped ebook must be visible upstream.
        missingFigures.push(name);
      }
      continue;
    }

    if (RULE.test(line)) {
      flushAll();
      out.push('<p class="ornament">* * *</p>');
      continue;
    }

    const h = line.match(HEADING);
    if (h) {
      flushAll();
      const level = Math.min(6, 2 + (h[1]!.length - minHeadingDepth));
      out.push(`<h${level}>${inline(h[2]!.trim())}</h${level}>`);
      continue;
    }

    // Table: a header row, a delimiter row, then rows until the block ends.
    if (TABLE_ROW.test(line) && isDelimiter(body[i + 1])) {
      flushAll();
      const header = splitRow(line.match(TABLE_ROW)![1]!);
      const aligns = splitRow(body[i + 1]!.match(TABLE_ROW)![1]!).map(alignOf);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < body.length && TABLE_ROW.test(body[j]!)) {
        rows.push(splitRow(body[j]!.match(TABLE_ROW)![1]!));
        j += 1;
      }
      i = j - 1;
      const th = header
        .map((c, k) => `<th style="text-align:${aligns[k] ?? 'left'}">${inline(c)}</th>`)
        .join('');
      const trs = rows
        .map(
          (r) =>
            `<tr>${r
              .map((c, k) => `<td style="text-align:${aligns[k] ?? 'left'}">${inline(c)}</td>`)
              .join('')}</tr>`,
        )
        .join('\n');
      words += countWords(header.join(' '));
      for (const r of rows) words += countWords(r.join(' '));

      /**
       * A WIDE TABLE IS STACKED, exactly as the print edition stacks it.
       *
       * A grid divides one measure between its columns, and on a phone that
       * measure is about 375 CSS pixels. This book's five-column permit table
       * would get roughly seventy pixels per column — around eight characters —
       * for cells that run to a full sentence. It does not clip, because the
       * cells wrap, but it becomes an unreadable vertical smear, which is the
       * same defect by a different route.
       *
       * So past four columns each row becomes one labelled record: the first
       * cell names it, every other cell is a labelled field. Every authored cell
       * is emitted, verbatim — presentation only, and the same rule and the same
       * threshold the print standard uses, so the two editions agree about which
       * tables are too wide to be tables.
       */
      const columns = Math.max(header.length, ...rows.map((r) => r.length), 1);
      if (columns > 4) {
        const units = rows
          .map((r) => {
            const cells = r.length >= columns ? r : [...r, ...Array(columns - r.length).fill('')];
            const fields = cells
              .slice(1)
              .map(
                (c, k) =>
                  `<p class="stk-field"><span class="stk-label">${inline(header[k + 1] ?? '')}</span> ${inline(c)}</p>`,
              )
              .join('\n');
            return `<div class="stk-unit"><p class="stk-lead">${inline(cells[0] ?? '')}</p>\n${fields}</div>`;
          })
          .join('\n');
        out.push(`<div class="stacked-table">\n${units}\n</div>`);
        continue;
      }

      out.push(`<table><thead><tr>${th}</tr></thead><tbody>\n${trs}\n</tbody></table>`);
      continue;
    }

    const b = line.match(BULLET);
    if (b) {
      flushPara();
      if (listKind && listKind !== 'ul') flushList();
      listKind = 'ul';
      words += countWords(b[1]!);
      list.push(`<li>${inline(b[1]!)}</li>`);
      continue;
    }

    const o = line.match(ORDERED);
    if (o) {
      flushPara();
      if (listKind && listKind !== 'ol') flushList();
      listKind = 'ol';
      words += countWords(o[2]!);
      list.push(`<li>${inline(o[2]!)}</li>`);
      continue;
    }

    if (/^\s*>/.test(line)) {
      flushPara();
      flushList();
      const inner = line.replace(/^\s*>\s?/, '');
      /**
       * A HEADING inside a quote opens a NEW callout.
       *
       * This book runs two skip boxes back to back with no blank line between
       * them. Without this, the second heading would be swallowed into the first
       * callout's body — where the label rule, which only looks at the first
       * line, would never see it, and the hashes would print again.
       */
      if (/^#{1,6}\s+\S/.test(inner) && quote.some((q) => q.trim())) flushQuote();
      quote.push(inner);
      continue;
    }

    // An indented continuation line under an open list item belongs to that
    // item, not to a new paragraph.
    if (list.length && /^\s{2,}\S/.test(line)) {
      const last = list.pop()!;
      words += countWords(line);
      list.push(last.replace(/<\/li>$/, ` ${inline(line.trim())}</li>`));
      continue;
    }

    flushList();
    para.push(line.trim());
  }
  flushAll();

  return { html: out.join('\n'), words, figuresUsed, missingFigures };
}

/** Section kind → the classification the preview UI and the packer understand. */
function kindOf(section: TypesetSection): EpubChapterKind {
  if (section.kind === 'chapter') return 'BODY';
  if (section.kind === 'front') return 'INTRODUCTION';
  if (/^about the author/i.test(section.title)) return 'ABOUT';
  if (/^glossary/i.test(section.title)) return 'GLOSSARY';
  return 'BODY';
}

/**
 * Display title: chapters keep their number, everything else keeps its own title.
 * Still carries its markdown, because it is about to go through `inline()` and be
 * set as the chapter's `<h1>` — that is where emphasis belongs.
 */
function navTitleOf(section: TypesetSection): string {
  return section.number !== null ? `Chapter ${section.number}: ${section.title}` : section.title;
}

/**
 * The same title as PLAIN TEXT, for the places that cannot hold markup.
 *
 * `EpubChapter.title` becomes three things at once: the `<title>` element, the
 * nav.xhtml link text and the NCX `<text>` label. None of them can carry markup,
 * so a heading with emphasis reached the Kindle contents screen with its markdown
 * intact — the appendix banner listed itself as "…CURRENT AS OF: **August 2026**",
 * asterisks and all, while the `<h1>` two lines below it set the same words in
 * proper bold.
 *
 * Print never had this: its running head already ran through `plainHeadingText`.
 * The ebook simply never called it. Same helper here, so the two editions cannot
 * disagree about what a heading says.
 *
 * The one deliberate difference is the drawn warning mark. Print transliterates it
 * to `->` because the running head sits in the margin beside body copy; a contents
 * entry has no such context, and a leading arrow there just reads as a stray
 * character. It is dropped instead.
 */
export function plainTitleOf(section: Pick<TypesetSection, 'title' | 'number'>): string {
  const title = plainHeadingText(section.title).replace(/^->\s*/, '').trim();
  return section.number !== null ? `Chapter ${section.number}: ${title}` : title;
}

/**
 * The copyright page, set from the SAME fields and in the SAME order as the
 * printed one in `front-matter.ts`.
 *
 * Mirrored deliberately, line for line. A first pass here wrote a shorter page
 * of its own — no title line, "All rights reserved." in place of the full
 * reservation, and no accuracy note — which would have shipped two editions of
 * one book making two different statements about their own rights. The rights
 * text itself is imported rather than copied, so it cannot drift.
 */
function copyrightHtml(meta: EpubMeta, config: ProjectConfig): string {
  const p = config.publishing;
  const year = p.copyrightYear ?? new Date().getFullYear();
  const author = meta.authors.join(', ');
  const parts: string[] = [
    `<p>${escapeXml(meta.title)}</p>`,
    `<p>${escapeXml(p.copyrightLine || `Copyright © ${year} ${author}`)}</p>`,
    `<p>${escapeXml(p.rightsStatement || DEFAULT_RIGHTS_STATEMENT)}</p>`,
  ];
  for (const d of p.disclaimers ?? []) {
    const t = d.trim();
    if (t) parts.push(`<p class="disclaimer">${escapeXml(t)}</p>`);
  }
  // The accuracy note reads off the project exactly as the print page does, so
  // it can never be on in one edition and off in the other.
  const note = p.accuracyNote;
  if (note?.enabled && note.text.trim()) {
    const reviewer = note.reviewerName?.trim()
      ? `Reviewed by ${note.reviewerName.trim()}${
          note.reviewerCredentials?.trim() ? `, ${note.reviewerCredentials.trim()}` : ''
        }.`
      : '';
    parts.push(`<p class="disclaimer">${escapeXml([note.text.trim(), reviewer].filter(Boolean).join(' '))}</p>`);
  }
  const facts: string[] = [];
  if (p.edition) facts.push(escapeXml(p.edition));
  if (p.publisher?.imprint) facts.push(escapeXml(p.publisher.imprint));
  if (p.isbn?.ebook) facts.push(`ISBN ${escapeXml(p.isbn.ebook)}`);
  if (facts.length) parts.push(`<p class="facts">${facts.join('<br />')}</p>`);
  return parts.join('\n');
}

/**
 * Build the reflowable EPUB model for a typeset book.
 *
 * Pure: no I/O, no storage, no database. Figures must already be resolved by the
 * caller, which is what makes this testable against a fixed manuscript string.
 */
export function assembleTypesetEpubModel(input: TypesetEpubInput): EpubModel {
  const { markdown, meta, config } = input;
  const figures = input.figures ?? new Map<string, EpubFigure>();
  const sectionFigures = input.sectionFigures ?? new Map<string, EpubFigure>();
  const usedSectionFigures: string[] = [];
  const sections = parseTypesetSections(markdown);
  const warnings: string[] = [];
  const skipped: string[] = [];

  const chapters: EpubChapter[] = [];

  // ── generated front matter, exactly as the print interior generates it ──
  chapters.push({
    title: meta.title,
    kind: 'TITLE',
    beforeToc: true,
    content: [
      `<h1>${escapeXml(meta.title)}</h1>`,
      meta.subtitle ? `<p class="subtitle">${escapeXml(meta.subtitle)}</p>` : '',
      `<p class="author">${escapeXml(meta.authors.join(', '))}</p>`,
      meta.series ? `<p class="series">${escapeXml(meta.series)}</p>` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  });
  chapters.push({
    title: 'Copyright',
    kind: 'COPYRIGHT',
    beforeToc: true,
    excludeFromToc: true,
    content: copyrightHtml(meta, config),
  });

  let words = 0;
  let bodyChapters = 0;
  const allMissing: string[] = [];
  let figuresEmbedded = 0;

  for (const s of sections) {
    const built = typesetBodyToHtml(s.bodyLines, figures);
    const nav = navTitleOf(s);
    const plainNav = plainTitleOf(s);
    /**
     * Matched by CONTAINMENT, not equality. `navTitleOf` prefixes a numbered
     * chapter with "Chapter N: ", so looking up the exact title found the three
     * part dividers and missed both chapter-end plates.
     *
     * Matched against the PLAIN title, so a plate keyed on a section whose
     * heading happens to carry emphasis still finds its section.
     */
    const navKey = plainNav.trim().toLowerCase();
    const plateKey = [...sectionFigures.keys()].find((k) => navKey === k || navKey.includes(k));
    const plate = plateKey ? sectionFigures.get(plateKey) : undefined;
    if (plate && plateKey) usedSectionFigures.push(plateKey);
    const plateHtml = plate
      ? `<div class="plate"><img src="${escapeXml(plate.src)}" alt="${escapeXml(plate.alt)}"/></div>`
      : '';

    /**
     * A HEADING WITH NO BODY IS STILL A SECTION.
     *
     * This used to `continue`, on the reasoning that an empty section ships as a
     * blank screen. That is right for a stray heading and WRONG for a part
     * divider, whose entire content IS its heading — and it silently deleted
     * Parts 1, 2 and 3, plus the Appendix heading, from the Kindle edition of a
     * book built around three parts.
     *
     * So a bodiless section is emitted with its heading, and carries its plate
     * when it has one. It is still REPORTED, because a section left empty by
     * accident is worth knowing about.
     */
    if (!built.html.trim() && !plateHtml) {
      skipped.push(`${plainNav} (heading only)`);
      warnings.push(`Section "${plainNav}" has a heading and no body text — emitted as a divider.`);
    }

    words += built.words;
    figuresEmbedded += built.figuresUsed.length + (plate ? 1 : 0);
    allMissing.push(...built.missingFigures);
    if (s.kind === 'chapter') bodyChapters += 1;
    chapters.push({
      title: plainNav,
      kind: kindOf(s),
      // The plate follows the body, which puts a chapter-end plate at the end of
      // its chapter and a divider plate directly under its part title.
      content: `<h1>${inline(nav)}</h1>\n${built.html}${plateHtml}`,
    });
  }

  for (const [key] of sectionFigures) {
    if (!usedSectionFigures.includes(key)) {
      warnings.push(`Section plate for "${key}" matched no section and is MISSING from this EPUB.`);
    }
  }

  if (allMissing.length) {
    const uniq = [...new Set(allMissing)];
    warnings.push(
      `${uniq.length} figure${uniq.length === 1 ? '' : 's'} referenced by the manuscript could not be ` +
        `resolved and ${uniq.length === 1 ? 'is' : 'are'} MISSING from this EPUB: ${uniq.join(', ')}.`,
    );
  }
  if (bodyChapters === 0) {
    warnings.push('No numbered chapters were found in the manuscript — check the heading convention.');
  }

  return {
    chapters,
    imagePlan: {
      coverIncluded: false, // set by the I/O layer once the cover is actually embedded
      heroMode: 'OFF',
      plannedHeroPlacement: 'BEFORE_ENTRY_TITLE',
      entriesAwaitingHero: 0,
    },
    stats: {
      chapters: chapters.length,
      bodyChapters,
      entries: 0,
      words,
      skipped,
      omittedImages: [...new Set(allMissing)].length,
      warnings,
      heroesEmbedded: figuresEmbedded,
    },
  };
}

/** Parse a raw config blob without importing the schema at the call site. */
export const parseProjectConfig = (raw: unknown): ProjectConfig => ProjectConfigSchema.parse(raw);
