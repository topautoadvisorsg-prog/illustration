/**
 * LOCAL LAYOUT OVERRIDES — the escape hatch, and its limits.
 *
 * A layout standard is right about the book and occasionally wrong about one
 * block of it. Without somewhere to put that exception, every isolated problem
 * becomes a choice between editing a frozen manuscript, changing the standard
 * for the whole book class, or shipping the page as-is. All three are wrong.
 *
 *     systemic defect -> fix the reusable layout standard
 *     isolated defect -> local override
 *     manuscript      -> frozen, always
 *
 * ─── WHY THIS IS NOT A STYLESHEET ─────────────────────────────────────────
 * The property set is CLOSED (`LayoutOverrideSchema` in shared). Every property
 * is a spacing or page-breaking decision a typesetter makes by hand, with a
 * bounded value, and each one compiles to exactly one CSS declaration here. An
 * arbitrary `css` field would turn the hatch into a second, unversioned layout
 * system competing with the standard — the precise problem the standard exists
 * to solve. If something is wanted on more than a couple of blocks, that is
 * evidence of a systemic gap, and it belongs in the standard.
 *
 * ─── WHY AN UNMATCHED OVERRIDE IS REPORTED, NOT DROPPED ───────────────────
 * Block ids come from manuscript text. An override that matches nothing means
 * either the text moved or the id was mistyped — both of which the operator
 * needs to be told about, because the symptom otherwise is a page that silently
 * stops obeying an exception someone deliberately made.
 */
import type { LayoutOverride } from '@wildlands/shared';

/**
 * Approved component variants. Not free styling: each is a named, reviewed
 * treatment, and an override may only name one of these.
 *
 * A variant may style the block's own descendants, which is what separates a
 * real component treatment from a margin nudge. It may NOT affect anything
 * outside the block — in particular it must never pull neighbouring content
 * around. Making a thin page denser by dragging the previous paragraph onto it
 * moves unrelated text to manufacture fill, which is a worse defect than the
 * one it hides.
 *
 * Keyed by selector suffix: '' is the block itself, anything else is appended
 * to the block's attribute selector.
 */
const VARIANTS: Record<string, Record<string, string>> = {
  /** Tighten a block that is close to fitting where it belongs. */
  compact: { '': 'margin-top: 0.4em; margin-bottom: 0.4em;' },
  /** Open a block up when it is crowding what follows. */
  roomy: { '': 'margin-top: 1.4em; margin-bottom: 1.4em;' },
  /**
   * CLOSING BEAT — for the closing unit of a chapter or section that ends up
   * nearly alone on a page.
   *
   * The defect is not the white space, it is that the block reads as leftover:
   * a heading and a sentence jammed against the top margin of an otherwise
   * empty leaf, set exactly like a mid-chapter subsection. Chapters legitimately
   * end short, so the fix is to make the page look DECIDED rather than to fill
   * it.
   *
   * The treatment drops the unit clear of the top margin, centres it, and
   * narrows the measure so the sentence reads as a closing statement instead of
   * a truncated paragraph. Nothing outside the block moves, and not one word
   * changes.
   */
  'closing-beat': {
    '': 'margin-top: 4.5em; margin-bottom: 0; text-align: center;',
    // The label sits centred above its sentence rather than flush left.
    ' > h3, > .takeaway-label, > .tail-unit > h3':
      'text-align: center; text-align-last: center; margin-bottom: 0.7em;',
    // Justification and the first-line indent are both wrong for a centred
    // one-sentence statement; the narrowed measure keeps it from running the
    // full width of the text block.
    ' p':
      'text-align: center; text-align-last: center; text-indent: 0; max-width: 24em; margin-left: auto; margin-right: auto;',
  },
};

export interface OverrideCssResult {
  css: string;
  /** Override keys that match no block in the rendered book. */
  orphaned: string[];
  /** Override keys that resolved to at least one declaration. */
  applied: string[];
}

/** A variant's rules for the block's DESCENDANTS, keyed by selector suffix. */
export function variantDescendantRules(o: LayoutOverride): [string, string][] {
  const v = o.variant ? VARIANTS[o.variant] : undefined;
  if (!v) return [];
  return Object.entries(v).filter(([suffix]) => suffix !== '');
}

/** One override -> its CSS declarations, in a fixed order so output is stable. */
export function declarationsFor(o: LayoutOverride): string[] {
  const d: string[] = [];
  // A variant is a base the explicit properties may then refine, so it goes
  // first: an operator who picks "compact" and then nudges the space above
  // gets both, with the nudge winning.
  const own = o.variant ? VARIANTS[o.variant]?.[''] : undefined;
  if (own) d.push(own);
  if (o.spaceBeforeEm !== undefined) d.push(`margin-top: ${o.spaceBeforeEm}em;`);
  if (o.spaceAfterEm !== undefined) d.push(`margin-bottom: ${o.spaceAfterEm}em;`);
  if (o.keepWithNext !== undefined) d.push(`break-after: ${o.keepWithNext ? 'avoid' : 'auto'};`);
  if (o.keepTogether !== undefined) d.push(`break-inside: ${o.keepTogether ? 'avoid' : 'auto'};`);
  if (o.breakBefore) d.push(`break-before: ${o.breakBefore};`);
  // An explicit break-after wins over keepWithNext, which is only a shorthand
  // for the avoid case.
  if (o.breakAfter) d.push(`break-after: ${o.breakAfter};`);
  return d;
}

/**
 * Compile the project's overrides into a CSS block.
 *
 * `knownIds` is the set of blocks the renderer actually emitted for this book,
 * so an override pointing at content that no longer exists is inert AND named.
 */
export function overrideCss(
  overrides: Record<string, LayoutOverride> | undefined,
  knownIds: ReadonlySet<string>,
): OverrideCssResult {
  const entries = Object.entries(overrides ?? {});
  if (entries.length === 0) return { css: '', orphaned: [], applied: [] };

  const orphaned: string[] = [];
  const applied: string[] = [];
  const rules: string[] = [];
  // Sorted so the same overrides always produce byte-identical CSS; a render is
  // supposed to be reproducible, and object key order is not a guarantee.
  for (const [blockId, o] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    if (!knownIds.has(blockId)) {
      orphaned.push(blockId);
      continue;
    }
    const decls = declarationsFor(o);
    const descendants = variantDescendantRules(o);
    if (decls.length === 0 && descendants.length === 0) continue; // note-only changes nothing
    applied.push(blockId);
    const sel = `[data-block-id="${blockId}"]`;
    const note = o.note ? ` /* ${o.note.replace(/[*/]/g, '')} */` : '';
    if (decls.length) rules.push(`${sel} { ${decls.join(' ')} }${note}`);
    // A variant may reach INTO the block. It can never reach outside it: every
    // selector here is prefixed with the block's own attribute selector.
    for (const [suffix, body] of descendants) rules.push(`${sel}${suffix} { ${body} }`);
  }
  if (rules.length === 0) return { css: '', orphaned, applied };
  return {
    css: `\n/* ── LOCAL OVERRIDES — per-block exceptions, last so they win by source order ── */\n${rules.join('\n')}\n`,
    orphaned,
    applied,
  };
}
