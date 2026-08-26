/**
 * BOOK-LOCAL CORRECTIONS — resolution and application.
 *
 *     book-specific change -> book-local correction   (here)
 *     systemic defect      -> shared platform change
 *     manuscript           -> frozen, always
 *
 * WHAT THIS REPLACES. Correcting one stray period used to mean editing a frozen
 * manuscript, branching a shared renderer on a book name, or shipping the
 * defect. This layer gives that decision somewhere to live where it is
 * deterministic, reviewable, versioned, reversible and scoped to one book.
 *
 * ─── WHERE IT SITS ────────────────────────────────────────────────────────
 *
 *     canonical source -> parse -> RESOLVE -> APPLY -> typeset -> paginate -> QA
 *
 * Corrections apply to parsed content BEFORE typesetting, never to a finished
 * PDF. A correction that depended on a page number would be invalidated by the
 * next repagination, which is exactly the fragility this replaces.
 *
 * Approved plate stamping stays where it is: that path is post-pagination on
 * purpose, because it draws into space the paginator left.
 *
 * ─── WHY BLOCK IDS SURVIVE A PUNCTUATION FIX ──────────────────────────────
 * `normaliseBlockText` keeps only alphanumerics. `5 p.m..` and `5 p.m.` produce
 * the same identity, so a text correction does not move the anchor it is
 * attached to, and the same correction stays resolvable on the next build.
 *
 * ─── NOTHING IS EVER SILENTLY DROPPED ─────────────────────────────────────
 * An anchor that matches nothing, matches twice, or whose expected text is no
 * longer present is an ERROR that blocks the build. A correction someone
 * deliberately made must never become a no-op nobody was told about.
 */
import type { Correction, LayoutOverride, ProjectConfig } from '@wildlands/shared';
import { normaliseBlockText, slugifySection } from '../typeset/block-identity.js';
import type { TypesetBlockRef } from '../typeset/block-identity.js';
import { buildTypesetHtml } from '../typeset/typeset-book.js';
import type { TypesetSection } from '../typeset/typeset-book.js';
import type { TypesetLayoutStandard } from '../typeset/layout-standards/types.js';

export type CorrectionOutcome =
  /** Resolved and changed something. */
  | 'APPLIED'
  /** Resolved, but the content already reads that way. Not an error. */
  | 'NOOP'
  /** Deliberately retired. Kept on the record, not applied. */
  | 'SUPERSEDED'
  /** The anchor matches no block in this book. HARD ERROR. */
  | 'UNMATCHED'
  /** The anchor, or the expected text, matches more than one place. HARD ERROR. */
  | 'AMBIGUOUS'
  /** The expected text is no longer in the source. HARD ERROR. */
  | 'EXPECT_MISMATCH';

/** Outcomes that must stop a production build. */
export const BLOCKING_OUTCOMES: readonly CorrectionOutcome[] = ['UNMATCHED', 'AMBIGUOUS', 'EXPECT_MISMATCH'];

export interface CorrectionResolution {
  id: string;
  type: Correction['type'];
  outcome: CorrectionOutcome;
  reason: string;
  detail: string;
  /** A short window around the change, so a person can verify it without the manuscript. */
  before?: string;
  after?: string;
}

export interface CorrectionMetadata {
  title: string;
  subtitle?: string;
  authorName: string;
  edition?: string;
}

export interface HeadingDisplayCorrection {
  display?: string;
  stripDrawnMarks?: boolean;
}

export interface IllustrationPlacement {
  asset: string;
  placement: 'after-block' | 'chapter-end' | 'section-start';
  widthPercent?: number;
  side?: 'recto' | 'verso' | 'any';
}

export interface CorrectionResult {
  resolutions: CorrectionResolution[];
  /** Sections with text corrections applied. The input is never mutated. */
  sections: TypesetSection[];
  metadata: CorrectionMetadata;
  /** `config.layoutOverrides` merged with every LAYOUT and BLOCK PRESENTATION correction. */
  layoutOverrides: Record<string, LayoutOverride>;
  headingDisplay: Record<string, HeadingDisplayCorrection>;
  runningHead: Record<string, string>;
  tocDisplay: Record<string, string>;
  illustrations: Record<string, IllustrationPlacement>;
  /** Every addressable block, as the book stood BEFORE corrections. */
  blocks: TypesetBlockRef[];
  /** False when any resolution blocks the build. */
  ok: boolean;
  counts: Record<CorrectionOutcome | 'total', number>;
}

