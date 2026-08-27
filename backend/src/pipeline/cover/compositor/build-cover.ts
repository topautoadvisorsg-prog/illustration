/**
 * THE COVER COMPOSITOR — one path, both bindings.
 *
 *   final interior PDF + approved artwork + metadata + binding
 *       -> authoritative geometry
 *       -> artwork fitting
 *       -> spine typography
 *       -> validation
 *       -> proof + production cover + manifest
 *
 * WHAT THIS REPLACES. Cover production used to be a scripting exercise: eighteen
 * book-specific programs, each with its own copy of the geometry, its own spine
 * maths, and its own idea of where the barcode goes. This is the one engine.
 * Book-specific values (title, author, artwork, back copy) are INPUTS. Nothing
 * about any particular book belongs in this file.
 *
 * THE PAGE COUNT IS READ, NEVER TYPED. A wrong spine is scrap paper and a
 * reprint, and a typed page count cannot be wrong loudly. The count comes out of
 * the interior PDF that is actually shipping, and the manifest records the hash
 * of that exact file beside the hash of the cover built from it, so a
 * 118-page interior paired with a forgotten 116-page cover becomes mechanically
 * detectable instead of a thing someone notices on a printed proof.
 */
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { planSpineType } from '../../publishing-standard/spine-type.js';
import { COPY_CREAM as COVER_CREAM, COPY_FONT as COVER_FONT, COPY_HALO as COVER_HALO } from '../../publishing-standard/cover-copy-column.js';

const escapeXml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
import type { ArtworkPlan, FitMode } from './artwork.js';
import { planArtwork, renderArtwork } from './artwork.js';
import type { CoverGeometry } from './geometry.js';
import { resolveCoverGeometry } from './geometry.js';
import { renderProof } from './proof.js';
import type { Check, ContentBox, SpineTextOutcome } from './validate.js';
import { validateCover, worstStatus } from './validate.js';
import type { KdpBinding, KdpInk, KdpPaper } from '../../publishing-standard/kdp-spec.js';

/** Bumped when the geometry contract or the manifest shape changes. */
export const COMPOSITOR_VERSION = '1.1.0';

export interface BuildCoverRequest {
  /** The interior that is actually shipping. Its page count and hash are authoritative. */
  interiorPdf: Buffer;
  interiorName?: string;
  /** Already-approved full-wrap artwork. Never regenerated, never redesigned. */
  artwork: Buffer;
  artworkName?: string;

  binding: KdpBinding;
  ink: KdpInk;
  paper: KdpPaper;
  trim: string;

  title: string;
  author: string;
  subtitle?: string;

  /** Default: place it whenever the binding allows. Set false to suppress. */
  spineText?: boolean;
  fitMode?: FitMode;
  renderDpi?: number;
  jpegQuality?: number;
  /** Declared back-cover content, so the barcode reserve can be checked rather than only drawn. */
  contentBoxes?: ContentBox[];
  /**
   * HOUSE POLICY, not KDP. Fold clearance the spine type is sized down to reach,
   * measured with the halo. Defaults to 20% above KDP's fold variance, because
   * sizing to the published floor leaves nothing for press wander.
   */
  spineTargetClearIn?: number;
  spineGapIn?: number;
  /**
   * Set the author name on the FRONT panel, in real type, rather than relying on
   * the artwork to carry it.
   *
   * 7 NATIONAL PARKS had the name painted into the raster. Changing it then meant
   * a paid image edit and a visual re-read of every other word on the cover,
   * because a model asked to touch one string can corrupt another -- it did,
   * once. With the name set here it is an argument, and a future change costs a
   * rebuild rather than a render.
   *
   * `baselineFromBottomIn` and `capHeightIn` are MEASURED off the approved
   * artwork the first time, so the type lands where the design already put it.
   * There is no default position: a cover this is wrong on is a cover nobody
   * asked for, so the caller states it or nothing is drawn.
   */
  frontAuthor?: {
    baselineFromBottomIn: number;
    capHeightIn: number;
    maxWidthIn: number;
  };
  /** Injected so a caller can produce a reproducible manifest. */
  builtAt?: string;
}

