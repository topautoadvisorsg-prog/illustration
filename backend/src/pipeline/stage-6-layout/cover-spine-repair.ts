/**
 * SPINE REPAIR — fix the spine of an approved cover without regenerating it.
 *
 * The third cover for NO ONE TOLD ME THAT was accepted on everything except the
 * spine, where the author name came out stacked on two cramped lines instead of
 * running along the spine. Regenerating the whole wrap to fix that would throw
 * away a front and back the operator had already approved and would produce a
 * different cover — the model does not repeat itself.
 *
 * So: send the SAME artwork back through the image EDIT endpoint with a mask
 * that exposes only the spine, and then — this is the part that actually makes
 * it safe — composite the returned spine strip back onto the ORIGINAL pixels.
 *
 * The mask constrains the REQUEST; it is not a promise about the response. That
 * warning is written on `generateImageFromBlueprint`'s own maskPng field, and
 * the remedy it names is exactly this: keep the original pixels and paste the
 * masked region back yourself. Everything outside the spine is therefore
 * byte-identical to the approved cover, by construction rather than by trust.
 *
 * WHAT THIS CANNOT DO: the spine is 0.385in of an 11.635in wrap. In the model's
 * 1536px-wide canvas that is roughly 45 pixels. There is a real chance the model
 * cannot set legible rotated type in a strip that narrow. The caller gets the
 * before/after strip geometry back so a human can judge, and a failed attempt
 * costs one call and changes nothing outside the spine.
 */
import sharp from 'sharp';
import type { ProjectConfig } from '@wildlands/shared';
import { computeCoverDimensions, COVER_BLEED_IN } from './render-html.js';

export interface SpineStripGeometry {
  /** Spine rectangle in the GENERATED ART's pixel space. */
  xPx: number;
  widthPx: number;
  /** The art canvas these coordinates belong to. */
  artWidthPx: number;
  artHeightPx: number;
  /** How wide the spine is on the printed book. */
  spineIn: number;
}

/**
 * Where the spine sits in the GENERATED ART, not in the printed wrap.
 *
 * These differ. `composeCoverPrint` fits the art onto the wrap with
 * `fit: 'cover'`, which scales the art until it covers and centre-crops the
 * overflow, so a position on the wrap is not the same fraction of the art. Work
 * that mapping backwards or the mask lands next to the spine instead of on it.
 */
export function spineStripInArt(
  config: ProjectConfig,
  pageCount: number,
  artWidthPx: number,
  artHeightPx: number,
): SpineStripGeometry {
  const dims = computeCoverDimensions(config, pageCount);
  const dpi = 300;
  const canvasW = Math.round(dims.fullWidthIn * dpi);
  const canvasH = Math.round(dims.fullHeightIn * dpi);

  // The same transform composeCoverPrint applies.
  const scale = Math.max(canvasW / artWidthPx, canvasH / artHeightPx);
  const cropX = (artWidthPx * scale - canvasW) / 2;

  // Spine bounds on the WRAP, in pixels from its left edge.
  const spineLeftWrapPx = (COVER_BLEED_IN + config.trimSize.widthIn) * dpi;
  const spineRightWrapPx = spineLeftWrapPx + dims.spineIn * dpi;

  // ...mapped back into ART pixels.
  const xPx = Math.floor((spineLeftWrapPx + cropX) / scale);
  const rightPx = Math.ceil((spineRightWrapPx + cropX) / scale);

  return {
    xPx: Math.max(0, xPx),
    widthPx: Math.min(artWidthPx - Math.max(0, xPx), Math.max(1, rightPx - xPx)),
    artWidthPx,
    artHeightPx,
    spineIn: dims.spineIn,
  };
}

/**
 * Mask for the edit request: TRANSPARENT over the spine (the model may paint
 * there), fully OPAQUE everywhere else (asked to hold).
 */
