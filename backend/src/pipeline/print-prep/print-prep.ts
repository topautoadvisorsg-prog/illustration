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
  buildCartoucheSvg,
  computeBadgeStackLayout,
  standardCanvas,
} from './badge-geometry.js';
import { runPreflight, type PreflightReport } from './preflight.js';
import { removeGuideLines } from './remove-guide-lines.js';
import { getProjectStorage } from '../../services/storage/project-storage.js';
import {
  getRenderById,
  persistPrintPrep,
} from '../../db/repositories/whole-page-render.repo.js';
import { getPaginatedPageById, getMaxBodyPlannedPageNumber, listPaginatedPagesForProject } from '../../db/repositories/pagination.repo.js';
import { resolveSpine } from '../book-assembly/spine-order.js';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

const SERIF = TYPOGRAPHY.renderFontFamily; // Typography-owned, Docker-installed fonts first

export interface StampBox { left: number; top: number; width: number; height: number }
export interface FolioPlacement {
  side: 'left' | 'right';
  label: string;
  fontPx: number;
  baselineY: number;
  cx: number;
  cy: number;
  numW: number;
  haloW: number;
  gRx: number;
  gRy: number;
  /** Bounding box of the stamped number on the print canvas (px). */
  box: StampBox;
}

/** SINGLE SOURCE OF TRUTH for where the folio is stamped. composePrintPage (the
 *  stamp) AND the preview overlay both call this, so the preview shows the EXACT
 *  position that will print — never a guess. Outer bottom corner, mirrored by side. */
