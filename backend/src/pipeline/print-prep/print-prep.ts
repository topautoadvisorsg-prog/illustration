/**
 * Print-Prep (STD-3) — turn a generated render into a KDP-ready print file.
 *
 * composePrintPage() is the deterministic image work (sharp + pdf-lib),
 * separable from storage so it can be tested on a fixture. printPrepRender()
 * is the orchestrator: load render → compose → store → preflight → persist.
 *
 * No AI, no spend. Lanczos upscale (faithful to the baked-in text), letterbox
 * in PALETTE.parchment, badge + folio stamping, 300-DPI PNG + single-page PDF.
 */

import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import type { Badge } from '@wildlands/shared';
import {
  PALETTE,
  TYPOGRAPHY,
  badgesForPage,
  resolveGeometry,
} from '../publishing-standard/index.js';
import { ProjectConfigSchema } from '@wildlands/shared';
import { getProject } from '../../db/repositories/projects.repo.js';
import {
  allWithinCanvas,
  computeBadgeLayout,
  computeFolioRect,
  standardCanvas,
} from './badge-geometry.js';
import { runPreflight, type PreflightReport } from './preflight.js';
import { getProjectStorage } from '../../services/storage/project-storage.js';
import {
  getRenderById,
  persistPrintPrep,
} from '../../db/repositories/whole-page-render.repo.js';
import { getPaginatedPageById } from '../../db/repositories/pagination.repo.js';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

const SERIF = TYPOGRAPHY.renderFontFamily; // Typography-owned, Docker-installed fonts first

export interface ComposeResult {
  pngBuffer: Buffer;
  pdfBuffer: Buffer;
  widthPx: number;
  heightPx: number;
  dpi: number;
  colorMode: string;
  badgesWithinCanvas: boolean;
  stampedBadges: number;
  stampedFolio: boolean;
}

/** The deterministic image+pdf composition. Testable on a fixture buffer.
 *  `canvasIn` is the project's resolved canvas (trim + 2×bleed). REQUIRED so
 *  the render and the print file always share one trim — callers pass
 *  `resolveGeometry(config).canvasIn`. No default fallback (that path is what
 *  produced the original trim-mismatch bug). */
