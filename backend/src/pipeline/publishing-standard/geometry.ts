/**
 * Geometry resolver — the SINGLE source of trim / bleed / canvas for a project.
 *
 * Reconciliation (SPEC_GEOMETRY_RECONCILIATION): pagination, page-spec,
 * blueprint, print-prep, and assembly must ALL derive geometry from here so
 * render and print can never use different trims. Canvas is DERIVED
 * (trim + 2×bleed) — never a separate constant.
 *
 * Rules:
 *   - explicit + supported trim  → use it (respected through the whole pipeline)
 *   - no trim                    → Standard default (8.5×11)
 *   - explicit + UNSUPPORTED trim → throw a clear error (never silent mismatch)
 */

import type { TrimSize } from '@wildlands/shared';
import { SPACING } from './standard.js';

/** The Standard's canonical default trim. */
export const DEFAULT_TRIM: TrimSize = {
  widthIn: SPACING.trimIn.w, // 8.5
  heightIn: SPACING.trimIn.h, // 11
  bleedIn: SPACING.bleedIn, // 0.125
};

/** Supported trim sizes (width×height in inches). Single global set for now;
 *  moves into per-publisher Standards when the Standard engine lands. */
export const SUPPORTED_TRIMS: ReadonlyArray<{ widthIn: number; heightIn: number }> = [
  // KDP standard trim, and the size the first typeset book is set at. It was
  // missing here, so that book typeset and proofed at 5.5×8.5 for weeks and
  // then threw `unsupported_trim` the moment it reached assembly: the list had
  // only ever been extended for books that came through the page-render track.
  { widthIn: 5.5, heightIn: 8.5 },
  { widthIn: 6, heightIn: 9 },
  { widthIn: 7, heightIn: 10 },
  { widthIn: 8.5, heightIn: 11 },
];

export interface ResolvedGeometry {
  /** TrimSize-compatible (feeds computePageGeometry + pagination capacity). */
  trimSize: TrimSize;
  /** Derived full-bleed canvas (trim + 2×bleed). */
  canvasIn: { w: number; h: number };
  dpi: number;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function isSupportedTrim(t: { widthIn: number; heightIn: number }): boolean {
  return SUPPORTED_TRIMS.some((s) => s.widthIn === t.widthIn && s.heightIn === t.heightIn);
}

/** Resolve the effective geometry for a project's config. */
export function resolveGeometry(config: { trimSize?: TrimSize | null }): ResolvedGeometry {
  const t = config.trimSize ?? null;
  let trim: TrimSize;
  if (!t) {
    trim = DEFAULT_TRIM;
  } else if (!isSupportedTrim(t)) {
    throw new Error(`unsupported_trim:${t.widthIn}x${t.heightIn}`);
  } else {
    trim = t;
  }
  const bleed = trim.bleedIn ?? SPACING.bleedIn;
  return {
    trimSize: { widthIn: trim.widthIn, heightIn: trim.heightIn, bleedIn: bleed },
    canvasIn: { w: round3(trim.widthIn + 2 * bleed), h: round3(trim.heightIn + 2 * bleed) },
    dpi: SPACING.printDpi,
  };
}