export function folioPlacement(
  canvas: { width: number; height: number; dpi: number },
  folioSide: 'left' | 'right',
  label: string,
): FolioPlacement {
  const fontPx = Math.round(0.2 * canvas.dpi);
  const bleedPx = Math.round(0.125 * canvas.dpi);
  const safePx = Math.round(0.5 * canvas.dpi);
  const baselineY = canvas.height - bleedPx - Math.round(0.4 * canvas.dpi);
  const numW = Math.max(fontPx, label.length * fontPx * 0.62);
  const onLeft = folioSide === 'left';
  const cx = onLeft ? bleedPx + safePx + numW / 2 : canvas.width - bleedPx - safePx - numW / 2;
  const cy = baselineY - fontPx * 0.32;
  const haloW = Math.max(5, Math.round(fontPx * 0.2));
  const gRx = numW * 0.85, gRy = fontPx * 0.9;
  return {
    side: folioSide, label, fontPx, baselineY, cx, cy, numW, haloW, gRx, gRy,
    box: { left: Math.round(cx - numW / 2), top: Math.round(baselineY - fontPx), width: Math.round(numW), height: Math.round(fontPx * 1.18) },
  };
}

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
  folioSide: 'left' | 'right' = 'right',
): Promise<ComposeResult> {
  const canvas = standardCanvas(canvasIn);
  const parchment = hexToRgb(PALETTE.parchment.hex);

  // 1. Lanczos upscale, height-fit (preserves the full composition; no crop).
  //    REAL bleed: the environmental illustration fills the full bleed canvas and
  //    runs off the trim — that is correct and expected. Protected content
  //    (typography, badges, decorative devices) must be authored INSIDE the
  //    trim-safe area at render time; it is NEVER protected here by faking bleed.
  const meta = await sharp(renderPng).metadata();
  const srcW = meta.width ?? 1024;
  const srcH = meta.height ?? 1536;
  const scaledW = Math.round((srcW / srcH) * canvas.height);
  const upscaledRaw = await sharp(renderPng)
    .resize({ width: scaledW, height: canvas.height, kernel: 'lanczos3' })
    .toBuffer();
  // Strip any baked-in orange guide lines that the AI copied from the blueprint
  // (no-op when none are found) so they never reach the printed page.
  const upscaled = await removeGuideLines(upscaledRaw);

  const composites: sharp.OverlayOptions[] = [
    // 2. Letterbox: centre the page; sides are parchment (the base fill).
    { input: upscaled, left: Math.max(0, Math.round((canvas.width - scaledW) / 2)), top: 0 },
  ];

  // L-7.2 — single bottom-right cartouche containing ALL metadata
  // (region / hazards / source / folio). Replaces the L-7/L-7.1 wide
  // stamping band that was killing the page composition. The AI now
  // has full composition freedom; the cartouche's soft parchment
  // backing hides whatever it placed in this small corner.
  const stack = computeBadgeStackLayout(badgesForPage(badgeSet), folioLabel, canvas);

  // 3a. Parchment cartouche FIRST (sits behind every stamp). Print-proof defect:
  // with badges suppressed, the cartouche backed only the page number and read as
  // a faint light stamp on the art. Draw it ONLY when there are badges to back;
  // a lone folio stamps bare (no parchment patch).
  if (stack.placedBadges.length > 0) {
    const cartoucheSvg = buildCartoucheSvg(stack.cartoucheRect, PALETTE.parchment.hex);
    const cartouchePng = await sharp(Buffer.from(cartoucheSvg)).png().toBuffer();
    composites.push({
      input: cartouchePng,
      left: stack.cartoucheRect.left,
      top: stack.cartoucheRect.top,
    });
  }

  // 3b. Badges stamped ON TOP of the cartouche. L-7.2.2 — 15% brightness
  // reduction (modulate preserves hue + alpha) makes the stamps read a touch
  // bolder against the parchment without changing the warm sepia ink character.
  for (const p of stack.placedBadges) {
    const bpng = await sharp(Buffer.from(p.badge.svg), { density: 600 })
      .resize({
        width: p.rect.width,
        height: p.rect.height,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .modulate({ brightness: 0.85 })
      .png()
      .toBuffer();
    composites.push({ input: bpng, left: p.rect.left, top: p.rect.top });
  }

  // 3c. Folio (page number) — OUTER bottom corner, INSIDE the safe margin,
  // MIRRORED by page side so the number sits on the page-TURN edge and never near
  // the spine: recto (right-hand page) → bottom-RIGHT, verso (left-hand) →
  // bottom-LEFT. `folioSide` is derived from the page's physical position in the
  // spine (odd PDF index = recto = right). A tight parchment halo (light glyph
  // behind the ink glyph) keeps it legible on busy art without a boxy cartouche.
  let stampedFolio = false;
  if (folioLabel) {
    const fp = folioPlacement(canvas, folioSide, folioLabel); // SAME geometry the preview draws
    // Soft radial parchment glow behind the number (translucent → illustration
    // still shows through) + a tight halo, so it reads on busy/dark art without a
    // hard oval. Ink glyph on top.
    const folioSvg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">` +
      `<defs><radialGradient id="fg" cx="50%" cy="50%" r="50%">` +
      `<stop offset="0%" stop-color="${PALETTE.parchment.hex}" stop-opacity="0.82"/>` +
      `<stop offset="55%" stop-color="${PALETTE.parchment.hex}" stop-opacity="0.55"/>` +
      `<stop offset="100%" stop-color="${PALETTE.parchment.hex}" stop-opacity="0"/></radialGradient></defs>` +
      `<ellipse cx="${fp.cx}" cy="${fp.cy}" rx="${fp.gRx}" ry="${fp.gRy}" fill="url(#fg)"/>` +
      `<text x="${fp.cx}" y="${fp.baselineY}" text-anchor="middle" font-family="${SERIF}" font-size="${fp.fontPx}" stroke="${PALETTE.parchment.hex}" stroke-width="${fp.haloW}" stroke-linejoin="round" fill="${PALETTE.parchment.hex}">${folioLabel}</text>` +
      `<text x="${fp.cx}" y="${fp.baselineY}" text-anchor="middle" font-family="${SERIF}" font-size="${fp.fontPx}" fill="${PALETTE.ink.hex}">${folioLabel}</text></svg>`;
    const fpng = await sharp(Buffer.from(folioSvg)).resize(canvas.width, canvas.height).png().toBuffer();
    composites.push({ input: fpng, left: 0, top: 0 });
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
  // Embed a 300-DPI JPEG rather than the lossless PNG. q82 with 4:2:0 chroma is
  // the standard print export for photographic full-page art at reading distance
  // — visually indistinguishable on paper but roughly HALF the bytes of q88/4:4:4,
  // which is what pushed the assembled 275-page interior to ~527 MB and timed out
  // KDP's upload. This keeps the whole book comfortably uploadable.
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([canvasIn.w * 72, canvasIn.h * 72]);
  const jpgBuffer = await sharp(pngBuffer).jpeg({ quality: 82, chromaSubsampling: '4:2:0' }).toBuffer();
  const img = await pdf.embedJpg(jpgBuffer);
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
    badgesWithinCanvas: allWithinCanvas(stack.placedBadges, canvas),
    stampedBadges: stack.placedBadges.length,
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
/** Volume I folio policy — see printPrepRender. Returns the page-number string
 *  to stamp, or null for pages that carry no visible folio. */
async function computeFolioLabel(
  page: { section?: string | null; frontMatterType?: string | null; spineOrder?: number | null; plannedPageNumber?: number | null } | undefined,
  projectId: string,
): Promise<string | null> {
  if (!page) return null;
  const section = (page.section ?? 'BODY').toUpperCase();
  if (section === 'FRONT_MATTER') return null; // half-title, title, copyright, contents, introduction
  if (section === 'BODY') return page.plannedPageNumber != null ? String(page.plannedPageNumber) : null;
  // BACK_MATTER:
  if ((page.frontMatterType ?? '').toUpperCase() === 'ABOUT_SERIES') return null; // closing brand page
  const bodyMax = await getMaxBodyPlannedPageNumber(projectId);
  const order = page.spineOrder ?? 0;
  return order > 0 ? String(bodyMax + order) : null; // glossary/index continue the body sequence
}

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
  // Volume I has NO wired badge system: the badgeContext values (region/hazard/
  // source) are reserved-draft placeholders, not real page metadata. Stamping a
  // placeholder put a badge in the corner, which made print-prep drop the folio
  // into the bottom-right corner cartouche — OUTSIDE the trim-safe area. Default
  // to no badges so the page number sits clean at bottom-centre, inside the trim.
  // A future volume with a real, wired badge system sets WL_ENABLE_BADGES=1.
  const spec = row.specJson as { badgeContext?: { region?: string; hazard?: string[]; source?: string } } | null;
  const bc = spec?.badgeContext;
  const badgeSet: Badge[] = (process.env.WL_ENABLE_BADGES && bc)
    ? [
        ...(bc.region ? [{ family: 'region' as const, value: bc.region }] : []),
        ...(bc.hazard ?? []).map((h) => ({ family: 'hazard' as const, value: h })),
        ...(bc.source ? [{ family: 'source' as const, value: bc.source }] : []),
      ]
    : [];

  // Folio policy (Volume I): front matter and the About-the-Series brand page
  // carry NO visible page number (clean display pages). Body keeps its arabic
  // number — the TOC and index already reference those. Back-matter reference
  // pages (glossary/index) CONTINUE the body's numbering rather than restarting
  // at 1, so the printed sequence is unbroken (258 → 259, 260 …).
  const page = await getPaginatedPageById(row.pageId);
  const folioLabel = await computeFolioLabel(page, row.projectId);

  const folioSide = await folioSideForRender(row.projectId, row.pageId);
  const composed = await composePrintPage(renderPng, badgeSet, folioLabel, canvasIn, folioSide);

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

/** Physical page side (recto/verso) from the spine order — odd PDF index = recto =
 *  right-hand. SHARED by the stamp (printPrepRender) and the preview geometry. */
async function folioSideForRender(projectId: string, pageId: string): Promise<'left' | 'right'> {
  const spine = resolveSpine(
    (await listPaginatedPagesForProject(projectId)).map((p) => ({
      id: p.id,
      pageKey: p.pageKey,
      chapterNumber: p.chapterNumber ?? 0,
      plannedPageNumber: p.plannedPageNumber ?? 0,
      section: p.section,
      spineOrder: p.spineOrder,
    })),
  );
  const pdfIndex = spine.findIndex((p) => p.id === pageId) + 1; // 1-based; 0 if missing
  return pdfIndex > 0 && pdfIndex % 2 === 0 ? 'left' : 'right';
}

export interface StampGeometry {
  pageKey: string;
  canvas: { width: number; height: number; dpi: number };
  folioSide: 'left' | 'right';
  folioLabel: string | null;
  trim: StampBox;
  safe: StampBox;
  reading: StampBox;
  folioBox: StampBox | null;
  badgeBox: StampBox | null;
}

/** Geometry of every stamped element + boundary for a render, computed WITHOUT
 *  rendering. The preview overlay calls this so it shows the EXACT placement
 *  print-prep will stamp (same folioPlacement / folioSideForRender / badge layout).
 *  QA rule: no stamped element is hidden — every one is reported here. */
export async function stampGeometryForRender(renderId: string): Promise<StampGeometry> {
  const row = await getRenderById(renderId);
  if (!row) throw new Error(`render_not_found:${renderId}`);
  const project = await getProject(row.projectId);
  const config = ProjectConfigSchema.parse(project?.config ?? {});
  const canvas = standardCanvas(resolveGeometry(config).canvasIn);
  const cv = { width: canvas.width, height: canvas.height, dpi: canvas.dpi };

  const folioSide = await folioSideForRender(row.projectId, row.pageId);
  const page = await getPaginatedPageById(row.pageId);
  const folioLabel = await computeFolioLabel(page, row.projectId);

  const spec = row.specJson as { badgeContext?: { region?: string; hazard?: string[]; source?: string } } | null;
  const bc = spec?.badgeContext;
  const badgeSet: Badge[] = (process.env.WL_ENABLE_BADGES && bc)
    ? [
        ...(bc.region ? [{ family: 'region' as const, value: bc.region }] : []),
        ...(bc.hazard ?? []).map((h) => ({ family: 'hazard' as const, value: h })),
        ...(bc.source ? [{ family: 'source' as const, value: bc.source }] : []),
      ]
    : [];
  const stack = computeBadgeStackLayout(badgesForPage(badgeSet), folioLabel, canvas);

  const bleed = Math.round(0.125 * canvas.dpi);
  const safe = Math.round(0.5 * canvas.dpi);
  const reading = Math.round(1.0 * canvas.dpi); // inner text/reading boundary
  const inset = (n: number): StampBox => ({ left: n, top: n, width: canvas.width - 2 * n, height: canvas.height - 2 * n });
  const cr = stack.cartoucheRect;

  return {
    pageKey: page?.pageKey ?? row.pageId,
    canvas: cv,
    folioSide,
    folioLabel,
    trim: inset(bleed),
    safe: inset(bleed + safe),
    reading: inset(bleed + reading),
    folioBox: folioLabel ? folioPlacement(cv, folioSide, folioLabel).box : null,
    badgeBox: cr ? { left: cr.left, top: cr.top, width: cr.width, height: cr.height } : null,
  };
}
