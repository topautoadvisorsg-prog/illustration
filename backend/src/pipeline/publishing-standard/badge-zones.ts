/**
 * Badge-safe-zone TYPE — kept for the WholePageSpec / proof-package contract.
 *
 * History: L-7/L-7.1 reserved geometric zones the AI had to leave clean
 * (computeBadgeSafeZones lived here). Operator REJECTED that approach —
 * the reserved band killed page composition. L-7.2 (LOCKED) replaced it:
 * the AI composes freely, and print-prep stamps all metadata into one small
 * bottom-right cartouche (see print-prep/badge-geometry.ts
 * computeBadgeStackLayout + buildCartoucheSvg).
 *
 * `WholePageSpec.badgeSafeZones` is now always an empty array; the field and
 * this type survive so older persisted specs and the proof-package envelope
 * keep deserializing. Do NOT reintroduce zone computation here — if physical
 * print proofs ever fail, the fix belongs in the cartouche stamping, not in
 * AI-side geometry restrictions.
 */

/** A reserved rectangle (inches from canvas top-left). Legacy contract shape. */
export interface BadgeSafeZone {
  id: 'badge-region-corner' | 'badge-hazard-source-corner' | 'folio-strip';
  role: 'badge' | 'folio';
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
}
