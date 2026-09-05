/**
 * EDUCATIONAL NONFICTION TYPESET LAYOUT — v4
 *
 * v3 plus THREE VISIBLE TIERS instead of two: the alert panel can be opened by a
 * bold run-in as well as a heading, and a heavier variant of it marks the tier
 * above same-day.
 *
 * WHY. BEFORE YOU NEED IT — the girls' companion to NO ONE TOLD ME THAT, same
 * class, same trim — marks its same-day safety tier with a bold run-in at the
 * head of a paragraph, `**Tell somebody today:**`. It contains no ALL-CAPS H3
 * heading at all, and the heading matcher is the only thing that could open a
 * panel, so on @3 the book rendered with ZERO alert panels against six
 * structural same-day sites. Measured on the real render, not inferred: the
 * most urgent guidance in a safety book set as ordinary prose, typographically
 * identical to the routine advice in the list directly above it.
 *
 * The capability was already known to be missing. `trade-nonfiction-guide-v1.ts`
 * records it against DIRT RICH — "needs a run-in matcher, which does not exist
 * yet. Left deliberately unstyled." There the cost was a closing beat. Here it
 * is the safety hierarchy, which is what makes it worth building rather than
 * noting again.
 *
 * ─── WHAT IS AND IS NOT MATCHED ──────────────────────────────────────────
 * Structural, never a keyword search. This manuscript contains 314 bold run-ins,
 * of which SIX are the safety marker, plus four inline references to the same
 * phrase that must stay ordinary text: one mid-sentence in plain prose, one as a
 * bold run later inside a paragraph, one trailing inside a bullet whose own
 * run-in is something else, and one inside an italic aside. All four are left
 * untouched because the bold has to OPEN a body paragraph.
 *
 * ─── WHAT THE PANEL CONTAINS ─────────────────────────────────────────────
 * The run-in paragraph plus a directly adjacent list, and nothing else. Two of
 * the six sites are followed by bullets and then by a reassurance paragraph —
 * "None of these mean something is seriously wrong" — which belongs OUTSIDE the
 * box. The heading matcher runs to the next heading, which would have swallowed
 * it and framed the reassurance as part of the warning.
 *
 * ─── THE THIRD TIER ──────────────────────────────────────────────────────
 * The book's own QA record declares three semantic tiers — routine, same-day
 * and immediately — and the `immediately` tier is toxic shock: take the tampon
 * out, tell an adult, get medical help, "Not in the morning." With only two
 * visual levels, the first render put a box around leg pain and left toxic
 * shock as ordinary prose on the same page, which inverted the hierarchy the
 * boxes were introduced to express.
 *
 * Giving it the SAME box as same-day would have been a different error: it
 * asserts that "tell somebody today" and "get medical help immediately" are
 * equivalent instructions. So the top tier gets a heavier rule and the drawn
 * flag, and stays legible as a third level on a greyscale photocopy.
 *
 * ─── WHY A NEW VERSION RATHER THAN AN EDIT TO @3 ─────────────────────────
 * The registry's whole point is that a pinned standard cannot change under an
 * approved book. NO ONE TOLD ME THAT is pinned to @3; editing @3 would put six
 * boxes into a book that was approved without them. @3 stays exactly as
 * approved. The matcher itself is inert without a declared policy, so every
 * standard that does not declare `runIn` renders byte-identically.
 *
 * Nothing else changes: identical trim, margins, type scale, ragged-right body,
 * long-token policy, opener treatment and orphan/widow settings.
 */
import { EDUCATIONAL_NONFICTION_TYPESET_V3 } from './educational-nonfiction-v3.js';
import type { TypesetLayoutStandard } from './types.js';

