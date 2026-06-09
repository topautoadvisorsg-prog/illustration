/**
 * Director auto-apply — safe-by-default fix executor.
 *
 * Reads the Publishing Director's decision-ledger entries and applies the
 * subset of `proposedActions` whose `fixMode` is `AUTOMATIC` and whose
 * `kind` is on the policy's allow-list. NEVER mutates silently — every
 * applied action returns a SupervisorAutoFix record with a plain-language
 * description, and the orchestrator surfaces them in the report.
 *
 * v1 conservative defaults (per `policy.director.allowedActions`):
 *   - `mark_intentional` — pure metadata. Records that an outlier (e.g. the
 *     compacted PURE_TEXT page CH06_P006_m) is accepted; no page mutation.
 *
 * Future opt-ins (NOT applied by default):
 *   - `switch_layout` — calls force-layout. Safe but operator-territory.
 *   - `apply_repeating_accent` — routes through repeating-shared-asset.
 */

import type {
  DirectorAction,
  DirectorActionKind,
  PublishingDirectorDecisionLedger,
  PublishingDirectorLedgerEntry,
} from '../publishing-director/decision-ledger.js';
import type { SupervisorAutoFix } from './types.js';

export interface AutoApplyInput {
  ledger: PublishingDirectorDecisionLedger;
  /** Action kinds allowed to run automatically. Anything not on this list
   *  is reported as `MANUAL` and surfaced for operator review. */
  allowedActions: DirectorActionKind[];
  /** Master enable. When false, returns zero applied fixes. */
  enabled: boolean;
}

export interface AutoApplyResult {
  applied: SupervisorAutoFix[];
  /** Actions that exist in the ledger and were AUTOMATIC-fix-mode, but were
   *  NOT applied because they aren't on the allow-list. Surfaced to the
   *  operator so they know what they could turn on. */
  skippedNotAllowed: Array<{ pageKey: string; kind: DirectorActionKind; rationale: string }>;
  /** Actions in the ledger that aren't AUTOMATIC fix mode at all — they
   *  belong to the operator and the supervisor never touches them. */
  manualRequired: Array<{ pageKey: string; recommendedFix: string }>;
}

export function applyDirectorAutoFixes(input: AutoApplyInput): AutoApplyResult {
  const applied: SupervisorAutoFix[] = [];
  const skippedNotAllowed: AutoApplyResult['skippedNotAllowed'] = [];
  const manualRequired: AutoApplyResult['manualRequired'] = [];

  if (!input.enabled) {
    // Master switch off: nothing applied. Still report what WOULD happen.
    for (const entry of input.ledger.pages) {
      if (entry.fixMode === 'AUTOMATIC' && entry.automaticFixAvailable) {
        for (const action of entry.proposedActions) {
          skippedNotAllowed.push({
            pageKey: entry.pageKey,
            kind: action.kind,
            rationale: 'director.autoApply is off',
          });
        }
      } else if (entry.fixMode === 'MANUAL' && entry.operatorDecision === 'NEEDS_DECISION') {
        manualRequired.push({ pageKey: entry.pageKey, recommendedFix: entry.recommendedFix });
      }
    }
    return { applied, skippedNotAllowed, manualRequired };
  }

  for (const entry of input.ledger.pages) {
    if (entry.fixMode === 'MANUAL' && entry.operatorDecision === 'NEEDS_DECISION') {
      manualRequired.push({ pageKey: entry.pageKey, recommendedFix: entry.recommendedFix });
      continue;
    }
    if (entry.fixMode !== 'AUTOMATIC' || !entry.automaticFixAvailable) continue;

    for (const action of entry.proposedActions) {
      if (!input.allowedActions.includes(action.kind)) {
        skippedNotAllowed.push({
          pageKey: entry.pageKey,
          kind: action.kind,
          rationale: `action kind "${action.kind}" not in policy.director.allowedActions`,
        });
        continue;
      }

      const fix = executeAction(entry, action);
      if (fix) {
        applied.push(fix);
      } else {
        // Action kind is allowed and AUTOMATIC-eligible, but v1 reserves the
        // actual mutation. Surface it explicitly so the operator (or the
        // report consumer) sees the gap instead of a silent skip.
        skippedNotAllowed.push({
          pageKey: entry.pageKey,
          kind: action.kind,
          rationale: `action kind "${action.kind}" is allowed but reserved by v1 supervisor (mutation seam not yet wired)`,
        });
      }
    }
  }

  return { applied, skippedNotAllowed, manualRequired };
}

/**
 * Execute one Director action. Returns a SupervisorAutoFix on success, null
 * if the action is a no-op for this entry.
 *
 * v1: `mark_intentional` is a no-op at the DB level — the Director's ledger
 * already silences future findings once the action is exposed to the
 * operator. We record the fix so the report shows what happened.
 *
 * When `switch_layout` is enabled (operator opt-in), it should call
 * `forcePageLayoutAndReplan(...)` from projects.routes via a shared helper.
 * NOT wired in v1 — exposed here as the seam for the future.
 */
function executeAction(
  entry: PublishingDirectorLedgerEntry,
  action: DirectorAction,
): SupervisorAutoFix | null {
  switch (action.kind) {
    case 'mark_intentional':
      return {
        stage: 'publishing-director',
        pageKey: entry.pageKey,
        description: `Marked ${entry.pageKey} as an intentional outlier (${action.rationale}). Future audits will not block on this page.`,
        kind: 'mark_intentional',
      };
    case 'switch_layout':
      // Reserved for opt-in. The seam exists; the actual mutation lives in
      // forcePageLayoutAndReplan() (projects.routes.ts:1337). Until we route
      // through that helper here, this is reported as an automatic-eligible
      // action that wasn't applied.
      return null;
    case 'apply_repeating_accent':
      // Same reservation — routes through apply-shared-image.
      return null;
    default:
      return null;
  }
}
