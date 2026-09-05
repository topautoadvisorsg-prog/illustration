/**
 * TYPESET LAYOUT STANDARD — the contract for "how is this class of book laid out?".
 *
 * Everything a typeset interior decides that is NOT specific to one manuscript:
 * geometry, the type scale, how paragraphs indent, what a chapter opener looks
 * like, where running heads and folios go, how a callout is styled. These used
 * to live as constants inside a CSS template literal in `typeset-book.ts`, which
 * meant approving a design produced a diff rather than a reusable asset, and a
 * second book of the same class needed a developer.
 *
 * ─── WHAT A STANDARD OWNS ─────────────────────────────────────────────────
 *   Page geometry and margin policy, the per-role type scale, paragraph
 *   behaviour, justification and hyphenation, widow/orphan limits, the chapter
 *   opener treatment and its label format, chapter-start policy, running-head
 *   roles, folio placement and suppression, and the styling of scene breaks,
 *   lists and callouts.
 *
 * ─── WHAT A STANDARD DOES NOT OWN ─────────────────────────────────────────
 *   The manuscript, its structure, the book's title/author, illustration
 *   selection, cover, export, or anything about the AI whole-page render track.
 *   A standard describes a PAGE, never a BOOK.
 *
 * ─── PRECEDENCE ───────────────────────────────────────────────────────────
 *   Standard supplies the design; `ProjectConfig` may override the few fields
 *   the operator legitimately chooses per book (trim, the two font roles, body
 *   size and leading). Everything else is the standard's and is not
 *   per-project-editable — that is the point of having one.
 *
 * ─── VERSIONING ───────────────────────────────────────────────────────────
 *   The id CARRIES the version (`educational-nonfiction-typeset@1`). There is
 *   deliberately no "latest" alias: a project pins a resolved id, and moving to
 *   `@2` is an explicit operator action. See `registry.ts`.
 *
 * Adding a book class is a REGISTERED STANDARD, not an edit to the renderer —
 * the same contract the Style DNA registry already proves.
 */

/** Interior margins. Mirrored: gutter is the binding edge, outside the fore-edge. */
export interface TypesetMarginPolicy {
  topIn: number;
  bottomIn: number;
  /** Fore-edge. Smaller than the gutter. */
  outsideIn: number;
  /**
   * Binding edge. KDP requires this to grow with page count; the bands below
   * are the printer's, so a book that grows past a threshold stays compliant
   * without anyone remembering to adjust it.
   */
  gutterIn: number;
  /** Gutter overrides by page count, smallest bound first. Optional. */
  gutterByPageCount?: readonly { maxPages: number; gutterIn: number }[];
}

/** Per-role point sizes. Sizes not fixed here are derived from `bodyPt`. */
export interface TypesetTypeScale {
  headingFont: string;
  bodyFont: string;
  bodyPt: number;
  lineHeight: number;
  sectionHeadingPt: number;
  subsectionHeadingPt: number;
  /** Running heads and the chapter kicker derive from this. */
  labelPt: number;
  captionPt: number;
  /** Chapter title size as a multiple of bodyPt. */
  chapterTitleScale: number;
  /** Kicker size = labelPt + this. */
  kickerPtDelta: number;
  /** Folio size = captionPt + this. */
  folioPtDelta: number;
}

export interface TypesetParagraphPolicy {
  /** First-line indent for continuing paragraphs, in em. */
  indentEm: number;
  /**
   * Vertical space between paragraphs, in em.
   *
   * 0 is classic trade-book setting: separation is carried entirely by the
   * first-line indent. It is correct, and it is also the single biggest driver
   * of how dense the page feels — worth a deliberate look for a book whose
   * reader is 9-14 and working through it a bit at a time, rather than a value
   * inherited by default.
   */
  spacingEm: number;
  /** The first paragraph after a heading sets flush left, no indent. */
  firstParagraphFlush: boolean;
  justify: boolean;
  hyphenate: boolean;
  /** Minimum lines left at the foot of a page. */
  orphans: number;
  /** Minimum lines carried to the top of a page. */
  widows: number;
}

