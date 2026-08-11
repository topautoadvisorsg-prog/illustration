/**
 * COVER BLUEPRINT — the layout reference image handed to the image model.
 *
 * The prompt says WHAT to design. This says WHERE it goes. They are separate on
 * purpose: prose cannot place a 0.385in spine on a 1536px canvas, and the
 * evidence for that is a model that painted a spine seven times too wide when
 * given only the measurement in words.
 *
 * ─── DRAWN IN MODEL SPACE, NOT PRINT SPACE ────────────────────────────────────
 *
 * Every zone is drawn at its position in the MODEL's canvas, after the
 * compositor's centre-crop has been worked backwards. A blueprint drawn at wrap
 * proportions would be a different shape from the canvas the model paints on,
 * and every zone on it would be a lie.
 *
 * ─── THIS IMAGE IS NEVER PRINTED ──────────────────────────────────────────────
 *
 * It is architectural plans. The prompt states, and the generated artwork must
 * honour, that no guide line, box, label or tint from this image appears in the
 * final cover.
 *
 * A generalisation of `backend/scripts/lib/cover-blueprint.ts`, which worked but
 * was hardcoded to Volume I's hardcover wrap (`Wf = 16.409, Hf = 11.417`) with
 * that book's title and author baked into the zone labels, and lived in a script
 * where no operator could reach it.
 */
import sharp from 'sharp';
import type { CoverSpec } from './cover-spec.js';
import type { Rect } from './cover-geometry.js';

const ART = '#dbe6f4';
const ART_EDGE = '#8d9cb0';
const SPINE_TINT = '#c7d6ea';
const RED = '#cc2222';
const RED_FILL = 'rgba(204,34,34,0.10)';
const DISCARD = 'rgba(0,0,0,0.30)';
const KEEP_EMPTY = '#1f7a3d';

/** XML-escape. Book titles legitimately contain & and quotes. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const n = (v: number): string => Number(v.toFixed(1)).toString();

/** A slice of a rect, expressed as fractions of its height. */
function band(r: Rect, fromPct: number, toPct: number): Rect {
  return { x: r.x, y: r.y + r.h * fromPct, w: r.w, h: r.h * (toPct - fromPct) };
}

interface TextZone {
  rect: Rect;
  label: string;
  /** The actual copy that belongs here, so the operator can verify placement. */
  sample?: string;
  rotated?: boolean;
  /** A "do not paint here" zone rather than a "put text here" zone. */
  keepEmpty?: boolean;
}

/**
 * Where each piece of copy sits inside its panel.
 *
 * Proportional to the SAFE area, so the same rules produce a correct layout at
 * any trim, page count or paper stock. Nothing here is per-book.
 */
export function blueprintTextZones(spec: CoverSpec): TextZone[] {
  const { frontSafe, backSafe, spineSafe } = spec.geometry.modelPx;
  const zones: TextZone[] = [];

  // FRONT — title block high-centre, author low. The gap between them is where
  // the art breathes, and it is why the title does not drift to the edge.
  zones.push({ rect: band(frontSafe, 0.14, 0.34), label: 'TITLE', sample: spec.copy.title });
  if (spec.copy.subtitle) {
    zones.push({ rect: band(frontSafe, 0.36, 0.46), label: 'SUBTITLE', sample: spec.copy.subtitle });
  }
  if (spec.copy.coverDescription) {
    zones.push({
      rect: band(frontSafe, 0.47, 0.55),
      label: 'COVER LINE',
      sample: spec.copy.coverDescription,
    });
  }
  zones.push({ rect: band(frontSafe, 0.74, 0.84), label: 'AUTHOR', sample: spec.copy.author });
  if (spec.copy.seriesLine) {
    zones.push({ rect: band(frontSafe, 0.86, 0.94), label: 'SERIES', sample: spec.copy.seriesLine });
  }

  // SPINE — a text zone here means "the model letters this". When code sets the
  // spine, the blueprint must say KEEP EMPTY instead, or the reference image and
  // the prompt are giving opposite instructions about the same 46 pixels.
  if (!spec.spineTextAllowed) {
    // Under KDP's 79-page floor nothing goes on the spine, whoever sets type.
    // No zone at all: a keep-empty box would still imply the spine is in play.
  } else if (spec.spineTypeSetBy === 'deterministic' && spineSafe.w > 0) {
    zones.push({ rect: band(spineSafe, 0.06, 0.94), label: 'SPINE: LEAVE EMPTY', rotated: true, keepEmpty: true });
  } else if (spineSafe.w > 0) {
    zones.push({ rect: band(spineSafe, 0.08, 0.62), label: 'SPINE: TITLE', rotated: true });
    zones.push({ rect: band(spineSafe, 0.70, 0.94), label: 'SPINE: AUTHOR', rotated: true });
  }

  // BACK — one block for the copy, kept off the lower-right where KDP prints its
  // own barcode over the artwork.
  if (spec.copy.back) {
    zones.push({
      rect: band(backSafe, 0.06, 0.72),
      label: 'BACK COVER COPY',
      sample: spec.copy.back.mainDescription,
    });
  }
  return zones;
}

