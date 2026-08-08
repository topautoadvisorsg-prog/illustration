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
  // Every other page type bakes its TITLE and scientific-name byline onto the
  // page alongside the body. Returning body alone made the reviewer report the
  // page's own heading as text that shouldn't be there: CH02_P007 was flagged
  // for printing "CANADA LYNX / Lynx canadensis", which is correct content.
  // A false positive here is not free — it sends a good page back for a paid
  // re-render. Include what is actually printed.
  const title = spec.pageText?.title;
  const parts = [title?.name, title?.scientificName, spec.pageText?.body].filter(
    (x): x is string => Boolean(x && x.trim()),
  );
  return parts.join('\n\n');
}
