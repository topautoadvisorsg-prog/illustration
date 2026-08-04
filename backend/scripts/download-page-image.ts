/* Downloads a page's rendered image from R2 to a local file so it can be
 * visually inspected (crop/zoom, read tool, whatever) instead of trusting
 * the DB status alone. By default grabs the latest render for the page;
 * pass a specific renderId as the 4th arg to get an older version.
 *
 * Usage: tsx scripts/download-page-image.ts <projectId> <pageKey> [outPath] [renderId]
 */
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getEnv } from '../src/env.js';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { and, eq, desc } from 'drizzle-orm';
import { writeFileSync } from 'node:fs';

const [PROJECT, PAGE_KEY, OUT_PATH_ARG, RENDER_ID_ARG] = process.argv.slice(2);
if (!PROJECT || !PAGE_KEY) {
  console.error('Usage: tsx scripts/download-page-image.ts <projectId> <pageKey> [outPath] [renderId]');
  process.exit(1);
}

const env = getEnv();
const db = getDb();

const [row] = await db.select().from(pages).where(and(eq(pages.projectId, PROJECT), eq(pages.pageKey, PAGE_KEY))).limit(1);
if (!row) { console.error(`${PAGE_KEY} not found in project ${PROJECT}`); process.exit(1); }

let renderId = RENDER_ID_ARG;
if (!renderId) {
  const [latest] = await db
    .select()
    .from(wholePageRenders)
    .where(and(eq(wholePageRenders.pageId, row.id), eq(wholePageRenders.status, 'RENDERED' as any)))
    .orderBy(desc(wholePageRenders.createdAt))
    .limit(1);
  if (!latest) { console.error(`No RENDERED render found for ${PAGE_KEY}`); process.exit(1); }
  renderId = latest.id;
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

const key = `${PROJECT}/experimental/whole-page/${PAGE_KEY}-${renderId}.png`;
const out = await client.send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
const bytes = await out.Body!.transformToByteArray();

const outPath = OUT_PATH_ARG ?? `./${PAGE_KEY}.png`;
writeFileSync(outPath, Buffer.from(bytes));
console.log(`Saved ${outPath} (${bytes.length} bytes, renderId=${renderId})`);
process.exit(0);
