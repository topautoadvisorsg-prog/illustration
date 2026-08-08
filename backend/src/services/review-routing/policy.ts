/**
 * REVIEW ROUTING POLICY — who reviews which page.
 *
 * Platform-wide, not book-specific. Any title produced as AI-generated page
 * images with manuscript text baked in gets routed the same way.
 *
 * THE RULE, deliberately one line of arithmetic:
 *   readable words >= threshold  ->  HIGH TEXT, AI review
 *   readable words <  threshold  ->  manual operator review
 *
 * No weighted score, no hidden terms. An operator reading "327 words -> AI
 * REVIEW" must be able to confirm the decision by eye. Words-per-block and
 * character count are measured and displayed because they are informative,
 * but they never move the route: the moment routing depends on a formula
 * nobody can check at a glance, the operator loses the ability to audit it.
 *
 * SCOPE — this governs ONLY pages whose final artefact is an AI-generated
 * image with readable text baked into it. Deterministic typeset pages keep
 * machine-readable text and are verified by string comparison; sending those
 * to a vision reviewer would pay attention to re-read text already held
 * exactly. Out-of-scope pages get `inScope: false` and no route.
 *
 * WORD COUNT COMES FROM THE CANONICAL SOURCE TEXT, never from OCR or from what
 * the rendered image appears to say. The route must be knowable before the
 * page is reviewed, and a corrupted render must not be able to change its own
 * routing by corrupting its own word count.
 *
 * ROUTING IS NOT APPROVAL. This says who looks at the page. It says nothing
 * about whether the page is correct, and must never be rendered in the same
 * visual channel as approval state.
 */

/** Layouts whose text is deliberately restructured into panels, steps, or
 *  columns. Beta evidence (2026-08-08): a word-diff reviewer misjudges these —
 *  reviewer v1 reported 54 phantom issues on the operator-approved CH08_P008.
 *  This does NOT remove them from AI review; it adds a manual check on top. */
export const STRUCTURED_LAYOUTS: readonly string[] = [
  'LAYOUT_15_PROGRESSION_STUDY',
  'LAYOUT_16_CUTAWAY_FEATURE',
  'LAYOUT_REFERENCE',
  'LAYOUT_12_DIAGNOSTIC_DIAGRAM',
  'LAYOUT_9_DIAGNOSTIC_DIAGRAM',
  'LAYOUT_7_SCATTERED_VIGNETTES',
];

/**
 * 200 readable words or more routes to AI review. EXACTLY 200 is AI review.
 *
 * Raised from an initial 300 after the blinded visual-QA beta (2026-08): a
 * strong vision model on the forensic pixel-QA prompt reliably caught
 * character-level render corruption, so the cheap instrument can safely cover
 * more of the book. Deliberately NOT encoded with an accuracy claim — the beta
 * was an operator assessment, not a measured platform guarantee.
 */
export const DEFAULT_HIGH_TEXT_WORD_THRESHOLD = 200;

export type ReviewRoute = 'AI_REVIEW' | 'MANUAL_REVIEW';

export interface ReviewRoutingPolicy {
  /** Readable words at or above which a page goes to AI review. */
  highTextWordThreshold: number;
}

export const DEFAULT_POLICY: ReviewRoutingPolicy = {
  highTextWordThreshold: DEFAULT_HIGH_TEXT_WORD_THRESHOLD,
};

export interface PageRoutingInput {
  readableWords: number | null;
  textBlocks?: number | null;
  layoutTemplate?: string | null;
  /** Operator's explicit route choice. Never alters the measurement. */
  reviewRouteOverride?: ReviewRoute | null;
  /** High-risk characteristics seen on the page (tiny labels, diagram text,
   *  visible collision). Escalates toward stronger review; never downgrades. */
  reviewEscalationReason?: string | null;
  /**
   * Does this page's FINAL artefact bake readable text into an AI-generated
   * image? Only those pages are in scope. A deterministically typeset page
   * keeps machine-readable text and is verified by comparing strings, so
   * routing it to a vision reviewer would be spending attention to re-read
   * text we already hold exactly. Defaults to true because that is what this
   * pipeline produces; a typeset pipeline passes false.
   */
  isAiImageTextPage?: boolean;
}