/** How a chapter number becomes its printed label. */
export type ChapterLabelFormat =
  /** 1 -> "Chapter One". Case is a STYLE decision, applied via text-transform. */
  | 'chapter-word'
  /** 1 -> "Chapter 1". */
  | 'chapter-numeral'
  /** No kicker at all. */
  | 'none';

export interface TypesetChapterOpener {
  /**
   * The drop, as a fraction of the text-block height: 0.27 starts the heading
   * about a quarter of the way down.
   *
   * Expressed as a fraction rather than a divisor because that is how the
   * decision is actually made and reviewed ("27%"), and because the divisor
   * form for anything but a simple fraction is unreadable (0.27 is a divisor of
   * 3.7037). Judge this by looking at where the BODY text starts, not the
   * heading: the title block plus its margin push the first line of reading
   * text roughly 12 points further down than the sink itself.
   */
  sinkFraction: number;
  labelFormat: ChapterLabelFormat;
  /** Rendered case of the kicker. The label text itself is never pre-uppercased. */
  labelTransform: 'uppercase' | 'none';
  labelLetterSpacingEm: number;
  /** Space between the heading block and the first paragraph, in em. */
  blockMarginBottomEm: number;
  /** Centre the label and title. */
  centered: boolean;
  /**
   * Which form of the chapter title the opener prints.
   *
   * `parsed` (default) the title with any leading `Chapter N:` removed, so the
   *          number appears once, in the generated kicker.
   * `source` the author's heading exactly as written, e.g.
   *          `Chapter 1: Backyard Me v1.0`. Pair with `labelFormat: 'none'`,
   *          or the number prints twice.
   *
   * The PARSER preserves both forms and decides nothing; this is where the
   * decision lives, because it is a question about how a page looks. OPTIONAL,
   * and absent means `parsed` — which is identical to the old behaviour for any
   * manuscript that never put a number in its title.
   */
  titleSource?: 'parsed' | 'source';
}

export interface TypesetPageFurniture {
  /** Verso (left) running head. */
  versoRunningHead: 'book-title' | 'section-title' | 'none';
  /** Recto (right) running head. */
  rectoRunningHead: 'book-title' | 'section-title' | 'none';
  runningHeadSmallCaps: boolean;
  runningHeadLetterSpacingEm: number;
  folio: 'bottom-center' | 'none';
  /** Chapter-opening pages carry no running head (they keep the drop folio). */
  suppressRunningHeadOnOpener: boolean;
  /** Suppress the folio too on opening pages. */
  suppressFolioOnOpener: boolean;
  /**
   * Strip all furniture from parity blanks. A blank verso inserted so the next
   * chapter opens recto is not a page of the book — printing a running head and
   * a folio on it advertises the mechanism and reads as a mistake.
   */
  suppressFurnitureOnBlank: boolean;
}

/**
 * A chapter whose LAST subsection is a heading plus a sentence or two will,
 * left alone, carry that whole unit to a fresh page and leave it stranded on an
 * otherwise empty leaf. Page 15 was a heading and one line above 85% white.
 *
 * The unit is kept indivisible (never strand the heading at the foot of the
 * previous page) and given one controlled chance to fit where it is, by
 * tightening the space above the heading. If it still does not fit, a new page
 * is the better of the two bad outcomes.
 */
export interface TerminalMicroSectionPolicy {
  /** Off entirely when false. */
  enabled: boolean;
  /** Treat as a micro-section only when the body after the final heading is at most this many words. */
  maxWords: number;
  /** Tightened space above the heading, in em. The rescue attempt. */
  tightenedMarginTopEm: number;
}