export async function buildSpineMask(strip: SpineStripGeometry): Promise<Buffer> {
  const hold = await sharp({
    create: {
      width: strip.artWidthPx,
      height: strip.artHeightPx,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  // Punch the spine out of the opaque field. A transparent rectangle composited
  // with `dest-out` clears alpha in exactly that column.
  const hole = await sharp({
    create: {
      width: strip.widthPx,
      height: strip.artHeightPx,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  return sharp(hold)
    .composite([{ input: hole, left: strip.xPx, top: 0, blend: 'dest-out' }])
    .png()
    .toBuffer();
}

/**
 * Keep the original artwork and take ONLY the spine column from the edit.
 *
 * This is what makes the operation honest. Whatever the model returns for the
 * rest of the canvas is discarded, so an approved front and back cannot drift.
 */
export async function compositeSpineOnly(
  originalArt: Buffer,
  editedArt: Buffer,
  strip: SpineStripGeometry,
): Promise<Buffer> {
  // The edit endpoint returns the requested size; normalise before cutting so a
  // size mismatch cannot silently shift the strip.
  const edited = await sharp(editedArt)
    .resize({ width: strip.artWidthPx, height: strip.artHeightPx, fit: 'fill' })
    .png()
    .toBuffer();

  const spineColumn = await sharp(edited)
    .extract({ left: strip.xPx, top: 0, width: strip.widthPx, height: strip.artHeightPx })
    .png()
    .toBuffer();

  return sharp(originalArt)
    .composite([{ input: spineColumn, left: strip.xPx, top: 0 }])
    .png()
    .toBuffer();
}

export interface SpineRepairResult {
  projectId: string;
  /** Where the repaired art was stored. Same path — this replaces the cover. */
  imagePath: string;
  /** The previous artwork, kept so the operator can go back. */
  backupPath: string;
  strip: SpineStripGeometry;
  promptPreview: string;
  /** True when the returned image differed from the original in the strip. */
  spineChanged: boolean;
}

/**
 * PAID. One image-edit call, and only the spine column of the result is kept.
 *
 * The previous artwork is copied aside first. A repair that comes back worse is
 * then an undo rather than another generation, which matters because the cover
 * it is editing is one the operator already approved.
 */
export async function repairCoverSpine(projectId: string): Promise<SpineRepairResult> {
  const { getProject } = await import('../../db/repositories/projects.repo.js');
  const { getProjectStorage } = await import('../../services/storage/project-storage.js');
  const { generateImageFromBlueprint } = await import('../../services/openai/openai.js');
  const { ProjectConfigSchema } = await import('@wildlands/shared');
  const { renderCoverGeometry } = await import('./render-chapter.js');

  const project = await getProject(projectId);
  if (!project) throw new Error('Project not found.');
  const config = ProjectConfigSchema.parse(project.config);
  const artPath = config.publishing.coverAssetPath;
  if (!artPath) throw new Error('No cover artwork to repair. Generate the cover first.');

  const storage = getProjectStorage();
  const original = await storage.readProjectFile(artPath);
  const meta = await sharp(original).metadata();
  const artWidthPx = meta.width ?? 1536;
  const artHeightPx = meta.height ?? 1024;

  const { pageCount } = await renderCoverGeometry(projectId, config);
  const strip = spineStripInArt(config, pageCount, artWidthPx, artHeightPx);
  const prompt = buildSpineRepairPrompt(config, strip);

  // Keep the approved cover before touching anything.
  const backup = await storage.writeProjectFile(
    projectId,
    ['cover', `cover-wrap-art.before-spine-repair.${Date.now()}.png`],
    original,
  );

  const edited = await generateImageFromBlueprint({
    blueprintPng: original,
    maskPng: await buildSpineMask(strip),
    prompt,
    size: `${artWidthPx}x${artHeightPx}` as never,
  });

  const repaired = await compositeSpineOnly(original, edited.pngBuffer, strip);

  // Did the strip actually change? A repair that returned the same pixels is a
  // wasted call, and the operator should be told rather than left comparing
  // two identical covers by eye.
  const cut = (buf: Buffer) =>
    sharp(buf).extract({ left: strip.xPx, top: 0, width: strip.widthPx, height: artHeightPx }).raw().toBuffer();
  const spineChanged = !(await cut(original)).equals(await cut(repaired));

  const stored = await storage.writeProjectFile(projectId, ['cover', 'cover-wrap-art.png'], repaired);

  return {
    projectId,
    imagePath: stored.relativePath,
    backupPath: backup.relativePath,
    strip,
    promptPreview: prompt.slice(0, 1200),
    spineChanged,
  };
}

/** The instruction sent with the edit. Deliberately about one thing only. */
export function buildSpineRepairPrompt(config: ProjectConfig, strip: SpineStripGeometry): string {
  const title = (config.publishing.title ?? config.title).toUpperCase();
  const author = (config.publishing.authors?.length
    ? config.publishing.authors.join(', ')
    : config.authorName
  ).toUpperCase();

  return [
    'Edit ONLY the narrow vertical spine strip of this book cover. Everything outside that strip must be left exactly as it is.',
    '',
    'THE ONE PROBLEM TO FIX: the author name on the spine is stacked onto two cramped lines. It must read as ONE single line.',
    '',
    'The spine must carry, both rotated 90 degrees to read from top to bottom, in the same typeface, colour and style already used on this spine:',
    `  TITLE:  ${title}`,
    `  AUTHOR: ${author}`,
    '',
    'Requirements:',
    `- ${author} runs along the spine on ONE line, reading top-to-bottom, never stacked, never wrapped, never on two lines.`,
    '- The title stays as it already is; only the author name is being corrected.',
    '- Both sit centred across the width of the spine, clear of the two folds on either side.',
    '- If the author name is too long to fit at its current size, set it SMALLER so it still fits on one line. Shrinking the type is correct; stacking it is not.',
    '- Keep the same background colour, the same typeface and the same spacing character already present on the spine.',
    '',
    'Do NOT redraw, restyle, recolour or move anything on the front cover or the back cover. Do not alter the illustration, the title block, the objects, or any other text anywhere on the wrap.',
  ].join('\n');
}
