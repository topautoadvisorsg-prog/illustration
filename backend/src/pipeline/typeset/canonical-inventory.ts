/**
 * CANONICAL INVENTORY — what the manuscript says is in the book, derived
 * independently of anything that lays it out.
 *
 * ─── WHY THIS EXISTS AND WHY IT SHARES NO CODE ────────────────────────────
 * The typeset pipeline already had an every-section invariant. It did not stop
 * a book losing a third of its back matter, because of HOW it was wired: it
 * compared the sections Paged.js rendered against the sections
 * `parseTypesetSections` handed it. Both sides of that comparison come from the
 * same parse. When the parse silently dropped eight sections, the invariant
 * compared the truncated list against itself and reported success.
 *
 * Measured on DIRT RICH before the parser was fixed: 16 sections rendered, 16
 * sections expected, invariant green — and The Practical Bits, Appendices A-F
 * and the Glossary were not in the book.
 *
 * A check that shares a code path with the thing it checks is not a check. So
 * this module deliberately:
 *
 *   - imports nothing from `typeset-book.ts` or anywhere else in the pipeline;
 *   - re-reads the raw canonical markdown rather than any parsed structure;
 *   - uses its own dumb heading scan, which is easy to audit precisely because
 *     it is too simple to be clever.
 *
 * The duplication is the POINT. If someone "cleans this up" by calling
 * `parseTypesetSections`, the invariant goes back to being decorative. Two
 * independent readings that agree is evidence; one reading agreeing with itself
 * is not.
 */

/** A heading found in the canonical manuscript. Nothing interpreted. */
export interface CanonicalHeading {
  level: 1 | 2;
  /** The heading text exactly as written, `#` markers and spacing stripped. */
  title: string;
  /** 1-based line number in the canonical file, for error messages. */
  line: number;
  /** Words of body text between this heading and the next one at level <= 2. */
  words: number;
  /**
   * True for an H1 that declares STRUCTURE rather than naming a section:
   * `# Chapter 4`, `# FRONT MATTER`, `# BACK MATTER`.
   *
   * These are the manuscript telling the typesetter what comes next; the section
   * itself is the H2 underneath. Requiring a marker to appear in the build as a
   * section would fail every book that uses the convention — NO ONE TOLD ME THAT
   * has 23 of them.
   *
   * Recognised here by this module's OWN pattern. It duplicates a rule that
   * `typeset-book.ts` also knows, and that duplication is deliberate: see the
   * header. Importing it would be the one thing that makes this check worthless.
   */
  isStructureMarker: boolean;
}

/** `# Chapter N`, `# FRONT MATTER`, `# BACK MATTER` — structure, not a section. */
const STRUCTURE_MARKER = /^(chapter\s+\d+\s*$|front\s+matter\s*$|back\s+matter\s*$)/i;

export interface CanonicalInventory {
  headings: CanonicalHeading[];
  /**
   * The leading bare H1 that is the manuscript's own title block, if present.
   *
   * This is the ONE heading a build is allowed not to contain: the title page is
   * generated matter, so typesetting the manuscript's title block would print it
   * twice. Recorded explicitly rather than silently skipped, so the exemption is
   * visible instead of being a hole in the invariant.
   */
  titleBlock: CanonicalHeading | null;
  /** Total body words across the whole manuscript, headings excluded. */
  totalWords: number;
}

