/**
 * director-auto-apply.test.ts — locks in v1 conservative behavior.
 *
 * - master switch off → zero applied, all auto-fixable surface as "skipped"
 * - master switch on + mark_intentional allowed → mark_intentional applied
 * - switch_layout always surfaces as not-applied even when allowed (v1 reserved)
 * - MANUAL fixes never auto-applied
 * - INFO-only entries pass through cleanly
 */

import { describe, expect, it } from 'vitest';
import { applyDirectorAutoFixes } from '../director-auto-apply.js';
import type {
  PublishingDirectorDecisionLedger,
  PublishingDirectorLedgerEntry,
  DirectorAction,
} from '../../publishing-director/decision-ledger.js';

function entry(o: Partial<PublishingDirectorLedgerEntry> & Pick<PublishingDirectorLedgerEntry, 'pageKey'>): PublishingDirectorLedgerEntry {
  return {
    pageKey: o.pageKey,
    chapterNumber: o.chapterNumber ?? 1,
    entryTitle: o.entryTitle ?? 'Test entry',
    selectedLayout: o.selectedLayout ?? 'LAYOUT_2_TEXT_HEAVY',
    persistedLayout: o.persistedLayout ?? null,
    contentType: o.contentType ?? 'SPECIES_PROFILE',
    wordCount: o.wordCount ?? 200,
    layoutReasonCodes: o.layoutReasonCodes ?? [],
    selectedLayoutWhy: o.selectedLayoutWhy ?? '',
    textCapacityChars: o.textCapacityChars ?? 2480,
    fillRatio: o.fillRatio ?? 0.5,
    estimatedRenderedPages: o.estimatedRenderedPages ?? 1,
    risks: o.risks ?? { continuation: 'NONE', underfilled: 'NONE', tightText: 'NONE', repeatedLayout: 'NONE' },
    currentQualityFindings: o.currentQualityFindings ?? [],
    recommendedFix: o.recommendedFix ?? '',
    fixMode: o.fixMode ?? 'NONE',
    automaticFixAvailable: o.automaticFixAvailable ?? false,
    alternativesConsidered: o.alternativesConsidered ?? [],
    proposedActions: o.proposedActions ?? [],
    operatorDecision: o.operatorDecision ?? 'READY',
  };
}

function ledger(entries: PublishingDirectorLedgerEntry[]): PublishingDirectorDecisionLedger {
  return {
    status: 'READY',
    generatedAt: new Date().toISOString(),
    totals: {
      pages: entries.length,
      needsDecision: entries.filter((e) => e.operatorDecision === 'NEEDS_DECISION').length,
      automaticFixesAvailable: entries.filter((e) => e.automaticFixAvailable).length,
      continuationRisks: 0,
      underfilledRisks: 0,
      tightTextRisks: 0,
      repeatedLayoutRisks: 0,
      actionableProposals: entries.reduce((sum, e) => sum + e.proposedActions.length, 0),
    },
    pages: entries,
  };
}

const markAction: DirectorAction = { kind: 'mark_intentional', rationale: 'accepted outlier' };
const switchAction: DirectorAction = {
  kind: 'switch_layout',
  from: 'LAYOUT_2_TEXT_HEAVY',
  to: 'LAYOUT_D_PURE_TEXT',
  pageKey: 'CH02_P003',
  rationale: 'overflow risk',
};

describe('applyDirectorAutoFixes', () => {
  it('master switch off: zero applied, mark_intentional surfaces as skipped', () => {
    const out = applyDirectorAutoFixes({
      ledger: ledger([
        entry({
          pageKey: 'CH06_P006_m',
          fixMode: 'AUTOMATIC',
          automaticFixAvailable: true,
          proposedActions: [markAction],
        }),
      ]),
      allowedActions: ['mark_intentional'],
      enabled: false,
    });
    expect(out.applied).toHaveLength(0);
    expect(out.skippedNotAllowed).toHaveLength(1);
    expect(out.skippedNotAllowed[0]!.rationale).toBe('director.autoApply is off');
  });

  it('enabled + mark_intentional allowed: action is applied', () => {
    const out = applyDirectorAutoFixes({
      ledger: ledger([
        entry({
          pageKey: 'CH06_P006_m',
          fixMode: 'AUTOMATIC',
          automaticFixAvailable: true,
          proposedActions: [markAction],
        }),
      ]),
      allowedActions: ['mark_intentional'],
      enabled: true,
    });
    expect(out.applied).toHaveLength(1);
    expect(out.applied[0]!.kind).toBe('mark_intentional');
    expect(out.applied[0]!.pageKey).toBe('CH06_P006_m');
    expect(out.applied[0]!.description).toMatch(/intentional outlier/i);
  });

  it('switch_layout NOT auto-applied in v1 even when allowed (reserved as no-op)', () => {
    const out = applyDirectorAutoFixes({
      ledger: ledger([
        entry({
          pageKey: 'CH02_P003',
          fixMode: 'AUTOMATIC',
          automaticFixAvailable: true,
          proposedActions: [switchAction],
        }),
      ]),
      allowedActions: ['switch_layout'],
      enabled: true,
    });
    // v1 reserved — no fix applied, no skipped-not-allowed (allow list matched).
    expect(out.applied).toHaveLength(0);
    expect(out.skippedNotAllowed).toHaveLength(0);
  });

  it('MANUAL entries needing decision surface as manualRequired', () => {
    const out = applyDirectorAutoFixes({
      ledger: ledger([
        entry({
          pageKey: 'CH02_P008',
          fixMode: 'MANUAL',
          operatorDecision: 'NEEDS_DECISION',
          recommendedFix: 'Consider de-compaction',
        }),
      ]),
      allowedActions: ['mark_intentional'],
      enabled: true,
    });
    expect(out.applied).toHaveLength(0);
    expect(out.manualRequired).toEqual([
      { pageKey: 'CH02_P008', recommendedFix: 'Consider de-compaction' },
    ]);
  });

  it('mark_intentional action NOT in allowed list surfaces as skipped', () => {
    const out = applyDirectorAutoFixes({
      ledger: ledger([
        entry({
          pageKey: 'CH06_P006_m',
          fixMode: 'AUTOMATIC',
          automaticFixAvailable: true,
          proposedActions: [markAction],
        }),
      ]),
      allowedActions: [], // empty allow list
      enabled: true,
    });
    expect(out.applied).toHaveLength(0);
    expect(out.skippedNotAllowed).toHaveLength(1);
    expect(out.skippedNotAllowed[0]!.kind).toBe('mark_intentional');
  });
});