/**
 * CHAPTER TAKEAWAY — a recurring closing beat, not a normal subsection.
 *
 * 21 of this book's 23 chapters end with the same heading followed by a single
 * sentence. Set as an ordinary H3 that is a heading plus one line, which lands
 * on its own page whenever the previous page is full and fills about 7% of it.
 * Treating it as a component lets it stay compact and travel with the chapter
 * content it belongs to.
 *
 * Matching is by heading text, declared here — the component is reusable, and a
 * different book class names its closing beat something else.
 */
export interface ChapterTakeawayPolicy {
  enabled: boolean;
  /** Heading texts that become a takeaway. Compared case-insensitively. */
  headings: readonly string[];
  /** Label point size. */
  labelPt: number;
  labelLetterSpacingEm: number;
  labelTransform: 'uppercase' | 'none';
  /** Space above the whole block, in em. Tighter than an H3's 1.15em. */
  marginTopEm: number;
  /** Space between the label and the takeaway sentence, in em. */
  labelGapEm: number;
}

/**
 * ALERT PANEL — a boxed, self-contained aside introduced by a known heading.
 *
 * This book's front matter tells the reader "you'll see BOXES marked SEE A
 * DOCTOR IF". Rendered as an ordinary H3 they were not boxes at all, just
 * another heading in the flow — a promise the page did not keep, on the nine
 * blocks in the book that carry medical guidance and most need to be scannable.
 *
 * The panel runs from the matched heading to the next heading or the end of the
 * section, which is where these blocks consistently end: bullets, then a
 * closing reassurance paragraph that belongs with them.
 */
/**
 * RUN-IN ALERTS — the same panel, opened by a bold run-in instead of a heading.
 *
 * `alertPanel` could only ever be opened by an ALL-CAPS H3. BEFORE YOU NEED IT
 * marks its same-day safety tier with a bold run-in at the head of a paragraph
 * (`**Tell somebody today:**`) and contains no all-caps H3 at all, so its most
 * urgent guidance set as ordinary prose — typographically identical to the
 * routine advice beside it. The same missing capability was recorded against the
 * trade line in `trade-nonfiction-guide-v1.ts`: "needs a run-in matcher, which
 * does not exist yet. Left deliberately unstyled." There it cost a closing beat;
 * here it costs the safety hierarchy.
 *
 * ─── STRUCTURAL, NOT A KEYWORD SEARCH ────────────────────────────────────
 * The bold must OPEN the paragraph. A mid-sentence mention, a bold run later in
 * the same paragraph, and the phrase inside a bullet are all left alone. That
 * distinction is the whole point: BEFORE YOU NEED IT has 314 bold run-ins, of
 * which 6 are safety, and 4 inline references to the same phrase that must stay
 * ordinary text.
 */
export interface AlertRunInPolicy {
  /**
   * Run-in texts that open a panel. Compared case-insensitively after trailing
   * presentation punctuation is removed, because the same marker is authored
   * both as `**Tell somebody today**,` and as `**Tell somebody today:**`.
   */
  runIns: readonly string[];
  /**
   * Absorb a list that DIRECTLY follows the run-in paragraph.
   *
   * The panel is the run-in plus an adjacent list and nothing else. Running on
   * to the next heading, as the heading matcher does, would swallow the
   * reassurance paragraph that deliberately sits outside these boxes ("None of
   * these mean something is seriously wrong").
   */
  absorbAdjacentList: boolean;
  /**
   * OPTIONAL. Run-ins that open the EMPHATIC variant of the panel rather than
   * the standard one — the third tier, above same-day.
   *
   * Listed here INSTEAD OF in `runIns`, not as well as: the matcher takes the
   * union, and membership here is what selects the variant. Absent means one
   * panel weight, which is the behaviour every book shipped with.
   */
  emphaticRunIns?: readonly string[];
}

