/* Copy a page's active render image to SUPABASE (so the deployed, Supabase-reading
 * console can serve it). For renders that landed in R2 only before dual-write.
 * Read-only w.r.t. the DB. Usage: _syncimg.ts <pageKey> */
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage, SupabaseStorageService } from '../src/services/storage/project-storage.js';
import { P } from './_project.js';
const KEY = process.argv[2]!;
const db = getDb();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0]!;
const r = (await db.select().from(wholePageRenders).where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.active, true))).orderBy(desc(wholePageRenders.version)).limit(1))[0] as Record<string, unknown>;
const imagePath = r.imagePath as string;
const img = await getProjectStorage().readProjectFile(imagePath); // from R2/cache
await new SupabaseStorageService().writeProjectFile(P, imagePath.split('/').slice(1), img);
console.log(`synced ${KEY} v${r.version} → Supabase (${(img.length / 1024).toFixed(0)} KB): ${imagePath}`);
process.exit(0);
