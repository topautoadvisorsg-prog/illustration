/**
 * EVIDENCE-FIRST PAGE VISION — the model describes, the policy decides.
 *
 * ─── WHY THE PREVIOUS PROFILE FAILED ──────────────────────────────────────
 * It asked the model for a VERDICT: good or poor. That put role interpretation
 * inside the model, and the model applied the wrong exception. Told "a chapter
 * may end part way down", it excused a BODY page with 45% of it erased. Told the
 * opposite, it condemned pages that merely had a normal bottom margin. Four
 * prompt versions oscillated between the two, because the question itself was
 * wrong.
 *
 * A direct probe settled the cause. Asked plainly, the same model answered
 * "roughly 45% of the page height is blank below the last line of text" — an
 * accurate, useful observation. It can SEE perfectly well. It was the judging
 * that was unreliable.
 *
 * So the split is now:
 *
 *     page image  ->  VISION: what is observably on this page
 *                 ->  role + deterministic measurements
 *                 ->  POLICY: what that means
 *                 ->  classification
 *
 * The model reports where the text stops and what structures it can see. It does
 * not decide whether that is acceptable, because acceptability depends on the
 * page's role, and role reasoning is deterministic code that can be tested.
 *
 * `visualConcern` survives as a secondary opinion. It is recorded, and it never
 * overrides the policy.
 */
import type { VisionProfile } from '../../services/vision/vision-core.js';

/**
 * v5. The schema and the task both changed, so every cached answer from the
 * judgment profile (v1-v4) misses. Those answers must never masquerade as
 * results from this one.
 */
export const PAGE_EVIDENCE_PROFILE_VERSION = 6;

export type EmptyRegionLocation = 'BOTTOM' | 'MIDDLE' | 'TOP' | 'DISTRIBUTED' | 'NONE';
export type HeadingRelationship =
  | 'NO_HEADING'
  | 'ATTACHED_TO_FOLLOWING_CONTENT'
  | 'STRANDED_FROM_ITS_CONTENT'
  | 'NORMAL_HIERARCHY_SPACING'
  | 'UNUSUALLY_LARGE_GAP';
export type TextFlow =
  | 'VISUALLY_NORMAL'
  | 'APPARENT_ORPHAN'
  | 'APPARENT_WIDOW'
  | 'SHORT_STRANDED_PARAGRAPH';
export type PanelState =
  | 'NO_PANEL'
  | 'PANEL_INTACT'
  | 'PANEL_SPLIT_CONFUSING'
  | 'LIST_COMPOSITION_INTENTIONAL'
  | 'EXCESSIVE_INTERNAL_WHITESPACE';
export type PageBalance =
  | 'BALANCED'
  | 'TOP_HEAVY'
  | 'BOTTOM_HEAVY'
  | 'IMAGE_TEXT_IMBALANCE'
  | 'COLLISION_OR_CLIPPING';
export type VisualConcern = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface PageObservations {
  page: number;
  fill: {
    /** How far down the page substantive content ends, 0 at the top, 100 at the foot. */
    contentEndsAtPercent: number;
    /** The tallest visually empty band, as a percentage of page height. */
    largestEmptyRegionPercent: number;
    /** Roughly how much of the page carries nothing. */
    unusedPercent: number;
    emptyRegionLocation: EmptyRegionLocation;
  };
  structureSeen: {
    chapterTitle: boolean;
    subheading: boolean;
    calloutPanel: boolean;
    list: boolean;
    table: boolean;
    illustration: boolean;
    sceneBreakOrnament: boolean;
    folio: boolean;
    runningHead: boolean;
  };
  headingRelationship: HeadingRelationship;
  textFlow: TextFlow;
  panel: PanelState;
  balance: PageBalance;
  renderingDefect: { present: boolean; description: string; region: string };
  /** Secondary. Recorded, never authoritative. */
  visualConcern: VisualConcern;
  concernReason: string;
}

