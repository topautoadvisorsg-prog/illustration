/* For a list of pages: render each blueprint, build a labeled montage, and print a
 * table with the layout + any ORNAMENT-related phrase still in the prompt (so we can
 * confirm ornaments are gone). Read-only (no render spend). Usage: _bpmany.ts <out> <key...> */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';
import { prepareRender } from '../src/pipeline/whole-page-render/render-whole-page.js';
import { renderBlueprintPng } from '../src/pipeline/stage-3-generation/blueprint.js';

import { P } from './_project.js';
const OUT = process.argv[2] ?? 'bp';
const KEYS = process.argv.slice(3);
const db = getDb();
const TW = 130, LBL = 14, COLS = 5, GAP = 4;
const ORN = /ornament|swag|botanical band|corner device|edge ornament|decorative (band|border|frame)/i;

const cells: Buffer[] = [];
console.log('pageKey'.padEnd(24) + 'layout'.padEnd(18) + 'ornament check');
console.log('-'.repeat(80));
for (const KEY of KEYS) {
  const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
  if (!row) { console.log(KEY.padEnd(24), 'NOT FOUND'); continue; }
  const prep = await prepareRender(row.id);
  const layout = (prep.spec as any)?.layoutTemplate || row.layoutTemplate || 'role-default';
  // find any sentence fragment mentioning an ornament term (to show negation vs request)
  const frag = prep.assembledPrompt.split(/(?<=\.)\s+/).find((s) => ORN.test(s));
  const hasPositive = !!frag && !/\bNO\b|never|without|no decorative/i.test(frag);
  console.log(`${KEY.padEnd(24)}${String(layout).replace('LAYOUT_', '').padEnd(18)}${hasPositive ? '⚠ ORNAMENT REQUESTED: ' + frag!.slice(0, 50) : frag ? 'clean (negated)' : 'clean (no mention)'}`);
  const { png } = await renderBlueprintPng(prep.allocation, prep.size.widthPx, prep.size.heightPx, { canvasIn: { w: 7.25, h: 10.25 } });
  const thumb = await sharp(png).resize({ width: TW }).toBuffer();
  const th = (await sharp(thumb).metadata()).height!;
  const lbl = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${LBL}"><rect width="100%" height="100%" fill="#2b1d10"/><text x="3" y="11" font-family="sans-serif" font-size="9" fill="#fff">${KEY.replace('_INTRODUCTION', '').replace('_GLOSSARY', '_GLOS').replace('_INDEX', '_IDX')}</text></svg>`)).png().toBuffer();
  cells.push(await sharp({ create: { width: TW, height: th + LBL, channels: 3, background: '#fff' } }).composite([{ input: lbl, top: 0, left: 0 }, { input: thumb, top: LBL, left: 0 }]).png().toBuffer());
}
const metas = await Promise.all(cells.map((b) => sharp(b).metadata()));
const rowH = Math.max(...metas.map((m) => m.height!)) + GAP;
const rows = Math.ceil(cells.length / COLS);
const W = COLS * (TW + GAP) + GAP, H = rows * rowH + GAP;
const comps: sharp.OverlayOptions[] = [];
cells.forEach((c, i) => comps.push({ input: c, left: GAP + (i % COLS) * (TW + GAP), top: GAP + Math.floor(i / COLS) * rowH }));
writeFileSync(`C:/Users/jovan/Downloads/_${OUT}.png`, await sharp({ create: { width: W, height: H, channels: 3, background: '#cfc8b8' } }).composite(comps).png().toBuffer());
console.log(`\n→ _${OUT}.png  (${cells.length} blueprints)`);
process.exit(0);
