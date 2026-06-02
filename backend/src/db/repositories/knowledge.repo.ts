/**
 * Publishing Intelligence persistence.
 *
 * What it does: stores durable publishing knowledge, evidence, lineage links,
 * versioned standards/SOPs, cost events, and print proof findings.
 * Input: validated @wildlands/shared request contracts.
 * Output: shared API contracts for operator-visible intelligence records.
 */

import { and, desc, eq, ilike, or } from 'drizzle-orm';
import type {
  CreateCostEventRequest,
  CreateDecisionRequest,
  CreateExperimentRequest,
  CreateKnowledgeEvidenceRequest,
  CreateKnowledgeLinkRequest,
  CreateLessonRequest,
  CreatePrintFindingRequest,
  CreatePrintReviewRequest,
  CreateSopRequest,
  CreateStandardRequest,
  KnowledgeEvidence,
  KnowledgeItem,
  KnowledgeItemType,
  KnowledgeLink,
  KnowledgeStatus,
} from '@wildlands/shared';
import { getDb } from '../client.js';
import {
  costEvents,
  decisions,
  experiments,
  knowledgeEvents,
  knowledgeEvidence,
  knowledgeItems,
  knowledgeLinks,
  lessonsLearned,
  printFindings,
  printReviews,
  sops,
  sopVersions,
  standards,
  standardVersions,
} from '../schema/index.js';

export type KnowledgeItemRow = typeof knowledgeItems.$inferSelect;
export type KnowledgeEvidenceRow = typeof knowledgeEvidence.$inferSelect;
export type KnowledgeLinkRow = typeof knowledgeLinks.$inferSelect;