export interface AlertPanelPolicy {
  enabled: boolean;
  /** Heading texts that open a panel. Compared case-insensitively. */
  headings: readonly string[];
  labelPt: number;
  labelLetterSpacingEm: number;
  borderPt: number;
  paddingEm: number;
  marginYEm: number;
  /**
   * Keep the whole panel on one page. A safety box split across a spread reads
   * as two unrelated fragments, and the second half loses its heading.
   */
  keepTogether: boolean;
  /**
   * OPTIONAL. Absent means headings-only matching — the behaviour every book
   * shipped with. An approved standard is never edited to add a capability it
   * was not approved with; register a new version instead.
   */
  runIn?: AlertRunInPolicy;
  /**
   * OPTIONAL. A heavier variant of the same panel, for a tier above same-day.
   *
   * BEFORE YOU NEED IT carries three semantic tiers — routine, same-day and
   * immediately — declared in its own QA record, but only two visual levels
   * existed. Giving the top tier the SAME box as same-day would assert that
   * "tell somebody today" and "get medical help immediately" are equivalent,
   * which is worse than leaving it unmarked: it is a false equivalence rather
   * than a missing one.
   *
   * Two channels separate it, and neither is colour, because the interior
   * prints black and a reader may be holding a photocopy: the rule weight
   * doubles, and the label carries the drawn flag the urgent-heading treatment
   * already uses.
   *
   * Absent means no variant, no extra class and no extra stylesheet rule — an
   * approved standard is never edited to add a capability it was not approved
   * with.
   */
  emphatic?: {
    /** Border width for the variant. The base panel's `borderPt` is the floor. */
    borderPt: number;
    /** Prefix the label with the drawn alert flag. */
    flag: boolean;
  };
}

/**
 * QUICK-ANSWER INDEX — a scanning component, not prose.
 *
 * This book ends with an index of ~120 question/answer entries, each authored
 * on its own line. Markdown treats a single newline as a soft break, so the
 * renderer joined them: five separate emergency entries — testicular pain,
 * self-harm, an adult asking a child to keep secrets, sextortion, not feeling
 * safe at home — set as one continuous justified paragraph. The most
 * safety-critical block in the book was the least scannable thing on the page.
 *
 * This is NOT book-wide soft-break preservation, which would repaginate
 * everything and change prose the author wrote as prose. It is scoped
 * STRUCTURALLY, to sections named here, where the LINE is the unit of meaning.
 *
 * Nor is it inferring structure from styling — the distinction that left
 * bold-lead-in numbered steps alone. There, structure would have been invented
 * from formatting. Here the author wrote real line breaks and the renderer was
 * discarding them.
 */
export interface QuickAnswerIndexPolicy {
  enabled: boolean;
  /** Section titles rendered as an index. Compared case-insensitively. */
  sectionTitles: readonly string[];
  /** Space between entries, in em. Compact: this is a lookup table. */
  entrySpacingEm: number;
  /**
   * Ragged right. Justifying one- and two-line entries opens rivers of word
   * space, and an index is scanned down its left edge rather than read across.
   */
  justify: boolean;
  /** Keep a question with its answer (`break-inside: avoid`). */
  keepEntryTogether: boolean;
  /**
   * Category headings that carry an alert mark.
   *
   * The manuscript flagged its emergency category with a 🚩, but stage-1
   * ingestion strips emoji from every book by design, so the marker was gone
   * before typesetting ever saw it and the most urgent category in the index
   * looked like all the others. Reinstated here as a drawn B&W symbol, keyed to
   * the heading text — the same convention `alertPanel.headings` already uses.
   * The manuscript is untouched.
   */
  urgentHeadings: readonly string[];
}

