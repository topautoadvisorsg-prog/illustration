/**
 * Image audit log — every review action (approve/reject/regenerate/set-active)
 * appends a row so the operator can see the full history of a page's artwork.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../client.js';
import { imageEvents } from '../schema/index.js';
import { logger } from '../../lib/logger.js';

export type ImageEventType = 'generated' | 'approved' | 'rejected' | 'regenerated' | 'set_active';

export interface ImageEventInput {
  imageId: string;
  pageId: string;
  eventType: ImageEventType;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function recordImageEvent(input: ImageEventInput): Promise<void> {
  try {
    const db = getDb();
    await db.insert(imageEvents).values({
      imageId: input.imageId,
      pageId: input.pageId,
      eventType: input.eventType,
      note: input.note ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (error) {
    // Audit logging must never break the review action.
    logger.warn({ error, eventType: input.eventType }, 'failed to record image event');
  }
}

export async function listImageEvents(pageId: string): Promise<Array<typeof imageEvents.$inferSelect>> {
  const db = getDb();
  return db.select().from(imageEvents).where(eq(imageEvents.pageId, pageId)).orderBy(imageEvents.createdAt);
}