export interface CoverManifest {
  compositorVersion: string;
  builtAt: string;
  interior: { name: string | null; sha256: string; pageCount: number };
  cover: { name: string | null; sha256: string };
  binding: KdpBinding;
  ink: KdpInk;
  paper: KdpPaper;
  trim: string;
  spineIn: number;
  fullWidthIn: number;
  fullHeightIn: number;
  geometryAuthority: string;
  geometrySource: string;
  effectivePpi: number;
  /**
   * Where the author was SET on the front panel, when it was set rather than
   * left to the artwork. Recorded so the placement can be reproduced without
   * re-measuring the approved cover, which is the whole reason the name is no
   * longer baked into the raster.
   */
  frontAuthor?: { name: string; sizePx: number; inkWidthIn: number; baselineFromBottomIn: number };
  status: 'READY' | 'BLOCKED';
}

export interface BuildCoverResult {
  status: 'READY' | 'BLOCKED';
  geometry: CoverGeometry;
  artworkPlan: ArtworkPlan;
  spineText: SpineTextOutcome;
  checks: Check[];
  /** Clean production cover, no guides. */
  productionPdf: Buffer;
  /** Guides drawn for human approval. Never shipped. */
  proofPng: Buffer;
  manifest: CoverManifest;
  report: string;
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/**
 * Read the page count from the interior that is shipping.
 *
 * There is deliberately no override. If the PDF cannot be read, that is a hard
 * stop: falling back to a supplied number is precisely how a cover ends up sized
 * for the wrong book.
 */
export async function readInteriorPageCount(pdf: Buffer): Promise<number> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(pdf, { updateMetadata: false });
  } catch (e) {
    throw new Error(
      `The interior PDF could not be read, so its page count is unknown: ${(e as Error).message}\n` +
        'Refusing to continue. A cover sized from a guessed page count is scrap paper.',
    );
  }
  const n = doc.getPageCount();
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`The interior PDF reported an unusable page count (${n}). Refusing to continue.`);
  }
  return n;
}

