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

/** FRONT_MATTER < BODY < BACK_MATTER; missing section = BODY (legacy rows). */
function sectionRank(section: string | null | undefined): number {
  if (section === 'FRONT_MATTER') return 0;
  if (section === 'BACK_MATTER') return 2;
  return 1;
}

/** Order pages for the book spine (Front Matter v1):
 *  sections in rank order; front/back matter by spineOrder inside their
 *  section; BODY by (chapterNumber, plannedPageNumber) exactly as before.
 *  Body rows carry null spineOrder, so a global spineOrder sort would have
 *  put the body BEFORE the front matter — section rank goes first. */
export function resolveSpine<T extends SpinePage>(pages: T[]): T[] {
  const sorted = [...pages];
  sorted.sort((a, b) => {
    const rank = sectionRank(a.section) - sectionRank(b.section);
    if (rank !== 0) return rank;
    if (sectionRank(a.section) !== 1) {
      return (a.spineOrder ?? 0) - (b.spineOrder ?? 0);
    }
    return a.chapterNumber - b.chapterNumber || a.plannedPageNumber - b.plannedPageNumber;
  });
  return sorted;
}

/** Whether any front-matter pages are present (drives the report's frontMatter flag). */
export function frontMatterStatus(pages: SpinePage[]): 'absent' | 'included' {
  return pages.some((p) => p.section === 'FRONT_MATTER') ? 'included' : 'absent';
}
