/**
 * Standard + project -> the concrete design one render uses. PURE (no DB, no
 * I/O) so the resolution rules are fully unit-testable.
 *
 * ─── PRECEDENCE ───────────────────────────────────────────────────────────
 * The standard supplies the design. `ProjectConfig` overrides only the fields
 * an operator legitimately chooses per book:
 *
 *     trim, headingFont, bodyFont, bodyPt, lineHeight
 *
 * Everything else — the supporting type scale, indentation, justification,
 * widow/orphan limits, opener sink, furniture, block styles — belongs to the
 * standard and is NOT per-project editable. If those were overridable per
 * project there would be no standard, just defaults, and two books of the same
 * class would drift apart the first time someone nudged a value.
 */
import type { ProjectConfig, TrimSize } from '@wildlands/shared';
import type { TypesetLayoutStandard, TypesetMarginPolicy, TypesetTypeScale } from './types.js';

/** Concrete margins for one render. */
export interface ResolvedMargins {
  topIn: number;
  bottomIn: number;
  outsideIn: number;
  gutterIn: number;
}

export interface ResolvedTypesetDesign {
  /** The pinned standard this render was produced from. */
  standardId: string;
  trim: TrimSize;
  margins: ResolvedMargins;
  type: TypesetTypeScale;
  standard: TypesetLayoutStandard;
  chaptersStartRecto: boolean;
}

/**
 * Pick the gutter for a page count. KDP widens the binding margin as a book
 * gets thicker; encoding the bands means a book that grows past a threshold
 * stays compliant without anyone remembering to adjust it. With no page count
 * (the first render, before the count is known) the standard's base value is
 * used — which is what the previous hardcoded behaviour did unconditionally.
 */
export function gutterForPageCount(policy: TypesetMarginPolicy, pageCount?: number): number {
  if (pageCount === undefined || !policy.gutterByPageCount?.length) return policy.gutterIn;
  for (const band of policy.gutterByPageCount) {
    if (pageCount <= band.maxPages) return band.gutterIn;
  }
  return policy.gutterByPageCount[policy.gutterByPageCount.length - 1]!.gutterIn;
}

export interface ResolveDesignInput {
  standard: TypesetLayoutStandard;
  config: ProjectConfig;
  /** Known final page count, so the gutter can follow the printer's bands. */
  pageCount?: number;
  /** Per-render override of the standard's chapter-start policy (operator toggle). */
  chaptersStartRecto?: boolean;
}

export function resolveTypesetDesign(input: ResolveDesignInput): ResolvedTypesetDesign {
  const { standard, config } = input;
  const t = config.typography;

  return {
    standardId: standard.id,
    // Trim is an operator choice: the same standard can set a 5.5x8.5 or a 6x9.
    trim: config.trimSize ?? standard.trim,
    margins: {
      topIn: standard.margins.topIn,
      bottomIn: standard.margins.bottomIn,
      outsideIn: standard.margins.outsideIn,
      gutterIn: gutterForPageCount(standard.margins, input.pageCount),
    },
    type: {
      ...standard.type,
      // The four operator-exposed type decisions, from Book Setup.
      headingFont: t.headingFont || standard.type.headingFont,
      bodyFont: t.bodyFont || standard.type.bodyFont,
      bodyPt: t.bodyPt || standard.type.bodyPt,
      lineHeight: t.lineHeight || standard.type.lineHeight,
    },
    standard,
    chaptersStartRecto: input.chaptersStartRecto ?? standard.chaptersStartRecto,
  };
}