export const EDUCATIONAL_NONFICTION_TYPESET_V4: TypesetLayoutStandard = {
  ...EDUCATIONAL_NONFICTION_TYPESET_V3,
  id: 'educational-nonfiction-typeset@4',
  label: 'Educational Nonfiction — Digest (v4, three safety tiers)',
  description:
    'v3 plus a structural bold-run-in trigger for the alert panel, and a heavier variant of it for the tier above same-day, so routine, same-day and immediate read as three distinct levels without relying on colour. Identical trim, margins, type scale and opener treatment.',
  /**
   * NO PARITY BLANKS. Owner decision, and the reason it lives here rather than
   * on the project: every section in this book parses as `front` or `back`, not
   * `chapter`, so the per-project `chaptersStartRecto` switch never touched it —
   * `sectionStart.front` was what forced nine blank leaves.
   *
   * The inherited standard opens front matter and chapters on a right-hand page,
   * which is the premium trade convention and costs an empty leaf roughly half
   * the time. Nine blanks in a 184-page book is nine sheets of paper carrying
   * nothing, and this book is not spending them.
   */
  sectionStart: {
    front: 'page',
    chapter: 'page',
    back: 'page',
  },

  alertPanel: {
    ...EDUCATIONAL_NONFICTION_TYPESET_V3.alertPanel,
    runIn: {
      /**
       * One marker, authored two ways — `**Tell somebody today**,` and
       * `**Tell somebody today:**`. Trailing punctuation is normalised away, so
       * both forms resolve to this single entry.
       *
       * The book states this convention itself, in the back matter: "Where
       * something says today, or straight away, that's the whole instruction."
       */
      runIns: ['Tell somebody today'],
      /**
       * The IMMEDIATE tier. Authored as `**Do this now.**` at both toxic-shock
       * sites in rev-17; the trailing period is normalised away, so the label
       * resolves to `Do this now`.
       *
       * Chosen to avoid every phrase already inside the instruction it opens —
       * not `straight away`, not `tell an adult`, not `get medical help`, not
       * `morning`, not `later` — and to read as an unambiguous step up from the
       * same-day marker: TODAY -> NOW.
       */
      emphaticRunIns: ['Do this now'],
      absorbAdjacentList: true,
    },
    /**
     * Double the rule weight, and carry the drawn flag. Two channels, neither
     * of them colour, so the three tiers stay separable on a greyscale page.
     */
    emphatic: { borderPt: 1.5, flag: true },
  },

  /**
   * A COMPACT CONTENTS LIST — 0.30em between entries against the generator's
   * 0.62em.
   *
   * WHY. This book lists 26 sections. At 0.62em, 21 fitted the contents page and
   * FIVE spilled onto a second leaf that was then 82% white — the emptiest page
   * in the book, and on the one page whose entire job is to be taken in at a
   * glance. A reader looking up a chapter had to turn a page to finish reading a
   * list of chapters.
   *
   * THE ARITHMETIC, not a guess. The spilled entries need 5 x 23pt = 115pt and
   * the contents page had 16pt of slack, so 99pt has to come from somewhere. The
   * entry margin appears 26 times, so each has to give up 99 / 26 = 3.81pt. At
   * 12pt type that is 0.62em - 0.32em, and 0.30em is the next round value below
   * it. The resulting pitch is about 19pt on 12pt type — looser than the 35-row
   * lookup table this book already sets at 10pt, and comfortably readable.
   *
   * A CONTENTS PAGE IS A LOOKUP, NOT PROSE. It sets tighter than running text
   * for the same reason the table does, which is why this belongs to the book
   * class rather than to the generator: @1-@3 declare nothing here and render
   * byte-identically.
   */
  contents: {
    entrySpacingEm: 0.3,
  },

  /**
   * ONE TABLE: the back matter's "What's worrying you this week" lookup, two
   * columns by thirty-five rows.
   *
   * WHY THIS IS DECLARED NOW. The table engine has existed since the trade line
   * needed it, but `tables` is optional and absent means pipe rows are not read
   * as tables — so the educational line, which had never carried a table, set
   * this one as a single justified paragraph of pipe characters with the
   * `|---|---|` delimiter row printed literally. A section whose own instruction
   * is "Look down the list until you find yours" was the least scannable page in
   * the book. Same shape of gap as the long-token policy at @3: an engine
   * capability this line simply never declared.
   *
   * 10pt against a 12pt body mirrors the trade line's 9-against-11 — a table is
   * scanned, not read, and sets tighter than running text at the same nominal
   * size.
   *
   * `allow-break` with a repeated header, because thirty-five rows cannot sit on
   * one digest page and a reader who turns the page mid-table needs to be told
   * again which column is the question and which is the chapter.
   *
   * No stacking fallback: at two columns the grid is never the wrong shape, and
   * the fallback exists for tables too wide to divide the measure.
   */
  tables: {
    typePt: 10,
    cellPaddingEm: 0.3,
    headerRulePt: 1,
    rowRulePt: 0.25,
    breakPolicy: 'allow-break',
    repeatHeader: true,
    stackWhenColumnsExceed: null,
  },
};