/**
 * LONG-TOKEN WRAPPING — where a line is allowed to break inside a long,
 * unspaced run of characters.
 *
 * A URL is one token. At a 4.6in measure a 120-character source link is roughly
 * 1.7x the column, and with nothing to break on it simply runs out of the text
 * block and off the page. DIRT RICH's `Where I Checked` carries 65 of them, so
 * this is the difference between a printable back matter and an unprintable one.
 *
 * ─── WHY BREAK OPPORTUNITIES, NOT `overflow-wrap` ─────────────────────────
 * `overflow-wrap: break-word` breaks wherever the line happens to end, so a URL
 * splits mid-word and reads as two broken fragments. Publishers break URLs AFTER
 * structural punctuation — a slash, a dot, a hyphen — so each fragment still
 * reads as part of an address. That is a decision about WHERE, which CSS has no
 * way to express, so the break opportunities are placed in the markup as `<wbr>`
 * and the browser chooses among them.
 *
 * `breakAnywhereFallback` is the last resort for a token with no punctuation at
 * all to break on: better an ugly break than ink outside the trim.
 *
 * OPTIONAL on a standard, and absent means `none` — the behaviour every book
 * shipped with. An existing standard is not edited to add it.
 */
export interface LongTokenWrappingPolicy {
  /**
   * `none`               leave long tokens alone (what shipped).
   * `after-punctuation`  break opportunities after / . - ? & = _ # , ; :
   * `anywhere`           any character boundary. Blunt; for tabular matter.
   */
  mode: 'none' | 'after-punctuation' | 'anywhere';
  /** Only tokens at least this long are touched. Ordinary prose is untouched. */
  minTokenLength: number;
  /** Allow an ugly mid-token break when a long token offers no other. */
  breakAnywhereFallback: boolean;
}

/**
 * TABLES — a real tabular grid, not prose.
 *
 * The typesetter had no table capability at all. A GFM pipe table fell through
 * to the paragraph branch and printed as rows of literal `|` characters, so a
 * book with tables could not be set. DIRT RICH carries three, including a 7x22
 * crop chart its own text calls the most-consulted page in the book.
 *
 * ─── WHY THIS IS OPTIONAL ─────────────────────────────────────────────────
 * Absent means pipe rows keep falling through to prose, exactly as before. That
 * matters more than it looks: the whole-page-track manuscripts DO contain pipe
 * tables (National Parks 46 rows, the two Wildlands volumes 35 and 22). They do
 * not use this renderer today, but making tables opt-in means that if one is
 * ever typeset, it cannot silently change shape because a capability arrived
 * underneath it.
 *
 * `typePt` is deliberately its own size rather than a scale of `bodyPt`: a table
 * is scanned, not read, and it sets tighter than running text at the same
 * nominal size.
 */
export interface TypesetTableStyles {
  /** Table type size in points. Independent of `bodyPt` — see above. */
  typePt: number;
  /** Padding inside each cell, in em of the table's own size. */
  cellPaddingEm: number;
  /** Rule under the header row. The one heavy line in the table. */
  headerRulePt: number;
  /** Hairline between body rows. 0 for an open, ruleless table. */
  rowRulePt: number;
  /**
   * `keep-together` forbids a page break inside the table. Correct for a
   * reference table that must be readable in one view, and the reason DIRT
   * RICH's Table C.1 is specified not to break across a turn.
   * `allow-break` lets a long table run over pages.
   */
  breakPolicy: 'keep-together' | 'allow-break';
  /** Repeat the header on each page. Only meaningful with `allow-break`. */
  repeatHeader: boolean;
  /**
   * Above this many columns, a table is SET AS STACKED UNITS instead of a grid.
   *
   * ─── WHY A TABLE SOMETIMES CANNOT BE A TABLE ────────────────────────────
   * A grid divides one fixed measure between its columns, so past a certain
   * count each column is narrower than the words inside it. 7 NATIONAL PARKS
   * carries a five-column permit table whose widest cell reads "Timed Entry +
   * Bear Lake Road if your day touches the Bear Lake corridor; plain Timed Entry
   * for everywhere else". At the 4.625in measure of a 6x9 that column is under
   * an inch — roughly eleven characters — and the row sets as a vertical smear
   * of one-word lines. There is no trim at which it works.
   *
   * The alternative was sending the table back to be reworded, which is the
   * wrong direction of travel: the manuscript is verified text with a claim
   * record behind every sentence, and layout does not get to reach into it. So
   * the transformation happens HERE, in presentation, where it belongs.
   *
   * ─── WHAT STACKING DOES ─────────────────────────────────────────────────
   * Each row becomes one unit: the FIRST column is the unit's name, and every
   * other column becomes a labelled field beneath it, the label taken from that
   * column's header. Every authored cell is emitted, including empty ones — the
   * same rule the grid follows, for the same reason. No cell text is altered,
   * merged, abbreviated or dropped. Presentation only.
   *
   * Deterministic: the same table at the same threshold always produces the same
   * markup, so a book cannot stack on one build and grid on the next.
   *
   * `null` disables the fallback and every table stays a grid.
   */
  stackWhenColumnsExceed: number | null;
  /** Type size for a stacked field's label. Absent falls back to `typePt`. */
  stackedLabelPt?: number;
}