export async function buildCover(req: BuildCoverRequest): Promise<BuildCoverResult> {
  const pageCount = await readInteriorPageCount(req.interiorPdf);

  const geometry = resolveCoverGeometry({
    binding: req.binding,
    ink: req.ink,
    paper: req.paper,
    trim: req.trim,
    pageCount,
  });

  const artworkPlan = await planArtwork(req.artwork, geometry, {
    mode: req.fitMode,
    renderDpi: req.renderDpi,
  });
  const dpi = artworkPlan.renderDpi;
  const placed = await renderArtwork(req.artwork, artworkPlan);

  // ── spine typography ──────────────────────────────────────────────────────
  const wantSpineText = req.spineText ?? geometry.spineTextEligible !== false;
  const spineText: SpineTextOutcome = { requested: wantSpineText, placed: false };
  let frontAuthorPlaced:
    | { sizePx: number; inkWidthIn: number; maxWidthIn: number; centreIn: number; baselineFromBottomIn: number }
    | undefined;
  let composed = placed;

  if (wantSpineText && geometry.spineTextEligible === false) {
    spineText.reason = `KDP prints spine text only above ${(geometry.spineTextMinPages ?? 80) - 1} pages; this is ${pageCount}.`;
  } else if (wantSpineText) {
    const safeLengthIn = geometry.panelIsBoard
      ? geometry.spineSafe.heightIn
      : geometry.panelHeightIn - geometry.safeInsetIn * 2;
    const targetClearIn = req.spineTargetClearIn ?? geometry.foldVarianceIn * 1.2;
    try {
      const plan = await planSpineType({
        title: req.title,
        author: req.author,
        wrapHeightPx: Math.round(geometry.fullHeightIn * dpi),
        spineWidthPx: Math.round(geometry.spineIn * dpi),
        foldSafeWidthPx: Math.round(geometry.spineSafe.widthIn * dpi),
        safeLengthPx: Math.round(safeLengthIn * dpi),
        gapPx: Math.round((req.spineGapIn ?? 0.35) * dpi),
        targetClearPx: Math.round(targetClearIn * dpi),
      });
      composed = await sharp(composed)
        .composite([{ input: Buffer.from(plan.svg), left: Math.round(geometry.foldLeftIn * dpi), top: 0 }])
        .toBuffer();
      spineText.placed = true;
      spineText.measuredClearPerSideIn = plan.measuredClearPerSidePx / dpi;
    } catch (e) {
      // planSpineType throws rather than shipping a spine with words missing or
      // type squeezed to illegibility. That refusal is the correct outcome and
      // is surfaced, not swallowed.
      spineText.reason = `Spine type could not be placed on a ${geometry.spineIn.toFixed(4)}in spine: ${(e as Error).message}`;
    }
  }

  // -- front-cover author, set rather than painted --------------------------
  if (req.frontAuthor) {
    const fa = req.frontAuthor;
    const frontLeftIn = geometry.foldRightIn;
    const centreIn = frontLeftIn + geometry.panelWidthIn / 2;
    const maxPx = Math.round(fa.maxWidthIn * dpi);
    /**
     * Sized by MEASURED ink, not by a font-size guess. Cap height is what the
     * eye reads and what was measured off the approved cover; the size that
     * produces it depends on the face, so it is searched for rather than
     * computed.
     */
    const targetCapPx = fa.capHeightIn * dpi;
    let sizePx = Math.round(targetCapPx / 0.7);
    let inkW = 0;
    for (let guard = 0; guard < 60; guard += 1) {
      const probe =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${maxPx * 3}" height="${Math.round(sizePx * 4)}">` +
        `<text x="${Math.round((maxPx * 3) / 2)}" y="${Math.round(sizePx * 2.5)}" text-anchor="middle" ` +
        `font-family="${COVER_FONT}" font-size="${sizePx}" font-weight="700" fill="#fff">` +
        `${escapeXml(req.author)}</text></svg>`;
      const { info } = await sharp(Buffer.from(probe)).trim().toBuffer({ resolveWithObject: true });
      const capPx = info.height;
      inkW = info.width;
      if (Math.abs(capPx - targetCapPx) <= 1 || sizePx <= 8) break;
      sizePx = Math.max(8, Math.round(sizePx * (targetCapPx / Math.max(1, capPx))));
    }
    /** Shrink further only if the name is wider than the design allows. */
    while (inkW > maxPx && sizePx > 8) {
      sizePx -= 1;
      const probe =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${maxPx * 3}" height="${Math.round(sizePx * 4)}">` +
        `<text x="${Math.round((maxPx * 3) / 2)}" y="${Math.round(sizePx * 2.5)}" text-anchor="middle" ` +
        `font-family="${COVER_FONT}" font-size="${sizePx}" font-weight="700" fill="#fff">` +
        `${escapeXml(req.author)}</text></svg>`;
      const { info } = await sharp(Buffer.from(probe)).trim().toBuffer({ resolveWithObject: true });
      inkW = info.width;
    }
    const baselinePx = Math.round((geometry.fullHeightIn - fa.baselineFromBottomIn) * dpi);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(geometry.fullWidthIn * dpi)}" ` +
      `height="${Math.round(geometry.fullHeightIn * dpi)}">` +
      `<text x="${Math.round(centreIn * dpi)}" y="${baselinePx}" text-anchor="middle" ` +
      `font-family="${COVER_FONT}" font-size="${sizePx}" font-weight="700" ` +
      `fill="${COVER_CREAM}" stroke="${COVER_HALO}" stroke-width="${(sizePx * 0.11).toFixed(2)}" ` +
      `stroke-linejoin="round" paint-order="stroke">${escapeXml(req.author)}</text></svg>`;
    composed = await sharp(composed).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).toBuffer();
    frontAuthorPlaced = {
      sizePx,
      inkWidthIn: inkW / dpi,
      maxWidthIn: fa.maxWidthIn,
      centreIn,
      baselineFromBottomIn: fa.baselineFromBottomIn,
    };
  }

  const checks = validateCover({
    geometry,
    artwork: artworkPlan,
    spineText,
    contentBoxes: req.contentBoxes,
  });
  const status: 'READY' | 'BLOCKED' = worstStatus(checks) === 'FAIL' ? 'BLOCKED' : 'READY';

  // ── outputs ───────────────────────────────────────────────────────────────
  const flat = await sharp(composed)
    .jpeg({ quality: req.jpegQuality ?? 92, chromaSubsampling: '4:4:4' })
    .toBuffer();
  const productionPdf = await toPdf(flat, geometry);
  const proofPng = await renderProof(composed, geometry, { dpi, checks });

  const builtAt = req.builtAt ?? new Date().toISOString();
  const manifest: CoverManifest = {
    compositorVersion: COMPOSITOR_VERSION,
    builtAt,
    interior: { name: req.interiorName ?? null, sha256: sha256(req.interiorPdf), pageCount },
    cover: { name: req.artworkName ?? null, sha256: sha256(productionPdf) },
    binding: req.binding,
    ink: req.ink,
    paper: req.paper,
    trim: req.trim,
    spineIn: geometry.spineIn,
    fullWidthIn: geometry.fullWidthIn,
    fullHeightIn: geometry.fullHeightIn,
    geometryAuthority: geometry.spineAuthority,
    geometrySource: geometry.spineSource,
    effectivePpi: artworkPlan.effectivePpi,
    ...(frontAuthorPlaced
      ? {
          frontAuthor: {
            name: req.author,
            sizePx: frontAuthorPlaced.sizePx,
            inkWidthIn: frontAuthorPlaced.inkWidthIn,
            baselineFromBottomIn: frontAuthorPlaced.baselineFromBottomIn,
          },
        }
      : {}),
    status,
  };

  return {
    status,
    geometry,
    artworkPlan,
    spineText,
    checks,
    productionPdf,
    proofPng,
    manifest,
    report: renderReport({ geometry, artworkPlan, spineText, checks, status, manifest }),
  };
}

