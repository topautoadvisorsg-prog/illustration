/**
 * What "the text that should be on this page" means for AI-review purposes.
 * Mirrors assemble-page-prompt.ts's own per-page-type text sources — COVER_WRAP
 * and TITLE_PAGE don't carry their baked text in pageText.body (they use
 * coverCopy / typographyDNA.titleHierarchy instead), so a reviewer that only
 * ever checks pageText.body silently no-ops on exactly the two page types
 * most likely to have had a real text-baking bug (2026-08-02).
 */
import type { WholePageSpec } from './types.js';

export function deriveReviewSourceText(spec: WholePageSpec): string {
  if (spec.pageType === 'COVER_WRAP' && spec.coverCopy) {
    const cc = spec.coverCopy;
    const parts = [
      cc.title,
      cc.subtitle,
      cc.coverDescription,
      cc.author,
      cc.seriesLine,
      cc.backCover?.mainDescription,
      ...(cc.backCover?.insideThisVolume ?? []),
      cc.backCover?.authorBio,
    ].filter((x): x is string => Boolean(x));
    return parts.join('\n\n');
  }
  if (spec.pageType === 'TITLE_PAGE') {
    return spec.typographyDNA.titleHierarchy.join('\n\n');
  }
  return spec.pageText?.body ?? '';
}
