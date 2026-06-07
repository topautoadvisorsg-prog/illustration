/**
 * Stage 1.8 — Text-In-Reading-Field Preview renderer.
 *
 * Drives the Stage 6 Chromium + Paged.js machinery against the single-page
 * HTML produced by `buildPreviewPageHtml`. Returns a PDF buffer suitable for
 * inline display in the Page Production tab.
 *
 * Chromium dependence: this function requires a Chromium executable resolvable
 * via `resolveChromiumPath()`. Callers should guard with `isChromiumAvailable()`
 * when integration tests run in environments without Chromium.
 */

import type { ProjectConfig } from '@wildlands/shared';
import { computePageGeometry } from '../stage-6-layout/page-geometry.js';
import { loadPagedPolyfill, renderHtmlToPdf } from '../stage-6-layout/render-pdf.js';
import { buildPreviewPageHtml } from './preview-page.html.js';
import type { PaginatedPage } from '../stage-1.75-pagination/types.js';

export interface RenderPreviewInput {
  page: PaginatedPage;
  config: ProjectConfig;
}

export interface RenderPreviewResult {
  buffer: Buffer;
  /** Always 1 for a successful preview; surfaced for parity with the chapter
   *  renderer's response shape. If Paged.js paginates beyond one printed page,
   *  the Reading Field overflowed and the operator must re-paginate. */
  totalPages: number;
}

/**
 * Render one preview page (HTML → PDF). Async — opens and closes a headless
 * Chromium browser. Use the cache layer (`preview-cache.ts`) to avoid repeated
 * renders for the same input.
 */
export async function renderPreviewPdf(input: RenderPreviewInput): Promise<RenderPreviewResult> {
  const polyfillJs = await loadPagedPolyfill();
  const html = buildPreviewPageHtml({ page: input.page, config: input.config, polyfillJs });
  const geometry = computePageGeometry(input.config.trimSize);
  return renderHtmlToPdf(html, geometry);
}
