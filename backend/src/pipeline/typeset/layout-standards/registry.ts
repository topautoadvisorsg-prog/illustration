/**
 * TYPESET LAYOUT STANDARD REGISTRY — the single resolution point for
 * "how is this class of book laid out?".
 *
 * Mirrors the Style DNA and production-profile registries: a plain record, a
 * `get` that resolves an explicit id, and a `list` for the operator picker.
 *
 * ─── WHY THERE IS NO "LATEST" ─────────────────────────────────────────────
 * A book is approved against a specific design. If improving the standard six
 * months from now silently re-rendered every project that referenced it, an
 * approved book could change between approval and print with no record of what
 * it used to be — and the operator would have no way to tell. So:
 *
 *   - ids carry the version: `educational-nonfiction-typeset@1`
 *   - there is deliberately no alias that means "newest"
 *   - a project stores the RESOLVED id and keeps rendering against it
 *   - moving to `@2` is an explicit operator action, never a side effect
 *
 * `resolveTypesetLayoutStandard` therefore THROWS on an unknown id rather than
 * falling back. A silent fallback is exactly the failure this design exists to
 * prevent: it would render an approved book with a different design and report
 * success. (Note this is the opposite call from the production-profile registry,
 * which falls back so a typo cannot make an existing project unopenable. The
 * difference is deliberate — that fallback affects which BEHAVIOUR runs, this
 * one would silently change what the PAGE looks like.)
 */
import { EDUCATIONAL_NONFICTION_TYPESET_V1 } from './educational-nonfiction-v1.js';
import type { TypesetLayoutStandard } from './types.js';

export const TYPESET_LAYOUT_STANDARDS: Record<string, TypesetLayoutStandard> = {
  [EDUCATIONAL_NONFICTION_TYPESET_V1.id]: EDUCATIONAL_NONFICTION_TYPESET_V1,
};

export class UnknownTypesetLayoutStandardError extends Error {
  constructor(id: string) {
    super(
      `Unknown typeset layout standard "${id}". Known: ${Object.keys(TYPESET_LAYOUT_STANDARDS).join(', ')}. ` +
        `Standards are pinned per project and never resolved to "latest" — if this project was approved against ` +
        `a standard that has since been removed, restore it rather than re-pointing the project.`,
    );
    this.name = 'UnknownTypesetLayoutStandardError';
  }
}

/** Resolve a pinned standard. Throws on an unknown id — see the note above. */
export function resolveTypesetLayoutStandard(id: string): TypesetLayoutStandard {
  const standard = TYPESET_LAYOUT_STANDARDS[id];
  if (!standard) throw new UnknownTypesetLayoutStandardError(id);
  return standard;
}

export function isKnownTypesetLayoutStandard(id: string): boolean {
  return Object.hasOwn(TYPESET_LAYOUT_STANDARDS, id);
}

/** For operator-facing pickers. */
export function listTypesetLayoutStandards(): Array<{ id: string; label: string; description: string }> {
  return Object.values(TYPESET_LAYOUT_STANDARDS).map((s) => ({
    id: s.id,
    label: s.label,
    description: s.description,
  }));
}

/**
 * Newer registered versions of the same family, for an operator-initiated
 * upgrade prompt. Returns ids only — nothing here changes a project.
 */
export function availableUpgrades(pinnedId: string): string[] {
  const at = pinnedId.lastIndexOf('@');
  if (at < 0) return [];
  const family = pinnedId.slice(0, at);
  const current = Number(pinnedId.slice(at + 1));
  if (!Number.isFinite(current)) return [];
  return Object.keys(TYPESET_LAYOUT_STANDARDS)
    .filter((id) => id.startsWith(`${family}@`) && Number(id.slice(family.length + 1)) > current)
    .sort();
}
