/* Export a SPECIFIC (possibly non-active) render version's image to a local PNG so
 * we can compare an approved version against a re-render. Read-only.
 * Usage: _viewver.ts <pageKey> <version> [outName] */
import { eq, and } from 'drizzle-orm';
import { writeFileSync } from 'node:fs';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { P } from './_project.js';

const KEY = process.argv[2]!, VER = Number(process.argv[3]!);
const OUT = process.argv[4] ?? `_ver_${KEY}_v${VER}`;
const db = getDb();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0]!;
const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.version, VER))).limit(1))[0] as Record<string, unknown> | undefined;
if (!r?.imagePath) { console.error('no image for', KEY, 'v' + VER); process.exit(1); }
const img = await getProjectStorage().readProjectFile(r.imagePath as string);
const out = `C:/Users/jovan/Downloads/${OUT}.png`;
writeFileSync(out, img);
console.log(`${KEY} v${VER} → ${out} (${(img.length / 1024).toFixed(0)} KB)`);
process.exit(0);