/**
 * PREFORMATTED / FENCED BLOCKS — content whose SHAPE is its meaning.
 *
 * A fenced block in a manuscript is a diagram made of characters: a site plan, a
 * layout sketch, an aligned figure. Reflowed as prose it stops meaning anything.
 * The typesetter had no fence handling, so a fence fell through to the paragraph
 * branch and its alignment was destroyed — the same corruption Manuscript
 * Studio's `layout-export.ts` already inflicted on DIRT RICH's Appendix E.
 *
 * ─── THE FONT IS PART OF THIS CONTRACT ────────────────────────────────────
 * `family` MUST name a face vendored in `backend/assets/fonts`. A generic
 * `monospace` would resolve to whatever the render host happens to have, which
 * is precisely the non-determinism the vendored-font rule exists to prevent.
 *
 * And a monospace face is not sufficient on its own: the face must also CARRY
 * the glyphs. Measured on DIRT RICH's Appendix E, all eleven currently vendored
 * faces are missing 18 of its 22 non-ASCII characters — every box-drawing and
 * block-element glyph. Naming a face here that cannot draw the content produces
 * a page of tofu, silently. Check coverage before pinning one.
 */
export interface TypesetPreformattedStyles {
  /** A family vendored in `backend/assets/fonts`. Never a generic keyword. */
  family: string;
  typePt: number;
  /** Leading, as a multiple. Tight: these are diagrams, not reading matter. */
  lineHeight: number;
  /**
   * `as-set`            print at `typePt` and let a wide block overrun.
   * `shrink-to-measure` scale down so the widest line fits the text block.
   */
  fit: 'as-set' | 'shrink-to-measure';
  /** Never split the block across a page. A half-diagram is not a diagram. */
  keepTogether: boolean;
  paddingEm: number;
}

/**
 * CHECKLIST — a list the reader is meant to TICK, with a real printed box.
 *
 * The manuscript writes these as GFM task items (`- [ ] Sun mapped at four
 * times of day`). Without this policy the bullet branch treats `[ ]` as ordinary
 * text, so the page prints a literal open bracket, a space and a close bracket
 * next to a bullet — which is not a checkbox, and DIRT RICH's Appendix D says in
 * its own text that the reader is meant to tick them.
 *
 * The box is DRAWN from the standard rather than typed as a glyph: the ballot
 * characters (U+2610 and friends) are missing from every vendored text face, so
 * a typed box would fall back to whatever the render host had, or to nothing.
 * The same reasoning as the arrow and flag glyphs elsewhere in the renderer.
 *
 * OPTIONAL. Absent means task items render exactly as they always did.
 */
export interface TypesetChecklistStyles {
  /** Box edge length, in em of the item's type size. */
  boxSizeEm: number;
  /** Rule weight of the box, in points. Thin enough not to shout. */
  boxStrokePt: number;
  /** Gap between the box and the item text, in em. */
  boxGapEm: number;
  /** Space between items, in em. Ticking needs a little more room than prose. */
  itemSpacingEm: number;
  /** Keep an item and its box together across a page break. */
  keepItemTogether: boolean;
}

