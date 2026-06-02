/**
 * Publishing Intelligence service.
 *
 * What it does: coordinates durable knowledge workflows on top of the DB
 * repository. Promotion flows preserve lineage instead of copying notes by hand.
 */

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
  KnowledgeItem,
} from '@wildlands/shared';
import {
  addKnowledgeEvidence,
  createCostEvent,
  createDecision,
  createExperiment,
  createLesson,
  createPrintFinding,
  createPrintReview,
  createSop,
  createStandard,
  getDecisionDetails,
  getExperimentDetails,
  getKnowledgeItem,
  getKnowledgeOverview,
  linkKnowledgeItems,
  listKnowledgeItems,
  type ListKnowledgeFilters,
} from '../../db/repositories/knowledge.repo.js';

export async function listPublishingKnowledge(filters: ListKnowledgeFilters): Promise<KnowledgeItem[]> {
  return listKnowledgeItems(filters);
}

export async function getPublishingIntelligenceOverview() {
  const overview = await getKnowledgeOverview();
  return {
    totals: {
      experiments: overview.totals.EXPERIMENT,
      decisions: overview.totals.DECISION,
      standards: overview.totals.STANDARD,
      sops: overview.totals.SOP,
      costRecords: overview.totals.COST_RECORD,
      printReviews: overview.totals.PRINT_REVIEW,
      lessons: overview.totals.LESSON,
    },
    lockedStandards: overview.lockedStandards,
    openExperiments: overview.openExperiments,
    recentItems: overview.recentItems,
  };
}

export async function recordExperiment(input: CreateExperimentRequest): Promise<KnowledgeItem> {
  return createExperiment(input);
}

export async function recordDecision(input: CreateDecisionRequest): Promise<KnowledgeItem> {
  return createDecision(input);
}

export async function recordStandard(input: CreateStandardRequest): Promise<KnowledgeItem> {
  return createStandard(input);
}

export async function recordSop(input: CreateSopRequest): Promise<KnowledgeItem> {
  return createSop(input);
}

export async function recordLesson(input: CreateLessonRequest): Promise<KnowledgeItem> {
  return createLesson(input);
}

export async function recordPrintReview(input: CreatePrintReviewRequest): Promise<KnowledgeItem> {
  return createPrintReview(input);
}

export async function recordPrintFinding(input: CreatePrintFindingRequest): Promise<{ id: string }> {
  return createPrintFinding(input);
}

export async function recordCostEvent(input: CreateCostEventRequest): Promise<KnowledgeItem> {
  return createCostEvent(input);
}

export async function recordEvidence(input: CreateKnowledgeEvidenceRequest) {
  return addKnowledgeEvidence(input);
}

export async function recordKnowledgeLink(input: CreateKnowledgeLinkRequest) {
  return linkKnowledgeItems(input);
}

export async function promoteExperimentToDecision(experimentItemId: string): Promise<KnowledgeItem> {
  const sourceItem = await getKnowledgeItem(experimentItemId);
  if (!sourceItem || sourceItem.type !== 'EXPERIMENT') {
    throw new Error('Experiment knowledge item not found.');
  }

  const experiment = await getExperimentDetails(experimentItemId);
  if (!experiment) throw new Error('Experiment details not found.');

  const decision = await createDecision({
    projectId: sourceItem.projectId ?? undefined,
    title: `Decision: ${sourceItem.title}`,
    summary: experiment.conclusion ?? sourceItem.summary ?? undefined,
    scope: sourceItem.scope,
    ownerName: sourceItem.ownerName ?? undefined,
    tags: [...sourceItem.tags, 'promoted-from-experiment'],
    metadata: {
      promotedFromExperimentItemId: experimentItemId,
      sourceExperimentTitle: sourceItem.title,
    },
    decision: experiment.conclusion ?? `Accept experiment result for ${sourceItem.title}.`,
    reason: experiment.result ?? experiment.testPerformed,
    status: 'ACCEPTED',
  });

  await linkKnowledgeItems({
    sourceItemId: experimentItemId,
    targetItemId: decision.id,
    relationType: 'PRODUCED_DECISION',
    note: 'Experiment conclusion promoted into an accepted publishing decision.',
  });

  return decision;
}

export async function promoteDecisionToStandard(decisionItemId: string, input: CreateStandardRequest): Promise<KnowledgeItem> {
  const sourceItem = await getKnowledgeItem(decisionItemId);
  if (!sourceItem || sourceItem.type !== 'DECISION') {
    throw new Error('Decision knowledge item not found.');
  }

  const decision = await getDecisionDetails(decisionItemId);
  if (!decision) throw new Error('Decision details not found.');

  const standard = await createStandard({
    ...input,
    projectId: input.projectId ?? sourceItem.projectId ?? undefined,
    scope: input.scope ?? sourceItem.scope,
    ownerName: input.ownerName ?? sourceItem.ownerName ?? undefined,
    tags: [...(input.tags ?? []), 'promoted-from-decision'],
    metadata: {
      ...input.metadata,
      promotedFromDecisionItemId: decisionItemId,
      sourceDecision: decision.decision,
    },
    status: 'LOCKED',
  });

  await linkKnowledgeItems({
    sourceItemId: decisionItemId,
    targetItemId: standard.id,
    relationType: 'PROMOTED_TO_STANDARD',
    note: 'Decision promoted into a locked publishing standard.',
  });

  return standard;
}
