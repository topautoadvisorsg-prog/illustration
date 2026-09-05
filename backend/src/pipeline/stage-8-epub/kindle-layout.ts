/**
 * KINDLE LAYOUT REPAIRS — the two things a reflowable EPUB cannot express in
 * CSS alone, and which this pipeline got wrong in four shipped books.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. KINDLE IGNORES `page-break-after: avoid`.
 *
 * The stylesheet has carried this since the beginning:
 *
 *     h1..h6 { page-break-after: avoid; break-after: avoid;
 *              page-break-inside: avoid; }
 *
 * and the comment beside it said the rule "glues each heading to the block that
 * follows it". In a compliant engine that is exactly true. Kindle's renderer
 * does not honour it, and the `page-break-inside: avoid` sitting next to it only
 * stops a heading's OWN lines from splitting -- it says nothing about the
 * paragraph underneath.
 *
 * Measured, by laying the real books out into screen-sized columns at eleven
 * screen and text sizes: with break-after honoured, zero headings strand. With
 * it neutralised -- Kindle's behaviour -- 101 strand in one book alone, worst on
 * a small screen at large text. A subhead alone at the foot of a screen with its
 * paragraph beginning after the turn.
 *
 * The property Kindle DOES honour is `page-break-inside: avoid` on a block. So
 * the heading and the content under it are wrapped in one block and that block
 * is asked not to break. Structural, global, and reflowable: no page numbers, no
 * per-heading patching, no change to a single word.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 2. THE TITLE PAGE WAS NOT STYLED AS A TITLE PAGE.
 *
 * It emitted a bare `<h1>` at 1.6em, left aligned, hard against the top of the
 * screen, followed by two paragraphs. On a Kindle that renders as the first
 * paragraph of a chapter rather than as the title of a book -- which is what the
 * owner saw and described as "everything at the top".
 *
 * The fix is deliberately NOT print-style positioning. No viewport units, no
 * absolute placement, no fixed heights: those break the moment a reader changes
 * type size, which is the whole point of a reflowable format. Only centring and
 * `em`-based spacing, which scale with the reader's own text.
 */

/** How long the block under a heading may be and still be bound to it.
 *
 *  `avoid` is a request, and a renderer grants it by moving the whole block to
 *  the next screen. Binding a heading to a very long block therefore risks
 *  trading a stranded heading for a screen of white. Measured on a real book,
 *  a tight cap (400 characters) left eight headings stranded while making the
 *  worst screen gap no smaller at all -- the large gaps come from callout boxes,
 *  which have avoided breaking for other reasons all along.
 *
 *  So the cap only guards the pathological case. 1200 characters is roughly one
 *  screenful at reading size; past that the request cannot be granted anyway --
 *  the block does not fit a screen on its own -- and binding would risk a hole
 *  for nothing. */
export const KEEP_MAX_CHARS = 1200;

/** Elements that may be bound to the heading above them.
 *
 *  Callouts (`aside`, `blockquote`) are INCLUDED, and the reason is worth
 *  keeping. They were left out at first on the grounds that they carry their own
 *  break rule already -- true, but their own rule keeps the callout whole and
 *  says nothing about the heading above it. Testing the repaired books found
 *  exactly one heading still stranding, and it was the worst possible one: a
 *  safety heading sitting alone at the foot of a screen with a "Do this now"
 *  emergency notice overleaf. KEEP_MAX_CHARS already guards the case a callout
 *  is actually too long to bind.
 *
 *  Figures and tables stay out: an image's height is not knowable from its
 *  markup, so the cap cannot police it. */
const BINDABLE = /^\s*<(p|ul|ol|dl|aside|blockquote)[\s>]/i;
const HEADING = /^\s*<(h[1-6])[\s>]/i;

/** Split a fragment into top-level element strings. The generated markup is
 *  newline-separated one element per line, but a list spans several lines, so
 *  depth is tracked rather than assuming one element per line. */
function topLevelBlocks(html: string): string[] {
  const out: string[] = [];
  const lines = html.split('\n');
  let buf: string[] = [];
  let depth = 0;
  const OPEN = /<(p|ul|ol|dl|div|section|figure|table|blockquote|h[1-6])[\s>]/gi;
  const CLOSE = /<\/(p|ul|ol|dl|div|section|figure|table|blockquote|h[1-6])>/gi;
  const SELF = /<(p|ul|ol|dl|div|section|figure|table|blockquote|h[1-6])[^>]*\/>/gi;
  for (const line of lines) {
    buf.push(line);
    const opens = (line.match(OPEN) || []).length - (line.match(SELF) || []).length;
    const closes = (line.match(CLOSE) || []).length;
    depth += opens - closes;
    if (depth <= 0) {
      const chunk = buf.join('\n');
      if (chunk.trim()) out.push(chunk);
      buf = [];
      depth = 0;
    }
  }
  if (buf.join('\n').trim()) out.push(buf.join('\n'));
  return out;
}

export function visibleLength(html: string): number {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length;
}