export const PAGE_EVIDENCE_PROFILE: VisionProfile = {
  id: 'page-evidence',
  version: PAGE_EVIDENCE_PROFILE_VERSION,
  reviewWidthPx: 900,
  systemPrompt: [
    'You are examining ONE page of a printed book and REPORTING WHAT YOU SEE.',
    '',
    'You are not deciding whether the page is acceptable. Something else does that,',
    'using your observations plus information you do not have. Your job is to be an',
    'accurate pair of eyes.',
    '',
    'Report only what is visible. Do not read or summarise the prose. Do not guess',
    'what kind of page this is or what the book intended. Do not soften an',
    'observation because you think the page is probably fine, and do not exaggerate',
    'one because you think something is probably wrong.',
    '',
    'MEASURING FILL. Look at where the last piece of substantive content sits —',
    'body text, a heading, a table, a panel or a picture. Ignore the page number and',
    'the running head, which are furniture and sit in the margins.',
    '  contentEndsAtPercent          0 means at the very top, 100 at the very foot.',
    '                                A page whose text runs to the normal bottom',
    '                                margin is about 88-95. A page whose text stops',
    '                                halfway is about 50.',
    '  largestEmptyRegionPercent     the tallest continuous empty band, as a',
    '                                percentage of the whole page height.',
    '  unusedPercent                 roughly how much of the page carries nothing.',
    '  emptyRegionLocation           where that band is.',
    '',
    'STRUCTURE SEEN. Simple true or false for each. A chapter title is large display',
    'type opening a chapter. A subheading is smaller than that and larger or bolder',
    'than body text. A callout panel is boxed or ruled off from the text. A',
    'scene-break ornament is a short centred row of asterisks or dots.',
    '',
    'HEADING RELATIONSHIP. Only about headings you can actually see:',
    '  NO_HEADING                     there is none',
    '  ATTACHED_TO_FOLLOWING_CONTENT  a heading with its text directly beneath it',
    '  STRANDED_FROM_ITS_CONTENT      a heading at the foot with nothing following',
    '  NORMAL_HIERARCHY_SPACING       ordinary space above a heading',
    '  UNUSUALLY_LARGE_GAP            far more space than the other headings here',
    '',
    'TEXT FLOW. How the running text begins and ends:',
    '  VISUALLY_NORMAL                nothing stands out',
    '  APPARENT_ORPHAN                a paragraph begins on the last line',
    '  APPARENT_WIDOW                 a short fragment alone at the top',
    '  SHORT_STRANDED_PARAGRAPH       a lone short paragraph isolated by space',
    '',
    'RENDERING DEFECT. Unmistakable breakage:',
    '  - text drawn over other text',
    '  - text running off the page edge',
    '  - a box, panel or table visibly cut off',
    '  - visible markup characters, or empty squares where glyphs should be',
    '  - A SOLID BLOCK OR BAR OF INK covering text, a running head, a page number,',
    '    or part of the text block. Report this even if it could be a design',
    '    element: a block that obscures content is breakage, and something else',
    '    decides whether it was intended.',
    '  - any area of the page unexpectedly filled with solid colour',
    '',
    'Ordinary whitespace is NOT a rendering defect. An empty page is not a defect.',
    '',
    'Finally, and only as a secondary opinion, give visualConcern and one sentence',
    'saying why. It carries no weight on its own.',
    '',
    'Reply with JSON only:',
    '{',
    '  "page": <number>,',
    '  "fill": { "contentEndsAtPercent": <0-100>, "largestEmptyRegionPercent": <0-100>,',
    '            "unusedPercent": <0-100>, "emptyRegionLocation": "BOTTOM"|"MIDDLE"|"TOP"|"DISTRIBUTED"|"NONE" },',
    '  "structureSeen": { "chapterTitle": <bool>, "subheading": <bool>, "calloutPanel": <bool>,',
    '                     "list": <bool>, "table": <bool>, "illustration": <bool>,',
    '                     "sceneBreakOrnament": <bool>, "folio": <bool>, "runningHead": <bool> },',
    '  "headingRelationship": "NO_HEADING"|"ATTACHED_TO_FOLLOWING_CONTENT"|"STRANDED_FROM_ITS_CONTENT"|"NORMAL_HIERARCHY_SPACING"|"UNUSUALLY_LARGE_GAP",',
    '  "textFlow": "VISUALLY_NORMAL"|"APPARENT_ORPHAN"|"APPARENT_WIDOW"|"SHORT_STRANDED_PARAGRAPH",',
    '  "panel": "NO_PANEL"|"PANEL_INTACT"|"PANEL_SPLIT_CONFUSING"|"LIST_COMPOSITION_INTENTIONAL"|"EXCESSIVE_INTERNAL_WHITESPACE",',
    '  "balance": "BALANCED"|"TOP_HEAVY"|"BOTTOM_HEAVY"|"IMAGE_TEXT_IMBALANCE"|"COLLISION_OR_CLIPPING",',
    '  "renderingDefect": { "present": <bool>, "description": "<text>", "region": "<text>" },',
    '  "visualConcern": "NONE"|"LOW"|"MEDIUM"|"HIGH",',
    '  "concernReason": "<one sentence>"',
    '}',
  ].join('\n'),
};

