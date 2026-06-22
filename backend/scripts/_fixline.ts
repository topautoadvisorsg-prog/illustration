/* SURGICAL single-page guide-line removal. Finds the strongest thin orange column
 * within a small x-window (where the operator saw the line) and bridges THAT column
 * full-height out of the render — so even the faint upper part goes. Windowed, so it
 * can't touch illustration elsewhere. Writes the cleaned render to the local cache
 * (RENDER_CACHE_ONLY); re-prep the page after. Usage: RENDER_CACHE_ONLY=1 _fixline.ts <key> [xCenterIn] [winIn] [bandPad]
 */
import sharp from 'sharp';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage, SupabaseStorageService } from '../src/services/storage/project-storage.js';
import { P } from './_project.js';

const KEY = process.argv[2]!;
const xc = Number(process.argv[3] ?? 3.95);
const win = Number(process.argv[4] ?? 0.35);
const pad = Number(process.argv[5] ?? 3);
if (!process.env.RENDER_CACHE_ONLY) { console.error('run with RENDER_CACHE_ONLY=1'); process.exit(2); }
const db = getDb(); const st = getProjectStorage();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0]!;
const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0] as Record<string, unknown>;
const imagePath = r.imagePath as string;
// Read the DURABLE original from Supabase (not the cache, which may already hold a
// prior bridge) so we bridge the real line exactly once.
const src = await new SupabaseStorageService().readProjectFile(imagePath);
const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
const idx = (x: number, y: number) => (y * W + x) * C;
const isGuide = (x: number, y: number) => { const i = idx(x, y); const R = data[i]!, G = data[i + 1]!, B = data[i + 2]!; return R > 110 && G > 30 && G < 150 && B < 105 && R - B > 50 && R - G > 24; };
const dpiR = W / 7.25;
const x0w = Math.max(2, Math.round((xc - win) * dpiR)), x1w = Math.min(W - 3, Math.round((xc + win) * dpiR));
let bestX = -1, bestC = 0;
for (let x = x0w; x <= x1w; x++) { let c = 0; for (let y = 0; y < H; y++) if (isGuide(x, y)) c++; if (c > bestC) { bestC = c; bestX = x; } }
console.log(`${KEY}: peak orange col x=${bestX} (~${(bestX / dpiR).toFixed(2)}in) count=${bestC}/${H}`);
const bx0 = Math.max(1, bestX - pad), bx1 = Math.min(W - 2, bestX + pad);
const out = Buffer.from(data);
const span = bx1 - bx0 + 2;
for (let y = 0; y < H; y++) {
  const li = idx(bx0 - 1, y), ri = idx(bx1 + 1, y);
  for (let x = bx0; x <= bx1; x++) { const t = (x - bx0 + 1) / span; const oi = idx(x, y); for (let k = 0; k < 3; k++) out[oi + k] = Math.round(data[li + k]! * (1 - t) + data[ri + k]! * t); }
}
const cleaned = await sharp(out, { raw: { width: W, height: H, channels: C } }).png().toBuffer();
await st.writeProjectFile(P, imagePath.split('/').slice(1), cleaned);
console.log(`bridged x ${bx0}-${bx1} full height; wrote cleaned render → cache (${imagePath}). Re-prep the page next.`);
process.exit(0);
