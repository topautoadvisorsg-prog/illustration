/* Batch re-render pages on the frozen architecture, activate each (so the console
 * shows them), and build ONE contact sheet of each page's top + bottom strip so a
 * systematic issue is visible across the whole batch.
 *
 * Renders run through a concurrency pool (default 4, override with CONC=n) so a
 * chapter finishes in roughly 1/CONC of the wall-clock. Each render is independent
 * (its own pageId + prompt + blueprint), so parallelism changes throughput only,
 * not output. Per-call 2-min timeout lives in services/openai. RENDER-ONCE RULE:
 * each page is rendered exactly once; a page that times out or errors is reported
 * FAILED and left for the OPERATOR to decide on — it is NOT auto-retried.
 * Usage: [CONC=4] _batch.ts <outName> <pageKey> [pageKey ...] */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { createAndRunRender } from '../src/pipeline/whole-page-render/render-whole-page.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { preflight } from './_preflight.js';

const P = '66c1c69c-2c81-409e-a4b5-bff3f3bb04ba';
const OUTNAME = process.argv[2] ?? 'batch';
const KEYS = process.argv.slice(3);
const CONC = Math.max(1, Number(process.env.CONC ?? '4'));

// ── RENDER SAFETY (operator rule, 2026-06-19 — NON-NEGOTIABLE) ─────────────────
// Render each page EXACTLY ONCE, then the OPERATOR looks at the actual image and
// decides. NEVER auto-retry. NEVER re-render a page without the operator having
// SEEN it and explicitly said "re-render this one". NEVER bulk-render the book
// (that is how a 275-page book cost 390 render calls). This tool calls the
// generator once per key and HARD-REFUSES a large batch unless the operator
// explicitly overrides with RENDER_BULK=1.
const MAX_KEYS = 5;
if (KEYS.length === 0) {
  console.error('No page keys given. Usage: [CONC=4] _batch.ts <outName> <pageKey> [pageKey ...]');
  process.exit(1);
}
if (KEYS.length > MAX_KEYS && process.env.RENDER_BULK !== '1') {
  console.error(
    `REFUSING: ${KEYS.length} pages requested (cap ${MAX_KEYS}). Render small batches and let ` +
      `the operator SEE each render before doing more. Re-render ONLY operator-flagged pages. ` +
      `Operator-approved bulk override only: RENDER_BULK=1.`,
  );
  process.exit(1);
}
const db = getDb();
const storage = getProjectStorage();
const all = await listPaginatedPagesForProject(P);
const W = 560, LBL = 26;

type Result = { key: string; folio: number | string; imagePath: string; version: number };
const done: Result[] = [];
let ok = 0, failed = 0;

async function renderOne(KEY: string): Promise<void> {
  const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
  if (!row) { console.log('SKIP (not found):', KEY); failed++; return; }
  const folio = all.find((p) => p.pageKey === KEY)?.plannedPageNumber ?? '?';
  try {
    const res = await createAndRunRender(row.id, {});
    if (res.status !== 'RENDERED' || !res.row.imagePath) { console.log('FAILED', KEY, res.status); failed++; return; }
    await db.update(wholePageRenders).set({ active: false }).where(eq(wholePageRenders.pageId, row.id));
    await db.update(wholePageRenders).set({ active: true }).where(eq(wholePageRenders.id, res.renderId));
    console.log(`ok ${KEY} (folio ${folio}) v${res.version}`);
    done.push({ key: KEY, folio, imagePath: res.row.imagePath, version: res.version });
    ok++;
  } catch (e) {
    console.log('FAILED', KEY, (e as Error)?.message ?? e);
    failed++;
  }
}

// PRE-FLIGHT GATE (operator rule 2026-06-20): verify storage can SAVE before any
// paid generation. If the Supabase storage canary fails, abort with ZERO spend —
// never burn paid renders that cannot be saved. Also blocks an invalid OpenAI key.
const pf = await preflight();
console.log('--- pre-flight (no spend) ---');
for (const l of pf.lines) console.log('  ' + l);
if (!pf.ok) {
  console.error(
    pf.storageOk
      ? 'ABORT: OpenAI pre-flight failed — not rendering with an unreachable/invalid key.'
      : 'ABORT: STORAGE canary FAILED — refusing to spend on renders that cannot be saved. Fix Supabase storage first, then retry.',
  );
  process.exit(1);
}

// Concurrency pool: CONC workers pull from a shared cursor until the queue drains.
let cursor = 0;
async function worker(): Promise<void> {
  for (;;) {
    const i = cursor++;
    if (i >= KEYS.length) return;
    await renderOne(KEYS[i]);
  }
}
await Promise.all(Array.from({ length: Math.min(CONC, KEYS.length) }, () => worker()));
console.log(`batch done: ${ok} ok, ${failed} failed (CONC=${CONC})`);

// Contact sheet, in KEY order, from whatever succeeded.
done.sort((a, b) => KEYS.indexOf(a.key) - KEYS.indexOf(b.key));
const rows: { buf: Buffer; h: number }[] = [];
for (const r of done) {
  const img = await storage.readProjectFile(r.imagePath);
  const m = await sharp(img).metadata();
  const h = m.height!, w = m.width!;
  const topStrip = await sharp(img).extract({ left: 0, top: 0, width: w, height: Math.round(h * 0.14) }).resize({ width: W }).toBuffer();
  const bTop = Math.round(h * 0.86);
  const botStrip = await sharp(img).extract({ left: 0, top: bTop, width: w, height: h - bTop }).resize({ width: W }).toBuffer();
  const tH = (await sharp(topStrip).metadata()).height!;
  const bH = (await sharp(botStrip).metadata()).height!;
  const labelSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${LBL}"><rect width="100%" height="100%" fill="#2b1d10"/><text x="8" y="18" font-family="sans-serif" font-size="14" fill="#fff">folio ${r.folio}  ·  ${r.key}  ·  TOP / BOTTOM</text></svg>`;
  const labelPng = await sharp(Buffer.from(labelSvg)).png().toBuffer();
  const rowH = LBL + tH + 6 + bH + 12;
  const rowBuf = await sharp({ create: { width: W, height: rowH, channels: 3, background: '#dddddd' } })
    .composite([{ input: labelPng, top: 0, left: 0 }, { input: topStrip, top: LBL, left: 0 }, { input: botStrip, top: LBL + tH + 6, left: 0 }])
    .png().toBuffer();
  rows.push({ buf: rowBuf, h: rowH });
}

if (rows.length) {
  const totalH = rows.reduce((s, r) => s + r.h + 8, 8);
  let y = 8; const comps: sharp.OverlayOptions[] = [];
  for (const r of rows) { comps.push({ input: r.buf, top: y, left: 0 }); y += r.h + 8; }
  const sheet = await sharp({ create: { width: W, height: totalH, channels: 3, background: '#ffffff' } }).composite(comps).png().toBuffer();
  const out = `C:/Users/jovan/Downloads/_${OUTNAME}.png`;
  writeFileSync(out, sheet);
  console.log('contact sheet →', out, `(${rows.length} pages)`);
}
console.log(
  `\n*** RENDERED ONCE (${ok} ok, ${failed} failed). Now SHOW the operator the actual images ` +
    `(_full.ts <keys>) and STOP. Do NOT re-render any page until the operator has seen it and ` +
    `said which to redo. No auto-retry, no second pass. ***`,
);
process.exit(0);
