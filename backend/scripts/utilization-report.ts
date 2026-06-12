/**
 * Trim utilization + density report (no DB, no spend).
 *
 * Answers the business question, not the geometry one: how much of the TRIM
 * (the page the customer sees) are we actually using, and what does the margin
 * setting do to text capacity / page count? Everything visible — image, text,
 * ornament, badge, folio — lives inside the trim; margins are blank border.
 *
 *   node --import tsx scripts/utilization-report.ts
 *   → utilization-report.png  + printed tables
 */

import sharp from 'sharp';
import type { LayoutTemplateId } from '@wildlands/shared';
import { computePageGeometry, type PageMargins } from '../src/pipeline/stage-6-layout/page-geometry.js';
import { analyzeTextFit } from '../src/pipeline/stage-6-layout/text-fit.js';
import { directLayout } from '../src/pipeline/stage-6-layout/layout-director.js';

const TRIM = { w: 8.5, h: 11 };
const TRIM_SIZE = { widthIn: 8.5, heightIn: 11, bleedIn: 0.125 };
const TRIM_AREA = TRIM.w * TRIM.h; // 93.5
const BODY_PT = 13;
const LINE_HEIGHT = 1.5; // locked Publishing Standard
const PLAIN = 'word '.repeat(400).trim(); // no headers → clean capacity

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const r2 = (n: number) => Math.round(n * 100) / 100;

interface Scenario { name: string; m: PageMargins; }
const scenarios: Scenario[] = [
  { name: 'CURRENT (1.0 / g1.25)', m: { topIn: 1, bottomIn: 1, rightIn: 1, gutterIn: 1.25 } },
  { name: 'Moderate (0.75 / g0.875)', m: { topIn: 0.75, bottomIn: 0.75, rightIn: 0.75, gutterIn: 0.875 } },
  { name: 'Tight (0.5 / g0.625)', m: { topIn: 0.5, bottomIn: 0.5, rightIn: 0.5, gutterIn: 0.625 } },
  { name: 'Field-guide (0.375 / g0.5)', m: { topIn: 0.375, bottomIn: 0.375, rightIn: 0.375, gutterIn: 0.5 } },
];

function contentDims(m: PageMargins): { w: number; h: number } {
  return { w: r2(TRIM.w - m.gutterIn - m.rightIn), h: r2(TRIM.h - m.topIn - m.bottomIn) };
}
function capacityFor(m: PageMargins, layout: LayoutTemplateId): number {
  const geo = computePageGeometry(TRIM_SIZE, m);
  return analyzeTextFit({ bodyMarkdown: PLAIN, layoutTemplate: layout, geometry: geo, bodyPt: BODY_PT, lineHeight: LINE_HEIGHT }).capacityChars;
}

// ---- Scenario table (utilization + density lever) --------------------------
console.log(`\nTRIM 8.5×11 = ${TRIM_AREA} sq in. Density layout = LAYOUT_2_TEXT_HEAVY @ ${BODY_PT}pt/${LINE_HEIGHT}.`);
console.log('\nMARGIN SCENARIO            content(in)   trim used   chars/text-page   vs current   ~text-page count*');
const base = capacityFor(scenarios[0]!.m, 'LAYOUT_2_TEXT_HEAVY');
for (const s of scenarios) {
  const c = contentDims(s.m);
  const used = (c.w * c.h) / TRIM_AREA;
  const cap = capacityFor(s.m, 'LAYOUT_2_TEXT_HEAVY');
  const rel = cap / base;
  const pageFactor = 1 / rel; // text-driven pages scale inversely with capacity
  console.log(
    `${s.name.padEnd(26)} ${`${c.w}×${c.h}`.padEnd(12)} ${pct(used).padEnd(11)} ${String(cap).padEnd(17)} ${`${rel >= 1 ? '+' : ''}${((rel - 1) * 100).toFixed(0)}%`.padEnd(12)} ×${pageFactor.toFixed(2)}`,
  );
}
console.log('* relative to current; absolute page count needs the manuscript (DB re-paginate).');

// ---- Per-layout coverage of the TRIM (current margins) ---------------------
const curGeo = computePageGeometry(TRIM_SIZE, scenarios[0]!.m);
const contentFrac = (curGeo.textWidthIn * curGeo.textHeightIn) / TRIM_AREA;
const layouts: LayoutTemplateId[] = ['LAYOUT_13_FEATURE_BANNER', 'LAYOUT_2_TEXT_HEAVY', 'LAYOUT_3_ILLUSTRATION_DOMINANT'];
console.log(`\nCOVERAGE OF TRIM (current margins; content frame = ${pct(contentFrac)} of trim):`);
console.log('layout                          image%   text%   used%   blank%(margin+gaps)');
interface Cov { layout: string; image: number; text: number; }
const covs: Cov[] = [];
for (const L of layouts) {
  const a = directLayout({ bodyMarkdown: PLAIN, layoutTemplate: L, geometry: curGeo, bodyPt: BODY_PT, lineHeight: LINE_HEIGHT });
  const img = a.imagePriorityZones.reduce((s, z) => s + (z.widthPct / 100) * (z.heightPct / 100), 0);
  const txt = a.textSafeZones.filter((z) => z.role === 'body').reduce((s, z) => s + (z.widthPct / 100) * (z.heightPct / 100), 0);
  const imageOfTrim = img * contentFrac;
  const textOfTrim = txt * contentFrac;
  const used = imageOfTrim + textOfTrim;
  covs.push({ layout: L, image: imageOfTrim, text: textOfTrim });
  console.log(`${L.padEnd(31)} ${pct(imageOfTrim).padEnd(8)} ${pct(textOfTrim).padEnd(7)} ${pct(used).padEnd(7)} ${pct(1 - used)}`);
}