export interface ListKnowledgeFilters {
  type?: KnowledgeItemType;
  status?: KnowledgeStatus;
  projectId?: string;
  q?: string;
  limit?: number;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function dateOrNull(value?: string): Date | null {
  return value ? new Date(value) : null;
}

export function toKnowledgeItem(row: KnowledgeItemRow): KnowledgeItem {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    title: row.title,
    summary: row.summary,
    status: row.status,
    scope: row.scope,
    ownerName: row.ownerName,
    tags: stringArray(row.tags),
    metadata: record(row.metadata),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toKnowledgeEvidence(row: KnowledgeEvidenceRow): KnowledgeEvidence {
  return {
    id: row.id,
    itemId: row.itemId,
    evidenceType: row.evidenceType,
    title: row.title,
    uri: row.uri,
    storagePath: row.storagePath,
    sha256: row.sha256,
    mimeType: row.mimeType,
    notes: row.notes,
    metadata: record(row.metadata),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toKnowledgeLink(row: KnowledgeLinkRow): KnowledgeLink {
  return {
    id: row.id,
    sourceItemId: row.sourceItemId,
    targetItemId: row.targetItemId,
    relationType: row.relationType,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

function baseItemValues(
  input: {
    projectId?: string;
    title: string;
    summary?: string;
    scope?: KnowledgeItem['scope'];
    ownerName?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  },
  type: KnowledgeItemType,
  status: KnowledgeStatus,
) {
  return {
    projectId: input.projectId ?? null,
    type,
    title: input.title,
    summary: input.summary ?? null,
    status,
    scope: input.scope ?? 'GLOBAL',
    ownerName: input.ownerName ?? null,
    tags: input.tags ?? [],
    metadata: input.metadata ?? {},
  };
}

export async function getKnowledgeItem(id: string): Promise<KnowledgeItem | null> {
  const db = getDb();
  const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).limit(1);
  return row ? toKnowledgeItem(row) : null;
}

export async function listKnowledgeItems(filters: ListKnowledgeFilters = {}): Promise<KnowledgeItem[]> {
  const db = getDb();
  const clauses = [];
  if (filters.type) clauses.push(eq(knowledgeItems.type, filters.type));
  if (filters.status) clauses.push(eq(knowledgeItems.status, filters.status));
  if (filters.projectId) clauses.push(eq(knowledgeItems.projectId, filters.projectId));
  if (filters.q?.trim()) {
    const pattern = `%${filters.q.trim()}%`;
    clauses.push(or(ilike(knowledgeItems.title, pattern), ilike(knowledgeItems.summary, pattern)));
  }

  const where = clauses.length > 0 ? and(...clauses) : undefined;
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const rows = where
    ? await db.select().from(knowledgeItems).where(where).orderBy(desc(knowledgeItems.createdAt)).limit(limit)
    : await db.select().from(knowledgeItems).orderBy(desc(knowledgeItems.createdAt)).limit(limit);
  return rows.map(toKnowledgeItem);
}

export async function getKnowledgeOverview(): Promise<{
  totals: Record<KnowledgeItemType, number>;
  lockedStandards: number;
  openExperiments: number;
  recentItems: KnowledgeItem[];
}> {
  const db = getDb();
  const rows = await db.select().from(knowledgeItems);
  const totals: Record<KnowledgeItemType, number> = {
    EXPERIMENT: 0,
    DECISION: 0,
    STANDARD: 0,
    SOP: 0,
    COST_RECORD: 0,
    PRINT_REVIEW: 0,
    LESSON: 0,
  };

  for (const row of rows) {
    totals[row.type] += 1;
  }

  const recentItems = await listKnowledgeItems({ limit: 8 });
  return {
    totals,
    lockedStandards: rows.filter((row) => row.type === 'STANDARD' && row.status === 'LOCKED').length,
    openExperiments: rows.filter((row) => row.type === 'EXPERIMENT' && ['DRAFT', 'RUNNING'].includes(row.status)).length,
    recentItems,
  };
}

export async function createExperiment(input: CreateExperimentRequest): Promise<KnowledgeItem> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [item] = await tx
      .insert(knowledgeItems)
      .values(baseItemValues(input, 'EXPERIMENT', input.status))
      .returning();
    if (!item) throw new Error('Failed to create experiment item.');

    await tx.insert(experiments).values({
      itemId: item.id,
      hypothesis: input.hypothesis,
      testPerformed: input.testPerformed,
      result: input.result ?? null,
      conclusion: input.conclusion ?? null,
      startedAt: dateOrNull(input.startedAt),
      completedAt: dateOrNull(input.completedAt),
    });
    await tx.insert(knowledgeEvents).values({
      itemId: item.id,
      eventType: 'created',
      actorName: input.ownerName ?? null,
      summary: 'Experiment created.',
      nextValue: input,
    });

    return toKnowledgeItem(item);
  });
}

export async function createDecision(input: CreateDecisionRequest): Promise<KnowledgeItem> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [item] = await tx
      .insert(knowledgeItems)
      .values(baseItemValues(input, 'DECISION', input.status))
      .returning();
    if (!item) throw new Error('Failed to create decision item.');

    await tx.insert(decisions).values({
      itemId: item.id,
      decision: input.decision,
      reason: input.reason,
      acceptedAt: dateOrNull(input.acceptedAt) ?? (input.status === 'ACCEPTED' ? new Date() : null),
      supersededByItemId: input.supersededByItemId ?? null,
    });
    await tx.insert(knowledgeEvents).values({
      itemId: item.id,
      eventType: 'created',
      actorName: input.ownerName ?? null,
      summary: 'Decision recorded.',
      nextValue: input,
    });

    return toKnowledgeItem(item);
  });
}

export async function createStandard(input: CreateStandardRequest): Promise<KnowledgeItem> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [item] = await tx
      .insert(knowledgeItems)
      .values(baseItemValues(input, 'STANDARD', input.status))
      .returning();
    if (!item) throw new Error('Failed to create standard item.');

    const [standard] = await tx
      .insert(standards)
      .values({
        itemId: item.id,
        domain: input.domain,
        standardKey: input.standardKey,
        lockedAt: input.status === 'LOCKED' ? new Date() : null,
      })
      .returning();
    if (!standard) throw new Error('Failed to create standard.');

    const [version] = await tx
      .insert(standardVersions)
      .values({
        standardId: standard.id,
        version: 1,
        value: input.value,
        rationale: input.rationale,
        effectiveAt: dateOrNull(input.effectiveAt) ?? new Date(),
        createdBy: input.ownerName ?? null,
      })
      .returning();
    if (!version) throw new Error('Failed to create standard version.');

    await tx.update(standards).set({ currentVersionId: version.id, updatedAt: new Date() }).where(eq(standards.id, standard.id));
    await tx.insert(knowledgeEvents).values({
      itemId: item.id,
      eventType: 'created',
      actorName: input.ownerName ?? null,
      summary: 'Publishing standard created with version 1.',
      nextValue: input,
    });

    return toKnowledgeItem(item);
  });
}