export interface ResolveCorrectionsInput {
  sections: TypesetSection[];
  config: ProjectConfig;
  layoutStandard?: TypesetLayoutStandard;
  /** Defaults to `config.corrections`. Supplied explicitly by the CLI and tests. */
  corrections?: Correction[];
}

/**
 * A paragraph-sized run of source lines.
 *
 * A block in the rendered book is usually several authored lines: manuscripts
 * wrap. Corrections must therefore be matched against the JOINED run, not
 * against one line, or a fix to a sentence that happens to straddle a wrap would
 * never be found.
 */
interface SourceGroup {
  sectionIndex: number;
  /** Indices into that section's `bodyLines`. */
  lineIndices: number[];
  joined: string;
  normalised: string;
}

function groupSourceLines(sections: TypesetSection[]): SourceGroup[] {
  const groups: SourceGroup[] = [];
  sections.forEach((section, sectionIndex) => {
    let current: number[] = [];
    const flush = () => {
      if (!current.length) return;
      const joined = current.map((i) => section.bodyLines[i]!).join(' ');
      groups.push({ sectionIndex, lineIndices: current, joined, normalised: normaliseBlockText(joined) });
      current = [];
    };
    section.bodyLines.forEach((line, i) => {
      if (line.trim() === '') flush();
      else current.push(i);
    });
    flush();
  });
  return groups;
}

/** Enumerate every block WITHOUT a browser, using the renderer's own identity path. */
export function enumerateBlocks(
  sections: TypesetSection[],
  config: ProjectConfig,
  layoutStandard?: TypesetLayoutStandard,
): TypesetBlockRef[] {
  const blocks: TypesetBlockRef[] = [];
  buildTypesetHtml({ sections, config, layoutStandard, collectBlocks: blocks } as never);
  return blocks;
}

