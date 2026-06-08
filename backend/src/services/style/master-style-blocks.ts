/**
 * Master style block accessor — Standard v1.2.
 *
 * RECONCILED: this module no longer holds its own copy of the visual DNA. The
 * single authority is the Publishing Standard's Illustration DNA module
 * (`publishing-standard/standard.ts` → `assembleIllustrationDna`), which owns
 * artwork BEHAVIOUR only and references PALETTE tokens for all colour (Rule
 * Zero). The old free-text block — which carried contradictory paper colours,
 * a "100% text-free" rule, and composition rules from the dead clean-art
 * pipeline — is deleted. See STANDARD_V1_2_RECONCILIATION.md for the audit
 * trail of every moved rule.
 *
 * Legacy clean-art callers keep their OWN no-text rule (in Stage 2
 * `LEAN_LAYOUT_RULES`); the Illustration DNA stays text-agnostic.
 */

import type { Brand } from '@wildlands/shared';
import { STANDARD_VERSION, assembleIllustrationDna } from '../../pipeline/publishing-standard/index.js';

export interface MasterStyleBlock {
  version: string;
  /** The Illustration-DNA fragment (artwork behaviour; colours via PALETTE). */
  text: string;
}

/** Return the canonical Illustration DNA. Brand-agnostic for now; when the
 *  Standard becomes per-publisher this resolves the brand's Standard. */
export function getMasterStyleBlock(_brand: Brand): MasterStyleBlock {
  return { version: `STANDARD_v${STANDARD_VERSION}`, text: assembleIllustrationDna() };
}

/** A config masterStyleBlockText shorter than this is treated as a placeholder/stub. */
export const MIN_REAL_STYLE_BLOCK_CHARS = 400;
