/**
 * PROFILE B — INTERIOR PAGE LAYOUT.
 *
 * The deterministic layer measures. This one looks. They answer different
 * questions and the split is deliberate:
 *
 *   deterministic   "the gap here is 2.03x leading"
 *   vision          "and that is the space above a subhead, which is correct"
 *
 * Vision is never asked to read text back off the page, rewrite prose, or
 * rediscover anything already held structurally. It is asked whether the page
 * looks like a book.
 *
 * IT IS NOT AUTHORITATIVE. A NOT_A_DEFECT verdict rejects a deterministic
 * finding, it does not delete it; a NEW_FINDING is a claim, not a fact.
 * Disagreement between the two layers escalates to a person rather than being
 * resolved by whichever spoke last.
 *
 * THE MODEL IS NOT TOLD WHAT WE HOPE TO HEAR. Deterministic findings are passed
 * as measurements to explain, not as conclusions to confirm, and pages sampled
 * for false-negative calibration are not labelled as expected-clean.
 */
import type { VisionProfile } from '../../services/vision/vision-core.js';

/** Bump when the prompt or the schema changes: it is part of the cache key. */
export const PAGE_LAYOUT_PROFILE_VERSION = 4;

export const PAGE_LAYOUT_PROFILE: VisionProfile = {
  id: 'page-layout',
  version: PAGE_LAYOUT_PROFILE_VERSION,
  // 1000px on the long edge of a 5.5x8.5 page is about 118dpi: enough to judge
  // spacing, stranding and balance, and a fraction of the cost of full size.
  reviewWidthPx: 760,
  systemPrompt: [
    'You are a book typesetter reviewing ONE interior page of a printed book.',
    '',
    'You judge COMPOSITION, not content. Never rewrite, summarise or correct the',
    'prose. Never comment on what the book says. Never transcribe the page.',
    '',
    'What you are looking for:',
    '  - whether the page reads as professionally composed',
    '  - whitespace that looks broken rather than intentional',
    '  - a heading stranded from the text it belongs to',
    '  - a widow or orphan as it actually appears to a reader',
    '  - callouts or panels that look clipped, split confusingly, or unbalanced',
    '  - tables that overflow, collapse, or lose their alignment',
    '  - illustrations that collide, sit oddly, or unbalance the page',
    '  - furniture anomalies: missing or wrong running head or page number',
    '  - anything visually malformed that a measurement would miss',
    '',
    'WHAT A REAL DEFECT LOOKS LIKE. Say so plainly when you see one:',
    '  - a page of running text that STOPS ABRUPTLY part way down, leaving a large',
    '    empty area with no heading, no section ending and no illustration to explain it',
    '  - a single stranded line marooned at the top or bottom of a page',
    '  - a heading sitting at the very foot of a page with its text overleaf',
    '  - text running past the margin, off the page, or over other text',
    '  - a box, panel or table that is visibly clipped or cut off',
    '  - a column or table that has collapsed, overlapped or lost alignment',
    '  - an image overlapping text, or floating with no relationship to it',
    '  - visible markup, placeholder text, or a missing-glyph box',
    '  - a page number or running head that is missing, duplicated or wrong',

    'Be specific and be willing to say POOR. A reviewer who calls everything GOOD',
    'is not reviewing. If a page has an unexplained hole in it, that is a finding',
    'even if the surrounding typography is competent.',

    'INTENTIONAL STRUCTURE IS NOT A DEFECT — BUT ONLY FOR THE RIGHT ROLE.',
    'You are told the structural role of the page. Apply the matching exception and',
    'NO OTHER. An exception used on the wrong role is how a broken page passes.',
    '',
    '  CHAPTER_OPENER  begins low, with space above the heading. Correct.',
    '  PART_DIVIDER    nearly empty, a few words alone. Correct.',
    '  PARITY_BLANK    entirely empty. Correct, and it must carry no folio.',
    '  CHAPTER_END     may stop part way down. Correct.',
    '  CONTENTS        entries, not prose. It has no widows or orphans.',
    '  FRONT_MATTER    sparse by nature.',
    '  BODY            RUNNING TEXT. It should fill its text block. A BODY page',
    '                  that stops part way down, leaving a large blank area with no',
    '                  heading, illustration or section ending to explain it, IS A',
    '                  DEFECT. Report it. Do not excuse it as a chapter ending: a',
    '                  chapter ending would have been given the role CHAPTER_END.',
    '',
    'Space above a subheading is hierarchy, not a hole. A scene-break ornament',
    '(* * *) is typography, not a defect. Those two hold for every role.',
    '',
    'You will sometimes be given measurements taken from the PDF. Treat them as',
    'observations to explain, not as conclusions to agree with. If a measurement',
    'describes something that is visually correct, say NOT_A_DEFECT and say why.',
    'Rejecting a measurement is a useful answer.',
    '',
    'Reply with JSON only, matching exactly:',
    '{',
    '  "page": <number>,',
    '  "overallComposition": "GOOD" | "ACCEPTABLE" | "POOR",',
    '  "findings": [',
    '    {',
    '      "issueCode": "<UPPER_SNAKE_CASE>",',
    '      "verdict": "CONFIRMED" | "LIKELY" | "NOT_A_DEFECT" | "NEW_FINDING" | "UNCERTAIN",',
    '      "severity": "HARD_FAIL" | "REVIEW" | "EXPECTED",',
    '      "confidence": <0.0 to 1.0>,',
    '      "region": "<where on the page, in words>",',
    '      "visualReason": "<what you can see, one or two sentences>",',
    '      "suggestedCorrectionType": "text" | "layout" | "headingDisplay" | "runningHead" | "tocDisplay" | "illustration" | "none"',
    '    }',
    '  ]',
    '}',
    '',
    'HOW MUCH BLANK IS NORMAL. Every page ends above the bottom margin, and the last',
    'line rarely lands exactly on it. Blank space of up to about a fifth of the text',
    'block below the last line is ORDINARY MARGIN and is not a finding. Report a hole',
    'only when the text stops around halfway down or higher, leaving an area a reader',
    'would notice as wrong. Do not report a page that runs nearly to the bottom.',
    '',
    'Before deciding, state to yourself roughly what fraction of the text block is',
    'blank below the last line. If that is more than about a quarter and the role is',
    'BODY, look hard for the reason before calling it GOOD.',
    '',
    'If the page is genuinely well composed, return an empty findings array and say',
    'GOOD. If something is wrong, say so: do not soften it because the rest of the',
    'page is competent. Do not invent findings, and do not suppress real ones.',
  ].join('\n'),
};

