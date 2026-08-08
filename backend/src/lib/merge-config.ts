/**
 * Safe config merge for `PATCH /api/projects/:id/config`.
 *
 * ─── THE DEFECT THIS FIXES ────────────────────────────────────────────────
 * The route used to REPLACE the stored config with whatever the client sent
 * (preserving only `layoutApprovals` and `planMeta`). The console's Book Setup
 * form builds its payload from the fields it renders, which is a strict subset:
 * it has no input for `publishing.authorBio`, `dedication`, `disclaimers`,
 * `additionalResources`, `coverArtDirection`, `coverSync`, `imageGeneration`,
 * `layoutPolicy`, and more. Because every one of those is `.optional()` or has a
 * schema default, the payload still parsed — so saving a title edit silently
 * deleted the book's cover-sync record and its author bio, with no error.
 *
 * Every INTERNAL caller of `updateProjectConfig` already reads the full config
 * and spreads it (`{ ...config, change }`), so they were never at risk. The
 * hazard was exclusively the HTTP boundary.
 *
 * ─── THE FIX ──────────────────────────────────────────────────────────────
 * Deep-merge the patch onto the stored config. A key the client does not send
 * is a key the client is not changing — it can never be dropped by omission.
 *
 * Clearing a value is then necessarily EXPLICIT, via `unset` dot-paths. That is
 * the right trade: deleting production metadata should be something a client
 * asks for by name, not something it achieves by forgetting a field.
 */

/** A plain JSON object (not an array, not null). */
type Obj = Record<string, unknown>;

function isPlainObject(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Recursively merge `patch` onto `base`.
 *
 * - Nested objects merge key by key.
 * - Arrays REPLACE wholesale. They are ordered values (authors, features,
 *   disclaimers); index-wise merging would produce nonsense like a 2-author
 *   list overwriting the first two of three and silently keeping the third.
 * - `undefined` in the patch means "not supplied" and never overwrites. Use
 *   `unset` to delete.
 * - Explicit `null` DOES overwrite: it is a value the client chose to send.
 */
export function deepMerge<T extends Obj>(base: T, patch: Obj): T {
  const out: Obj = { ...base };
  for (const [key, patchValue] of Object.entries(patch)) {
    if (patchValue === undefined) continue;
    const baseValue = out[key];
    out[key] =
      isPlainObject(baseValue) && isPlainObject(patchValue)
        ? deepMerge(baseValue, patchValue)
        : patchValue;
  }
  return out as T;
}

/**
 * Delete a dot-path (`publishing.series`) from a config object, immutably.
 * Missing intermediate keys are a no-op, so an `unset` for something already
 * absent is not an error.
 */
export function unsetPath<T extends Obj>(base: T, path: string): T {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return base;
  const [head, ...rest] = parts as [string, ...string[]];
  if (!(head in base)) return base;

  if (rest.length === 0) {
    const { [head]: _removed, ...remaining } = base;
    return remaining as T;
  }
  const child = base[head];
  if (!isPlainObject(child)) return base;
  return { ...base, [head]: unsetPath(child, rest.join('.')) } as T;
}

/** Apply every `unset` path in order. */
export function unsetPaths<T extends Obj>(base: T, paths: readonly string[]): T {
  return paths.reduce<T>((acc, p) => unsetPath(acc, p), base);
}

/**
 * The full safe-patch operation: merge the patch onto the stored config, then
 * apply explicit deletions. Merge runs FIRST so a client can set and clear
 * different keys in one request without ordering surprises.
 */
export function applyConfigPatch<T extends Obj>(
  existing: T,
  patch: Obj,
  unset: readonly string[] = [],
): T {
  return unsetPaths(deepMerge(existing, patch), unset);
}
