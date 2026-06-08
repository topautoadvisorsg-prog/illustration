/**
 * Deterministic subject + badge extractor (Standard v1.1).
 *
 * Pure, no AI, no network. Reads a PAGE manifest's title + body header and
 * separates page meaning into structured fields:
 *   - cleanSubject  : illustration subject ONLY (no warnings / tags / markup)
 *   - hazard[]      : usage/hazard badges, most-severe-first
 *   - region        : habitat (the body-noun scan that was WRONG for subject
 *                     is CORRECT here)
 *   - sourceConfidence
 *   - badgeSet      : ordered [region, hazard…, source] for the renderer
 *
 * Why deterministic: the manuscript author already wrote the data we need into
 * a structured first line of every body — `*Binomial* | <markers>` plus an
 * optional `**EDIBLE** *(…)* [EXPERT REVIEW REQUIRED]` line. We parse it; we do
 * not re-run breakdown.
 */

import {
  HAZARD_DISPLAY_ORDER,
  HAZARD_CONTRADICTIONS,
} from '../publishing-standard/standard.js';
import type {
  Badge,
  HazardBadge,
  PageManifest,
  RegionBadge,
  SourceBadge,
} from '@wildlands/shared';

export interface ExtractedBadgeMetadata {
  cleanSubject: string;
  hazard: HazardBadge[];
  region: RegionBadge;
  sourceConfidence: SourceBadge;
  badgeSet: Badge[];
}

// ── Editorial tags / markup that must NEVER appear in cleanSubject ──────────
// Emoji (any non-ASCII pictograph), bracket annotations, and the known tag words.
const EDITORIAL_TAGS = [
  'DEADLY', 'TOXIC', 'VENOMOUS', 'POISONOUS', 'PRIORITY ENTRY', 'BURNS',
  'PHOTOTOXIC', 'CONTACT IRRITANT', 'SEVERE CONTACT IRRITANT', 'IRRITANT',
  'HALLUCINOGENIC', 'EDIBLE', 'MEDICINAL', 'EXPERT REVIEW REQUIRED',
  'EXPERT REVIEW', 'USE CAUTION', 'CAUTION', 'KNOW THESE COLD', 'WARNING',
];

/** Strip leading "N." numbering, emoji, and editorial tags from a title. */
export function cleanTitle(rawTitle: string): string {
  let t = rawTitle;
  // Drop a leading list number: "22. Black-Legged Tick" → "Black-Legged Tick".
  t = t.replace(/^\s*\d+\.\s*/, '');
  // Drop a leading "Hazard N —" / "Hazard N -" prefix.
  t = t.replace(/^\s*Hazard\s+\d+\s*[—–-]\s*/i, '');
  // Remove any non-ASCII (emoji ⚠️ ☠️ — and stray pictographs).
  t = t.replace(/[^\x00-\x7F]/g, ' ');
  // Remove bracketed annotations: [EXPERT REVIEW REQUIRED].
  t = t.replace(/\[[^\]]*\]/g, ' ');
  // Remove known editorial tags. Longest-first + word boundaries so a short tag
  // never eats part of a longer word (e.g. TOXIC inside PHOTOTOXIC).
  for (const tag of [...EDITORIAL_TAGS].sort((a, b) => b.length - a.length)) {
    const esc = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`\\b${esc}\\b`, 'gi'), ' ');
  }
  // Collapse leftover separators (— – - / | ,) and whitespace at the edges.
  t = t.replace(/\s*[—–|]\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  // Trim dangling separators.
  t = t.replace(/^[\s/,\-]+|[\s/,\-]+$/g, '').trim();
  return t;
}

/** Pull the binomial from the body's first line: `*Genus species*` or
 *  `*Genus* spp.` Returns null if absent (concept/process pages). */
export function extractBinomial(body: string): string | null {
  const firstLine = (body || '').split('\n')[0] ?? '';
  // *Genus species*  (two words, capital genus)
  let m = firstLine.match(/\*([A-Z][a-z]+)\s+([a-z][a-z-]+)\*/);
  if (m) return `${m[1]} ${m[2]}`;
  // *Genus* spp.
  m = firstLine.match(/\*([A-Z][a-z]+)\*\s*spp\.?/);
  if (m) return `${m[1]} spp.`;
  // *Genus* alone (rare) — only if it looks like a genus.
  m = firstLine.match(/^\*([A-Z][a-z]{3,})\*/);
  if (m) return m[1] ?? null;
  return null;
}

/** Build the clean illustration subject. */
export function buildCleanSubject(
  rawTitle: string,
  binomial: string | null,
  fallbackHabitat: string,
): string {
  const common = cleanTitle(rawTitle);
  if (common && binomial) return `${common} (${binomial})`;
  if (common) return common;
  if (binomial) return binomial;
  // Concept/process page with no organism: habitat descriptor IS correct here.
  return fallbackHabitat;
}

// ── Hazard detection ───────────────────────────────────────────────────────
const SKULL = /☠/; // ☠
const WARN = /⚠/; // ⚠

