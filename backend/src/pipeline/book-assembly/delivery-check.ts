/**
 * DELIVERY CHECK — is what we are about to upload actually printable?
 *
 * Runs against the FINISHED files, not the pipeline state that produced them.
 * Two different things can be true at once: every production step reported
 * success, and the PDF is still rejected at the printer. This is the second
 * question.
 *
 * There was a `scripts/validate-delivery.ts` doing roughly this, but with the
 * previous book's interior path, cover path and expected wrap size written into
 * the source. It could only ever validate that one book, on the machine that
 * had those files, from a shell. This is the same intent as a function of the
 * project, callable by the console.
 *
 * Every check states what it found, not just pass/fail — a page-size mismatch
 * is only actionable once you can see which size the pages actually are.
 */
import type { ProjectConfig } from '@wildlands/shared';
import { computeCoverDimensions } from '../stage-6-layout/render-html.js';
import { inspectPdf, type PdfFacts } from './pdf-inspect.js';

export type CheckStatus = 'PASS' | 'WARNING' | 'FAIL';

export interface DeliveryCheck {
  name: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface DeliveryReport {
  status: CheckStatus;
  checks: DeliveryCheck[];
  interior: PdfFacts | null;
  cover: PdfFacts | null;
}

/** Printer tolerance on a physical dimension. KDP's own is 0.0625in. */
const DIM_TOLERANCE_IN = 0.02;

const worst = (checks: DeliveryCheck[]): CheckStatus =>
  checks.some((c) => c.status === 'FAIL') ? 'FAIL'
    : checks.some((c) => c.status === 'WARNING') ? 'WARNING'
      : 'PASS';

export async function checkDelivery(input: {
  config: ProjectConfig;
  interiorPdf: Buffer | null;
  coverPdf: Buffer | null;
}): Promise<DeliveryReport> {
  const checks: DeliveryCheck[] = [];
  const { config } = input;

  if (!input.interiorPdf) {
    return {
      status: 'FAIL',
      checks: [{
        name: 'interior_present',
        label: 'Interior PDF',
        status: 'FAIL',
        detail: 'No interior has been built yet. Build the book first.',
      }],
      interior: null,
      cover: null,
    };
  }

  const interior = await inspectPdf(input.interiorPdf);

  checks.push({
    name: 'interior_present',
    label: 'Interior PDF',
    status: 'PASS',
    detail: `${interior.pageCount} pages, ${(interior.bytes / 1048576).toFixed(1)} MB`,
  });

  // Page size. Every page must be the same size, and that size must be the trim
  // the book is set at (plus bleed on each side, when the book bleeds).
  const expectedW = config.trimSize.widthIn + config.trimSize.bleedIn * 2;
  const expectedH = config.trimSize.heightIn + config.trimSize.bleedIn * 2;
  const sizeList = interior.pageSizesIn
    .map((s) => `${s.widthIn}×${s.heightIn}in ×${s.pages}`)
    .join(', ');
  const onlySize = interior.pageSizesIn.length === 1 ? interior.pageSizesIn[0] : undefined;
  const sizeOk =
    !!onlySize &&
    Math.abs(onlySize.widthIn - expectedW) <= DIM_TOLERANCE_IN &&
    Math.abs(onlySize.heightIn - expectedH) <= DIM_TOLERANCE_IN;
  checks.push({
    name: 'interior_page_size',
    label: 'Page size',
    status: sizeOk ? 'PASS' : 'FAIL',
    detail: sizeOk
      ? `every page ${expectedW}×${expectedH}in`
      : `expected every page ${expectedW}×${expectedH}in, found ${sizeList}`,
  });

  // Fonts. A Type3 face is glyph-drawing procedures rather than a font program:
  // it renders on screen and is commonly rejected by print RIPs.
  const type3 = interior.fonts.filter((f) => f.subtype === 'Type3');
  const notEmbedded = interior.fonts.filter((f) => f.subtype !== 'Type3' && !f.embedded);
  const fontStatus: CheckStatus = type3.length || notEmbedded.length ? 'FAIL' : 'PASS';
  checks.push({
    name: 'interior_fonts',
    label: 'Fonts',
    status: fontStatus,
    detail:
      fontStatus === 'PASS'
        ? `${interior.fonts.length} faces, all embedded, no Type3`
        : [
            type3.length ? `${type3.length} Type3 faces (${type3.map((f) => f.baseFont).join(', ')})` : '',
            notEmbedded.length ? `${notEmbedded.length} not embedded (${notEmbedded.map((f) => f.baseFont).join(', ')})` : '',
          ].filter(Boolean).join('; '),
  });

  // TrimBox. This is how the file declares where the trim sits inside the bleed.
  // A book printed WITHOUT bleed does not need one, so its absence is a warning.
  const bleeds = config.trimSize.bleedIn > 0;
  const trimOk =
    interior.trimBoxesIn.length === 1 && interior.trimBoxesIn[0]?.pages === interior.pageCount;
  checks.push({
    name: 'interior_trimbox',
    label: 'TrimBox',
    status: trimOk ? 'PASS' : bleeds ? 'FAIL' : 'WARNING',
    detail: interior.trimBoxesIn.length === 0
      ? bleeds
        ? 'no TrimBox declared, but this book prints with bleed'
        : 'no TrimBox declared (not required: this book prints without bleed)'
      : interior.trimBoxesIn
          .map((t) => `${t.widthIn}×${t.heightIn}in at ${t.xIn},${t.yIn} ×${t.pages} pages`)
          .join(' | '),
  });

  // KDP's own page-count limits for a paperback.
  const pc = interior.pageCount;
  checks.push({
    name: 'page_count_range',
    label: 'Page count',
    status: pc >= 24 && pc <= 828 ? 'PASS' : 'FAIL',
    detail: pc < 24
      ? `${pc} pages — KDP paperbacks need at least 24`
      : pc > 828
        ? `${pc} pages — over the 828-page paperback maximum`
        : `${pc} pages, within the 24–828 paperback range`,
  });

  // Cover. Optional, because the interior is deliverable and reviewable before
  // the cover exists; when it does exist its geometry must match THIS interior.
  let cover: PdfFacts | null = null;
  if (input.coverPdf) {
    cover = await inspectPdf(input.coverPdf);
    const want = computeCoverDimensions(config, interior.pageCount);
    const got = cover.pageSizesIn[0];
    const dimOk =
      cover.pageCount === 1 &&
      got &&
      Math.abs(got.widthIn - want.fullWidthIn) <= DIM_TOLERANCE_IN &&
      Math.abs(got.heightIn - want.fullHeightIn) <= DIM_TOLERANCE_IN;
    checks.push({
      name: 'cover_geometry',
      label: 'Cover wrap size',
      status: dimOk ? 'PASS' : 'FAIL',
      detail: dimOk
        ? `${got.widthIn}×${got.heightIn}in, spine ${want.spineIn.toFixed(4)}in for ${interior.pageCount} pages on ${config.paperStock} paper`
        : `expected ${want.fullWidthIn.toFixed(3)}×${want.fullHeightIn.toFixed(3)}in (spine ${want.spineIn.toFixed(4)}in for ${interior.pageCount} pages on ${config.paperStock} paper), found ${got ? `${got.widthIn}×${got.heightIn}in` : 'no page'}${cover.pageCount === 1 ? '' : ` across ${cover.pageCount} pages`}`,
    });
  } else {
    checks.push({
      name: 'cover_geometry',
      label: 'Cover wrap size',
      status: 'WARNING',
      detail: 'No cover PDF yet. The interior is complete; the cover is a separate file.',
    });
  }

  return { status: worst(checks), checks, interior, cover };
}
