/**
 * Spine ordering (Book Assembly). Pure.
 *
 * v1: body pages by (chapterNumber, plannedPageNumber).
 * Forward-compatible: when the Front Matter build adds `section` + `spineOrder`
 * to pages, ordering switches to spineOrder automatically — the merge code never
 * changes.
 */

export interface SpinePage {
  id: string;
  pageKey: string;
  chapterNumber: number;
  plannedPageNumber: number;
  /** Front Matter build (not present in v1). */
  section?: string | null;
  spineOrder?: number | null;
}

/** Order pages for the book spine. */
export function resolveSpine<T extends SpinePage>(pages: T[]): T[] {
  const usesSpineOrder = pages.some((p) => p.spineOrder != null);
  const sorted = [...pages];
  if (usesSpineOrder) {
    sorted.sort((a, b) => (a.spineOrder ?? 0) - (b.spineOrder ?? 0));
  } else {
    sorted.sort(
      (a, b) => a.chapterNumber - b.chapterNumber || a.plannedPageNumber - b.plannedPageNumber,
    );
  }
  return sorted;
}

/** Whether any front-matter pages are present (drives the report's frontMatter flag). */
export function frontMatterStatus(pages: SpinePage[]): 'absent' | 'included' {
  return pages.some((p) => p.section === 'FRONT_MATTER') ? 'included' : 'absent';
}