export async function composePrintPage(
  renderPng: Buffer,
  badgeSet: Badge[] | null,
  folioLabel: string | null,
  canvasIn: { w: number; h: number },
): Promise<ComposeResult> {
  const canvas = standardCanvas(canvasIn);
  const parchment = hexToRgb(PALETTE.parchment.hex);

  // 1. Lanczos upscale, height-fit (preserves the full composition; no crop).
  const meta = await sharp(renderPng).metadata();
  const srcW = meta.width ?? 1024;
  const srcH = meta.height ?? 1536;
  const scaledW = Math.round((srcW / srcH) * canvas.height);
  const upscaled = await sharp(renderPng)
    .resize({ width: scaledW, height: canvas.height, kernel: 'lanczos3' })
    .toBuffer();

  const composites: sharp.OverlayOptions[] = [
    // 2. Letterbox: centre the page; sides are parchment (the base fill).
    { input: upscaled, left: Math.max(0, Math.round((canvas.width - scaledW) / 2)), top: 0 },
  ];

  // 3. Stamp badges (raster each STD-2 SVG at high density, composite at its rect).
  const placed = computeBadgeLayout(badgesForPage(badgeSet), canvas);
  for (const p of placed) {
    const bpng = await sharp(Buffer.from(p.badge.svg), { density: 600 })
      .resize({
        width: p.rect.width,
        height: p.rect.height,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    composites.push({ input: bpng, left: p.rect.left, top: p.rect.top });
  }

  // 4. Stamp folio (bottom-centre, serif, ink).
  let stampedFolio = false;
  if (folioLabel) {
    const r = computeFolioRect(canvas);
    const fontPx = Math.round(0.18 * canvas.dpi);
    const folioSvg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${r.width}" height="${r.height}" viewBox="0 0 ${r.width} ${r.height}">` +
      `<text x="${r.width / 2}" y="${r.height * 0.7}" text-anchor="middle" font-family="${SERIF}" font-size="${fontPx}" fill="${PALETTE.ink.hex}">${folioLabel}</text></svg>`;
    const fpng = await sharp(Buffer.from(folioSvg)).png().toBuffer();
    composites.push({ input: fpng, left: r.left, top: r.top });
    stampedFolio = true;
  }

  // 5. Flatten onto the parchment canvas.
  const pngBuffer = await sharp({
    create: { width: canvas.width, height: canvas.height, channels: 3, background: parchment },
  })
    .composite(composites)
    .withMetadata({ density: canvas.dpi })
    .png()
    .toBuffer();

  // 6. Single-page PDF at exact trim+bleed (pdf-lib, points = in × 72).
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([canvasIn.w * 72, canvasIn.h * 72]);
  const img = await pdf.embedPng(pngBuffer);
  page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  const pdfBuffer = Buffer.from(await pdf.save());

  const outMeta = await sharp(pngBuffer).metadata();
  return {
    pngBuffer,
    pdfBuffer,
    widthPx: outMeta.width ?? canvas.width,
    heightPx: outMeta.height ?? canvas.height,
    dpi: canvas.dpi,
    colorMode: outMeta.space ?? 'srgb',
    badgesWithinCanvas: allWithinCanvas(placed, canvas),
    stampedBadges: placed.length,
    stampedFolio,
  };
}

export interface PrintPrepResult {
  renderId: string;
  printPngPath: string;
  printPdfPath: string;
  preflight: PreflightReport;
  stampedBadges: number;
  stampedFolio: boolean;
}

/** Orchestrator: print-prep one RENDERED render. */
export async function printPrepRender(renderId: string): Promise<PrintPrepResult> {
  const row = await getRenderById(renderId);
  if (!row) throw new Error(`render_not_found:${renderId}`);
  if (!row.imagePath) throw new Error(`render_has_no_image:${renderId}`);

  // Resolve the project's canvas (single source of truth) so the print file is
  // composed AND preflighted at the same trim the render used.
  const project = await getProject(row.projectId);
  const config = ProjectConfigSchema.parse(project?.config ?? {});
  const canvasIn = resolveGeometry(config).canvasIn;

  const storage = getProjectStorage();
  const renderPng = await storage.readProjectFile(row.imagePath);

  // Reconstruct the badge set from the stored spec's badgeContext.
  const spec = row.specJson as { badgeContext?: { region?: string; hazard?: string[]; source?: string } } | null;
  const bc = spec?.badgeContext;
  const badgeSet: Badge[] = bc
    ? [
        ...(bc.region ? [{ family: 'region' as const, value: bc.region }] : []),
        ...(bc.hazard ?? []).map((h) => ({ family: 'hazard' as const, value: h })),
        ...(bc.source ? [{ family: 'source' as const, value: bc.source }] : []),
      ]
    : [];

  // Folio: the page's planned number (arabic). Front-matter roman/blank folios
  // arrive with the Front Matter build; here Print-Prep stamps what it's given.
  const page = await getPaginatedPageById(row.pageId);
  const folioLabel = page ? String(page.plannedPageNumber) : null;

  const composed = await composePrintPage(renderPng, badgeSet, folioLabel, canvasIn);

  const pageKey = page?.pageKey ?? row.pageId;
  const base = `${pageKey}-${renderId}`;
  const pngStored = await storage.writeProjectFile(row.projectId, ['print-ready', `${base}.print.png`], composed.pngBuffer);
  const pdfStored = await storage.writeProjectFile(row.projectId, ['print-ready', `${base}.print.pdf`], composed.pdfBuffer);

  const preflight = runPreflight({
    widthPx: composed.widthPx,
    heightPx: composed.heightPx,
    dpi: composed.dpi,
    colorMode: composed.colorMode,
    pngBytes: composed.pngBuffer.length,
    pdfBytes: composed.pdfBuffer.length,
    badgesWithinCanvas: composed.badgesWithinCanvas,
    canvasIn,
  });

  await persistPrintPrep(renderId, {
    printPngPath: pngStored.relativePath,
    printPdfPath: pdfStored.relativePath,
    preflightPassed: preflight.passed,
  });

  return {
    renderId,
    printPngPath: pngStored.relativePath,
    printPdfPath: pdfStored.relativePath,
    preflight,
    stampedBadges: composed.stampedBadges,
    stampedFolio: composed.stampedFolio,
  };
}