// ---- Reference field guides (positioning context) --------------------------
console.log('\nREFERENCE CLASSES (typical published specs):');
console.log('  POCKET/DENSE FIELD GUIDE');
console.log('   • Sibley Guide to Birds   ~6.1×9.25, margins ~0.4in, multi-subject/page, ~80%+ trim used');
console.log('   • Peterson Field Guide    ~5.5×8.5,  margins ~0.5in, plates+dense text, ~78% used');
console.log('   • Audubon (pocket)        ~4×7.5,    margins ~0.35in, photo-dense, ~82% used');
console.log('  PREMIUM ILLUSTRATED MONOGRAPH / HEIRLOOM (our positioning)');
console.log('   • Large-format natural-history (DK/NatGeo) ~9–10×11–12, margins ~0.75–1in, big plates, ~55–65% used');

// ---- Visual: utilization stacked bar + capacity bars -----------------------
const W = 1200, H = 620;
const rep = covs[0]!; // LAYOUT_13 opener as the representative page
const marginBlank = 1 - contentFrac;
const contentBlank = contentFrac - rep.image - rep.text;
const segs = [
  { label: `MARGIN (blank border) ${pct(marginBlank)}`, frac: marginBlank, color: '#e9d8c3' },
  { label: `IMAGE ${pct(rep.image)}`, frac: rep.image, color: '#c8842a' },
  { label: `TEXT ${pct(rep.text)}`, frac: rep.text, color: '#6a8f3c' },
  { label: `IN-PAGE BLANK (title band/gaps) ${pct(contentBlank)}`, frac: contentBlank, color: '#d9cdb8' },
];
function t(x: number, y: number, s: string, size = 14, color = '#111', weight = 'normal', anchor = 'start'): string {
  return `<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${s}</text>`;
}
const parts: string[] = [`<rect width="${W}" height="${H}" fill="#fff"/>`];
parts.push(t(W / 2, 34, 'Trim utilization — where the 8.5×11 page actually goes (representative opener)', 18, '#111', 'bold', 'middle'));

// stacked bar (horizontal, 100% of trim)
const barX = 60, barY = 70, barW = 1080, barH = 70;
let cursor = barX;
for (const s of segs) {
  const w = s.frac * barW;
  parts.push(`<rect x="${cursor}" y="${barY}" width="${w}" height="${barH}" fill="${s.color}" stroke="#666"/>`);
  if (w > 70) parts.push(t(cursor + 6, barY + barH / 2 + 4, pct(s.frac), 13, '#222', 'bold'));
  cursor += w;
}
let ly = barY + barH + 30;
for (const s of segs) { parts.push(`<rect x="${barX}" y="${ly - 12}" width="16" height="16" fill="${s.color}" stroke="#666"/>`); parts.push(t(barX + 24, ly + 1, s.label, 14)); ly += 26; }
const usedRep = rep.image + rep.text;
parts.push(t(barX, ly + 14, `USED (image+text): ${pct(usedRep)}    BLANK (margin + in-page): ${pct(1 - usedRep)}`, 15, '#111', 'bold'));

// capacity-vs-margin bars
const cap0 = capacityFor(scenarios[0]!.m, 'LAYOUT_2_TEXT_HEAVY');
const cBarsY = 360, cBarH = 200, cBarBase = cBarsY + cBarH;
parts.push(t(barX, cBarsY - 12, 'Text capacity per page vs margin setting (text-heavy layout)', 15, '#111', 'bold'));
const maxCap = Math.max(...scenarios.map((s) => capacityFor(s.m, 'LAYOUT_2_TEXT_HEAVY')));
scenarios.forEach((s, i) => {
  const cap = capacityFor(s.m, 'LAYOUT_2_TEXT_HEAVY');
  const bh = (cap / maxCap) * cBarH;
  const x = barX + i * 270;
  const color = i === 0 ? '#9b6a3a' : '#3f6212';
  parts.push(`<rect x="${x}" y="${cBarBase - bh}" width="170" height="${bh}" fill="${color}"/>`);
  parts.push(t(x + 85, cBarBase - bh - 8, `${cap} ch  (×${(cap / cap0).toFixed(2)})`, 13, '#111', 'bold', 'middle'));
  const c = contentDims(s.m);
  parts.push(t(x + 85, cBarBase + 20, s.name.split(' ')[0]!, 13, '#111', 'normal', 'middle'));
  parts.push(t(x + 85, cBarBase + 38, `${c.w}×${c.h} · ${pct((c.w * c.h) / TRIM_AREA)} trim`, 12, '#555', 'normal', 'middle'));
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('\n')}</svg>`;
await sharp(Buffer.from(svg)).png().toFile('utilization-report.png');
console.log('\n✓ wrote utilization-report.png');
