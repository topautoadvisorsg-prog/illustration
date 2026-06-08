/**
 * Stage 1.75 — Layout A pair expansion.
 *
 * After the flow engine produces pages, this pass walks each entry's chain
 * and — when the opener layout is the Layout A text page — appends one
 * facing-illustration page (Layout A illustration) immediately after the
 * last text page of the chain. The text leads; the illustration follows as
 * the reader's visual reward (operator-approved order, recto/verso
 * convention deferred to v1.1 per the layout-simplification approval).
 *
 * The pass also:
 *   - moves `carriesSubject = true` from the text opener to the new
 *     illustration page (Layout A's image lives on the facing page),
 *   - recomputes `partN` / `totalParts` for the affected entry's chain,
 *   - re-assigns `plannedPageNumber` across the whole book to keep it
 *     contiguous,
 *   - computes the zones for the illustration page via `directLayout`.
 *
 * Skipping the pass entirely when no opener is LAYOUT_A_TEXT keeps the
 * legacy 16-template flow unchanged.
 */

import type { ProjectConfig } from '@wildlands/shared';
import { computePageGeometry } from '../stage-6-layout/page-geometry.js';
import { directLayout } from '../stage-6-layout/layout-director.js';
import { isLayoutAText } from '../stage-2-planner/layout-families.js';
import type { PaginatedPage } from './types.js';

/**
 * Returns a new pages array with Layout A illustration pages inserted after
 * each Layout A text chain. The input array is not mutated; partN/totalParts/
 * plannedPageNumber are recomputed on the output.
 */
export function expandLayoutAPairs(pages: PaginatedPage[], config: ProjectConfig): PaginatedPage[] {
  // Quick exit when no Layout A entries are present — no work to do.
  if (!pages.some((p) => isLayoutAText(p.layoutTemplate))) {
    return pages;
  }
  const geometry = computePageGeometry(config.trimSize);
  const out: PaginatedPage[] = [];

  // Group pages by entryKey to find each chain's last text page; preserve
  // input order so the iteration below sees pages in book order.
  const chainEnd = new Map<string, number>(); // entryKey -> index of LAST page in chain (input array)
  pages.forEach((p, idx) => {
    chainEnd.set(p.entryKey, idx);
  });
  // Track which entry chains use Layout A. We only check the opener (partN === 1)
  // because Layout A's continuations are also text pages — checking any one of
  // them is enough.
  const layoutAEntries = new Set<string>();
  for (const p of pages) {
    if (isLayoutAText(p.layoutTemplate)) layoutAEntries.add(p.entryKey);
  }

  for (let idx = 0; idx < pages.length; idx++) {
    const original = pages[idx]!;
    // The opener of a Layout A chain loses its `carriesSubject` flag — the
    // facing illustration page becomes the image carrier.
    const isLayoutAEntry = layoutAEntries.has(original.entryKey);
    const adjusted: PaginatedPage = isLayoutAEntry
      ? { ...original, carriesSubject: false, imageSubject: null }
      : original;
    out.push(adjusted);

    // Insert the illustration page right after the LAST text page in this
    // entry's chain.
    if (isLayoutAEntry && chainEnd.get(original.entryKey) === idx) {
      const illustrationZones = directLayout({
        bodyMarkdown: '',
        layoutTemplate: 'LAYOUT_A_ILLUSTRATION',
        geometry,
        bodyPt: config.typography.bodyPt,
        lineHeight: config.typography.lineHeight,
      });
      const illustration: PaginatedPage = {
        plannedPageNumber: 0, // re-numbered at the end of this function
        entryKey: original.entryKey,
        entryTitle: original.entryTitle,
        pageKey: `${original.entryKey}_illus`,
        chapterNumber: original.chapterNumber,
        partN: 0, // re-numbered after totalParts is recomputed
        totalParts: 0,
        pageRole: 'continuation',
        carriesSubject: true,
        compactedEntryKeys: null,
        // The illustration carries the entry's image subject. We don't have
        // it on the PaginatedPage row directly (it lives on the manifest);
        // the route layer reattaches it via `getEntryMetaByKeys` at preview
        // time. Leave null here — engine output is for persistence.
        imageSubject: null,
        layoutTemplate: 'LAYOUT_A_ILLUSTRATION',
        readingFieldText: '',
        readingFieldChars: 0,
        readingFieldWords: 0,
        fitStatus: 'FITS',
        zones: illustrationZones,
        warnings: [],
      };
      out.push(illustration);
    }
  }

  // Recompute partN + totalParts per chain in the new ordering.
  const partsByEntry = new Map<string, number>();
  for (const p of out) {
    partsByEntry.set(p.entryKey, (partsByEntry.get(p.entryKey) ?? 0) + 1);
  }
  const partCursor = new Map<string, number>();
  for (const p of out) {
    const next = (partCursor.get(p.entryKey) ?? 0) + 1;
    partCursor.set(p.entryKey, next);
    p.partN = next;
    p.totalParts = partsByEntry.get(p.entryKey) ?? 1;
  }
  // Re-number the book's planned page numbers (sequential 1..N).
  out.forEach((p, i) => {
    p.plannedPageNumber = i + 1;
  });
  return out;
}
