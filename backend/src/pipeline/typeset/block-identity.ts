/**
 * STABLE BLOCK IDENTITY — what a local layout override is allowed to point at.
 *
 * An override must survive repagination. Page numbers do not: this book has
 * moved 153 -> 157 -> 159 -> 156 during QA alone, and any override keyed to a
 * page number would have silently re-pointed at unrelated content four times.
 * A page number is a rendering RESULT, not an identity.
 *
 * So identity is derived from the manuscript instead:
 *
 *     blockId = sha1(sectionSlug : blockKind : normalisedFirstText [: n]).slice(0, 8)
 *
 * - `sectionSlug`   from the section TITLE, not its index — inserting a section
 *                   must not renumber every override after it.
 * - `blockKind`     what the block IS (paragraph, callout, alert panel,
 *                   takeaway...). Component identity is deliberate: an override
 *                   on "the takeaway that ends Chapter Nine" should not silently
 *                   transfer to a plain paragraph if that block's role changes.
 * - `firstText`     the first ~60 characters of its text, normalised the same
 *                   way Layer 1 normalises for text fidelity.
 * - `n`             occurrence index, and ONLY when an earlier block in the same
 *                   section already produced this exact triple. Two identical
 *                   short paragraphs are otherwise indistinguishable.
 *
 * The id therefore changes only when the manuscript text changes — and the
 * manuscript is frozen. It is invariant across layout-standard edits, font
 * changes, trim changes and re-renders.
 */
import { createHash } from 'node:crypto';

/** Every block kind an override may target. Closed set, mirrored in the UI. */
export type BlockKind =
  | 'opener'
  | 'p'
  | 'h3'
  | 'h4'
  | 'ul'
  | 'ol'
  | 'callout'
  | 'alert-panel'
  | 'takeaway'
  | 'tail-unit'
  | 'scene-break'
  /**
   * A real data table (C2). Only ever produced when a standard declares a
   * `tables` policy, so no previously-approved book gains one — and because no
   * existing block was ever classified `table`, no existing block id moves.
   */
  | 'table'
  /** Preformatted / fenced content (C3), set verbatim in a mono face. */
  | 'pre';

export interface TypesetBlockRef {
  blockId: string;
  sectionSlug: string;
  sectionTitle: string;
  kind: BlockKind;
  /** Human-readable opening of the block, for the operator picker. */
  preview: string;
}

/**
 * Section title -> slug. Lowercased, alphanumerics and single hyphens.
 *
 * Titles in this class of book are long ("The Smell Situation: Sweat, Deodorant,
 * and the New Rules"), so the slug is capped — the hash below carries the
 * uniqueness, the slug only has to be stable.
 */
export function slugifySection(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    // Trim again AFTER slicing: the cut lands mid-word on a long title and
    // would otherwise leave a dangling hyphen in the slug.
    .replace(/-+$/, '');
}

/**
 * Text -> comparison key. Alphanumerics only, lowercased, first 60 chars.
 *
 * Punctuation and whitespace are dropped so that a typographic change (curly
 * quotes, a non-breaking space, an en dash) does not invent a new identity for
 * a block whose words are unchanged.
 */
export function normaliseBlockText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 60);
}

export function computeBlockId(
  sectionSlug: string,
  kind: BlockKind,
  firstText: string,
  occurrence = 0,
): string {
  const key = `${sectionSlug}:${kind}:${normaliseBlockText(firstText)}${occurrence > 0 ? `:${occurrence}` : ''}`;
  return createHash('sha1').update(key).digest('hex').slice(0, 8);
}

/** Strip tags and collapse whitespace — the block's readable text. */
export function textOfHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classify a top-level block by its opening tag and class.
 *
 * Order matters: the wrappers (`takeaway`, `tail-unit`, `alert-panel`) are
 * checked before the plain tags they are built from.
 */
export function blockKindOf(html: string): BlockKind {
  if (html.startsWith('<header')) return 'opener';
  if (html.includes('class="takeaway"')) return 'takeaway';
  if (html.includes('class="tail-unit"')) return 'tail-unit';
  if (html.includes('class="alert-panel"')) return 'alert-panel';
  if (html.startsWith('<blockquote')) return 'callout';
  if (html.includes('class="scene-break"')) return 'scene-break';
  if (html.startsWith('<h3')) return 'h3';
  if (html.startsWith('<h4')) return 'h4';
  if (html.startsWith('<ul')) return 'ul';
  if (html.startsWith('<ol')) return 'ol';
  if (html.startsWith('<table')) return 'table';
  if (html.startsWith('<pre')) return 'pre';
  return 'p';
}

/**
 * Stamp `data-block-id` onto every top-level block of one section, recording
 * each into `collect`.
 *
 * The attribute goes on the outermost element so the override stylesheet can
 * target it with a plain attribute selector, and so the browser can report which
 * page each block landed on after Paged.js has finished.
 */
export function stampBlockIds(
  blocks: readonly string[],
  sectionSlug: string,
  sectionTitle: string,
  collect?: TypesetBlockRef[],
): string[] {
  const seen = new Map<string, number>();
  return blocks.map((html) => {
    const kind = blockKindOf(html);
    const text = textOfHtml(html);
    const key = `${kind}:${normaliseBlockText(text)}`;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    const blockId = computeBlockId(sectionSlug, kind, text, occurrence);
    collect?.push({
      blockId,
      sectionSlug,
      sectionTitle,
      kind,
      preview: text.slice(0, 90),
    });
    // Insert straight after the tag NAME, so existing attributes are untouched.
    return html.replace(/^<([a-z0-9]+)/i, `<$1 data-block-id="${blockId}"`);
  });
}