export function buildCoverBlueprintSvg(spec: CoverSpec): string {
  const { modelCanvas, modelPx, crop } = spec.geometry;
  const W = modelCanvas.widthPx;
  const H = modelCanvas.heightPx;
  const o: string[] = [];
  const fs = (k: number) => n(W * k);

  const r = (rc: Rect, fill: string, stroke?: string, dash?: boolean, sw = 0.0022) =>
    o.push(
      `<rect x="${n(rc.x)}" y="${n(rc.y)}" width="${n(rc.w)}" height="${n(rc.h)}" fill="${fill}"` +
        (stroke
          ? ` stroke="${stroke}" stroke-width="${fs(sw)}"${dash ? ` stroke-dasharray="${fs(0.006)} ${fs(0.0045)}"` : ''}`
          : '') +
        `/>`,
    );

  const label = (x: number, y: number, t: string, size: number, fill: string, weight = '400', rotate?: number) =>
    o.push(
      `<text x="${n(x)}" y="${n(y)}" text-anchor="middle" font-size="${fs(size)}" fill="${fill}" font-weight="${weight}"` +
        (rotate ? ` transform="rotate(${rotate} ${n(x)} ${n(y)})"` : '') +
        `>${esc(t)}</text>`,
    );

  // 1. The whole canvas is artwork. There is no "background area" that is not
  //    illustration; the wrap is one continuous image.
  r({ x: 0, y: 0, w: W, h: H }, ART);
  r(modelPx.spine, SPINE_TINT);

  // 2. What the compositor throws away. Drawn as a dimmed margin so the model can
  //    see that the outer band is disposable, not a place to put anything.
  const s = crop.survivingModelRect;
  if (crop.cropPerSideModelPxX > 0.5) {
    r({ x: 0, y: 0, w: s.x, h: H }, DISCARD);
    r({ x: s.x + s.w, y: 0, w: W - (s.x + s.w), h: H }, DISCARD);
  }
  if (crop.cropPerSideModelPxY > 0.5) {
    r({ x: 0, y: 0, w: W, h: s.y }, DISCARD);
    r({ x: 0, y: s.y + s.h, w: W, h: H - (s.y + s.h) }, DISCARD);
  }

  // 3. Panel boundaries and the two folds.
  for (const foldX of [modelPx.spine.x, modelPx.spine.x + modelPx.spine.w]) {
    o.push(
      `<line x1="${n(foldX)}" y1="0" x2="${n(foldX)}" y2="${n(H)}" stroke="${ART_EDGE}" stroke-width="${fs(0.0016)}" stroke-dasharray="${fs(0.01)} ${fs(0.006)}"/>`,
    );
  }

  label(
    modelPx.backPanel.x + modelPx.backPanel.w / 2,
    H * 0.93,
    'BACK COVER',
    0.013,
    ART_EDGE,
    '700',
  );
  label(
    modelPx.frontPanel.x + modelPx.frontPanel.w / 2,
    H * 0.93,
    'FRONT COVER',
    0.013,
    ART_EDGE,
    '700',
  );

  // 4. Trim + safe outlines. Type lives inside the red line; art runs past it.
  r(modelPx.trim, 'none', ART_EDGE, false, 0.0014);
  r(modelPx.safe, 'none', RED, false, 0.0022);

  // 5. The text zones. A keep-empty zone is drawn in a different colour and left
  //    unfilled, so the reference cannot be read as "put something here".
  for (const z of blueprintTextZones(spec)) {
    const stroke = z.keepEmpty ? KEEP_EMPTY : RED;
    r(z.rect, z.keepEmpty ? 'none' : RED_FILL, stroke, true);
    const cx = z.rect.x + z.rect.w / 2;
    const cy = z.rect.y + z.rect.h / 2;
    if (z.rotated) {
      label(cx, cy, z.label, 0.0092, stroke, '700', 90);
    } else {
      label(cx, cy, z.label, 0.0115, RED, '700');
      if (z.sample) {
        const clipped = z.sample.length > 46 ? `${z.sample.slice(0, 44)}…` : z.sample;
        label(cx, cy + Number(fs(0.016)), clipped, 0.0085, RED);
      }
    }
  }

  // 6. Legends. The model reads these as instructions about the image it is
  //    looking at, which is exactly what they are.
  label(W / 2, H * 0.028, 'RED BOXES = PLACE TEXT HERE. Artwork still covers the entire canvas.', 0.0125, RED, '700');
  if (spec.spineTypeSetBy === 'deterministic') {
    label(W / 2, H * 0.076, 'GREEN BOX = SPINE. LEAVE IT COMPLETELY EMPTY — no text, no fold lines.', 0.0115, KEEP_EMPTY, '700');
  }
  label(
    W / 2,
    H * 0.052,
    'DIMMED EDGES ARE CROPPED OFF AND DISCARDED — nothing important there',
    0.0105,
    '#333333',
    '700',
  );
  label(W / 2, H * 0.975, 'ALL TEXT INSIDE THE RED LINE. Artwork may bleed past it; text may not.', 0.0105, RED, '700');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="sans-serif">${o.join('')}</svg>`;
}

/** The blueprint as a PNG, at the model's exact canvas size. */
export async function renderCoverBlueprintPng(spec: CoverSpec): Promise<Buffer> {
  const svg = buildCoverBlueprintSvg(spec);
  return sharp(Buffer.from(svg))
    .resize(spec.geometry.modelCanvas.widthPx, spec.geometry.modelCanvas.heightPx, { fit: 'fill' })
    .png()
    .toBuffer();
}
