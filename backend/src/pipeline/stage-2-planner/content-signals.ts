/**
 * Shared content-signal helpers for the planner and the layered layout model.
 *
 * Layout/content intent is derived from a page's IDENTITY (title + image subject
 * + category + warnings), never incidental body prose — a normal edible entry
 * with a "look-alike warning" subsection is not a danger page.
 */

import type { PageManifest } from '@wildlands/shared';

export function normalizeText(value: string): string {
  return value.toLowerCase();
}

export function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

/** The identity signal a page is classified from: title + image subject. */
export function signalText(page: PageManifest): string {
  return normalizeText(`${page.entryTitle}\n${page.imageSubject}`);
}

/** True only for genuinely dangerous subjects (warnings / toxic category / toxic identity). */
export function isDangerPage(page: PageManifest): boolean {
  if (page.warnings.length > 0) return true;
  const category = normalizeText(page.category ?? '');
  if (includesAny(category, ['toxic', 'poison', 'deadly', 'danger', 'venom'])) return true;
  const identity = signalText(page);
  return includesAny(identity, ['toxic', 'poison', 'poisonous', 'deadly', 'venomous', 'do not eat']);
}
