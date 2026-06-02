/**
 * Simple cost estimate.
 *
 * Deliberately dead-simple: estimated cost = (images generated) x (flat average
 * cost per image). No per-call ledger, no provider math — just a running estimate
 * the operator can trust at a glance. Adjust AVG_COST_PER_IMAGE_USD as real spend
 * settles.
 */

/** Flat average $/image (gpt-image-1 generation + Real-ESRGAN upscale, rounded). */
export const AVG_COST_PER_IMAGE_USD = 0.05;

export interface CostEstimate {
  imageCount: number;
  avgCostPerImageUsd: number;
  estimatedCostUsd: number;
}

export function estimateCost(imageCount: number, avgPerImage: number = AVG_COST_PER_IMAGE_USD): CostEstimate {
  const count = Math.max(0, Math.floor(imageCount));
  return {
    imageCount: count,
    avgCostPerImageUsd: avgPerImage,
    estimatedCostUsd: Math.round(count * avgPerImage * 100) / 100,
  };
}