export interface PageRouting {
  route: ReviewRoute;
  /** True when the page cleared the word threshold, regardless of override. */
  isHighText: boolean;
  /** AI review is not sufficient on its own for this page. */
  manualCheckRequired: boolean;
  overridden: boolean;
  /** Promoted to AI review by a high-risk escalation rather than word count. */
  escalated: boolean;
  /** False for pages this policy does not govern (deterministic typeset pages). */
  inScope: boolean;
  /** The measured route, before any operator override. */
  measuredRoute: ReviewRoute;
  readableWords: number | null;
  /** Operator-facing explanation, e.g. "327 readable words". */
  reason: string;
  /** UI badge text, e.g. "HIGH TEXT · AI REVIEW + MANUAL CHECK REQUIRED". */
  label: string;
}

export function classifyReviewRoute(
  input: PageRoutingInput,
  policy: ReviewRoutingPolicy = DEFAULT_POLICY,
): PageRouting {
  const words = input.readableWords;
  const inScope = input.isAiImageTextPage ?? true;
  const wordText = words === null ? 'not yet measured' : `${words} readable words`;
  const blockText =
    input.textBlocks && words ? ` in ${input.textBlocks} blocks (${Math.round(words / input.textBlocks)}/block)` : '';

  if (!inScope) {
    return {
      route: 'MANUAL_REVIEW',
      isHighText: false,
      manualCheckRequired: false,
      overridden: false,
      escalated: false,
      inScope: false,
      measuredRoute: 'MANUAL_REVIEW',
      readableWords: words,
      reason: 'deterministic typeset page — forensic image review does not apply',
      label: 'NOT APPLICABLE',
    };
  }

  // An unmeasured page is not silently promoted to automation.
  const isHighText = words !== null && words >= policy.highTextWordThreshold;
  const byWordCount: ReviewRoute = isHighText ? 'AI_REVIEW' : 'MANUAL_REVIEW';

  // High-risk escalation can only ever strengthen review. It promotes a short
  // page to AI review; it can never pull a long page down to manual.
  const escalated = !!input.reviewEscalationReason && byWordCount === 'MANUAL_REVIEW';
  const measuredRoute: ReviewRoute = escalated ? 'AI_REVIEW' : byWordCount;

  const override = input.reviewRouteOverride ?? null;
  const overridden = override !== null && override !== measuredRoute;
  const route: ReviewRoute = override ?? measuredRoute;

  const structured = !!input.layoutTemplate && STRUCTURED_LAYOUTS.includes(input.layoutTemplate);
  // Secondary requirement layered on top of AI review — never a demotion.
  const manualCheckRequired = route === 'AI_REVIEW' && structured;

  let label: string;
  if (route === 'AI_REVIEW') {
    label = manualCheckRequired ? 'AI REVIEW + MANUAL CHECK REQUIRED' : 'AI REVIEW';
  } else {
    label = 'MANUAL REVIEW';
  }
  if (overridden) label += ' (operator override)';
  else if (escalated) label += ' (escalated)';

  let reason = `${wordText}${blockText}`;
  if (escalated && !overridden) reason += ` — escalated to AI review: ${input.reviewEscalationReason}`;
  if (overridden) {
    reason += ` — measured ${measuredRoute === 'AI_REVIEW' ? 'AI REVIEW' : 'MANUAL REVIEW'}, operator routed to ${route === 'AI_REVIEW' ? 'AI REVIEW' : 'MANUAL REVIEW'}`;
  }

  return { route, isHighText, manualCheckRequired, overridden, escalated, inScope, measuredRoute, readableWords: words, reason, label };
}

/** Counts for the pagination header. */
export interface RoutingSummary {
  total: number;
  aiReview: number;
  manualReview: number;
  manualCheckRequired: number;
  overridden: number;
  escalated: number;
  unmeasured: number;
  outOfScope: number;
}

export function summariseRouting(
  inputs: PageRoutingInput[],
  policy: ReviewRoutingPolicy = DEFAULT_POLICY,
): RoutingSummary {
  const s: RoutingSummary = {
    total: inputs.length, aiReview: 0, manualReview: 0, manualCheckRequired: 0,
    overridden: 0, escalated: 0, unmeasured: 0, outOfScope: 0,
  };
  for (const i of inputs) {
    const r = classifyReviewRoute(i, policy);
    if (!r.inScope) {
      s.outOfScope++;
      continue;
    }
    if (r.route === 'AI_REVIEW') s.aiReview++;
    else s.manualReview++;
    if (r.manualCheckRequired) s.manualCheckRequired++;
    if (r.overridden) s.overridden++;
    if (r.escalated) s.escalated++;
    if (i.readableWords === null) s.unmeasured++;
  }
  return s;
}
