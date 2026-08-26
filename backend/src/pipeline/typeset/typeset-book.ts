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

import type { LayoutOverride, ProjectConfig, TrimSize } from '@wildlands/shared';
import { slugifySection, stampBlockIds, type TypesetBlockRef } from './block-identity.js';
import { bundledFontCss } from './font-assets.js';
import { buildFrontMatterHtml, frontMatterCss, type TocEntry } from './front-matter.js';
import { overrideCss, type OverrideCssResult } from './layout-overrides.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V1 } from './layout-standards/educational-nonfiction-v1.js';
import { resolveTypesetDesign } from './layout-standards/resolve-design.js';
import type {
  AlertPanelPolicy,
  ChapterLabelFormat,
  ChapterTakeawayPolicy,
  LongTokenWrappingPolicy,
  TerminalMicroSectionPolicy,
  TypesetChecklistStyles,
  TypesetPreformattedStyles,
  TypesetTableStyles,
  TypesetLayoutStandard,
  HeadingBindPolicy,
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
  /**
   * The heading EXACTLY as the manuscript wrote it, before any number was split
   * out of it. For `## Chapter 1: Backyard Me v1.0` the parser reports
   * `number: 1` and `title: 'Backyard Me v1.0'`, and this keeps the original
   * `'Chapter 1: Backyard Me v1.0'`.
   *
   * The parser's job is to READ structure, never to decide how it prints.
   * Whether a chapter sets as a generated kicker over a short title, or as the
   * author's own one-line heading, belongs to the layout standard
   * (`opener.titleSource`) — and a standard cannot make that choice if the
   * parser has already thrown the original away.
   *
   * Equal to `title` for any heading that declared no number, so a reader of
   * this field always gets something sensible.
   */
  sourceTitle: string;
  bodyLines: string[];
}

/** Escape a value for use inside a CSS string literal (content: "..."). */
const cssString = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Inline emphasis, applied AFTER escaping so nothing can inject markup. */
/**
 * GLYPHS THE TEXT FACES DO NOT CARRY — drawn, not typed.
 *
 * The manuscript uses two characters outside the vendored latin subsets: an
 * arrow (U+2192, ~120 cross-references in the Quick-Answer Index) and a flag
 * (U+1F6A9, one heading marker). Left as text they fall through to whatever
 * font the render host happens to offer — an unknown face on an unknown
 * machine, and for the flag, usually nothing at all, so the marker silently
 * vanished from the page.
 *
 * Neither is acceptable as a final print state. Both are replaced with inline
 * SVG paths: vector, deterministic, identical on every host, embedded as
 * drawing operations rather than as text needing a font. `currentColor` and em
 * sizing keep them tied to the type around them.
 *
 * The MANUSCRIPT still says what it said. This is a render-layer substitution.
 */
const XREF_ARROW =
  '<svg class="gl gl-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M2 12h18M14 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * Solid pennant on a staff. The pennant fills most of the box on purpose: at
 * heading size a small mark reads as a tick or a stray bracket rather than a
 * flag, which defeats the point of marking the one category a reader must not
 * scroll past.
 */
const ALERT_FLAG =
  '<svg class="gl gl-flag" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M4 23V1.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
  '<path d="M6 2.2h16l-4.2 6.4 4.2 6.4H6z" fill="currentColor"/></svg>';

/**
 * The author's WARNING SIGN (U+26A0), drawn.
 *
 * Ingestion used to delete it as decoration, which flattened sixteen safety
 * paragraphs — flash-flood checks, altitude, road status, wildlife distance —
 * into ordinary prose. It is now on the semantic allow-list in
 * `sanitize-manuscript.ts` and arrives here intact.
 *
 * A HOLLOW triangle with a solid bar-and-dot, not a filled one: at 11pt a solid
 * triangle prints as a heavy black lozenge that pulls the eye off the sentence
 * it is meant to introduce. The outline reads as a warning at text size and
 * still survives a 300-dpi bitmap proof.
 */
const WARNING_MARK =
  '<svg class="gl gl-warn" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M12 2.6 22.4 21H1.6z" fill="none" stroke="currentColor" stroke-width="2.2" ' +
  'stroke-linejoin="round"/>' +
  '<path d="M12 9.2v5.1" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
  '<circle cx="12" cy="17.7" r="1.25" fill="currentColor"/></svg>';

/**
 * A break opportunity, carried through escaping as a private-use character and
 * turned into `<wbr>` at the very end.
 *
 * It has to be a sentinel rather than literal `<wbr>` markup because the marks
 * are placed BEFORE `escapeHtml`, which would otherwise escape them into visible
 * text. Placing them before escaping is itself deliberate: doing it afterwards
 * would mean splitting `&amp;` and `&#39;` down the middle.
 */
const WBR = String.fromCharCode(0xe000);

