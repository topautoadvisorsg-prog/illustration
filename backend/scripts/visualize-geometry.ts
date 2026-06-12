/**
 * Geometry visual audit (no DB, no spend). Renders the box model BEFORE vs
 * AFTER reconciliation so we can confirm the fix matches the publishing model
 * before re-paginating 268 pages.
 *
 *   Usage: node --import tsx scripts/visualize-geometry.ts [layoutTemplate]
 *   Output: geometry-audit.png  (+ a printed numeric table)
 */

import fs from 'node:fs';
import sharp from 'sharp';
import type { LayoutTemplateId } from '@wildlands/shared';
import {
  computePageGeometry,
  DEFAULT_MARGINS,
  COMPACT_MARGINS,
} from '../src/pipeline/stage-6-layout/page-geometry.js';
import { directLayout } from '../src/pipeline/stage-6-layout/layout-director.js';
import { resolveGeometry } from '../src/pipeline/publishing-standard/index.js';

const layout = (process.argv[2] as LayoutTemplateId) ?? 'LAYOUT_13_FEATURE_BANNER';
const BODY_PT = 13;
const LINE_HEIGHT = 1.5;
const SAMPLE_BODY = 'word '.repeat(220).trim();

const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ---- BEFORE: the broken split geometry -------------------------------------
// render/spec laid the page out for 7×10 (old default, COMPACT margins) while
// print-prep composed onto an 8.75×11.25 canvas. Content frame was derived from
// the BLEED page (trim + bleed), so it exceeds the trim.
const before = {
  label: 'BEFORE — split geometry',
  printCanvas: { w: 8.75, h: 11.25 }, // what print-prep used
  trim: { w: 7, h: 10 }, // what the render was laid out for
  bleed: 0.125,
  margins: COMPACT_MARGINS,
  // OLD formula: content off the bleed page (width + 1×bleed, height + 2×bleed)
  page: { w: r3(7 + 0.125), h: r3(10 + 0.25) },
  content: {
    w: r3(7 + 0.125 - COMPACT_MARGINS.gutterIn - COMPACT_MARGINS.rightIn),
    h: r3(10 + 0.25 - COMPACT_MARGINS.topIn - COMPACT_MARGINS.bottomIn),
  },
};

// ---- AFTER: one source, clean box model ------------------------------------
const g = resolveGeometry({ trimSize: { widthIn: 8.5, heightIn: 11, bleedIn: 0.125 } });
const geo = computePageGeometry(g.trimSize, DEFAULT_MARGINS);
const after = {
  label: 'AFTER — reconciled',
  printCanvas: { w: g.canvasIn.w, h: g.canvasIn.h },
  trim: { w: g.trimSize.widthIn, h: g.trimSize.heightIn },
  bleed: g.trimSize.bleedIn,
  margins: DEFAULT_MARGINS,
  content: { w: geo.textWidthIn, h: geo.textHeightIn },
};

// Zones from the real layout director (percent of the content frame).
const alloc = directLayout({ bodyMarkdown: SAMPLE_BODY, layoutTemplate: layout, geometry: geo, bodyPt: BODY_PT, lineHeight: LINE_HEIGHT });
const bodyZone = alloc.textSafeZones.filter((z) => z.role === 'body').sort((a, b) => b.widthPct * b.heightPct - a.widthPct * a.heightPct)[0] ?? alloc.textSafeZones[0];
const imgZone = alloc.imagePriorityZones[0];
// Drop-cap: ~3 lines tall, top-left of the body zone (openers only).
const dropCapInch = r3((3 * BODY_PT * LINE_HEIGHT) / 72);

// ---- numeric report --------------------------------------------------------
function table(label: string, d: typeof before | typeof after): void {
  console.log(`\n${label}`);
  console.log(`  bleed canvas : ${d.printCanvas.w} x ${d.printCanvas.h} in`);
  console.log(`  trim box     : ${d.trim.w} x ${d.trim.h} in  (bleed ${d.bleed})`);
  console.log(`  margins      : top ${d.margins.topIn}  bottom ${d.margins.bottomIn}  outside ${d.margins.rightIn}  gutter ${d.margins.gutterIn}`);
  console.log(`  content frame: ${d.content.w} x ${d.content.h} in`);
  if ('page' in d) console.log(`  (content derived from BLEED page ${d.page.w} x ${d.page.h} → exceeds trim by ${r3(d.content.w - (d.trim.w - d.margins.gutterIn - d.margins.rightIn))} in)`);
  else console.log(`  (content derived from TRIM box → no bleed contamination)`);
}
table(before.label, before);
table(after.label, after);
console.log(`\nAFTER zones (layout ${layout}, % of content frame):`);
if (imgZone) console.log(`  image zone : x${imgZone.xPct} y${imgZone.yPct} w${imgZone.widthPct} h${imgZone.heightPct}`);
if (bodyZone) console.log(`  text zone  : x${bodyZone.xPct} y${bodyZone.yPct} w${bodyZone.widthPct} h${bodyZone.heightPct}`);
console.log(`  drop-cap   : ~${dropCapInch} in square (3 lines @ ${BODY_PT}pt/${LINE_HEIGHT}) — openers only`);

// ---- SVG drawing -----------------------------------------------------------
const PX = 60; // px per inch
const PAD = 70;
const PANEL_W = Math.round(8.75 * PX) + PAD * 2;
const PANEL_H = Math.round(11.25 * PX) + PAD * 2 + 40;
const W = PANEL_W * 2 + 40;
const H = PANEL_H + 80;