export interface TypesetBlockStyles {
  /** Printed glyphs for a scene break, e.g. "* * *". */
  sceneBreakMark: string;
  sceneBreakLetterSpacingEm: number;
  /**
   * What to do with a horizontal rule that sits directly against a heading.
   *
   * A scene break's job is to separate two passages of PROSE. A rule with a
   * heading immediately on either side separates nothing the heading does not
   * already separate, so printing it puts a row of asterisks above the heading
   * for no reader benefit.
   *
   * Some manuscripts use the rule as a STRUCTURAL divider rather than as a scene
   * break, and then this matters a great deal. 7 NATIONAL PARKS carries 128 rule
   * runs, of which 108 fall immediately before a heading and the remaining 20
   * immediately after one — every single rule in the book is structural, and
   * printing them would have set 128 asterisk rows through a 130-page interior.
   *
   * `print` is the original behaviour and the default for every standard that
   * existed before this field: a rule always prints. `drop-at-heading` suppresses
   * only the rules touching a heading and leaves genuine mid-prose scene breaks
   * exactly as they are.
   */
  sceneBreakAtHeading?: 'print' | 'drop-at-heading';
  listIndentEm: number;
  listItemSpacingEm: number;
  /**
   * Callout / blockquote treatment. Markdown "> " lines become a styled block
   * rather than a paragraph containing a literal ">".
   */
  callout: {
    /** Rule on the binding side of the block. */
    borderLeftPt: number;
    paddingLeftEm: number;
    marginYEm: number;
    italic: boolean;
    /** Point size relative to bodyPt. */
    scale: number;
  };
}

/**
 * How much text a heading drags with it, so a page break cannot strand it.
 *
 * A heading bound to the paragraph below it is enough ONLY when that paragraph
 * runs to more than one line. When it is a single line the whole unit still fits
 * at the foot of a page and the reader gets a heading, one line, and a page
 * turn — the same defect, one line further on. Pulling one more paragraph into
 * the unit closes it without leaving a hole.
 *
 * ─── WHY THIS IS PER-STANDARD AND NOT A SHARED CONSTANT ──────────────────────
 * "One line" is a number of characters, and a number of characters is a function
 * of the MEASURE. It is not portable between books.
 *
 * It shipped once as a shared `ONE_LINE_CHARS = 95`, measured off 7 NATIONAL
 * PARKS at 6x9. NO ONE TOLD ME THAT sets 5.5x8.5 on a 4.375in measure where the
 * longest line in 170 pages is 76 characters — nothing in that book can reach 95,
 * so every heading-plus-paragraph pair qualified. It fired in 113 places, reflowed
 * 24 pages and pushed two approved illustrations off their pages.
 *
 * So the threshold lives with the standard that was measured for it. A standard
 * that does not set it keeps the older behaviour exactly, which is what every
 * book frozen before this existed was built with.
 */
/**
 * What the DISPLAY heading does with a drawn mark — an arrow, a flag, a warning
 * triangle.
 *
 * The running head and the contents entry always drop them; a CSS string cannot
 * carry an SVG, and a transliterated "->" printed in a margin reads as a mistake.
 * The display heading is the one place where either answer is defensible, so it
 * belongs to the standard rather than to the renderer.
 *
 * ABSENT MEANS 'draw', which is what every book frozen before this existed was
 * built with. An approved standard is never edited to change it — a new version is.
 */
export type HeadingDrawnMarks = 'draw' | 'strip';

export interface HeadingBindPolicy {
  /**
   * Bind a SECOND paragraph when the first is no longer than this many
   * characters. Measure it on the standard's own trim, never inherit it.
   */
  extraParagraphUnderChars: number;
}

