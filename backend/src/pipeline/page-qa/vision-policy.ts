/**
 * VISION POLICY — where observations become classifications.
 *
 * The model reported what it saw. This decides what it means, using the page's
 * structural role, which the model was deliberately never told.
 *
 * ─── WHY THIS IS CODE AND NOT A PROMPT ────────────────────────────────────
 * Role reasoning inside the model produced two failures in four attempts: it
 * excused a BODY page with half of it erased, then condemned pages with an
 * ordinary bottom margin. The rules could not be inspected, tested, or fixed
 * without changing the answer to everything else at the same time.
 *
 * Here they are ordinary branches with unit tests. A wrong call is a bug someone
 * can find and correct, not a sentence to be reworded and re-run at cost.
 *
 * ─── ROLE MODIFIES INTERPRETATION; IT IS NOT A BLANKET EXCUSE ─────────────
 * CHAPTER_END may legitimately end high on the page. It may not contain a
 * rendering defect, a stranded heading or a split panel. Every role gets the
 * whitespace tolerance it has earned and nothing else.
 */
import type { PageRole } from './page-roles.js';
import type { PageObservations } from './vision-observations.js';

export type VisionClassification = 'HARD_FAIL' | 'REVIEW' | 'EXPECTED' | 'CLEAN';

export interface PolicyFinding {
  code: string;
  classification: VisionClassification;
  /** The observed evidence this rests on, so a wrong call can be argued with. */
  evidence: string;
  suggests?: 'text' | 'layout' | 'headingDisplay' | 'runningHead' | 'illustration';
}

export interface PolicyResult {
  page: number;
  role: PageRole;
  findings: PolicyFinding[];
  /** Worst classification present. CLEAN when nothing fired. */
  overall: VisionClassification;
  /** The model's own opinion, recorded but never authoritative. */
  modelConcern: PageObservations['visualConcern'];
}

/**
 * How far down the page content may stop before it is worth remarking on.
 *
 * A page whose text runs to the normal bottom margin reports about 88-95, so a
 * BODY threshold of 70 leaves ordinary margin well clear while still catching a
 * page that gives up half way. The roles that are sparse by design have no
 * threshold at all: their whitespace IS the design.
 */
const CONTENT_END_FLOOR: Partial<Record<PageRole, number>> = {
  BODY: 70,
  APPENDIX: 65,
  CONTENTS: 40,
  SOURCES: 40,
};

/** Roles whose running text can meaningfully have a widow or an orphan. */
const PROSE_ROLES: PageRole[] = ['BODY', 'CHAPTER_OPENER', 'CHAPTER_END', 'APPENDIX'];

/** Roles that should carry a folio. */
const FOLIO_ROLES: PageRole[] = ['BODY', 'CHAPTER_OPENER', 'CHAPTER_END', 'APPENDIX', 'SOURCES', 'CONTENTS'];

/**
 * EACH LAYER JUDGES WHAT IT IS GOOD AT.
 *
 * Vision measures fill and spots breakage reliably: it correctly reported "content
 * ends 60% down" on a page with its bottom erased, and told the same page apart
 * from an ordinary one.
 *
 * It is NOT reliable on line-level flow. Asked whether a paragraph begins on the
 * last line, it said yes about a perfectly ordinary page, and called a heading
 * stranded on a chapter ending that simply stopped. Both were false positives in
 * tuning. That is not surprising: those judgements need line coordinates, and the
 * deterministic layer HAS the line coordinates.
 *
 * So a vision-only flow signal is recorded as a note, not raised as a defect,
 * unless the deterministic pass measured the same thing on the same page. Vision
 * corroborates a measurement; it does not replace one.
 */
