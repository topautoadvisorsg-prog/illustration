/**
 * Layout templates that exist in the canonical enum but are NOT IMPLEMENTED.
 *
 * A layout lands here when its identifier and profile exist but the rendering
 * support behind it (architecture, blueprint zones, layout-director geometry)
 * was never finished. These are unfinished features, deliberately kept rather
 * than deleted, so the intended design is not lost.
 *
 * The platform FAILS CLOSED on them: production planning must never select an
 * unimplemented layout. Selecting one would produce a page whose geometry was
 * never built, and that failure would surface as a bad printed page rather
 * than a clear error.
 *
 * To finish one: implement the missing behavior, flip its tests from
 * `it.fails` to `it`, and remove it from this map. Do NOT remove it from here
 * to silence an error — that reintroduces exactly the silent-breakage this
 * guard exists to prevent.
 */
import type { LayoutTemplateId } from '@wildlands/shared';

export const UNIMPLEMENTED_LAYOUTS: Partial<Record<LayoutTemplateId, string>> = {
  // Declares architecture 'BALANCED_BAND' in intent (a contained ~25% top
  // illustration band over a clean centered reading field), but no such
  // architecture exists — the layered model only implements TOP_BAND, the
  // blueprint emits no supporting-art study zone for it, and the layout
  // director places its focal image above the title band instead of below.
  // Used on 0 pages across both books as of 2026-08-06.
  LAYOUT_E_BAND_BALANCED:
    'BALANCED_BAND architecture is not implemented: no layered-model architecture, no blueprint study zone, and layout-director geometry places the focal image above the title band.',
};

/** True if this layout exists in the enum but has no working implementation. */
export function isLayoutImplemented(layout: LayoutTemplateId): boolean {
  return !(layout in UNIMPLEMENTED_LAYOUTS);
}

/**
 * Fail closed before a page is planned or rendered with an unimplemented
 * layout. Throws with the specific reason so the operator sees what is
 * missing rather than a malformed page.
 */
export function assertLayoutImplemented(layout: LayoutTemplateId, context?: string): void {
  const reason = UNIMPLEMENTED_LAYOUTS[layout];
  if (!reason) return;
  throw new Error(
    `LAYOUT_NOT_IMPLEMENTED: ${layout} cannot be used${context ? ` (${context})` : ''}. ${reason} ` +
      `It is a deliberately retained unfinished feature — implement it or choose a different layout; do not force it through.`,
  );
}