/**
 * CONTENTS LIST — how tightly the entries set.
 *
 * OPTIONAL, and absent means exactly what it meant before this existed. A
 * contents page is a LOOKUP, not running prose, and it sets tighter than body
 * text for the same reason a table does; but that is a judgement a book class
 * makes, not one the front-matter generator should make for every book on the
 * platform.
 *
 * The number that forced this: BEFORE YOU NEED IT lists 26 sections. At the
 * generator's hardcoded 0.62em, 21 fitted on the contents page and FIVE spilled
 * onto a second leaf that was then 82% white — the emptiest page in the book, on
 * a page whose whole job is to be scanned in one look.
 */
export interface TypesetContentsPolicy {
  /**
   * Space below each entry, in em. The generator's own value is 0.62; anything
   * lower sets the list more compactly without touching the type size.
   */
  entrySpacingEm: number;
}

export interface TypesetLayoutStandard {
  /** Versioned id, e.g. "educational-nonfiction-typeset@1". Never a bare name. */
  id: string;
  label: string;
  /** Human note on what this standard is for, shown in the operator picker. */
  description: string;
  /** The trim this standard was designed and approved against. */
  trim: { widthIn: number; heightIn: number; bleedIn: number };
  margins: TypesetMarginPolicy;
  type: TypesetTypeScale;
  paragraphs: TypesetParagraphPolicy;
  opener: TypesetChapterOpener;
  /**
   * Where each KIND of section begins. Role-aware on purpose: a chapter opening
   * on a recto is a premium convention worth a blank verso; a two-paragraph
   * back-matter note is not. Forcing every section to a recto cost this book
   * three blank pages in its last nine.
   *
   * Keyed by section role, not by title, so it holds for any book of the class
   * instead of naming SOURCES / ABOUT THE AUTHOR and friends.
   */
  sectionStart: {
    front: 'recto' | 'page';
    chapter: 'recto' | 'page';
    back: 'recto' | 'page';
  };
  /**
   * Operator toggle for CHAPTERS only, overriding `sectionStart.chapter` for a
   * single render. Front and back matter keep the standard's policy — the
   * toggle is about the premium chapter convention, not about back matter.
   */
  chaptersStartRecto: boolean;
  /**
   * OPTIONAL. Absent means a heading binds to exactly one following paragraph,
   * which is how every book rendered before this existed. An approved standard
   * is never edited to add it — a new version is.
   */
  headingBind?: HeadingBindPolicy;
  /**
   * OPTIONAL. Absent means 'draw'. See HeadingDrawnMarks.
   */
  headingDrawnMarks?: HeadingDrawnMarks;
  furniture: TypesetPageFurniture;
  blocks: TypesetBlockStyles;
  terminalMicroSection: TerminalMicroSectionPolicy;
  chapterTakeaway: ChapterTakeawayPolicy;
  alertPanel: AlertPanelPolicy;
  quickAnswerIndex: QuickAnswerIndexPolicy;
  /**
   * OPTIONAL. Absent means `none`, which is exactly how every book rendered
   * before this existed — an approved standard is never edited to add a
   * capability it was not approved with.
   */
  longTokens?: LongTokenWrappingPolicy;
  /**
   * OPTIONAL. Absent means the front-matter generator's own contents spacing,
   * so every standard that does not declare this renders identically.
   */
  contents?: TypesetContentsPolicy;
  /**
   * OPTIONAL. Absent means pipe rows are not read as tables — the behaviour
   * every shipped book has. See `TypesetTableStyles`.
   */
  tables?: TypesetTableStyles;
  /**
   * OPTIONAL. Absent means fenced blocks are not recognised — the behaviour
   * every shipped book has. See `TypesetPreformattedStyles`.
   */
  preformatted?: TypesetPreformattedStyles;
  /**
   * OPTIONAL. Absent means `- [ ]` items render as ordinary bullets with the
   * brackets printed as text — the behaviour every shipped book has.
   */
  checklist?: TypesetChecklistStyles;
}