export type VisionVerdict = 'CONFIRMED' | 'LIKELY' | 'NOT_A_DEFECT' | 'NEW_FINDING' | 'UNCERTAIN';

export interface VisionFinding {
  issueCode: string;
  verdict: VisionVerdict;
  severity: 'HARD_FAIL' | 'REVIEW' | 'EXPECTED';
  confidence: number;
  region: string;
  visualReason: string;
  suggestedCorrectionType: string;
}

export interface VisionPageReview {
  page: number;
  overallComposition: 'GOOD' | 'ACCEPTABLE' | 'POOR';
  findings: VisionFinding[];
}

const VERDICTS: VisionVerdict[] = ['CONFIRMED', 'LIKELY', 'NOT_A_DEFECT', 'NEW_FINDING', 'UNCERTAIN'];
const SEVERITIES = ['HARD_FAIL', 'REVIEW', 'EXPECTED'];
const COMPOSITIONS = ['GOOD', 'ACCEPTABLE', 'POOR'];

/**
 * Strict validation. A response that is not the agreed shape is REFUSED, not
 * coerced: a half-understood verdict entering a calibration matrix is worse than
 * a recorded failure, because it looks like data.
 */
export function validatePageReview(value: unknown): VisionPageReview | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.page !== 'number') return null;
  if (typeof v.overallComposition !== 'string' || !COMPOSITIONS.includes(v.overallComposition)) return null;
  if (!Array.isArray(v.findings)) return null;

  const findings: VisionFinding[] = [];
  for (const raw of v.findings) {
    if (typeof raw !== 'object' || raw === null) return null;
    const f = raw as Record<string, unknown>;
    if (typeof f.issueCode !== 'string' || !f.issueCode) return null;
    if (typeof f.verdict !== 'string' || !VERDICTS.includes(f.verdict as VisionVerdict)) return null;
    if (typeof f.severity !== 'string' || !SEVERITIES.includes(f.severity)) return null;
    if (typeof f.confidence !== 'number' || f.confidence < 0 || f.confidence > 1) return null;
    findings.push({
      issueCode: f.issueCode,
      verdict: f.verdict as VisionVerdict,
      severity: f.severity as VisionFinding['severity'],
      confidence: f.confidence,
      region: typeof f.region === 'string' ? f.region : '',
      visualReason: typeof f.visualReason === 'string' ? f.visualReason : '',
      suggestedCorrectionType:
        typeof f.suggestedCorrectionType === 'string' ? f.suggestedCorrectionType : 'none',
    });
  }
  return {
    page: v.page,
    overallComposition: v.overallComposition as VisionPageReview['overallComposition'],
    findings,
  };
}

/**
 * The user turn for one page.
 *
 * Measurements are presented as observations. The page's structural role IS
 * given, because withholding it would invite exactly the false positives the
 * role model exists to prevent.
 */
export function buildPageUserText(input: {
  page: number;
  role: string;
  measurements: string[];
  deterministicFindings: Array<{ code: string; detail: string }>;
  hasNeighbours: boolean;
}): string {
  const lines = [
    `This is page ${input.page} of a printed book.`,
    `STRUCTURAL ROLE: ${input.role}. Apply the exception for THIS role and no other.`,
  ];
  if (input.role === 'BODY') {
    lines.push(
      'This is ordinary running text. It should fill its text block. If it stops part',
      'way down with an unexplained blank area, that is a defect and you must report it.',
    );
  }
  if (input.hasNeighbours) {
    lines.push('You are also given the preceding and following pages, for context only. Judge only the page under review.');
  }
  if (input.measurements.length) {
    lines.push('', 'Measurements taken from the PDF:');
    for (const m of input.measurements) lines.push(`  - ${m}`);
  }
  if (input.deterministicFindings.length) {
    lines.push('', 'An automated measurement pass raised the following. Decide whether each is a real');
    lines.push('visual defect or a correct piece of typography that the measurement misread:');
    for (const f of input.deterministicFindings) lines.push(`  - ${f.code}: ${f.detail}`);
  } else {
    lines.push('', 'No automated findings were raised for this page. Judge it on its own merits.');
  }
  lines.push('', `Reply with JSON only, with "page": ${input.page}.`);
  return lines.join('\n');
}