/** Fenced regions are not structure. A `#` inside a code fence is not a heading. */
const FENCE = /^\s*(```|~~~)/;

/**
 * A horizontal rule is punctuation, not prose. Counting `---` as a word made a
 * `# BACK MATTER` marker followed by a scene break look like it carried body
 * text, which is the kind of false alarm that teaches people to ignore a check.
 */
const HORIZONTAL_RULE = /^\s*([-*_])\s*(\1\s*){2,}$/;

const countWords = (lines: string[]): number =>
  lines
    .filter((l) => !HORIZONTAL_RULE.test(l))
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;

/**
 * Scan the canonical manuscript for its H1/H2 structure.
 *
 * Intentionally naive: headings are lines starting with one or two `#` outside a
 * code fence. No chapter detection, no front/back inference, no title cleanup —
 * every one of those is an interpretation, and interpretations are what this
 * module exists to check rather than to make.
 */
export function scanCanonicalHeadings(markdown: string): CanonicalInventory {
  const headings: CanonicalHeading[] = [];
  const lines = markdown.split('\n');
  let inFence = false;
  let bodyForCurrent: string[] = [];
  let totalWords = 0;

  const closeCurrent = (): void => {
    const w = countWords(bodyForCurrent);
    totalWords += w;
    const last = headings[headings.length - 1];
    if (last) last.words = w;
    bodyForCurrent = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    if (FENCE.test(raw)) {
      inFence = !inFence;
      bodyForCurrent.push(raw);
      continue;
    }
    if (inFence) {
      bodyForCurrent.push(raw);
      continue;
    }
    const m = raw.match(/^(#{1,2})\s+(.*\S)\s*$/);
    if (!m) {
      bodyForCurrent.push(raw);
      continue;
    }
    closeCurrent();
    const level = m[1]!.length as 1 | 2;
    const title = m[2]!.trim();
    headings.push({
      level,
      title,
      line: i + 1,
      words: 0,
      isStructureMarker: level === 1 && STRUCTURE_MARKER.test(title),
    });
  }
  closeCurrent();

  // The title block is a level-1 heading that comes before every other heading.
  const first = headings[0];
  const titleBlock =
    first && first.level === 1 && !first.isStructureMarker && headings.length > 1 ? first : null;

  return { headings, titleBlock, totalWords };
}

export interface CompletenessFailure {
  kind: 'missing-section' | 'word-loss' | 'duplicate-section';
  message: string;
}

export interface CompletenessResult {
  ok: boolean;
  failures: CompletenessFailure[];
  expectedSections: number;
  builtSections: number;
  canonicalWords: number;
  builtWords: number;
}

/** What a built section must expose to be checkable. Structural minimum only. */
export interface BuiltSectionView {
  title: string;
  /** The heading as the manuscript wrote it, when the builder preserved it. */
  sourceTitle?: string;
  words: number;
}

/**
 * Assert every canonical section survived into the build.
 *
 * Matching is on the heading text, against EITHER the built title or the
 * preserved source heading — a builder is allowed to split `Chapter 1: Title`
 * into a number and a short title, and doing so must not read as a loss.
 *
 * `wordTolerance` is a fraction, not a count, and defaults to 0. Body text is
 * moved by typesetting, never deleted; a real drop is what this catches.
 */
export function assertCanonicalCompleteness(
  canonical: CanonicalInventory,
  built: BuiltSectionView[],
  opts: { wordTolerance?: number } = {},
): CompletenessResult {
  const tolerance = opts.wordTolerance ?? 0;
  const failures: CompletenessFailure[] = [];

  // Everything the book must contain: every heading except the generated title
  // block and the structural markers, which name no section of their own.
  const expected = canonical.headings.filter((h) => h !== canonical.titleBlock && !h.isStructureMarker);

  // A marker carrying body text means the manuscript put prose somewhere this
  // check is about to stop looking. Surface it rather than quietly dropping it.
  for (const h of canonical.headings) {
    if (h.isStructureMarker && h.words > 0) {
      failures.push({
        kind: 'word-loss',
        message:
          `Structure marker "${h.title}" (line ${h.line}) carries ${h.words} words of body text. ` +
          `Markers are expected to be empty; this prose belongs to no section and may not reach the book.`,
      });
    }
  }
  const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

  const builtKeys = new Set<string>();
  for (const b of built) {
    builtKeys.add(norm(b.title));
    if (b.sourceTitle) builtKeys.add(norm(b.sourceTitle));
  }

  for (const h of expected) {
    if (!builtKeys.has(norm(h.title))) {
      failures.push({
        kind: 'missing-section',
        message:
          `Canonical section "${h.title}" (line ${h.line}, ${h.words} words) is not in the build. ` +
          `A section present in the manuscript and absent from the book is content loss, not a layout choice.`,
      });
    }
  }

  const seen = new Set<string>();
  for (const b of built) {
    const k = norm(b.title);
    if (seen.has(k)) {
      failures.push({ kind: 'duplicate-section', message: `Section "${b.title}" appears more than once in the build.` });
    }
    seen.add(k);
  }

  const canonicalWords = expected.reduce((a, h) => a + h.words, 0);
  const builtWords = built.reduce((a, b) => a + b.words, 0);
  if (builtWords < canonicalWords * (1 - tolerance)) {
    failures.push({
      kind: 'word-loss',
      message:
        `Build carries ${builtWords} body words against ${canonicalWords} in the canonical manuscript ` +
        `(${canonicalWords - builtWords} lost). Typesetting moves text between pages; it never deletes it.`,
    });
  }

  return {
    ok: failures.length === 0,
    failures,
    expectedSections: expected.length,
    builtSections: built.length,
    canonicalWords,
    builtWords,
  };
}
