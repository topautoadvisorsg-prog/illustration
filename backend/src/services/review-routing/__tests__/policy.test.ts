import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HIGH_TEXT_WORD_THRESHOLD,
  classifyReviewRoute,
  summariseRouting,
} from '../policy.js';

describe('review routing policy', () => {
  it('defaults to 200', () => {
    expect(DEFAULT_HIGH_TEXT_WORD_THRESHOLD).toBe(200);
  });

  it('routes 200 words or more to AI review', () => {
    expect(classifyReviewRoute({ readableWords: 200 }).route).toBe('AI_REVIEW');
    expect(classifyReviewRoute({ readableWords: 327 }).route).toBe('AI_REVIEW');
    expect(classifyReviewRoute({ readableWords: 481 }).route).toBe('AI_REVIEW');
  });

  it('EXACTLY 200 belongs to AI review, and 199 does not', () => {
    expect(classifyReviewRoute({ readableWords: 200 }).route).toBe('AI_REVIEW');
    expect(classifyReviewRoute({ readableWords: 199 }).route).toBe('MANUAL_REVIEW');
  });

  it('routes below 200 to manual review', () => {
    expect(classifyReviewRoute({ readableWords: 142 }).route).toBe('MANUAL_REVIEW');
    expect(classifyReviewRoute({ readableWords: 0 }).route).toBe('MANUAL_REVIEW');
  });

  it('honours a per-project threshold', () => {
    expect(classifyReviewRoute({ readableWords: 260 }, { highTextWordThreshold: 250 }).route).toBe('AI_REVIEW');
    expect(classifyReviewRoute({ readableWords: 260 }, { highTextWordThreshold: 400 }).route).toBe('MANUAL_REVIEW');
  });

  it('never auto-promotes an unmeasured page to automation', () => {
    const r = classifyReviewRoute({ readableWords: null });
    expect(r.route).toBe('MANUAL_REVIEW');
    expect(r.isHighText).toBe(false);
    expect(r.reason).toContain('not yet measured');
  });

  describe('scope', () => {
    it('excludes deterministic typeset pages entirely', () => {
      const r = classifyReviewRoute({ readableWords: 900, isAiImageTextPage: false });
      expect(r.inScope).toBe(false);
      expect(r.label).toBe('NOT APPLICABLE');
      expect(r.isHighText).toBe(false);
    });

    it('defaults to in-scope for this pipeline', () => {
      expect(classifyReviewRoute({ readableWords: 250 }).inScope).toBe(true);
    });
  });

  describe('routing is separate from approval', () => {
    it('returns no approval/quality field of any kind', () => {
      const r = classifyReviewRoute({ readableWords: 250 });
      expect(Object.keys(r)).not.toContain('approved');
      expect(Object.keys(r)).not.toContain('reviewStatus');
      expect(r.label).toBe('AI REVIEW');
    });
  });

  describe('structured layouts', () => {
    it('keeps a structured page in AI review and ADDS a manual check', () => {
      const r = classifyReviewRoute({ readableWords: 475, layoutTemplate: 'LAYOUT_15_PROGRESSION_STUDY' });
      expect(r.route).toBe('AI_REVIEW');
      expect(r.manualCheckRequired).toBe(true);
      expect(r.label).toBe('AI REVIEW + MANUAL CHECK REQUIRED');
    });

    it('does not attach a manual check to a page already routed manual', () => {
      const r = classifyReviewRoute({ readableWords: 120, layoutTemplate: 'LAYOUT_REFERENCE' });
      expect(r.route).toBe('MANUAL_REVIEW');
      expect(r.manualCheckRequired).toBe(false);
    });
  });

  describe('high-risk escalation', () => {
    it('promotes a short page to AI review', () => {
      const r = classifyReviewRoute({ readableWords: 150, reviewEscalationReason: 'tiny diagram labels' });
      expect(r.route).toBe('AI_REVIEW');
      expect(r.escalated).toBe(true);
      expect(r.reason).toContain('tiny diagram labels');
    });

    it('NEVER downgrades a page already at or above the threshold', () => {
      const r = classifyReviewRoute({ readableWords: 400, reviewEscalationReason: 'anything' });
      expect(r.route).toBe('AI_REVIEW');
      expect(r.escalated).toBe(false); // it was already there; nothing to escalate
    });

    it('leaves the measured word count untouched', () => {
      expect(classifyReviewRoute({ readableWords: 150, reviewEscalationReason: 'x' }).readableWords).toBe(150);
    });
  });

  describe('operator override', () => {
    it('changes the route but never the measurement', () => {
      const r = classifyReviewRoute({ readableWords: 142, reviewRouteOverride: 'AI_REVIEW' });
      expect(r.route).toBe('AI_REVIEW');
      expect(r.measuredRoute).toBe('MANUAL_REVIEW');
      expect(r.overridden).toBe(true);
      expect(r.readableWords).toBe(142);
      expect(r.isHighText).toBe(false);
      expect(r.reason).toContain('142 readable words');
    });

    it('can route a high-text page to manual, and says so plainly', () => {
      const r = classifyReviewRoute({ readableWords: 230, reviewRouteOverride: 'MANUAL_REVIEW' });
      expect(r.route).toBe('MANUAL_REVIEW');
      expect(r.measuredRoute).toBe('AI_REVIEW');
      expect(r.overridden).toBe(true);
      expect(r.label).toContain('operator override');
    });

    it('an override matching the measured route is not flagged as an override', () => {
      expect(classifyReviewRoute({ readableWords: 400, reviewRouteOverride: 'AI_REVIEW' }).overridden).toBe(false);
    });
  });

  it('reports words per block when blocks are known', () => {
    expect(classifyReviewRoute({ readableWords: 481, textBlocks: 3 }).reason).toBe('481 readable words in 3 blocks (160/block)');
  });

  it('summarises a mixed set', () => {
    const s = summariseRouting([
      { readableWords: 400 },
      { readableWords: 475, layoutTemplate: 'LAYOUT_15_PROGRESSION_STUDY' },
      { readableWords: 100 },
      { readableWords: 142, reviewRouteOverride: 'AI_REVIEW' },
      { readableWords: 150, reviewEscalationReason: 'tiny labels' },
      { readableWords: null },
      { readableWords: 900, isAiImageTextPage: false },
    ]);
    expect(s).toEqual({
      total: 7,
      aiReview: 4,
      manualReview: 2,
      manualCheckRequired: 1,
      overridden: 1,
      escalated: 1,
      unmeasured: 1,
      outOfScope: 1,
    });
  });
});
