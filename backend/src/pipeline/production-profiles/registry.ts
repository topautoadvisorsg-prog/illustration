/**
 * BOOK PRODUCTION PROFILE REGISTRY — the single resolution point for
 * "what kind of book is this?".
 *
 * Deliberately mirrors the Style DNA registry (`publishing-standard/style-dna.ts`):
 * a plain record, a `get` that falls back safely, and a `list` for the UI. Adding
 * a book type is a REGISTERED PROFILE, not an engine change.
 *
 * The default is the field guide, so a project whose config predates
 * `productionProfileId` resolves to exactly the behaviour it already had.
 */

import { BW_EDUCATIONAL_NONFICTION_PROFILE } from './bw-educational-nonfiction.js';
import { TRADE_NONFICTION_GUIDE_PROFILE } from './trade-nonfiction-guide.js';
import { WILDLANDS_FIELD_GUIDE_PROFILE } from './wildlands-field-guide.js';
import type { BookProductionProfile } from './types.js';

export const PRODUCTION_PROFILES: Record<string, BookProductionProfile> = {
  [WILDLANDS_FIELD_GUIDE_PROFILE.id]: WILDLANDS_FIELD_GUIDE_PROFILE,
  [BW_EDUCATIONAL_NONFICTION_PROFILE.id]: BW_EDUCATIONAL_NONFICTION_PROFILE,
  // Adult trade nonfiction. Registered rather than reusing the educational
  // profile, whose audience band, illustration budget and cover art language
  // all belong to one specific book for readers 9-14.
  [TRADE_NONFICTION_GUIDE_PROFILE.id]: TRADE_NONFICTION_GUIDE_PROFILE,
};

/** The profile every pre-existing project resolves to. */
export const DEFAULT_PRODUCTION_PROFILE_ID = WILDLANDS_FIELD_GUIDE_PROFILE.id;

/**
 * Resolve a profile. An unknown id falls back to the field guide rather than
 * throwing: a typo in a stored config must not make an existing book
 * unopenable. Callers that need to detect the fallback compare `.id`.
 */
export function getProductionProfile(
  productionProfileId: string = DEFAULT_PRODUCTION_PROFILE_ID,
): BookProductionProfile {
  return PRODUCTION_PROFILES[productionProfileId] ?? WILDLANDS_FIELD_GUIDE_PROFILE;
}

/** True when the id does not name a registered profile (so the caller can warn). */
export function isKnownProductionProfile(productionProfileId: string): boolean {
  return Object.hasOwn(PRODUCTION_PROFILES, productionProfileId);
}

/** For operator-facing pickers. */
export function listProductionProfiles(): Array<{ id: string; label: string }> {
  return Object.values(PRODUCTION_PROFILES).map((p) => ({ id: p.id, label: p.label }));
}