export async function createSop(input: CreateSopRequest): Promise<KnowledgeItem> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [item] = await tx
      .insert(knowledgeItems)
      .values(baseItemValues(input, 'SOP', input.status))
      .returning();
    if (!item) throw new Error('Failed to create SOP item.');

    const [sop] = await tx.insert(sops).values({ itemId: item.id, workflowName: input.workflowName }).returning();
    if (!sop) throw new Error('Failed to create SOP.');

    const [version] = await tx
      .insert(sopVersions)
      .values({
        sopId: sop.id,
        version: 1,
        bodyMarkdown: input.bodyMarkdown,
        checklist: input.checklist,
        changeNotes: input.changeNotes ?? null,
        createdBy: input.ownerName ?? null,
      })
      .returning();
    if (!version) throw new Error('Failed to create SOP version.');

    await tx.update(sops).set({ currentVersionId: version.id, updatedAt: new Date() }).where(eq(sops.id, sop.id));
    await tx.insert(knowledgeEvents).values({
      itemId: item.id,
      eventType: 'created',
      actorName: input.ownerName ?? null,
      summary: 'SOP created with version 1.',
      nextValue: input,
    });

    return toKnowledgeItem(item);
  });
}

export async function createLesson(input: CreateLessonRequest): Promise<KnowledgeItem> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [item] = await tx
      .insert(knowledgeItems)
      .values(baseItemValues(input, 'LESSON', input.status))
      .returning();
    if (!item) throw new Error('Failed to create lesson item.');

    await tx.insert(lessonsLearned).values({
      itemId: item.id,
      lesson: input.lesson,
      prevention: input.prevention ?? null,
      appliesTo: input.appliesTo,
    });
    await tx.insert(knowledgeEvents).values({
      itemId: item.id,
      eventType: 'created',
      actorName: input.ownerName ?? null,
      summary: 'Lesson learned recorded.',
      nextValue: input,
    });

    return toKnowledgeItem(item);
  });
}

export async function createPrintReview(input: CreatePrintReviewRequest): Promise<KnowledgeItem> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [item] = await tx
      .insert(knowledgeItems)
      .values(baseItemValues(input, 'PRINT_REVIEW', input.status))
      .returning();
    if (!item) throw new Error('Failed to create print review item.');

    await tx.insert(printReviews).values({
      itemId: item.id,
      proofName: input.proofName,
      vendor: input.vendor,
      format: input.format,
      orderedAt: dateOrNull(input.orderedAt),
      receivedAt: dateOrNull(input.receivedAt),
      overallStatus: input.overallStatus,
      metadata: input.metadata,
    });
    await tx.insert(knowledgeEvents).values({
      itemId: item.id,
      eventType: 'created',
      actorName: input.ownerName ?? null,
      summary: 'Print proof review created.',
      nextValue: input,
    });

    return toKnowledgeItem(item);
  });
}

export async function createPrintFinding(input: CreatePrintFindingRequest): Promise<{ id: string }> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [review] = await tx
      .select()
      .from(printReviews)
      .where(eq(printReviews.itemId, input.printReviewItemId))
      .limit(1);
    if (!review) throw new Error('Print review item not found.');

    const [finding] = await tx
      .insert(printFindings)
      .values({
        printReviewId: review.id,
        relatedItemId: input.relatedItemId ?? null,
        severity: input.severity,
        category: input.category,
        pageKey: input.pageKey ?? null,
        layoutTemplate: input.layoutTemplate ?? null,
        finding: input.finding,
        recommendation: input.recommendation ?? null,
        status: input.status,
      })
      .returning({ id: printFindings.id });
    if (!finding) throw new Error('Failed to create print finding.');

    await tx.insert(knowledgeEvents).values({
      itemId: input.printReviewItemId,
      eventType: 'print_finding_added',
      actorName: null,
      summary: `${input.severity} ${input.category} print finding added.`,
      nextValue: input,
    });

    return finding;
  });
}

