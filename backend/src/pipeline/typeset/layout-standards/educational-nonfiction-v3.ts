/**
 * EDUCATIONAL NONFICTION TYPESET LAYOUT — v3
 *
 * v2 with ONE addition: a long-token wrapping policy.
 *
 * WHY. NO ONE TOLD ME THAT gained a SOURCES section listing all 94 checked
 * sources per chapter, each as a bare URL inside a list item. Rendered on @2 the
 * section overflowed the measure on five entries across three pages, the worst
 * by 170px against a 4.375in text block — ink outside the trim on a printed
 * book.
 *
 * The cause is not a missing stylesheet rule. `markLongTokenBreaks` is a no-op
 * when the standard declares no policy, so NOT ONE break opportunity was placed
 * in any URL. The engine capability (C4) has existed since typeset engine v1 and
 * is declared by the trade-nonfiction standard, which was written for DIRT
 * RICH's 65 source URLs. The educational line never carried URLs before, so it
 * never declared the policy. This book is the first to need it.
 *
 * `breakAnywhereFallback` is deliberately FALSE. The fallback emits
 * `p { overflow-wrap: break-word }`, and every one of these URLs is dense with
 * structural punctuation to break on, so the `<wbr>` pass alone resolves them.
 * Leaving the fallback off keeps the rule out of the stylesheet entirely rather
 * than adding a break-anywhere behaviour this book has no need of.
 *
 * WHY A NEW VERSION RATHER THAN AN EDIT TO @2. The registry's whole point is
 * that a pinned standard cannot change under an approved book. Editing @2 would
 * silently alter the design of anything already rendering against it. @2 stays
 * exactly as approved; moving to @3 is a deliberate per-project pin, taken here
 * because the book cannot be printed on @2 without type off the trim.
 *
 * Nothing else changes: identical trim, margins, type scale, ragged-right body,
 * opener treatment and orphan/widow settings.
 */
import { EDUCATIONAL_NONFICTION_TYPESET_V2 } from './educational-nonfiction-v2.js';
import type { TypesetLayoutStandard } from './types.js';

export const EDUCATIONAL_NONFICTION_TYPESET_V3: TypesetLayoutStandard = {
  ...EDUCATIONAL_NONFICTION_TYPESET_V2,
  id: 'educational-nonfiction-typeset@3',
  label: 'Educational Nonfiction — Digest (v3, URL wrapping)',
  description:
    'v2 plus a long-token wrapping policy, so bare source URLs in a list break at their own punctuation instead of running past the measure. Identical trim, margins, type scale and opener treatment.',
  longTokens: {
    mode: 'after-punctuation',
    /**
     * 28 characters, matching the trade-nonfiction standard. Short enough to
     * catch every real URL, long enough that ordinary prose — where the longest
     * words in this book are well under 20 characters — is never touched.
     */
    minTokenLength: 28,
    breakAnywhereFallback: false,
  },
};