const LOCATIONS: EmptyRegionLocation[] = ['BOTTOM', 'MIDDLE', 'TOP', 'DISTRIBUTED', 'NONE'];
const HEADINGS: HeadingRelationship[] = [
  'NO_HEADING',
  'ATTACHED_TO_FOLLOWING_CONTENT',
  'STRANDED_FROM_ITS_CONTENT',
  'NORMAL_HIERARCHY_SPACING',
  'UNUSUALLY_LARGE_GAP',
];
const FLOWS: TextFlow[] = ['VISUALLY_NORMAL', 'APPARENT_ORPHAN', 'APPARENT_WIDOW', 'SHORT_STRANDED_PARAGRAPH'];
const PANELS: PanelState[] = [
  'NO_PANEL',
  'PANEL_INTACT',
  'PANEL_SPLIT_CONFUSING',
  'LIST_COMPOSITION_INTENTIONAL',
  'EXCESSIVE_INTERNAL_WHITESPACE',
];
const BALANCES: PageBalance[] = ['BALANCED', 'TOP_HEAVY', 'BOTTOM_HEAVY', 'IMAGE_TEXT_IMBALANCE', 'COLLISION_OR_CLIPPING'];
const CONCERNS: VisualConcern[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];

const STRUCTURE_KEYS = [
  'chapterTitle',
  'subheading',
  'calloutPanel',
  'list',
  'table',
  'illustration',
  'sceneBreakOrnament',
  'folio',
  'runningHead',
] as const;

/** Strict. A response that is not the agreed shape is refused, never coerced. */
export function validateObservations(value: unknown): PageObservations | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.page !== 'number') return null;

  const fill = v.fill as Record<string, unknown> | undefined;
  if (!fill || typeof fill !== 'object') return null;
  const pct = (x: unknown): number | null =>
    typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 100 ? x : null;
  const contentEndsAtPercent = pct(fill.contentEndsAtPercent);
  const largestEmptyRegionPercent = pct(fill.largestEmptyRegionPercent);
  const unusedPercent = pct(fill.unusedPercent);
  if (contentEndsAtPercent === null || largestEmptyRegionPercent === null || unusedPercent === null) return null;
  if (typeof fill.emptyRegionLocation !== 'string' || !LOCATIONS.includes(fill.emptyRegionLocation as EmptyRegionLocation))
    return null;

  const st = v.structureSeen as Record<string, unknown> | undefined;
  if (!st || typeof st !== 'object') return null;
  const structureSeen = {} as PageObservations['structureSeen'];
  for (const k of STRUCTURE_KEYS) {
    if (typeof st[k] !== 'boolean') return null;
    structureSeen[k] = st[k] as boolean;
  }

  if (typeof v.headingRelationship !== 'string' || !HEADINGS.includes(v.headingRelationship as HeadingRelationship))
    return null;
  if (typeof v.textFlow !== 'string' || !FLOWS.includes(v.textFlow as TextFlow)) return null;
  if (typeof v.panel !== 'string' || !PANELS.includes(v.panel as PanelState)) return null;
  if (typeof v.balance !== 'string' || !BALANCES.includes(v.balance as PageBalance)) return null;

  const rd = v.renderingDefect as Record<string, unknown> | undefined;
  if (!rd || typeof rd !== 'object' || typeof rd.present !== 'boolean') return null;

  if (typeof v.visualConcern !== 'string' || !CONCERNS.includes(v.visualConcern as VisualConcern)) return null;

  return {
    page: v.page,
    fill: {
      contentEndsAtPercent,
      largestEmptyRegionPercent,
      unusedPercent,
      emptyRegionLocation: fill.emptyRegionLocation as EmptyRegionLocation,
    },
    structureSeen,
    headingRelationship: v.headingRelationship as HeadingRelationship,
    textFlow: v.textFlow as TextFlow,
    panel: v.panel as PanelState,
    balance: v.balance as PageBalance,
    renderingDefect: {
      present: rd.present,
      description: typeof rd.description === 'string' ? rd.description : '',
      region: typeof rd.region === 'string' ? rd.region : '',
    },
    visualConcern: v.visualConcern as VisualConcern,
    concernReason: typeof v.concernReason === 'string' ? v.concernReason : '',
  };
}

/**
 * The user turn.
 *
 * DELIBERATELY BLIND. The page's role is NOT given: role belongs to the policy
 * layer, and telling the model was exactly how the previous profile learned to
 * excuse a broken page. Neither is any hint about whether this page is expected
 * to be good or bad.
 */
export function buildObservationRequest(page: number): string {
  return [
    `Examine page ${page} of a printed book and report what you can see.`,
    'Describe only. Do not judge whether the page is acceptable.',
    `Reply with JSON only, with "page": ${page}.`,
  ].join('\n');
}
