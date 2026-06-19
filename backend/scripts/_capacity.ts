/* Capacity audit: for each layout, how many characters of the STANDARD body size
 * actually fit in its painted reading-field zone(s) — vs how many the paginator
 * assigns. When pagination > zone capacity, that layout overflows the bottom rail.
 * Read-only. Usage: _capacity.ts */
import { getProject } from '../src/db/repositories/projects.repo.js';
import { ProjectConfigSchema } from '@wildlands/shared';
import { resolveGeometry } from '../src/pipeline/publishing-standard/index.js';
import { computePageGeometry } from '../src/pipeline/stage-6-layout/page-geometry.js';
import { directLayout } from '../src/pipeline/stage-6-layout/layout-director.js';
import { LAYOUT_PROFILES } from '../src/pipeline/stage-6-layout/layout-profiles.js';

const P = '66c1c69c-2c81-409e-a4b5-bff3f3bb04ba';
const AVG_CHAR_WIDTH_EM = 0.45; // mirror layout-director

const project = await getProject(P);
if (!project) throw new Error('project not found');
const config = ProjectConfigSchema.parse(project.config);
const bodyPt = config.typography.bodyPt;
const lineHeight = config.typography.lineHeight;
const trim = resolveGeometry(config).trimSize;
const geometry = computePageGeometry(trim);
// Zones are painted as % of the full BLEED canvas (trim + bleed on every side),
// the same surface the blueprint orange rail is drawn on.
const canvasW = trim.widthIn + 2 * trim.bleedIn;
const canvasH = trim.heightIn + 2 * trim.bleedIn;

console.log(`Book: bodyPt=${bodyPt} lineHeight=${lineHeight} trim=${trim.widthIn}x${trim.heightIn} bleed=${trim.bleedIn} canvas=${canvasW.toFixed(2)}x${canvasH.toFixed(2)}in\n`);

const BIG = 'x'.repeat(8000); // force the standard (non-underfilled) zone plan
function zoneCapacityChars(wPct: number, hPct: number): number {
  const wPt = (wPct / 100) * canvasW * 72;
  const hPt = (hPct / 100) * canvasH * 72;
  const cpl = Math.max(1, Math.floor(wPt / (AVG_CHAR_WIDTH_EM * bodyPt)));
  const lines = Math.max(0, Math.floor(hPt / (bodyPt * lineHeight)));
  return cpl * lines;
}

type Row = { id: string; img: number; zoneCap: number; pagCap: number };
const rows: Row[] = [];
for (const id of Object.keys(LAYOUT_PROFILES) as (keyof typeof LAYOUT_PROFILES)[]) {
  const prof = LAYOUT_PROFILES[id];
  const alloc = directLayout({ bodyMarkdown: BIG, layoutTemplate: id, geometry, bodyPt, lineHeight, hasTitle: true, isEntryOpener: false });
  const bodyZones = alloc.textSafeZones.filter((z) => z.role === 'body');
  const zoneCap = bodyZones.reduce((s, z) => s + zoneCapacityChars(z.widthPct, z.heightPct), 0);
  const pagCap = alloc.wordsPerOpeningPage * 6; // paginator's assigned chars (≈ words×6)
  rows.push({ id, img: Math.round(prof.artAreaFraction * 100), zoneCap, pagCap });
}

rows.sort((a, b) => b.zoneCap - a.zoneCap);
const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log(pad('LAYOUT', 34) + pad('IMG%', 6) + pad('ZONE chars', 12) + pad('ZONE words', 12) + pad('PAGINATOR chars', 16) + 'FLAG');
console.log('-'.repeat(92));
for (const r of rows) {
  const overflow = r.pagCap > r.zoneCap * 1.02 ? '⚠ paginator > zone (overflows)' : '';
  console.log(pad(r.id, 34) + pad(r.img, 6) + pad(r.zoneCap, 12) + pad(Math.round(r.zoneCap / 6), 12) + pad(r.pagCap, 16) + overflow);
}
console.log('\nZONE chars = what actually fits in the painted reading field at standard body size.');
console.log('Use it to pick a layout: a page with N body chars needs a layout whose ZONE chars ≥ N.');
process.exit(0);