export function resolveCorrections(input: ResolveCorrectionsInput): CorrectionResult {
  const { config, layoutStandard } = input;
  const corrections = input.corrections ?? config.corrections ?? [];

  // Deep copy: a correction pass must never mutate the caller's parsed book.
  const sections: TypesetSection[] = input.sections.map((s) => ({ ...s, bodyLines: [...s.bodyLines] }));
  const blocks = enumerateBlocks(sections, config, layoutStandard);
  const byId = new Map<string, TypesetBlockRef[]>();
  for (const b of blocks) {
    const list = byId.get(b.blockId) ?? [];
    list.push(b);
    byId.set(b.blockId, list);
  }

  const resolutions: CorrectionResolution[] = [];
  const metadata: CorrectionMetadata = {
    title: config.title,
    subtitle: config.subtitle,
    authorName: config.authorName,
  };
  const layoutOverrides: Record<string, LayoutOverride> = { ...(config.layoutOverrides ?? {}) };
  const headingDisplay: Record<string, HeadingDisplayCorrection> = {};
  const runningHead: Record<string, string> = {};
  const tocDisplay: Record<string, string> = {};
  const illustrations: Record<string, IllustrationPlacement> = {};

  const sectionSlugs = new Set(sections.map((s) => slugifySection(s.title)));

  const add = (
    c: Correction,
    outcome: CorrectionOutcome,
    detail: string,
    extra?: { before?: string; after?: string },
  ) => resolutions.push({ id: c.id, type: c.type, outcome, reason: c.reason, detail, ...extra });

  /** Anchor resolution, shared by every block-anchored type. */
  const resolveAnchor = (c: Correction & { anchor: string }): TypesetBlockRef | null => {
    const hits = byId.get(c.anchor) ?? [];
    if (hits.length === 0) {
      add(
        c,
        'UNMATCHED',
        `No block with id ${c.anchor} exists in this book. The content may have moved, or the id may be mistyped. ` +
          `Run the corrections CLI to list current block ids.`,
      );
      return null;
    }
    if (hits.length > 1) {
      add(c, 'AMBIGUOUS', `Block id ${c.anchor} resolves to ${hits.length} blocks, which should be impossible.`);
      return null;
    }
    return hits[0]!;
  };

  for (const c of corrections) {
    if (c.status === 'superseded') {
      add(c, 'SUPERSEDED', 'Retired deliberately. Kept on the record, not applied.');
      continue;
    }

    switch (c.type) {
      case 'metadata': {
        const current = c.field === 'edition' ? metadata.edition : metadata[c.field];
        if (current === c.value) {
          add(c, 'NOOP', `${c.field} already reads "${c.value}".`);
          break;
        }
        if (c.field === 'edition') metadata.edition = c.value;
        else if (c.field === 'subtitle') metadata.subtitle = c.value;
        else metadata[c.field] = c.value;
        add(c, 'APPLIED', `${c.field} set for every output that displays it.`, {
          before: String(current ?? '(unset)'),
          after: c.value,
        });
        break;
      }

      case 'runningHead': {
        if (!sectionSlugs.has(c.section)) {
          add(c, 'UNMATCHED', `No section with slug "${c.section}". Slugs come from slugifySection(title).`);
          break;
        }
        runningHead[c.section] = c.display;
        add(c, 'APPLIED', `Running head for "${c.section}" set.`, { after: c.display });
        break;
      }

      case 'tocDisplay': {
        if (!sectionSlugs.has(c.section)) {
          add(c, 'UNMATCHED', `No section with slug "${c.section}".`);
          break;
        }
        tocDisplay[c.section] = c.display;
        add(c, 'APPLIED', `Contents entry for "${c.section}" set.`, { after: c.display });
        break;
      }

      case 'headingDisplay': {
        const ref = resolveAnchor(c);
        if (!ref) break;
        if (c.display === undefined && c.stripDrawnMarks !== true) {
          add(c, 'NOOP', 'Neither a replacement display nor stripDrawnMarks was requested.');
          break;
        }
        headingDisplay[c.anchor] = { display: c.display, stripDrawnMarks: c.stripDrawnMarks };
        add(c, 'APPLIED', `Heading display set on ${ref.kind} in "${ref.sectionTitle}".`, {
          before: ref.preview,
          after: c.display ?? `${ref.preview} (drawn marks stripped)`,
        });
        break;
      }

      case 'layout': {
        const ref = resolveAnchor(c);
        if (!ref) break;
        layoutOverrides[c.anchor] = { ...(layoutOverrides[c.anchor] ?? {}), ...c.override };
        add(c, 'APPLIED', `Layout override on ${ref.kind} in "${ref.sectionTitle}": ${describeOverride(c.override)}.`, {
          before: ref.preview,
        });
        break;
      }

      case 'blockPresentation': {
        const ref = resolveAnchor(c);
        if (!ref) break;
        layoutOverrides[c.anchor] = { ...(layoutOverrides[c.anchor] ?? {}), variant: c.variant };
        add(c, 'APPLIED', `Presentation variant "${c.variant}" on ${ref.kind} in "${ref.sectionTitle}".`, {
          before: ref.preview,
        });
        break;
      }

      case 'illustration': {
        const ref = resolveAnchor(c);
        if (!ref) break;
        illustrations[c.anchor] = {
          asset: c.asset,
          placement: c.placement,
          widthPercent: c.widthPercent,
          side: c.side,
        };
        add(c, 'APPLIED', `Plate "${c.asset}" anchored ${c.placement} to ${ref.kind} in "${ref.sectionTitle}".`, {
          before: ref.preview,
        });
        break;
      }

      case 'text': {
        const ref = resolveAnchor(c);
        if (!ref) break;
        const outcome = applyTextCorrection(sections, ref, c.expect, c.replace);
        add(c, outcome.outcome, outcome.detail, { before: outcome.before, after: outcome.after });
        break;
      }
    }
  }

  const counts = {
    total: corrections.length,
    APPLIED: 0,
    NOOP: 0,
    SUPERSEDED: 0,
    UNMATCHED: 0,
    AMBIGUOUS: 0,
    EXPECT_MISMATCH: 0,
  } as Record<CorrectionOutcome | 'total', number>;
  for (const r of resolutions) counts[r.outcome] += 1;

  return {
    resolutions,
    sections,
    metadata,
    layoutOverrides,
    headingDisplay,
    runningHead,
    tocDisplay,
    illustrations,
    blocks,
    ok: !resolutions.some((r) => BLOCKING_OUTCOMES.includes(r.outcome)),
    counts,
  };
}