export function detectHazards(title: string, body: string): HazardBadge[] {
  const hay = `${title}\n${body.split('\n').slice(0, 3).join('\n')}`;
  const up = hay.toUpperCase();
  const found = new Set<HazardBadge>();

  if (SKULL.test(hay) || /\bDEADLY\b/.test(up)) found.add('DEADLY');
  // "toxic look-alike" describes a DIFFERENT species, not this subject — don't
  // mark the subject TOXIC for it (it becomes EXPERT_REVIEW below instead).
  if (/\bTOXIC\b(?!\s*-?\s*LOOK)|\bPOISONOUS\b/.test(up)) found.add('TOXIC');
  if (/\bVENOMOUS\b|RATTLESNAKE|COPPERHEAD|\bVIPER\b/.test(up)) found.add('VENOMOUS');
  if (/\bAGGRESSIVE\b|CHARGING|\bMOOSE\b|\bBEAR\b(?!D)/.test(up)) found.add('AGGRESSIVE');
  if (
    WARN.test(hay) ||
    /\bCAUTION\b|\bBURNS\b|PHOTOTOXIC|IRRITANT|STING|RABIES|GIARDIA/.test(up)
  )
    found.add('CAUTION');
  if (/EXPERT REVIEW|LOOK-ALIKE CRITICAL|MUST BE FULLY COOKED|DEADLY LOOK/.test(up))
    found.add('EXPERT_REVIEW');
  if (/\bEDIBLE\b/.test(up)) found.add('EDIBLE');
  if (/\bMEDICINAL\b|MEDICINE|REMEDY|POULTICE/.test(up)) found.add('MEDICINAL');

  // Resolve contradictions: drop the gentler of any conflicting pair.
  for (const [a, b] of HAZARD_CONTRADICTIONS) {
    if (found.has(a) && found.has(b)) {
      // Lower index = more severe. Keep the severer one, drop the gentler.
      const lessSevere =
        HAZARD_DISPLAY_ORDER.indexOf(a) < HAZARD_DISPLAY_ORDER.indexOf(b) ? b : a;
      found.delete(lessSevere);
    }
  }

  const ordered = HAZARD_DISPLAY_ORDER.filter((h) => h !== 'NONE' && found.has(h));
  return ordered.length ? ordered : ['NONE'];
}

// ── Region inference (habitat nouns — correct use of the scan) ─────────────
export function inferRegion(title: string, body: string): RegionBadge {
  const hay = `${title}\n${body}`.toLowerCase();
  const test = (re: RegExp) => re.test(hay);
  // Order matters: most specific habitat wins.
  if (test(/above[-\s]?treeline|alpine tundra|\balpine\b|presidential range/)) return 'ALPINE';
  if (test(/\bcoast|shoreline|tidal|\bbeach\b|ocean|saltmarsh/)) return 'COASTAL';
  if (test(/\bmarsh|\bbog\b|wetland|swamp|cattail|\bfen\b/)) return 'WETLAND';
  if (test(/\briver|\bstream|\bbrook|\bcreek|crossing|riparian|\bpond\b/)) return 'RIVER';
  if (test(/ridgeline|\bsummit|granite|rocky|mountain|\bridge\b|\bnotch\b|\bpeak/)) return 'MOUNTAIN';
  if (test(/\bmeadow|open field|\bfield\b|grassland|\bclearing\b|pasture/)) return 'FIELD';
  if (test(/forest|woodland|spruce|\bfir\b|hardwood|\bpine\b|\bbirch|understory|canopy|boreal/)) return 'FOREST';
  return 'GENERAL';
}

// ── Source confidence (conservative; no aggressive inference) ──────────────
export function inferSource(title: string, body: string): SourceBadge {
  const up = `${title}\n${body}`.toUpperCase();
  // Only upgrade away from the default when the manuscript clearly supports it.
  if (/TRADITIONALLY USED|FOLK (REMEDY|USE)|INDIGENOUS|NATIVE PEOPLES USED/.test(up))
    return 'TRADITIONAL_USE';
  if (/HISTORICALLY|EARLY SETTLERS|COLONIAL[- ]ERA|19TH CENTURY/.test(up))
    return 'HISTORICAL_SOURCE';
  return 'GENERAL_REFERENCE';
}

/** Compose the ordered badge set the renderer stamps. */
export function composeBadgeSet(
  region: RegionBadge,
  hazards: HazardBadge[],
  source: SourceBadge,
): Badge[] {
  const set: Badge[] = [{ family: 'region', value: region }];
  for (const h of hazards) {
    if (h !== 'NONE') set.push({ family: 'hazard', value: h });
  }
  set.push({ family: 'source', value: source });
  return set;
}

/** Top-level: extract all subject + badge metadata for one PAGE manifest. */
export function extractBadgeMetadata(
  manifest: Pick<PageManifest, 'entryTitle' | 'bodyMarkdown' | 'imageSubject'>,
): ExtractedBadgeMetadata {
  const title = manifest.entryTitle ?? '';
  const body = manifest.bodyMarkdown ?? '';
  const binomial = extractBinomial(body);
  const region = inferRegion(title, body);
  // Fallback habitat for concept pages with no organism: a calm regional
  // descriptor. GENERAL reads better as "wilderness" than "general landscape".
  const habitatFallback =
    region === 'GENERAL'
      ? 'New England wilderness landscape'
      : `New England ${region.toLowerCase()} landscape`;
  const cleanSubject = buildCleanSubject(title, binomial, habitatFallback);
  const hazard = detectHazards(title, body);
  const sourceConfidence = inferSource(title, body);
  const badgeSet = composeBadgeSet(region, hazard, sourceConfidence);
  return { cleanSubject, hazard, region, sourceConfidence, badgeSet };
}