/**
 * Wrap every heading together with the first bindable block after it, so the
 * pair cannot be split across a screen. Consecutive headings bind as one run,
 * so a section title immediately followed by a subhead keeps both with the text
 * that finally arrives.
 *
 * Text is never touched: blocks are re-nested, never edited.
 */
export function keepHeadingsWithContent(html: string): string {
  if (!html || !/<h[1-6][\s>]/i.test(html)) return html;
  const blocks = topLevelBlocks(html);
  const out: string[] = [];
  let i = 0;
  while (i < blocks.length) {
    // Indexed reads are asserted, not guarded: both loops already bound the
    // index by `blocks.length`, so the element cannot be undefined. This is
    // narrowing for `noUncheckedIndexedAccess` only — no behaviour changes.
    if (!HEADING.test(blocks[i]!)) {
      out.push(blocks[i]!);
      i += 1;
      continue;
    }
    const run = [blocks[i]!];
    let j = i + 1;
    while (j < blocks.length && HEADING.test(blocks[j]!)) {
      run.push(blocks[j]!);
      j += 1;
    }
    const next = j < blocks.length ? blocks[j] : undefined;
    if (next !== undefined && BINDABLE.test(next) && visibleLength(next) <= KEEP_MAX_CHARS) {
      run.push(next);
      j += 1;
      out.push(`<div class="keep">\n${run.join('\n')}\n</div>`);
    } else {
      out.push(...run);
    }
    i = j;
  }
  return out.join('\n');
}

/**
 * Give the title page and the copyright leaf their own container so the
 * stylesheet can treat them as front matter rather than as body text.
 *
 * A container, not a rewrite: the content passed in is emitted unchanged inside
 * it, so no wording, order or element is altered.
 */
export function wrapFrontMatter(kind: string | undefined, html: string): string {
  if (kind === 'TITLE') return `<div class="titlepage">\n${html}\n</div>`;
  if (kind === 'COPYRIGHT') return `<div class="frontmatter">\n${html}\n</div>`;
  return html;
}

/** Both repairs, in the order they must be applied: front-matter container
 *  first, then heading binding inside it. */
export function applyKindleLayout(kind: string | undefined, html: string): string {
  return wrapFrontMatter(kind, keepHeadingsWithContent(html));
}

/**
 * The stylesheet half of the two repairs. Appended to EPUB_CSS.
 *
 * Every dimension is in `em` and every rule is reflowable. Nothing here fixes a
 * height, uses a viewport unit, or positions anything absolutely, because all
 * three break as soon as the reader changes type size.
 */
export const KINDLE_LAYOUT_CSS: string[] = [
  /* The keep-together block. `page-break-inside: avoid` is the one break
     property Kindle reliably honours, which is the entire reason this wrapper
     exists rather than a `break-after` on the heading. It carries no margin,
     padding or border, so the margins inside it collapse exactly as they did
     before it existed and the spacing of the book is unchanged. */
  'div.keep { page-break-inside: avoid; break-inside: avoid; margin: 0; padding: 0; border: 0; }',

  /* The title page. These are the numbers from TRAIN THE DOG YOU'VE GOT, whose
     front matter the owner approved -- copied rather than invented, so the books
     agree with each other.

     The first pass here used smaller values (3em / 2.4em / 3em) and the block
     finished barely half way down the screen, leaving the title marooned at the
     top with an empty page under it. Measured against the approved reference on
     a 380x560 screen: the dog book's title block runs 11% to 72% of the screen,
     the first attempt here 9% to 51%. These values bring it to 11%-64%.

     Every dimension is `em`, so the whole block grows and shrinks with the
     reader's type instead of being pinned to a fixed offset. */
  'div.titlepage { text-align: center; padding-top: 3.5em; }',
  'div.titlepage h1 { font-size: 2.5em; line-height: 1.15; letter-spacing: 0.03em; margin: 0 0 0.5em; page-break-after: avoid; break-after: avoid; }',
  'div.titlepage p.subtitle { font-size: 1em; font-style: italic; margin: 0 auto 4em; padding: 0 7%; }',
  'div.titlepage p.author { font-size: 1.15em; letter-spacing: 0.12em; margin: 0; }',
  'div.titlepage p.series { font-size: 0.95em; margin-top: 2em; }',

  /* The copyright leaf, set quieter than the body and dropped well clear of the
     top edge. In print this page sits at the foot of the leaf; a reflowable page
     has no foot to sit at, so the nearest honest equivalent is to push it past
     the middle.

     8em, and the number was measured rather than guessed. Every value from 5em
     to 8em produces the SAME overflow set -- a long copyright notice at 22px on
     a small screen runs onto a second screen whatever the padding, because it is
     the text that is long, not the gap. So the deeper drop costs nothing and
     buys the composition: the block lands at 22% of the screen instead of 7%. */
  'div.frontmatter { font-size: 0.9em; padding-top: 8em; }',
  'div.frontmatter p { margin: 0 0 0.9em; }',
  'div.frontmatter h1 { font-size: 1.25em; }',
];