/**
 * Apply one text correction, in place, to the section that owns the anchor.
 *
 * THE RESIDUE CHECK IS THE POINT. A correction written against a manuscript that
 * has since been revised must refuse rather than replace whatever now sits at
 * that anchor. Blind replacement is how an old patch corrupts a new edition.
 */
function applyTextCorrection(
  sections: TypesetSection[],
  ref: TypesetBlockRef,
  expect: string,
  replace: string,
): { outcome: CorrectionOutcome; detail: string; before?: string; after?: string } {
  const groups = groupSourceLines(sections).filter(
    (g) => slugifySection(sections[g.sectionIndex]!.title) === ref.sectionSlug,
  );
  const target = normaliseBlockText(ref.preview);
  const candidates = groups.filter((g) => g.normalised === target);

  if (candidates.length === 0) {
    return {
      outcome: 'EXPECT_MISMATCH',
      detail:
        `The anchored block resolved, but no run of source lines in "${ref.sectionTitle}" matches its text. ` +
        `The manuscript has changed under this correction.`,
    };
  }
  if (candidates.length > 1) {
    return {
      outcome: 'AMBIGUOUS',
      detail: `${candidates.length} runs of source lines in "${ref.sectionTitle}" match the anchored block.`,
    };
  }

  const group = candidates[0]!;
  const section = sections[group.sectionIndex]!;
  // Count OCCURRENCES, not lines. An expectation that matches twice on one line
  // used to replace the first and report success, which is precisely the silent
  // wrong-thing this layer exists to prevent. A correction is a specific fix.
  const occurrencesIn = (line: string): number => (expect ? line.split(expect).length - 1 : 0);
  const totalOccurrences = group.lineIndices.reduce((n, i) => n + occurrencesIn(section.bodyLines[i]!), 0);
  const hits = group.lineIndices.filter((i) => occurrencesIn(section.bodyLines[i]!) > 0);

  if (hits.length === 0) {
    const spans = group.joined.includes(expect);
    return {
      outcome: 'EXPECT_MISMATCH',
      detail: spans
        ? `CORRECTION NO LONGER MATCHES SOURCE: the expected text spans a line break in the manuscript, so it ` +
          `cannot be replaced without rewrapping. Narrow the expectation to text on one line.`
        : `CORRECTION NO LONGER MATCHES SOURCE: expected "${clip(expect)}" at this anchor and it is not present. ` +
          `Refusing to replace something else.`,
      before: clip(group.joined),
    };
  }
  if (totalOccurrences > 1) {
    return {
      outcome: 'AMBIGUOUS',
      detail:
        `"${clip(expect)}" appears ${totalOccurrences} times in the anchored block` +
        (hits.length > 1 ? ` across ${hits.length} lines` : ``) +
        `. Make the expectation unique rather than replacing whichever comes first.`,
    };
  }

  const lineIndex = hits[0]!;
  const original = section.bodyLines[lineIndex]!;
  if (expect === replace) {
    return { outcome: 'NOOP', detail: 'Expected and replacement text are identical.', before: clip(original) };
  }
  // ONE occurrence, deliberately. A correction is a specific fix, not a
  // find-and-replace pass over the book.
  const updated = original.replace(expect, replace);
  section.bodyLines[lineIndex] = updated;
  return {
    outcome: 'APPLIED',
    detail: `Replaced in "${ref.sectionTitle}".`,
    before: clip(window(original, expect)),
    after: clip(window(updated, replace || expect)),
  };
}

function window(line: string, needle: string, pad = 34): string {
  const i = needle ? line.indexOf(needle) : -1;
  if (i < 0) return line.slice(0, pad * 2);
  return `${i > pad ? '…' : ''}${line.slice(Math.max(0, i - pad), i + needle.length + pad)}`;
}

const clip = (s: string, n = 120): string => (s.length > n ? `${s.slice(0, n)}…` : s);

function describeOverride(o: LayoutOverride): string {
  const parts = Object.entries(o)
    .filter(([k, v]) => k !== 'note' && v !== undefined)
    .map(([k, v]) => `${k}=${String(v)}`);
  return parts.length ? parts.join(', ') : 'no properties set';
}
