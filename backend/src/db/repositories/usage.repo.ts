/**
 * LLM usage / cost meter — every Claude or OpenAI call records a row here.
 *
 * What it does: append-only usage log for cost tracking.
 * Input: provider/model/operation + token or image counts.
 * Output: void (best-effort; never throws into the caller's hot path).
 */

import { getDb } from '../client.js';
import { llmUsage } from '../schema/index.js';
import { logger } from '../../lib/logger.js';

export interface UsageRecord {
  projectId?: string | null;
  pageId?: string | null;
  provider: string;
  model: string;
  operation: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  imageCount?: number | null;
  costUsd?: number | null;
}

export async function recordUsage(record: UsageRecord): Promise<void> {
  try {
    const db = getDb();
    await db.insert(llmUsage).values({
      projectId: record.projectId ?? null,
      pageId: record.pageId ?? null,
      provider: record.provider,
      model: record.model,
      operation: record.operation,
      inputTokens: record.inputTokens ?? null,
      outputTokens: record.outputTokens ?? null,
      imageCount: record.imageCount ?? null,
      costUsd: record.costUsd != null ? record.costUsd.toFixed(4) : null,
    });
  } catch (error) {
    // Cost logging must never break the pipeline.
    logger.warn({ error, operation: record.operation }, 'failed to record llm usage');
  }
}
