import { describe, expect, it } from 'vitest';
import { AVG_COST_PER_IMAGE_USD, estimateCost } from '../services/cost/estimate.js';

describe('estimateCost', () => {
  it('multiplies image count by the average cost per image', () => {
    const r = estimateCost(10);
    expect(r.imageCount).toBe(10);
    expect(r.avgCostPerImageUsd).toBe(AVG_COST_PER_IMAGE_USD);
    expect(r.estimatedCostUsd).toBe(Math.round(10 * AVG_COST_PER_IMAGE_USD * 100) / 100);
  });

  it('is zero for no images', () => {
    expect(estimateCost(0).estimatedCostUsd).toBe(0);
  });

  it('accepts a custom average and rounds to cents', () => {
    expect(estimateCost(3, 0.167).estimatedCostUsd).toBe(0.5); // 3 * 0.167 = 0.501 -> 0.50
  });

  it('floors fractional/negative counts safely', () => {
    expect(estimateCost(2.9).imageCount).toBe(2);
    expect(estimateCost(-5).imageCount).toBe(0);
  });
});
