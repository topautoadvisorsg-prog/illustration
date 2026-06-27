/**
 * Edition → resolved styling. PURE (no DB, no I/O) so it is fully unit-testable.
 *
 * An edition SELECTS a Style DNA (from the registry) plus optional surface
 * overrides (palette / paper). This resolves those into the concrete values the
 * render + export paths consume: the master style block (prompt fragment), the
 * paper/ink palette, and the paper type. The shared manuscript/prompts/composition
 * are NOT here — they are inherited identically by every edition.
 */
import { assembleIllustrationDna, getStyleDna } from '../publishing-standard/index.js';

export interface EditionPalette {
  paperHex: string;
  inkHex: string;
}

/** The minimal edition shape this resolver needs (a subset of the `editions` row,
 *  or a literal descriptor for the default edition before backfill). */
export interface EditionLike {
  styleDnaId: string;
  paletteOverride?: EditionPalette | null;
  paperType?: string | null;
}

export interface ResolvedEditionStyle {
  styleDnaId: string;
  /** The illustration-DNA prompt fragment for this edition's Style DNA. */
  masterStyleBlock: string;
  /** Surface paper/ink: the edition override if set, else the Style DNA default. */
  palette: EditionPalette;
  paperType: string;
}

/** Resolve an edition's concrete styling from the Style DNA registry + overrides. */
export function resolveEditionStyle(ed: EditionLike): ResolvedEditionStyle {
  const profile = getStyleDna(ed.styleDnaId); // unknown id → Color (safe default)
  const paperTypeDefault = profile.id === 'cinematic-naturalist-color' ? 'premium-color' : 'standard-bw';
  return {
    styleDnaId: profile.id,
    masterStyleBlock: assembleIllustrationDna(profile.id),
    palette: ed.paletteOverride ?? profile.palette,
    paperType: ed.paperType ?? paperTypeDefault,
  };
}

/** The default edition every existing book is backfilled to — the current Color
 *  look. styleDnaId points at the frozen Color profile, so resolving it yields the
 *  byte-identical master style block the book already renders with. */
export const DEFAULT_COLOR_EDITION = {
  editionKey: 'color',
  label: 'Color',
  styleDnaId: 'cinematic-naturalist-color',
  paperType: 'premium-color',
  isDefault: true,
} as const;
