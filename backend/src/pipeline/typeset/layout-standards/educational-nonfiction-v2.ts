/**
 * EDUCATIONAL NONFICTION TYPESET LAYOUT — v2
 *
 * v1 with ONE change: the body text is set ragged right instead of justified.
 *
 * WHY. Editorial QA measured the v1 interior of NO ONE TOLD ME THAT and found
 * justified text with hyphenation effectively off — 7 hyphenated line ends in
 * 2,400 body lines (0.3%), against 5-15% for normal justified book setting.
 * With nothing to hyphenate, the engine can only stretch word spaces, and it
 * did: 105 lines at 2x normal word spacing or worse, the worst at 4.5x.
 *
 * The obvious fix is to turn hyphenation on. It is already on. `typeset-book.ts`
 * declares `hyphens: auto` on `body` and `lang="en"` on `<html>`, and the
 * property is a NO-OP in the render Chromium: a probe rendering the same
 * paragraph at a 180px measure with `hyphens: auto` and with `hyphens: none`
 * produced an identical 152px height. Chromium loads hyphenation dictionaries
 * through the component updater, and the render environment has none. There is
 * nothing to switch on.
 *
 * So the choice is justified-with-holes or ragged-right, and for a 9-14
 * readership ragged right with even word spacing is the better read. It is also
 * deterministic: it cannot regress when a dictionary appears or disappears.
 *
 * v1 stays exactly as approved. Books already proofed on it keep rendering
 * identically; moving is a deliberate per-project pin.
 */
import { EDUCATIONAL_NONFICTION_TYPESET_V1 } from './educational-nonfiction-v1.js';
import type { TypesetLayoutStandard } from './types.js';

export const EDUCATIONAL_NONFICTION_TYPESET_V2: TypesetLayoutStandard = {
  ...EDUCATIONAL_NONFICTION_TYPESET_V1,
  id: 'educational-nonfiction-typeset@2',
  label: 'Educational Nonfiction — Digest (v2, ragged right)',
  description:
    'v1 with the body set ragged right. Identical trim, margins, type scale and opener treatment; only the justification changes, because hyphenation is unavailable in the render engine and justifying without it opens word-space holes.',
  paragraphs: {
    ...EDUCATIONAL_NONFICTION_TYPESET_V1.paragraphs,
    justify: false,
  },
};
