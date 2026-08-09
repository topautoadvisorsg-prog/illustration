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
 * density the standard's components already support.
 */
const VARIANTS: Record<string, string> = {
  /** Tighten a block that is close to fitting where it belongs. */
  compact: 'margin-top: 0.4em; margin-bottom: 0.4em;',
  /** Open a block up when it is crowding what follows. */
  roomy: 'margin-top: 1.4em; margin-bottom: 1.4em;',
};

export interface OverrideCssResult {
  css: string;
  /** Override keys that match no block in the rendered book. */
  orphaned: string[];
  /** Override keys that resolved to at least one declaration. */
  applied: string[];
}

/** One override -> its CSS declarations, in a fixed order so output is stable. */
export function declarationsFor(o: LayoutOverride): string[] {
  const d: string[] = [];
  // A variant is a base the explicit properties may then refine, so it goes
  // first: an operator who picks "compact" and then nudges the space above
  // gets both, with the nudge winning.
  if (o.variant && VARIANTS[o.variant]) d.push(VARIANTS[o.variant]!);
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
    if (decls.length === 0) continue; // a note-only override changes nothing
    applied.push(blockId);
    const note = o.note ? ` /* ${o.note.replace(/[*/]/g, '')} */` : '';
    rules.push(`[data-block-id="${blockId}"] { ${decls.join(' ')} }${note}`);
  }
  if (rules.length === 0) return { css: '', orphaned, applied };
  return {
    css: `\n/* ── LOCAL OVERRIDES — per-block exceptions, last so they win by source order ── */\n${rules.join('\n')}\n`,
    orphaned,
    applied,
  };
}