export function applyVisionPolicy(
  obs: PageObservations,
  role: PageRole,
  /** Deterministic codes already raised for this page, e.g. ["ORPHAN"]. */
  deterministicCodes: readonly string[] = [],
): PolicyResult {
  const findings: PolicyFinding[] = [];
  const add = (
    code: string,
    classification: VisionClassification,
    evidence: string,
    suggests?: PolicyFinding['suggests'],
  ) => findings.push({ code, classification, evidence, suggests });

  // ── 1. Unmistakable breakage. Role never excuses this. ──────────────────
  if (obs.renderingDefect.present) {
    add(
      'RENDERING_DEFECT',
      'HARD_FAIL',
      `${obs.renderingDefect.description || 'reported'}${obs.renderingDefect.region ? ` (${obs.renderingDefect.region})` : ''}`,
      'text',
    );
  }
  if (obs.balance === 'COLLISION_OR_CLIPPING') {
    add('COLLISION_OR_CLIPPING', 'HARD_FAIL', 'content overlapping or cut off');
  }
  if (obs.panel === 'PANEL_SPLIT_CONFUSING') {
    add('PANEL_SPLIT', 'REVIEW', 'a panel reads as two unrelated boxes', 'layout');
  }

  // ── 2. Furniture. ───────────────────────────────────────────────────────
  if (role === 'PARITY_BLANK') {
    if (obs.structureSeen.folio || obs.structureSeen.runningHead) {
      add('FURNITURE_ON_BLANK', 'HARD_FAIL', 'a page that must be empty carries a folio or running head');
    }
    // Nothing else applies: an intentionally blank page has no composition.
    return finish(obs, role, findings);
  }
  /**
   * NO MISSING_RUNNING_HEAD RULE, DELIBERATELY.
   *
   * One was added to catch a solid bar drawn over the furniture, and it cost two
   * false positives out of seven good pages: the model simply does not always
   * report a running head it can see. A bar over the furniture is breakage and is
   * caught as a RENDERING_DEFECT, which is where it belongs. A rule that trades
   * one catch for two false alarms makes the whole report less trusted.
   */
  if (FOLIO_ROLES.includes(role) && !obs.structureSeen.folio) {
    add('MISSING_FOLIO', 'REVIEW', `no page number visible on a ${role} page`, 'runningHead');
  }

  // ── 3. Fill, interpreted by role. ───────────────────────────────────────
  const floor = CONTENT_END_FLOOR[role];
  if (floor === undefined) {
    // CHAPTER_OPENER, PART_DIVIDER, CHAPTER_END, FRONT_MATTER, PLATE.
    if (obs.fill.contentEndsAtPercent < 80) {
      add(
        'SPARSE_BY_DESIGN',
        'EXPECTED',
        `content ends ${obs.fill.contentEndsAtPercent}% down, which is correct for a ${role}`,
      );
    }
  } else if (obs.fill.contentEndsAtPercent < floor) {
    // A hole in the MIDDLE of a page is a different, worse thing from a page
    // that simply ends early, and it is not explained by any role.
    const middle = obs.fill.emptyRegionLocation === 'MIDDLE';
    const severe = obs.fill.contentEndsAtPercent < floor - 15;
    add(
      middle ? 'UNEXPLAINED_MIDDLE_GAP' : 'PAGE_STOPS_EARLY',
      severe || middle ? 'HARD_FAIL' : 'REVIEW',
      `content ends ${obs.fill.contentEndsAtPercent}% down a ${role} page; largest empty band ${obs.fill.largestEmptyRegionPercent}% (${obs.fill.emptyRegionLocation})`,
      'layout',
    );
  }

  // ── 4. Headings. ────────────────────────────────────────────────────────
  if (obs.headingRelationship === 'STRANDED_FROM_ITS_CONTENT') {
    const corroborated = deterministicCodes.includes('STRANDED_HEADING');
    add(
      'STRANDED_HEADING',
      corroborated ? 'REVIEW' : 'EXPECTED',
      corroborated
        ? 'a heading at the foot with its text overleaf, measured and seen'
        : 'vision reported a stranded heading; the measured pass did not, so it is a note only',
      'layout',
    );
  }
  if (obs.headingRelationship === 'UNUSUALLY_LARGE_GAP') {
    // A large gap above a heading is hierarchy. It is only notable when the
    // model also saw no heading structure to justify it.
    if (!obs.structureSeen.subheading && !obs.structureSeen.chapterTitle) {
      add('GAP_WITHOUT_HEADING', 'REVIEW', 'an unusually large gap with no heading to explain it', 'layout');
    } else {
      add('HEADING_SPACING', 'EXPECTED', 'a large gap above a heading, which is hierarchy');
    }
  }

  // ── 5. Text flow, only where the text is prose. ──────────────────────────
  if (PROSE_ROLES.includes(role)) {
    /**
     * AN ORPHAN NEEDS A PAGE TURN TO BE AN ORPHAN.
     *
     * A paragraph beginning on the last line only matters when that line is at
     * a page break the reader has to cross. On a chapter opener whose text ends
     * at 42% there is no break to cross, and the model reporting APPARENT_ORPHAN
     * there produced two false positives out of seven good pages in the first
     * tuning run. The observation is not wrong; it is simply not a defect on a
     * page that was never full.
     */
    const pageIsFull = obs.fill.contentEndsAtPercent >= 80;
    const flow = (code: string, seen: boolean, what: string) => {
      if (!seen) return;
      const corroborated = deterministicCodes.includes(code);
      add(
        code,
        corroborated ? 'REVIEW' : 'EXPECTED',
        corroborated
          ? `${what}, measured and seen`
          : `vision reported ${code.toLowerCase()}; the measured pass did not, so it is a note only`,
        'layout',
      );
    };
    flow('ORPHAN', obs.textFlow === 'APPARENT_ORPHAN' && pageIsFull, 'a paragraph begins on the last line of a full page');
    flow('WIDOW', obs.textFlow === 'APPARENT_WIDOW', 'a short fragment stranded at the top');
    if (obs.textFlow === 'SHORT_STRANDED_PARAGRAPH' && obs.panel !== 'LIST_COMPOSITION_INTENTIONAL') {
      add('STRANDED_PARAGRAPH', 'REVIEW', 'a lone short paragraph isolated by space', 'layout');
    }
  }

  return finish(obs, role, findings);
}

function finish(obs: PageObservations, role: PageRole, findings: PolicyFinding[]): PolicyResult {
  const worst: VisionClassification = findings.some((f) => f.classification === 'HARD_FAIL')
    ? 'HARD_FAIL'
    : findings.some((f) => f.classification === 'REVIEW')
      ? 'REVIEW'
      : findings.length
        ? 'EXPECTED'
        : 'CLEAN';
  return { page: obs.page, role, findings, overall: worst, modelConcern: obs.visualConcern };
}

/** Did the policy consider this page defective? EXPECTED and CLEAN do not count. */
export const isDefect = (r: PolicyResult): boolean => r.overall === 'HARD_FAIL' || r.overall === 'REVIEW';