/** Where a URL may break. Everything here is structural punctuation. */
const URL_BREAK_AFTER = /([/?&=_.,;:#-])/g;

/**
 * Characters that mean a token is carrying markdown, not just text. Tokens
 * holding any of them are left completely alone: inserting a sentinel inside
 * `**bold**` or a `[link](url)` would stop the emphasis pass matching, and a
 * silently unbolded word is a worse defect than a long URL.
 */
const MARKDOWN_SIGNIFICANT = /[*`[\]()<>]/;

const URL_LIKE = /^(https?:\/\/|www\.)/i;

/**
 * Place break opportunities inside long tokens. See `LongTokenWrappingPolicy`.
 *
 * Deliberately narrow. It touches a token only when the token is long enough to
 * be a real overflow risk AND carries no markdown, and it prefers URLs — the
 * case this exists for — over long words in prose, which hyphenation would
 * normally handle and which are not what runs off the page.
 */
function markLongTokenBreaks(s: string, policy?: LongTokenWrappingPolicy): string {
  if (!policy || policy.mode === 'none') return s;
  return s.replace(/\S+/g, (token) => {
    if (MARKDOWN_SIGNIFICANT.test(token)) return token;
    if (token.length < policy.minTokenLength && !URL_LIKE.test(token)) return token;
    if (policy.mode === 'anywhere') return token.split('').join(WBR);
    const marked = token.replace(URL_BREAK_AFTER, `$1${WBR}`);
    // A long token with nothing structural to break on — a 60-character
    // unbroken identifier — still has to fit. CSS handles that case; see
    // `breakAnywhereFallback` in the stylesheet.
    return marked;
  });
}

function inlineMarkdown(s: string, longTokens?: LongTokenWrappingPolicy): string {
  return escapeHtml(markLongTokenBreaks(s, longTokens))
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+?)\*/g, '$1<em>$2</em>')
    // U+2192 and U+27F6 both. The long form appears in this book's appendix
    // banner and is no more likely to be in a vendored latin subset than the
    // short one — an arrow the face cannot draw prints as a tofu box, which is
    // the failure this substitution exists to prevent.
    .replace(/[→⟶]/g, XREF_ARROW)
    .replace(/🚩/g, ALERT_FLAG)
    // U+FE0F is already gone by here (ingestion drops it), but a manuscript that
    // never went through ingestion — a test, a preview — can still carry it.
    .replace(/⚠️?/g, WARNING_MARK)
    .replace(new RegExp(WBR, 'g'), '<wbr>');
}

/**
 * A HEADING, rendered.
 *
 * Section titles used to go through `escapeHtml` alone, so a title carrying any
 * emphasis printed its markdown syntax on the page: the appendix banner of
 * 7 NATIONAL PARKS set as "…CURRENT AS OF: **August 2026**", asterisks and all,
 * at chapter-opener size.
 *
 * This is GENERAL, not a fix for that one heading. Body text has always had an
 * inline pass and headings never did, so any title with emphasis in any book was
 * going to print raw — the appendix banner is simply the first one to have any.
 *
 * Long-token breaking is deliberately NOT applied: `<wbr>` in a heading invites
 * a break in a display line, and a heading is short enough not to need one.
 */
/**
 * The marks a HEADING never carries: both arrows, the flag, and the warning
 * triangle with or without its variation selector. One definition, used by every
 * heading path, because three copies of this list is how they drift.
 */
const DRAWN_MARKS = /[\u2192\u27F6\u{1F6A9}]|\u26A0\uFE0F?/gu;

export function inlineHeadingHtml(s: string): string {
  return inlineMarkdown(stripDrawnMarks(s));
}

/**
 * Drawn marks come OFF a heading, everywhere a heading is set.
 *
 * A mark like an arrow or a warning triangle is emphasis inside a sentence,
 * where it sits in the run of text and points at the words beside it. A heading
 * is not a sentence. Set at display size and centred in the measure, a leading
 * arrow hangs outside the left edge of the text column, throws the optical
 * centring off, and is the only glyph of its kind at that size in the book.
 *
 * 7 NATIONAL PARKS heads its appendix with an arrow before "ALL FIGURES IN THIS
 * APPENDIX ARE CURRENT AS OF: August 2026". That mark was already dropped from
 * the running head and from the contents entry, for the same reason in each
 * case; leaving it on the display heading alone made the three disagree about
 * the same title.
 *
 * SAME LIST AS `plainHeadingText`, deliberately shared, so display, running head
 * and contents cannot drift apart again. Body text is untouched: an arrow inside
 * a paragraph is a real cross-reference and still draws.
 */
export function stripDrawnMarks(s: string): string {
  return s
    .replace(DRAWN_MARKS, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * The same heading as PLAIN TEXT, for places that cannot hold markup.
 *
 * The running head is set through `string-set: sectitle attr(data-title)`, and a
 * CSS string can only carry characters — markup in that attribute would print as
 * literal tags in the margin, which is worse than the asterisks this replaces.
 * So display gets `inlineHeading` and the attribute gets this.
 *
 * ─── A DRAWN MARK IS DROPPED, NOT SPELLED OUT ────────────────────────────────
 * Warning marks are drawn as SVG, and an SVG is not a character, so it cannot
 * travel into a CSS string. An earlier version transliterated them — `⟶` became
 * `->` — on the reasoning that something was better than nothing.
 *
 * It is not. 7 NATIONAL PARKS heads its appendix `⟶ ALL FIGURES IN THIS APPENDIX
 * ARE CURRENT AS OF: August 2026`, and that ran along the top of pages 113 and
 * 115 of the printed book as "-> ALL FIGURES...". A hyphen and a greater-than in
 * a running head do not read as an arrow; they read as a mistake, and one that
 * survived to a finished interior.
 *
 * A mark is emphasis on the heading where it is drawn. In the margin it is
 * decoration that has lost its meaning, so it goes. The words are what a running
 * head is for.
 */
export function plainHeadingText(s: string): string {
  return s
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*]+?)\*/g, '$1$2')
    .replace(DRAWN_MARKS, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * A chapter heading that carries its own number, e.g.
 * `Chapter 1: Backyard Me v1.0`, `Chapter 11 — Backyard Me Now`,
 * `Chapter 3. Composting`.
 *
 * The separator is REQUIRED. `Chapter 4 What to Plant First` is not matched, and
 * that is deliberate: without a separator there is no non-guessing way to tell a
 * numbered chapter heading from a section that merely opens with the word.
 */
const SELF_NUMBERED_CHAPTER = /^chapter\s+(\d+)\s*[:.–—-]\s*(.+)$/i;

/**
 * An H1 that numbers itself, e.g. `# 4 — Great Smoky Mountains`, `# 11 - Acadia`.
 *
 * As with SELF_NUMBERED_CHAPTER the separator is REQUIRED, and for the same
 * reason: without one there is no non-guessing way to tell `# 7 National Parks
 * Without the Rookie Mistakes` — a TITLE that opens with a numeral — from a
 * numbered chapter. That distinction is not academic; it is this book's own
 * title block, and reading it as chapter 7 would typeset the title page twice
 * and renumber every chapter after it.
 */
const NUMBERED_H1_CHAPTER = /^(\d+)\s*[:.–—-]\s*(.+)$/;

/** An H1 that is a STRUCTURAL MARKER rather than a section of the book. */
const H1_STRUCTURE_MARKER = /^(chapter\s+\d+|front\s+matter|back\s+matter)/i;

/**
 * Which heading convention a manuscript uses.
 *
 *   `marked`        `# Chapter N` + `## Title`, `# FRONT MATTER` / `# BACK MATTER`.
 *                   H1 declares structure; H2 is a section or an entry inside one.
 *   `self-numbered` No structural H1 markers at all. `## Chapter N: Title` carries
 *                   its own number and H1 is a top-level division.
 *   `numbered-h1`   `# N — Title` IS the chapter, and H2 is a SECTION INSIDE it
 *                   rather than a sibling of it. Matter markers may still appear.
 *
 * ─── WHY THIS IS DECIDED UP FRONT ─────────────────────────────────────────
 * The conventions assign OPPOSITE meanings to the same heading levels, so role
 * inference has to know which one it is reading before it starts. Deciding
 * per-heading instead was tried and regressed two shipped books: the Wildlands
 * manuscripts use `# CHAPTER N` markers AND happen to contain some
 * `## Chapter N: ...` H2s further down, so a per-heading rule promoted seven
 * entry headings to chapters and relabelled a run of sections.
 *
 * A single up-front decision makes the guarantee structural: a manuscript with
 * any marker H1 takes the original code path exactly, so it cannot move.
 *
 * ─── WHY numbered-h1 IS CHECKED LAST, AND ONLY UNDER 'marked' ─────────────
 * `# FRONT MATTER` is a structure marker, so a book using self-numbered H1
 * chapters alongside matter markers already returns 'marked' on the first
 * marker it sees — and then loses every chapter, because none of its headings
 * is `# Chapter N`. Measured on 7 NATIONAL PARKS WITHOUT THE ROOKIE MISTAKES:
 * 126 sections, 0 chapters, 177 non-blank lines dropped.
 *
 * So the numbered-h1 test runs only on a manuscript that would otherwise be
 * called 'marked' AND contains no `# Chapter N` marker at all. Any book with a
 * real chapter marker, and any book with no numbered H1s, resolves exactly as
 * it did before — which is every book that has shipped through this parser.
 * Two numbered H1s are required, so a single stray `# 3 — Notes` cannot flip a
 * whole manuscript into a different convention.
 */
export type HeadingConvention = 'marked' | 'self-numbered' | 'numbered-h1';

/** Chapter headings must agree on a convention; one lone match is not a book. */
const MIN_NUMBERED_H1_CHAPTERS = 2;

export function detectHeadingConvention(markdown: string): HeadingConvention {
  let sawSelfNumbered = false;
  let sawChapterMarker = false;
  let markerConvention = false;
  let numberedH1 = 0;

  for (const raw of markdown.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) {
      if (SELF_NUMBERED_CHAPTER.test(h2[1]!.trim())) sawSelfNumbered = true;
      continue;
    }
    const h1 = line.match(/^#\s+(.*)$/);
    if (!h1) continue;
    const t = h1[1]!.trim();
    // Any structural marker at all settles it: this is the original convention.
    if (H1_STRUCTURE_MARKER.test(t)) {
      markerConvention = true;
      if (/^chapter\s+\d+/i.test(t)) sawChapterMarker = true;
      continue;
    }
    if (NUMBERED_H1_CHAPTER.test(t)) numberedH1 += 1;
  }

  // A real `# Chapter N` is decisive, exactly as it was before this branch existed.
  if (sawChapterMarker) return 'marked';
  if (markerConvention) {
    return numberedH1 >= MIN_NUMBERED_H1_CHAPTERS ? 'numbered-h1' : 'marked';
  }
  if (sawSelfNumbered) return 'self-numbered';
  return numberedH1 >= MIN_NUMBERED_H1_CHAPTERS ? 'numbered-h1' : 'marked';
}

/**
 * Split a manuscript into typesettable sections using its own headings.
 *
 *   `# Chapter N` followed by `## Title`  -> chapter (title from the H2)
 *   `## Chapter N: Title`                 -> chapter (number split from title)
 *   `# FRONT MATTER` / `# BACK MATTER`    -> matter, each following H2 a section
 *   `###` / `####`                        -> subheads inside a section
 *   `---`                                 -> scene break
 *
 * The manuscript's own title block is dropped: a title page is generated matter,
 * not manuscript prose, so typesetting it here would duplicate it later.
 *
 * ─── WHY THIS READS MORE THAN ONE SHAPE ───────────────────────────────────
 * It used to read only the first and third shapes. A manuscript that numbered
 * its chapters in the H2 itself and used bare H1s for its back matter — an
 * entirely ordinary nonfiction layout — hit the title-block rule on EVERY H1 and
 * had those sections discarded along with all their body text.
 *
 * Measured on DIRT RICH: 16 sections instead of 24, zero chapters recognised,
 * and The Practical Bits, Appendices A-F and the Glossary silently gone. It did
 * not error. The every-section invariant compares the render against THIS
 * function's output, so a section dropped here is a section the invariant never
 * knew to look for — it compared the truncated list against itself and passed.
 * That is why `canonical-inventory.ts` re-derives the expected sections straight
 * from the manuscript instead of trusting anything downstream of this parser.
 *
 * Both additions are STRICTLY ADDITIVE: each fires only where the old code would
 * have dropped content on the floor.
 *   - the H2 chapter shape is read only when no `# Chapter N` is already pending,
 *     so a book using the original two-line shape cannot double-count;
 *   - a bare H1 defaults to `back` only once chapters have started AND no
 *     explicit matter marker is in force, which is exactly the case that used to
 *     be mislabelled `front`.
 */
export function parseTypesetSections(markdown: string): TypesetSection[] {
  const out: TypesetSection[] = [];
  let current: TypesetSection | null = null;
  let pendingChapter: number | null = null;
  let matter: 'front' | 'back' | null = null;
  /** True once a chapter or matter marker has appeared — see the bare-H1 rule. */
  let seenStructure = false;
  /** True once any chapter has been read. Only consulted in the new conventions. */
  let seenChapter = false;
  /**
   * Decided once, before a single heading is read. In `marked` this function
   * behaves exactly as it did before C1, line for line — that is the regression
   * guarantee, and it is structural rather than a matter of testing carefully.
   */
  const convention = detectHeadingConvention(markdown);
  const selfNumbered = convention === 'self-numbered';
  const numberedH1 = convention === 'numbered-h1';
  /**
   * Does the manuscript SAY where its back matter starts?
   *
   * The inference below exists for books that do not, and it must not overrule
   * one that does. 7 NATIONAL PARKS declares `# BACK MATTER` near the end and
   * ALSO carries bare H1 part dividers — `PART 2 — THE SEVEN PARKS` — in the
   * middle of the book, four chapters before it. Inferring from "chapters have
   * started" alone labelled those dividers back matter a third of the way in.
   */
  const declaresBackMatter = /^#[ \t]+back[ \t]+matter[ \t]*$/im.test(markdown);
  /**
   * Back-matter inference: a rule for the two newer conventions, and only for a
   * manuscript that left the question open.
   */
  const unmarked = (): 'front' | 'back' =>
    (selfNumbered || numberedH1) && seenChapter && !declaresBackMatter ? 'back' : 'front';
  /**
   * True when the section now open was started by an H3 under a matter marker.
   * Consecutive H3s there are PEERS — two author notes, not one note carrying
   * the other as a subhead — so each opens its own section. See the H3 branch.
   */
  let matterSectionFromH3 = false;

  for (const raw of markdown.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h3 = line.match(/^###\s+(.*)$/);

    if (h1) {
      const t = h1[1]!.trim();
      const ch = t.match(/^chapter\s+(\d+)/i);
      if (ch) { pendingChapter = Number(ch[1]); matter = null; seenStructure = true; seenChapter = true; current = null; matterSectionFromH3 = false; continue; }
      if (/^front\s+matter$/i.test(t)) { matter = 'front'; seenStructure = true; current = null; matterSectionFromH3 = false; continue; }
      if (/^back\s+matter$/i.test(t)) { matter = 'back'; seenStructure = true; current = null; matterSectionFromH3 = false; continue; }
      // `# N — Title` IS the chapter in this convention. Checked before the
      // title-block rule, because the title block has no separator-number shape
      // and so cannot reach here (see NUMBERED_H1_CHAPTER).
      const num = numberedH1 ? t.match(NUMBERED_H1_CHAPTER) : null;
      if (num) {
        seenStructure = true;
        seenChapter = true;
        matter = null;
        pendingChapter = null;
        current = { kind: 'chapter', number: Number(num[1]), title: num[2]!.trim(), sourceTitle: t, bodyLines: [] };
        out.push(current);
        matterSectionFromH3 = false;
        continue;
      }
      // A bare H1 BEFORE any chapter or matter marker is the manuscript's own
      // title block. It must not become a typeset section: the title page is
      // generated matter, so typesetting the prose here would duplicate it and
      // push every chapter two pages later. After structure has started, a bare
      // H1 is a real standalone section and is kept.
      if (!seenStructure) { pendingChapter = null; current = null; continue; }
      // Once the chapters have run, an unmarked H1 is back matter. Appendices, a
      // glossary and a source list are not front matter, and calling them front
      // gives them the front-matter start policy — which on a recto-start
      // standard buys a blank verso in front of each one.
      current = { kind: matter ?? unmarked(), number: null, title: t, sourceTitle: t, bodyLines: [] };
      out.push(current);
      pendingChapter = null;
      matterSectionFromH3 = false;
      continue;
    }

    if (h2) {
      const t = h2[1]!.trim();
      /**
       * In numbered-h1 an H2 is a SECTION INSIDE the chapter, not a sibling of
       * it, so it stays in the body and is set as a subhead. Promoting it was
       * the defect: 107 H2s became 107 top-level sections, each taking the
       * standard's forced section break — 126 page breaks in a book with 23
       * divisions, and no chapter opener anywhere.
       *
       * A stray H2 before any chapter (inside the title block) still has no
       * section to belong to and is dropped with the rest of that block.
       */
      if (numberedH1) {
        if (current) current.bodyLines.push(line);
        continue;
      }
      const self = selfNumbered && pendingChapter === null ? t.match(SELF_NUMBERED_CHAPTER) : null;
      if (self) {
        seenStructure = true;
        seenChapter = true;
        matter = null;
        current = { kind: 'chapter', number: Number(self[1]), title: self[2]!.trim(), sourceTitle: t, bodyLines: [] };
        out.push(current);
        continue;
      }
      current = {
        // Same rule as the bare H1 above, for the same reason: `Where I Checked`
        // and `About the Author` are H2s that follow the appendices, and calling
        // them front matter is wrong in both role and start policy.
        kind: pendingChapter !== null ? 'chapter' : (matter ?? unmarked()),
        number: pendingChapter,
        title: t,
        sourceTitle: t,
        bodyLines: [],
      };
      out.push(current);
      pendingChapter = null;
      continue;
    }

    /**
     * An H3 under a matter marker with NO section open starts one.
     *
     * `# FRONT MATTER` followed straight by `### A note on how this book was
     * written` opened nothing, so every line beneath it fell to the `if
     * (current)` guard at the bottom of the loop and was discarded — 177
     * non-blank lines on 7 NATIONAL PARKS, including the composite-narrator
     * disclosure, which is a legal disclosure rather than copy.
     *
     * It fired silently. Nothing downstream compares a section count against
     * the manuscript's own headings, so the book simply had no front matter and
     * reported success.
     *
     * STRICTLY ADDITIVE: it requires an explicit matter marker AND no open
     * section, which is exactly and only the case that used to drop content. An
     * H3 anywhere else — inside a chapter, inside a matter section already
     * opened by an H2 — still falls through to the body, as it always did.
     */
    if (h3 && matter !== null && (current === null || matterSectionFromH3)) {
      const t = h3[1]!.trim();
      current = { kind: matter, number: null, title: t, sourceTitle: t, bodyLines: [] };
      out.push(current);
      matterSectionFromH3 = true;
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

// ── Tables (C2) ─────────────────────────────────────────────────────────────

type CellAlign = 'left' | 'right' | 'center';

/**
 * Split a pipe row into cells.
 *
 * Splits on UNESCAPED pipes only, so a cell may contain a literal `\|`. Leading
 * and trailing pipes are optional, per GFM — `a | b` and `| a | b |` are the
 * same row.
 */
export function splitTableRow(row: string): string[] {
  let t = row.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  return t
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));
}

/** `|---|:--:|--:|` — the row that turns the line above it into a header. */
export function isDelimiterRow(row: string | undefined): boolean {
  if (!row) return false;
  const t = row.trim();
  if (!t.includes('|') || !t.includes('-')) return false;
  const cells = splitTableRow(t);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

/**
 * Column alignment from the delimiter row. `:--` left, `--:` right, `:-:`
 * centre, bare `--` left by default.
 *
 * Padded to the header width so a malformed delimiter row cannot leave a column
 * with no alignment — the cell still has to render.
 */
export function alignmentsFrom(delimiter: string, columns: number): CellAlign[] {
  const cells = splitTableRow(delimiter);
  const out: CellAlign[] = [];
  for (let i = 0; i < columns; i++) {
    const c = cells[i] ?? '';
    const l = c.startsWith(':');
    const r = c.endsWith(':');
    out.push(l && r ? 'center' : r ? 'right' : 'left');
  }
  return out;
}

/**
 * Build the table markup.
 *
 * Every authored cell is emitted, including empty ones and any beyond the header
 * width: a table is DATA, and quietly dropping a cell because a row is ragged
 * would be exactly the silent content loss this engine work exists to stop. A
 * short row is padded so the grid stays rectangular.
 */
function tableHtml(
  header: string[],
  align: CellAlign[],
  rows: string[][],
  inline: (s: string) => string,
): string {
  const columns = Math.max(header.length, ...rows.map((r) => r.length), 1);
  const at = (i: number): CellAlign => align[i] ?? 'left';
  const cell = (tag: 'th' | 'td', text: string, i: number): string =>
    `<${tag} class="ta-${at(i)}">${inline(text)}</${tag}>`;
  const pad = (r: string[]): string[] =>
    r.length >= columns ? r : [...r, ...Array(columns - r.length).fill('')];

  const thead = `<thead><tr>${pad(header).map((c, i) => cell('th', c, i)).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows
    .map((r) => `<tr>${pad(r).map((c, i) => cell('td', c, i)).join('')}</tr>`)
    .join('')}</tbody>`;
  return `<table class="tset-table" data-columns="${columns}" data-rows="${rows.length}">${thead}${tbody}</table>`;
}

/**
 * The same table, set as stacked units because it is too wide to be a grid.
 * See `TypesetTableStyles.stackWhenColumnsExceed` for why this exists.
 *
 * One unit per row. The first cell names the unit; every remaining cell becomes
 * a labelled field. `data-cells` carries the authored cell count so a QA pass
 * can assert against the manuscript that nothing was lost on the way here —
 * which is the whole reason a presentation fallback is safe to have at all.
 */
function stackedTableHtml(
  header: string[],
  rows: string[][],
  inline: (s: string) => string,
): string {
  const columns = Math.max(header.length, ...rows.map((r) => r.length), 1);
  const pad = (r: string[]): string[] =>
    r.length >= columns ? r : [...r, ...Array(columns - r.length).fill('')];
  const label = (i: number): string => header[i] ?? '';

  const units = rows
    .map((r) => {
      const cells = pad(r);
      const lead = `<p class="tst-lead">${inline(cells[0] ?? '')}</p>`;
      const fields = cells
        .slice(1)
        .map(
          (c, i) =>
            `<p class="tst-field">` +
            `<span class="tst-label">${inline(label(i + 1))}</span>` +
            `<span class="tst-value">${inline(c)}</span>` +
            `</p>`,
        )
        .join('');
      return `<div class="tst-unit">${lead}${fields}</div>`;
    })
    .join('');

  const cellCount = rows.reduce((n, r) => n + Math.max(r.length, columns), 0);
  return (
    `<div class="tset-table-stacked" data-columns="${columns}" data-rows="${rows.length}" ` +
    `data-cells="${cellCount}">${units}</div>`
  );
}

interface BodyHtmlOptions {
  micro?: TerminalMicroSectionPolicy;
  takeaway?: ChapterTakeawayPolicy;
  alert?: AlertPanelPolicy;
  /**
   * Render each authored LINE as its own index entry instead of joining
   * consecutive lines into a paragraph. Scoped to the Quick-Answer Index by the
   * caller, never global.
   */
  quickAnswerEntries?: boolean;
  /** Category headings that get the drawn alert mark. */
  urgentHeadings?: readonly string[];
  /** Section identity, so every block can be stamped with a stable id. */
  sectionSlug?: string;
  sectionTitle?: string;
  /** Receives one ref per emitted block. See `block-identity.ts`. */
  collect?: TypesetBlockRef[];
  /** Where long tokens may break. Absent leaves them intact, as they shipped. */
  longTokens?: LongTokenWrappingPolicy;
  /** Table styling. Absent means pipe rows are not read as tables at all. */
  tables?: TypesetTableStyles;
  /** From the pinned standard. Absent binds one paragraph, as books shipped before it existed. */
  headingBind?: HeadingBindPolicy;
  /** Fenced-block styling. Absent means fences are not recognised. */
  preformatted?: TypesetPreformattedStyles;
  /** Checklist styling. Absent means task items stay ordinary bullets. */
  checklist?: TypesetChecklistStyles;
  /** asset name -> data URI. Absent means `![...]()` stays literal text. */
  images?: Record<string, string>;
  /**
   * How far to demote authored subheads. 0 leaves `###` as h3. 1 sets a
   * manuscript's H2 as h3 and its H3 as h4 — see the heading branch below.
   */
  subheadOffset?: number;
  /** Whether a rule touching a heading prints. Absent means it prints. */
  sceneBreakAtHeading?: 'print' | 'drop-at-heading';
}

/**
 * Does this manuscript set its H2s as body subheads rather than as sections?
 *
 * This is a FACT about the parse, not a guess. `parseTypesetSections` consumes
 * every H2 into a section in both the `marked` and `self-numbered` conventions —
 * the branch always `continue`s — so an H2 can only ever reach `bodyLines`
 * through the `numbered-h1` branch, which is exactly the convention where H2 is
 * a division inside the chapter.
 *
 * Deriving it here rather than threading a convention flag through every caller
 * keeps the sections self-describing: anything holding a `TypesetSection[]` can
 * set it correctly without also having to hold the markdown it came from.
 */
export function subheadOffsetFor(sections: readonly TypesetSection[]): 0 | 1 {
  return sections.some((s) => s.bodyLines.some((l) => /^##\s+\S/.test(l))) ? 1 : 0;
}

function bodyToHtml(lines: string[], opts: BodyHtmlOptions = {}): string {
  const { micro, takeaway, alert } = opts;
  /** Local alias so every inline call carries the policy without repeating it. */
  const inline = (s: string): string => inlineMarkdown(s, opts.longTokens);
  const html: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  /** Which kind of list is open. Switching kind closes the previous one. */
  let listKind: 'ul' | 'ol' | null = null;
  let quote: string[] = [];
  let flushNext = true;

  /** A GFM task item: `[ ] text` or `[x] text`, after the bullet is stripped. */
  const TASK_ITEM = /^\[([ xX])\]\s+(.*)$/;

  const closeList = (): void => {
    if (!list.length) return;
    const tag = listKind === 'ol' ? 'ol' : 'ul';
    // A CHECKLIST only when the standard asks for one AND every item is a task
    // item. A mixed list is left alone: half-boxed, half-bulleted would read as
    // a mistake, and guessing which half was meant is not the renderer's call.
    const allTasks = list.every((li) => TASK_ITEM.test(li));
    if (opts.checklist && tag === 'ul' && allTasks) {
      const items = list
        .map((li) => {
          const m = TASK_ITEM.exec(li)!;
          const ticked = m[1]!.toLowerCase() === 'x';
          // The box is drawn, not typed — see TypesetChecklistStyles.
          return `<li class="ck-item"><span class="ck-box${ticked ? ' ck-ticked' : ''}"></span><span class="ck-text">${inline(m[2]!)}</span></li>`;
        })
        .join('');
      html.push(`<ul class="checklist">${items}</ul>`);
    } else {
      html.push(`<${tag}>${list.map((li) => `<li>${inline(li)}</li>`).join('')}</${tag}>`);
    }
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
    // A HEADING on the first line is a label too. 7 NATIONAL PARKS writes all 16
    // of its skip boxes as `> ### SKIP IT / DO THIS INSTEAD`, and with only the
    // bold rule that line went through `inline`, which has no heading branch —
    // so the hashes printed literally at the top of every box.
    const m = /^\*\*(.+)\*\*$/.exec(first) ?? /^#{1,4}\s+(.+)$/.exec(first);
    if (m) {
      label = `<p class="callout-label">${inline(m[1]!.trim())}</p>`;
      lines.shift();
    }
    const body = lines
      .join('\n')
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean)
      .map((p) => `<p>${inline(p)}</p>`)
      .join('');
    html.push(`<blockquote class="callout">${label}${body}</blockquote>`);
    quote = [];
    flushNext = true;
  };
  const closePara = (): void => {
    if (!para.length) return;
    // In an index the LINE is the unit: each authored line becomes its own
    // entry rather than being joined into a paragraph. Joining them is what
    // turned the emergency block into one unscannable justified slab.
    if (opts.quickAnswerEntries) {
      for (const line of para) html.push(`<p class="qa-entry">${inline(line)}</p>`);
      para = [];
      flushNext = false;
      return;
    }
    /**
     * A paragraph the author OPENED with the warning sign is a safety warning,
     * and is set as one: the drawn mark hangs at the head of the block and the
     * paragraph is kept whole.
     *
     * Deliberately NOT a boxed panel. All sixteen of them sit inline in the
     * middle of running advice, and boxing each one would change the rhythm of
     * every safety passage in the book — the mark carries the signal on its own.
     *
     * `break-inside: avoid` matters more than it looks: a flash-flood
     * instruction split across a page turn shows the reader half of it.
     */
    const text = para.join(' ');
    const cls = [flushNext ? 'first' : '', /^\s*⚠/.test(text) ? 'warn' : ''].filter(Boolean).join(' ');
    html.push(`<p${cls ? ` class="${cls}"` : ''}>${inline(text)}</p>`);
    para = [];
    flushNext = false;
  };

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    const t = line.trim();

    // ── Inline figure ────────────────────────────────────────────────────
    // `![caption](asset-name)` on its own line becomes a figure IN THE FLOW, so
    // the typesetter reserves its height and pagination accounts for it.
    //
    // Deliberately not the stamping path: stamping draws art into whatever space
    // is left at the foot of a page, which suits an illustrated book with room
    // to spare. This book runs 94 of 119 pages at 90-100% full, so there is no
    // such space — anchoring by stamp pushed both figures 5 and 8 pages away
    // from the text they illustrate. A figure in the flow stays put.
    // `![caption](asset)` optionally followed by `{70%}` to set the printed
    // width as a fraction of the text measure. Without it a figure fills the
    // measure, which is right for a chart and too heavy for a small vignette —
    // a chapter-end plate and a full-width diagram are different jobs.
    const fig = opts.images ? t.match(/^!\[([^\]]*)\]\(([^)]+)\)(?:\{(\d{1,3})%\})?$/) : null;
    if (fig) {
      const src = opts.images![fig[2]!.trim()];
      if (src) {
        closeQuote(); closeList(); closePara();
        const caption = fig[1]!.trim();
        // Clamped: a figure may not exceed the measure, and a sub-10% figure is
        // a typo rather than an intention.
        const pct = fig[3] ? Math.min(100, Math.max(10, Number(fig[3]))) : 100;
        const style = pct === 100 ? '' : ` style="width:${pct}%"`;
        html.push(
          `<figure class="tset-figure"><img src="${src}" alt="${escapeHtml(caption)}"${style}>` +
            (caption ? `<figcaption>${inline(caption)}</figcaption>` : '') +
            `</figure>`,
        );
        flushNext = true;
        continue;
      }
      // Unknown asset: fall through to normal text rather than emit a broken
      // image. A missing figure must be visible, not silently blank.
    }

    // ── Preformatted / fenced blocks (C3) ────────────────────────────────
    // Everything between the fences is emitted VERBATIM: escaped, but with no
    // inline markdown pass, no long-token marking, no whitespace collapsing.
    // The shape is the content — a `**` inside a site plan is two asterisks in
    // a drawing, not an instruction to embolden.
    if (opts.preformatted && /^(```|~~~)/.test(t)) {
      closeQuote(); closeList(); closePara();
      const marker = t.slice(0, 3);
      const content: string[] = [];
      let j = li + 1;
      for (; j < lines.length; j++) {
        if (lines[j]!.trim().startsWith(marker)) break;
        content.push(lines[j]!);
      }
      // An unterminated fence consumes the rest of the section rather than
      // silently reverting to prose: losing the shape is the failure mode this
      // branch exists to prevent, so fail towards preserving it.
      li = j;
      html.push(
        `<pre class="tset-pre" data-lines="${content.length}">${escapeHtml(content.join('\n'))}</pre>`,
      );
      flushNext = true;
      continue;
    }

    // ── Tables (C2) ──────────────────────────────────────────────────────
    // Consumes several lines at once, so it needs the index. Recognised only
    // when the standard declares a table policy AND the row is followed by a
    // delimiter row — the two-line signature is what distinguishes a table from
    // a paragraph that happens to contain a pipe.
    if (opts.tables && t.startsWith('|') && isDelimiterRow(lines[li + 1])) {
      closeQuote(); closeList(); closePara();
      const header = splitTableRow(t);
      const align = alignmentsFrom(lines[li + 1]!, header.length);
      const rows: string[][] = [];
      let j = li + 2;
      for (; j < lines.length; j++) {
        const rt = lines[j]!.trim();
        if (!rt.startsWith('|')) break;
        rows.push(splitTableRow(rt));
      }
      li = j - 1;
      // Too wide to divide the measure legibly? Set it as stacked units instead.
      // The decision is taken on the authored column count, so it is the same on
      // every build of the same manuscript.
      const columns = Math.max(header.length, ...rows.map((r) => r.length), 1);
      const limit = opts.tables.stackWhenColumnsExceed;
      html.push(
        limit !== null && limit !== undefined && columns > limit
          ? stackedTableHtml(header, rows, inline)
          : tableHtml(header, align, rows, inline),
      );
      flushNext = true;
      continue;
    }

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
    if (bq) {
      closeList(); closePara();
      const inner = bq[1] ?? '';
      /**
       * A HEADING inside a quote opens a NEW callout.
       *
       * A blank line inside a blockquote is a paragraph break rather than the
       * end of it, which is correct for a multi-paragraph aside and wrong for
       * two boxes standing back to back. 7 NATIONAL PARKS writes its skip boxes
       * as `> ### SKIP IT / DO THIS INSTEAD` and puts two of them in a row in
       * two places; both merged into a single box, and because the label is
       * only lifted from the FIRST line of a quote, the second one printed its
       * hashes in the middle of the box.
       *
       * A heading is a label, and a label starts a box. Requiring existing
       * content means the ordinary case — a heading on the quote's first line —
       * is untouched.
       */
      if (/^#{1,6}\s+\S/.test(inner) && quote.some((q) => q.trim())) closeQuote();
      quote.push(inner);
      continue;
    }
    closeQuote();
    if (/^-{3,}$/.test(t) || /^\*\s*\*\s*\*$/.test(t)) {
      closeList(); closePara();
      /**
       * A rule touching a heading is STRUCTURAL, not a scene break — dropped
       * when the standard asks for it. See `blocks.sceneBreakAtHeading`.
       *
       * "Touching" is measured across blank lines and across a run of rules,
       * because that is how these are authored: `---` on its own line, a blank,
       * then the heading. Looking only at the adjacent line would find the blank
       * and print the asterisks anyway.
       */
      if (opts.sceneBreakAtHeading === 'drop-at-heading') {
        const isHeading = (s: string | undefined): boolean => /^#{1,6}\s+\S/.test((s ?? '').trim());
        const isRuleOrBlank = (s: string | undefined): boolean => {
          const v = (s ?? '').trim();
          return v === '' || /^-{3,}$/.test(v) || /^\*\s*\*\s*\*$/.test(v);
        };
        let after = li + 1;
        while (after < lines.length && isRuleOrBlank(lines[after])) after += 1;
        let before = li - 1;
        while (before >= 0 && isRuleOrBlank(lines[before])) before -= 1;
        // No preceding prose at all means this rule opens the section body, and
        // there is nothing above it to separate from either.
        if (isHeading(lines[after]) || before < 0 || isHeading(lines[before])) {
          flushNext = true;
          continue;
        }
      }
      // A scene break separates two passages. Two in a row separate nothing
      // from nothing, so collapse them. This manuscript uses a DOUBLE rule as a
      // structural marker before every chapter heading and a single rule as a
      // real scene break, and rendering both literally printed pairs of stray
      // asterisk rows at the end of sections.
      if (html[html.length - 1] !== SCENE_BREAK) html.push(SCENE_BREAK);
      flushNext = true;
      continue;
    }
    /**
     * Subheads, demoted by the convention's offset.
     *
     * With `subheadOffset: 1` the manuscript's H2 becomes the page's h3 and its
     * H3 becomes h4 — which maps a numbered-h1 book's two levels of subhead onto
     * the two the standard already styles (`sectionHeadingPt`,
     * `subsectionHeadingPt`) rather than inventing a third. It also keeps the
     * component matchers working: `alertPanel`, `takeaway` and `urgentHeadings`
     * all key on `<h3`, and in that convention the recurring beats
     * ("NOBODY WARNED ME") are authored as H2.
     *
     * Clamped at h4. Going deeper would emit a level with no styling.
     */
    const heading = t.match(/^(#{2,4})\s+(.*)$/);
    if (heading) {
      const authored = heading[1]!.length;
      // A source H2 is a heading only where the convention says so; elsewhere it
      // was consumed by the parser and can never reach here.
      const level = Math.min(authored + (opts.subheadOffset ?? 0), 4);
      if (level >= 3) {
        closeList(); closePara();
        const text = heading[2]!;
        if (level === 3) {
          const isUrgent = (opts.urgentHeadings ?? []).some((h) => h.toLowerCase() === text.trim().toLowerCase());
          html.push(`<h3${isUrgent ? ' class="urgent"' : ''}>${isUrgent ? ALERT_FLAG : ''}${inline(text)}</h3>`);
        } else {
          html.push(`<h4>${inline(text)}</h4>`);
        }
        flushNext = true;
        continue;
      }
    }
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

  /** Every block carries a stable id; overrides target these, never pages. */
  /**
   * KEEP A HEADING WITH THE TEXT IT INTRODUCES.
   *
   * A subhead alone at the foot of a page, its content starting overleaf, reads
   * as a mistake: the reader turns the page to find out what it was for.
   *
   * `break-after: avoid` is the CSS for this and Paged.js here IGNORES it — the
   * same finding already recorded for `orphans`/`widows` in the layout standard.
   * What it does honour is `break-inside: avoid`, so the heading and the block
   * after it are wrapped in one indivisible unit and travel together.
   *
   * Only a PARAGRAPH is paired. Binding a heading to a table, a figure or a list
   * could drag a large object onto a new page and open a bigger hole than the
   * one being closed.
   */
  const keepHeadingsWithText = (blocks: string[]): string[] => {
    const out: string[] = [];
    const isPara = (b: string | undefined): boolean =>
      Boolean(b && /^<p[ >]/.test(b) && !b.includes('scene-break'));
    /**
     * Absent policy binds ONE paragraph, which is the behaviour every book
     * frozen before `headingBind` existed was built with. The threshold is never
     * defaulted to a number here: a character count is a property of the measure,
     * so a shared default would be one book's calibration silently applied to
     * every other. See HeadingBindPolicy.
     */
    const bindUnder = opts.headingBind?.extraParagraphUnderChars;
    const textLen = (b: string): number => b.replace(/<[^>]+>/g, '').trim().length;
    for (let i = 0; i < blocks.length; i++) {
      const cur = blocks[i]!;
      const next = blocks[i + 1];
      const isHeading = /^<h[34][ >]/.test(cur);
      if (isHeading && isPara(next)) {
        const after = blocks[i + 2];
        const bindTwo = bindUnder !== undefined && textLen(next!) <= bindUnder && isPara(after);
        out.push(`<div class="keep-with-next">${cur}${next}${bindTwo ? after : ''}</div>`);
        i += bindTwo ? 2 : 1;
        continue;
      }
      out.push(cur);
    }
    return out;
  };

  const finish = (): string =>
    stampBlockIds(keepHeadingsWithText(html), opts.sectionSlug ?? '', opts.sectionTitle ?? '', opts.collect).join('\n');

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
        return finish();
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
  return finish();
}

// ── Document ────────────────────────────────────────────────────────────────

export interface TypesetHtmlInput {
  sections: TypesetSection[];
  config: ProjectConfig;
  margins?: TypesetMargins;
  /**
   * Figure assets, keyed by the name used in `![caption](name)`, as data URIs.
   *
   * Data URIs rather than file paths, for the same reason the type faces are
   * vendored: a print render must not depend on anything outside the document
   * at render time. Absent means figure syntax stays literal text.
   */
  images?: Record<string, string>;
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
  /**
   * Title page, copyright page and contents, set in the same standard as the
   * body. Omit entirely and the book renders exactly as it did before, which is
   * what tests and the field-guide track rely on.
   *
   * `entries[].page` is null on the first pass and filled on the second; see
   * front-matter.ts for why a contents page cannot resolve in one.
   */
  frontMatter?: { entries: TocEntry[]; publication?: Record<string, unknown> };
  /**
   * Per-block exceptions to the standard, keyed by stable block id. Emitted as
   * the LAST rules in the stylesheet, so they win by source order rather than by
   * `!important` and the standard's own CSS stays readable.
   */
  layoutOverrides?: Record<string, LayoutOverride>;
  /** Receives a ref for every block emitted. Lets callers name blocks. */
  collectBlocks?: TypesetBlockRef[];
  /** Receives which overrides applied and which matched nothing. */
  overrideReport?: OverrideCssResult[];
  /**
   * REVIEW GUIDES — draw the trim edge and the text area on every page.
   *
   * For looking at, never for printing. The export path never sets this, and the
   * guides are drawn with `outline`, which is painted outside the box and takes
   * part in no layout calculation whatsoever. A guided render therefore has the
   * same page count and the same line breaks as an unguided one, which the
   * acceptance gate checks rather than assumes.
   */
  reviewGuides?: boolean;
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
  const qa = standard.quickAnswerIndex;
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
   *
   * FIRST CHAPTER ONLY is forced recto, and that is handled as a separate rule
   * below rather than here. Forcing EVERY chapter to a right-hand page bought
   * ten parity blanks in a 159-page book: a lot of empty paper for a convention
   * this book does not need past the opening of the body.
   */
  const startFor = (kind: TypesetSection['kind']): 'recto' | 'page' => {
    if (kind === 'chapter') return design.chaptersStartRecto ? 'recto' : 'page';
    return standard.sectionStart[kind];
  };
  /** Index of the first chapter, which opens the body and does earn a recto. */
  const firstChapterIndex = sections.findIndex((s) => s.kind === 'chapter');

  // The classic drop: the chapter heading begins about a third down the text
  // block, leaving white space above it.
  const sinkIn = ((trim.heightIn - m.topIn - m.bottomIn) * op.sinkFraction).toFixed(3);

  // Every block gets a stable id as it is emitted, and the refs are collected so
  // callers (the review UI, Layer 1) can name a block without re-deriving it.
  const collect: TypesetBlockRef[] = [];
  const subheadOffset = subheadOffsetFor(sections);
  const body = sections
    .map((s, i) => {
      const label = chapterLabel(s, op.labelFormat);
      const slug = slugifySection(s.title);
      const opener = stampBlockIds(
        [
          `<header class="opener">${label ? `<p class="kicker">${escapeHtml(label)}</p>` : ''}<h2>${inlineHeadingHtml(op.titleSource === 'source' ? s.sourceTitle : s.title)}</h2></header>`,
        ],
        slug,
        s.title,
        collect,
      )[0]!;
      // `data-title` feeds the running head through `string-set`, and a CSS
      // string can only carry characters — so the attribute gets the plain form
      // while the opener above gets the rendered one.
      return `<section class="tsec ${s.kind}${i === firstChapterIndex ? ' first-chapter' : ''}" id="tsec-${i}" data-title="${escapeHtml(plainHeadingText(s.title))}" data-label="${escapeHtml(label)}" data-kind="${s.kind}" data-section-slug="${slug}">
  ${opener}
  ${bodyToHtml(s.bodyLines, {
    /** From the PINNED standard, never a shared constant. See HeadingBindPolicy. */
    headingBind: standard.headingBind,
    micro: standard.terminalMicroSection,
    takeaway: standard.chapterTakeaway,
    alert: standard.alertPanel,
    quickAnswerEntries:
      qa.enabled && qa.sectionTitles.some((t) => t.toLowerCase() === s.title.toLowerCase()),
    urgentHeadings: qa.enabled ? qa.urgentHeadings : [],
    sectionSlug: slug,
    sectionTitle: s.title,
    collect,
    longTokens: standard.longTokens,
    tables: standard.tables,
    preformatted: standard.preformatted,
    checklist: standard.checklist,
    images: input.images,
    subheadOffset,
    sceneBreakAtHeading: standard.blocks.sceneBreakAtHeading,
  })}
</section>`;
    })
    .join('\n');
  input.collectBlocks?.push(...collect);
  // Overrides are compiled against the blocks this render actually produced, so
  // one that matches nothing is reported rather than silently doing nothing.
  const overrides = overrideCss(
    input.layoutOverrides ?? config.layoutOverrides,
    new Set(collect.map((b) => b.blockId)),
  );
  input.overrideReport?.push(overrides);

  // Fonts come from vendored assets so the printed interior is reproducible
  // offline. Only families with no bundled asset fall back to the CDN, and that
  // fallback is a dev convenience — see font-assets.ts.
  // The preformatted face is only embedded for a book that actually sets a
  // fenced block — it is a complete unsubsetted TTF (~444KB of base64), and a
  // text-only book must not carry it.
  const fonts = bundledFontCss(
    standard.preformatted
      ? [t.headingFont, t.bodyFont, standard.preformatted.family]
      : [t.headingFont, t.bodyFont],
  );
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
${input.reviewGuides
  ? `
/* REVIEW GUIDES — never printed. Drawn with OUTLINE, not border: an outline is
   painted outside the box and occupies no space, so it cannot change a page
   box, a text area, a line break or the page count. Anything that could is the
   wrong tool here, because the whole point is to look at the real interior.

   red   = TRIM, where the paper is cut. This book has zero bleed, so the trim
           IS the page edge.
   blue  = the TEXT AREA the margins define. Body type lives inside it; the
           running head and the folio sit outside it on purpose, in the margin
           boxes, which is exactly what an operator needs to see. */
.pagedjs_pagebox { outline: 0.75pt solid #cc2222; outline-offset: -0.375pt; }
.pagedjs_area { outline: 0.5pt dashed #2E6FB0; }`
  : ''}

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
  /* From the layout standard, not hardcoded. These fields existed on
     TypesetParagraphPolicy and were being ignored here, so a standard could
     declare orphans/widows and get 2/2 regardless. v1 declares 2/2, so this
     changes nothing for books already approved on it. */
  orphans: ${para.orphans}; widows: ${para.widows};
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
/* The body opens on a right-hand page; later chapters take the next available
   page, left or right. Forcing every chapter recto cost ten blank pages. */
.tsec.first-chapter { break-before: recto; }
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
/* A SPLIT PANEL IS ONE PANEL, NOT TWO.
   When a panel is allowed to break, Paged.js rebuilds each fragment as its own
   element, so both halves drew a complete four-sided box and the reader saw two
   independent boxes across the spread rather than one continuing over the page.
   Paged.js marks the fragments: data-split-to on the half that continues,
   data-split-from on the half that resumes. Opening the facing edges turns them
   back into one panel, and the label is suppressed on the continuation so the
   heading is not announced twice. */
.alert-panel[data-split-to] { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
.alert-panel[data-split-from] { border-top: none; padding-top: 0; margin-top: 0; }
.alert-panel[data-split-from] > .alert-label { display: none; }
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
/* Quick-Answer Index: a lookup table set as type. One authored line = one
   entry, no first-line indent (an index is scanned down its left edge), ragged
   right (justifying two-line entries opens rivers), and each entry kept whole
   so a question is never split from its answer across a page. */
.qa-entry { text-indent: 0; margin: 0 0 ${qa.entrySpacingEm}em;
  text-align: ${qa.justify ? 'justify' : 'left'};
  ${qa.justify ? '' : 'hyphens: none; -webkit-hyphens: none;'}
  ${qa.keepEntryTogether ? 'break-inside: avoid;' : ''} }
${
  standard.longTokens && standard.longTokens.mode !== 'none' && standard.longTokens.breakAnywhereFallback
    ? `/* Long-token fallback. The break opportunities placed as <wbr> handle every
   URL that has punctuation to break on; this catches the token that has none,
   where the only alternative is ink outside the trim. Scoped to paragraphs so it
   cannot reflow a heading. Emitted ONLY when the standard asks for it, so a book
   approved without this rule does not silently acquire it. */
p { overflow-wrap: break-word; }`
    : ''
}
${
  standard.tables
    ? `/* Tables (C2). A grid, not prose: no first-line indent, no justification,
   and the header carrying the one heavy rule. Emitted only when the standard
   declares a table policy. */
table.tset-table { width: 100%; border-collapse: collapse; margin: 1em 0;
  font-size: ${standard.tables.typePt}pt; line-height: 1.25;
  ${standard.tables.breakPolicy === 'keep-together' ? 'break-inside: avoid;' : ''} }
table.tset-table th, table.tset-table td {
  padding: ${standard.tables.cellPaddingEm}em; vertical-align: top;
  text-indent: 0; hyphens: none; -webkit-hyphens: none;
  ${standard.tables.rowRulePt > 0 ? `border-bottom: ${standard.tables.rowRulePt}pt solid rgba(0,0,0,.28);` : ''} }
table.tset-table th { font-family: '${t.headingFont}', 'Oswald', sans-serif; font-weight: 600;
  text-align: left; border-bottom: ${standard.tables.headerRulePt}pt solid rgba(0,0,0,.85); }
${standard.tables.repeatHeader ? 'table.tset-table thead { display: table-header-group; }' : ''}
table.tset-table tr { break-inside: avoid; }
.ta-left { text-align: left; } .ta-right { text-align: right; } .ta-center { text-align: center; }
/* Stacked wide table. Set as a run of small labelled records, because past a
   certain column count a grid gives each column fewer characters than its words
   need. Each unit is kept whole and hangs its labels on a common left edge, so
   the reader still scans down one column even though the grid is gone. */
.tset-table-stacked { margin: 1em 0; font-size: ${standard.tables.typePt}pt; line-height: 1.25; }
.tst-unit { break-inside: avoid; margin: 0 0 .7em;
  ${standard.tables.rowRulePt > 0 ? `padding-bottom: .55em; border-bottom: ${standard.tables.rowRulePt}pt solid rgba(0,0,0,.28);` : ''} }
.tst-unit:last-child { margin-bottom: 0; border-bottom: none; }
.tst-lead { font-family: '${t.headingFont}', 'Oswald', sans-serif; font-weight: 600;
  text-indent: 0; margin: 0 0 .25em; break-after: avoid;
  border-bottom: ${standard.tables.headerRulePt}pt solid rgba(0,0,0,.85); padding-bottom: .18em; }
/* Label and value on one line, the value indented to a common edge. The label
   is a fixed-width inline-block rather than a float: a float drops out of flow
   and stops break-inside:avoid holding the unit together. */
.tst-field { text-indent: 0; margin: 0 0 .12em; padding-left: 5.4em;
  hyphens: none; -webkit-hyphens: none; }
.tst-label { display: inline-block; width: 5.4em; margin-left: -5.4em;
  font-family: '${t.headingFont}', 'Oswald', sans-serif; font-weight: 600;
  font-size: ${(standard.tables.stackedLabelPt ?? standard.tables.typePt).toFixed(2)}pt;
  vertical-align: top; padding-right: .4em; }
.tst-value { display: inline; }`
    : ''
}
${
  standard.preformatted
    ? `/* Preformatted / fenced blocks (C3). Whitespace is the content, so it is
   preserved exactly and never justified, indented or hyphenated. The family is
   a vendored face by contract — see TypesetPreformattedStyles. */
pre.tset-pre { font-family: '${standard.preformatted.family}', monospace;
  font-size: ${standard.preformatted.typePt}pt; line-height: ${standard.preformatted.lineHeight};
  white-space: pre; text-indent: 0; text-align: left; hyphens: none; -webkit-hyphens: none;
  margin: 1em 0; padding: ${standard.preformatted.paddingEm}em;
  ${standard.preformatted.keepTogether ? 'break-inside: avoid;' : ''}
  ${standard.preformatted.fit === 'shrink-to-measure' ? 'max-width: 100%; overflow: hidden;' : ''} }`
    : ''
}
${
  standard.checklist
    ? `/* Checklist (Appendix D). A DRAWN box, not a typed glyph: the ballot
   characters are absent from every vendored text face, so a typed box would
   fall back to the render host or to nothing at all. Flex keeps a wrapped
   item's second line aligned with its first instead of running under the box. */
ul.checklist { list-style: none; margin: .7em 0; padding: 0; }
ul.checklist li.ck-item { display: flex; align-items: flex-start; text-indent: 0;
  margin: 0 0 ${standard.checklist.itemSpacingEm}em;
  ${standard.checklist.keepItemTogether ? 'break-inside: avoid;' : ''} }
.ck-box { flex: 0 0 auto; width: ${standard.checklist.boxSizeEm}em; height: ${standard.checklist.boxSizeEm}em;
  border: ${standard.checklist.boxStrokePt}pt solid #000;
  margin-right: ${standard.checklist.boxGapEm}em;
  /* Sit on the first line's baseline rather than its box top. */
  margin-top: .18em; }
.ck-text { flex: 1 1 auto; }`
    : ''
}
/* Inline figures. Kept whole so a chart never splits across a page turn, and
   capped at the text measure so a figure cannot reach past the type block. */
/* A heading and the paragraph it introduces, bound so a page break cannot fall
   between them. See keepHeadingsWithText in bodyToHtml. */
.keep-with-next { break-inside: avoid; }
figure.tset-figure { margin: 1.1em 0; break-inside: avoid; text-align: center; }
/* Centred as a BLOCK with auto margins rather than by inheriting text-align.
   A percentage-width inline image only centres if every ancestor keeps the
   alignment; one left-aligned wrapper anywhere in the chain pins it left with
   all the slack on one side, which is exactly how it printed. */
figure.tset-figure img { display: block; max-width: 100%; height: auto;
  margin-left: auto; margin-right: auto; }
figure.tset-figure figcaption { font-family: '${t.bodyFont}', Georgia, serif;
  font-size: ${t.captionPt}pt; line-height: 1.25; text-align: left;
  text-indent: 0; margin-top: .4em; }
/* Glyphs the text faces do not carry, drawn as vector rather than typed. Sized
   and coloured from the surrounding type so they sit on the same line as text
   instead of reading as pasted-in icons. */
.gl { display: inline-block; height: .72em; width: .72em; vertical-align: -.04em; color: currentColor; }
/* The manuscript already writes a space either side of the arrow, so the glyph
   adds none of its own — with margins it read as a gap, not a pointer. */
.gl-arrow { width: .95em; margin: 0; }
.gl-flag { width: .82em; height: .92em; vertical-align: -.12em; margin-right: .3em; }
.gl-warn { width: .92em; height: .92em; vertical-align: -.14em; margin-right: .34em; }
/* A safety warning the author opened with the warning sign.
   The mark HANGS in the left margin so the warning text keeps the same left
   edge as the prose around it — indenting the whole block would read as a
   quotation, and these are instructions, not asides. Kept whole on one page:
   half of "check the flash flood forecast" is worse than none of it. */
p.warn { text-indent: 0; padding-left: 1.26em; break-inside: avoid; }
/* :first-child only — a warning sign used again mid-sentence is ordinary
   inline punctuation and must not be pulled into the margin. */
p.warn > .gl-warn:first-child { margin-left: -1.26em; }
${input.frontMatter ? frontMatterCss({ headingFont: t.headingFont, bodyFont: t.bodyFont, bodyPt: t.bodyPt, displayPt: t.bodyPt * t.chapterTitleScale, labelPt: t.labelPt, captionPt: t.captionPt }) : ''}
${overrides.css}</style></head>
<body>
${input.frontMatter ? buildFrontMatterHtml({ config: input.config, entries: input.frontMatter.entries, publication: input.frontMatter.publication as never }) : ''}
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
  /**
   * Content elements whose text is wider than its own measure — ink leaving the
   * text block sideways.
   *
   * Measured per ELEMENT, never on the Paged.js page container, whose horizontal
   * scrollWidth is a container artifact. The case this catches is a long
   * unbreakable token, typically a source URL: it runs off the trim while page
   * count, section count and vertical overflow all report clean.
   *
   * Empty on every book that shipped before this was measured — the check is new,
   * not the behaviour.
   */
  horizontalOverflow: {
    page: number | null;
    blockId: string | null;
    tag: string;
    overflowPx: number;
    preview: string;
  }[];
  /** Pages that are effectively empty — recto-start parity blanks. */
  blankPages: number[];
  /**
   * Page number -> the stable block ids that landed on it. Measured, never
   * predicted. This is what lets the review UI say "these are the blocks on
   * page 88" and lets an override be authored against one of them without ever
   * keying the override to the page number itself.
   */
  pageBlocks: Record<number, string[]>;
  trim: { widthIn: number; heightIn: number };
  marginsIn: TypesetMargins;
  bodyPt: number;
  lineHeight: number;
}
