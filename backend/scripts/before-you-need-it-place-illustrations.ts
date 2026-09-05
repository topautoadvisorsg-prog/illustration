/**
 * BEFORE YOU NEED IT — place the seven approved illustrations.
 *
 * STAMPED, NOT LAID OUT. The typeset PDF is produced first and the art is drawn
 * onto it afterwards at fixed coordinates, so line breaks, folios, margins,
 * parity blanks and the page count cannot move. 184 pages stays 184 pages,
 * which is what keeps the spine width and both approved covers valid.
 *
 * ANCHORED TO TEXT, NOT TO PAGE NUMBERS. Each illustration is keyed to the
 * stable block id of the closing sentence it belongs to, resolved fresh on
 * every build. If an anchor cannot be resolved the illustration is reported
 * ORPHANED and nothing is drawn — never stamped at a guessed location.
 *
 *   yarn tsx scripts/before-you-need-it-place-illustrations.ts
 *
 * Local and free: no model, no network.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { stampIllustrations } from '../src/pipeline/typeset/stamp-illustrations.js';
import { typesetMarginsForTrim } from '../src/pipeline/typeset/typeset-book.js';
import type { PageIllustration } from '@wildlands/shared';
import { OUT_DIR, REV, RENDER_INPUT, STANDARD, readManuscript } from './before-you-need-it-config.js';

const ART = `${OUT_DIR}/illustrations`;
const OUT_PDF = `${OUT_DIR}/BEFORE-YOU-NEED-IT_interior_${REV.replace('-','')}_ILLUSTRATED.pdf`;

/** Vignette, roughly a third of the text column's height. 1536x1024 is 3:2. */
const PLACE_W_IN = 3.5;
const PLACE_H_IN = PLACE_W_IN * (1024 / 1536);

interface Slot { page: number; id: string; anchorLine: string; alt: string }
const SLOTS: Slot[] = JSON.parse(readFileSync(`${ART}/ILLUSTRATION-MANIFEST.json`, 'utf8')).map(
  (e: { page: number; id: string; anchor: { anchor_line: string }; alt: string }) => ({
    page: e.page, id: e.id, anchorLine: e.anchor.anchor_line, alt: e.alt,
  }),
);

const { md } = readManuscript();

console.log('rendering the canonical interior (deep probe, for anchor resolution)...');
const render = await renderTypesetBook({ ...RENDER_INPUT, markdown: md, deepProbe: true });
const before = render.report.totalPages;
console.log(`  ${before} pages, ${render.report.blankPages.length} blanks\n`);

/** Resolve each anchor line to the block id the renderer actually emitted. */
const html = render.html;
const resolve = (line: string): string | null => {
  const i = html.indexOf(line);
  if (i < 0) return null;
  const start = html.lastIndexOf('<p', 0 + i);
  const tag = html.slice(start, html.indexOf('>', start) + 1);
  return /data-block-id="([^"]+)"/.exec(tag)?.[1] ?? null;
};

const illustrations: Record<string, PageIllustration> = {};
const assets = new Map<string, Buffer>();
const unresolved: string[] = [];

for (const s of SLOTS) {
  const blockId = resolve(s.anchorLine);
  if (!blockId) { unresolved.push(s.id); continue; }
  const path = `illustrations/${s.id}.png`;
  const png = readFileSync(`${ART}/${s.id}.png`);
  assets.set(path, png);
  illustrations[blockId] = {
    rawAssetPath: path,
    approvedAssetPath: path,
    version: 1,
    nativeWidthPx: 1536,
    nativeHeightPx: 1024,
    placementWidthIn: PLACE_W_IN,
    placementHeightIn: PLACE_H_IN,
    status: 'approved',
    pageOffset: 0,
    model: 'gpt-image-2',
    styleDnaId: 'bw-educational-clearline',
    subject: s.alt,
    note: `Anchored to "${s.anchorLine.slice(0, 48)}..." — expected around p${s.page}.`,
  };
  console.log(`  ${s.id} -> block ${blockId}`);
}
if (unresolved.length) {
  console.error(`\nABORT: ${unresolved.length} anchor(s) unresolved: ${unresolved.join(', ')}`);
  process.exit(2);
}

console.log('\nstamping...');
const result = await stampIllustrations({
  pdf: render.pdf,
  illustrations,
  assets,
  probe: render.probe!,
  trim: { widthIn: STANDARD.trim.widthIn, heightIn: STANDARD.trim.heightIn },
  margins: typesetMarginsForTrim(STANDARD.trim),
});

for (const s of result.stamped.sort((a, b) => a.page - b.page)) {
  console.log(
    `  p${String(s.page).padStart(3)}  ${s.widthIn.toFixed(2)} x ${s.heightIn.toFixed(2)}in ` +
      `at (${s.xIn.toFixed(2)}, ${s.yIn.toFixed(2)})  ${Math.round(s.nativePpi)} PPI native`,
  );
}
if (result.orphaned.length) {
  console.error('\nORPHANED:');
  for (const o of result.orphaned) console.error(`  ${o.blockId}: ${o.reason}`);
}

writeFileSync(OUT_PDF, result.pdf);
console.log(`\nstamped ${result.stamped.length}/${SLOTS.length}, orphaned ${result.orphaned.length}`);
console.log(`sha256 ${createHash('sha256').update(result.pdf).digest('hex')}`);
console.log(`-> ${OUT_PDF}`);
process.exit(result.orphaned.length || result.stamped.length !== SLOTS.length ? 1 : 0);