async function toPdf(jpeg: Buffer, g: CoverGeometry): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([g.fullWidthIn * 72, g.fullHeightIn * 72]);
  const img = await pdf.embedJpg(jpeg);
  page.drawImage(img, { x: 0, y: 0, width: g.fullWidthIn * 72, height: g.fullHeightIn * 72 });
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

function renderReport(o: {
  geometry: CoverGeometry;
  artworkPlan: ArtworkPlan;
  spineText: SpineTextOutcome;
  checks: Check[];
  status: string;
  manifest: CoverManifest;
}): string {
  const { geometry: g, artworkPlan: a, manifest: m } = o;
  const L = (k: string, v: string) => `  ${k.padEnd(22)}${v}`;
  const out: string[] = [];
  out.push('');
  out.push(`COVER BUILD — ${g.binding} · ${g.ink} · ${g.paper} paper · ${g.trim}in`);
  out.push('─'.repeat(78));
  out.push(L('interior', `${m.interior.name ?? '(buffer)'}`));
  out.push(L('interior sha256', m.interior.sha256));
  out.push(L('page count', `${g.pageCount}  (read from the PDF, not supplied)`));
  if (g.pageCountRange) out.push(L('printable range', `${g.pageCountRange.min}-${g.pageCountRange.max}pp`));
  out.push('');
  out.push(L('spine', `${g.spineIn.toFixed(5)}in`));
  out.push(L('', g.spineExplanation));
  out.push(L('authority', g.spineAuthority));
  out.push(L('source', g.spineSource));
  out.push('');
  for (const line of g.wrapExplanation.split('\n')) out.push(L('wrap', line));
  out.push(L('at ' + a.renderDpi + ' DPI', `${a.targetWidthPx} x ${a.targetHeightPx} px`));
  if (g.panelIsBoard) out.push(L('board', `${g.panelWidthIn} x ${g.panelHeightIn}in (larger than trim)`));
  out.push('');
  out.push(L('artwork', `${a.sourceWidthPx} x ${a.sourceHeightPx}px, fit "${a.mode}"`));
  out.push(L('effective PPI', `${a.effectivePpi.toFixed(1)} against a ${g.minDpi} minimum`));
  out.push(
    L('spine text', o.spineText.placed
      ? `placed, ${(o.spineText.measuredClearPerSideIn ?? 0).toFixed(4)}in measured clearance per side`
      : o.spineText.requested
        ? `NOT PLACED — ${o.spineText.reason ?? 'unknown'}`
        : 'not requested'),
  );
  if (o.manifest.frontAuthor) {
    const fa = o.manifest.frontAuthor;
    out.push(
      L('front author', `"${fa.name}" set at ${fa.sizePx}px, ${fa.inkWidthIn.toFixed(3)}in wide, ` +
        `baseline ${fa.baselineFromBottomIn}in from the foot`),
    );
  }
  out.push('');
  out.push('  CHECKS');
  for (const c of o.checks) out.push(`    [${c.status.padEnd(4)}] ${c.label}: ${c.detail}`);
  out.push('');
  out.push(L('cover sha256', m.cover.sha256));
  out.push(L('STATUS', o.status));
  out.push('');
  return out.join('\n');
}