export async function createCostEvent(input: CreateCostEventRequest): Promise<KnowledgeItem> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [item] = await tx
      .insert(knowledgeItems)
      .values(baseItemValues(input, 'COST_RECORD', 'ACCEPTED'))
      .returning();
    if (!item) throw new Error('Failed to create cost item.');

    await tx.insert(costEvents).values({
      itemId: item.id,
      projectId: input.projectId ?? null,
      pageId: input.pageId ?? null,
      provider: input.provider,
      model: input.model ?? null,
      operation: input.operation,
      quantity: String(input.quantity),
      unitCostUsd: input.unitCostUsd == null ? null : String(input.unitCostUsd),
      costUsd: String(input.costUsd),
      incurredAt: dateOrNull(input.incurredAt) ?? new Date(),
      metadata: input.metadata,
    });
    await tx.insert(knowledgeEvents).values({
      itemId: item.id,
      eventType: 'created',
      actorName: input.ownerName ?? null,
      summary: `Cost event recorded: ${input.operation} ${input.costUsd.toFixed(4)} USD.`,
      nextValue: input,
    });

    return toKnowledgeItem(item);
  });
}

export async function addKnowledgeEvidence(input: CreateKnowledgeEvidenceRequest): Promise<KnowledgeEvidence> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(knowledgeEvidence)
      .values({
        itemId: input.itemId,
        evidenceType: input.evidenceType,
        title: input.title,
        uri: input.uri ?? null,
        storagePath: input.storagePath ?? null,
        sha256: input.sha256 ?? null,
        mimeType: input.mimeType ?? null,
        notes: input.notes ?? null,
        metadata: input.metadata,
      })
      .returning();
    if (!row) throw new Error('Failed to add evidence.');

    await tx.insert(knowledgeEvents).values({
      itemId: input.itemId,
      eventType: 'evidence_added',
      actorName: null,
      summary: `Evidence added: ${input.title}.`,
      nextValue: input,
    });

    return toKnowledgeEvidence(row);
  });
}

export async function linkKnowledgeItems(input: CreateKnowledgeLinkRequest): Promise<KnowledgeLink> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(knowledgeLinks)
      .values({
        sourceItemId: input.sourceItemId,
        targetItemId: input.targetItemId,
        relationType: input.relationType,
        note: input.note ?? null,
      })
      .onConflictDoNothing()
      .returning();

    const row =
      inserted ??
      (
        await tx
          .select()
          .from(knowledgeLinks)
          .where(
            and(
              eq(knowledgeLinks.sourceItemId, input.sourceItemId),
              eq(knowledgeLinks.targetItemId, input.targetItemId),
              eq(knowledgeLinks.relationType, input.relationType),
            ),
          )
          .limit(1)
      )[0];
    if (!row) throw new Error('Failed to link knowledge items.');

    await tx.insert(knowledgeEvents).values({
      itemId: input.sourceItemId,
      eventType: 'linked',
      actorName: null,
      summary: `${input.relationType} link created.`,
      nextValue: input,
    });

    return toKnowledgeLink(row);
  });
}

export async function getExperimentDetails(itemId: string): Promise<typeof experiments.$inferSelect | null> {
  const db = getDb();
  const [row] = await db.select().from(experiments).where(eq(experiments.itemId, itemId)).limit(1);
  return row ?? null;
}

export async function getDecisionDetails(itemId: string): Promise<typeof decisions.$inferSelect | null> {
  const db = getDb();
  const [row] = await db.select().from(decisions).where(eq(decisions.itemId, itemId)).limit(1);
  return row ?? null;
}

export { toIso };
