import { writeFileSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { P } from './_project.js';

const pageKey = process.argv[2];
const version = Number(process.argv[3]);
const outPath = process.argv[4];
const db = getDb();
const storage = getProjectStorage();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, pageKey))))[0];
const renders = await db.select().from(wholePageRenders).where(eq(wholePageRenders.pageId, row.id));
const r = renders.find((x) => x.version === version)!;
const buf = await storage.readProjectFile(r.imagePath!);
writeFileSync(outPath, buf);
console.log(`saved v${version} to ${outPath}`);
process.exit(0);