function box(x: number, y: number, w: number, h: number, stroke: string, fill: string, dash = '', sw = 2): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${dash ? `stroke-dasharray="${dash}"` : ''} />`;
}
function label(x: number, y: number, t: string, color = '#222', size = 13, weight = 'normal', anchor = 'start'): string {
  return `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${t}</text>`;
}

function panel(ox: number, d: typeof before | typeof after, withZones: boolean): string {
  const parts: string[] = [];
  const cx = ox + PAD;
  const cy = 90;
  // bleed canvas (always 8.75×11.25 — the print surface)
  const cw = d.printCanvas.w * PX;
  const ch = d.printCanvas.h * PX;
  parts.push(box(cx, cy, cw, ch, '#b08968', '#efe4d2')); // parchment bleed canvas
  parts.push(label(cx, cy - 10, `BLEED CANVAS ${d.printCanvas.w}×${d.printCanvas.h}`, '#7f5539', 12, 'bold'));

  // trim box. AFTER: inset 0.125 all sides of canvas. BEFORE: 7×10 floated
  // (height-fit + centered) inside the 8.75×11.25 canvas → mismatch gap.
  let tx: number, ty: number;
  if ('page' in d) {
    const scaledW = (d.trim.w / d.trim.h) * d.printCanvas.h; // height-fit
    tx = cx + ((d.printCanvas.w - scaledW) / 2) * PX;
    ty = cy;
    const tw = scaledW * PX;
    const th = d.printCanvas.h * PX;
    parts.push(box(tx, ty, tw, th, '#c1121f', 'rgba(193,18,31,0.05)', '6 4'));
    parts.push(label(tx + 4, ty + 16, `TRIM ${d.trim.w}×${d.trim.h} (render) ✗`, '#c1121f', 12, 'bold'));
    // parchment side bars (the letterbox)
    parts.push(label(cx + 4, cy + ch - 8, `↤ parchment letterbox bars ↦`, '#9c6644', 11));
    // content frame (off bleed page) — overflows the trim
    const fw = d.content.w * PX, fh = d.content.h * PX;
    const fx = tx + d.margins.gutterIn * PX, fy = ty + d.margins.topIn * PX;
    parts.push(box(fx, fy, fw, fh, '#1d4ed8', 'rgba(29,78,216,0.06)'));
    parts.push(label(fx + 4, fy + 16, `CONTENT ${d.content.w}×${d.content.h} (off bleed page)`, '#1d4ed8', 11, 'bold'));
  } else {
    tx = cx + d.bleed * PX; ty = cy + d.bleed * PX;
    const tw = d.trim.w * PX, th = d.trim.h * PX;
    parts.push(box(tx, ty, tw, th, '#2d6a4f', 'rgba(45,106,79,0.05)'));
    parts.push(label(tx + 6, ty + 18, `TRIM ${d.trim.w}×${d.trim.h} ✓`, '#2d6a4f', 12, 'bold'));
    // content frame off trim
    const fx = tx + d.margins.gutterIn * PX, fy = ty + d.margins.topIn * PX;
    const fw = d.content.w * PX, fh = d.content.h * PX;
    parts.push(box(fx, fy, fw, fh, '#1d4ed8', 'rgba(29,78,216,0.05)'));
    parts.push(label(fx + 6, fy + 18, `CONTENT ${d.content.w}×${d.content.h}`, '#1d4ed8', 11, 'bold'));
    if (withZones) {
      // image + text zones (percent of content frame)
      if (imgZone) {
        parts.push(box(fx + (imgZone.xPct / 100) * fw, fy + (imgZone.yPct / 100) * fh, (imgZone.widthPct / 100) * fw, (imgZone.heightPct / 100) * fh, '#b45309', 'rgba(180,83,9,0.18)'));
        parts.push(label(fx + (imgZone.xPct / 100) * fw + 6, fy + (imgZone.yPct / 100) * fh + 16, 'IMAGE ZONE', '#92400e', 11, 'bold'));
      }
      if (bodyZone) {
        const bx = fx + (bodyZone.xPct / 100) * fw, by = fy + (bodyZone.yPct / 100) * fh;
        const bw = (bodyZone.widthPct / 100) * fw, bh = (bodyZone.heightPct / 100) * fh;
        parts.push(box(bx, by, bw, bh, '#3f6212', 'rgba(101,163,13,0.15)'));
        parts.push(label(bx + 6, by + 16, 'TEXT ZONE', '#3f6212', 11, 'bold'));
        // drop-cap region top-left of text zone
        const dc = dropCapInch * PX;
        parts.push(box(bx, by, dc, dc, '#7c3aed', 'rgba(124,58,237,0.25)'));
        parts.push(label(bx + dc + 4, by + dc / 2, `drop-cap ~${dropCapInch}in`, '#6d28d9', 10));
      }
    }
  }
  parts.push(label(ox + PANEL_W / 2, cy + ch + 34, d.label, '#111', 15, 'bold', 'middle'));
  return parts.join('\n');
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#ffffff"/>
${label(W / 2, 34, `Wild Lands geometry — box-model audit (layout ${layout})`, '#111', 18, 'bold', 'middle')}
${panel(20, before, false)}
${panel(PANEL_W + 40, after, true)}
</svg>`;

const out = 'geometry-audit.png';
await sharp(Buffer.from(svg)).png().toFile(out);
fs.writeFileSync('geometry-audit.svg', svg);
console.log(`\n✓ wrote ${out}`);
