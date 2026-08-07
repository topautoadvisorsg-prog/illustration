/* RECOVER the 8 whole-page renders whose DB rows were cascade-deleted by the
 * re-paginate. Every file (image/blueprint/spec/prompt) survived in R2, so we
 * rebuild each row EXACTLY: id = the render UUID from the filename, status
 * RENDERED, active=false (their real prior state — rendered, awaiting approval).
 * DRY by default; pass --commit to write. Idempotent (skips if id already exists).
 * Usage: _restorerenders.ts [--commit] */
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { eq, and, sql, ilike } from 'drizzle-orm';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { getEnv } from '../src/env.js';
import { P } from './_project.js';

const COMMIT = process.argv.includes('--commit');
const PAGEKEYS = ['CH01_P001','CH02_P001','CH02_P024','CH02_P024_c1','CH02_P028','CH03_P009','CH03_P009_c1','CH03_P013'];

const env = getEnv();
const db = getDb();
const storage = getProjectStorage();
const r2 = new S3Client({ region: 'auto', endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });
const Bucket = env.R2_BUCKET || 'project-files';

// Template values from a surviving render row (columns not stored in spec JSON).
const survivor = (await db.select().from(wholePageRenders)
  .where(and(eq(wholePageRenders.projectId, P), eq(wholePageRenders.status, 'APPROVED'))).limit(1))[0];
const STD_VERSION = survivor?.standardVersion ?? 'unknown';
// These 8 are AI whole-page renders (not the stamped survivor's deterministic
// composer), so label them with the whole-page image model per SPEC.
const MODEL = 'gpt-image-2';
console.log(`template: standardVersion=${STD_VERSION} model=${MODEL} (from survivor ${survivor?.id ?? 'NONE'})`);

async function listFor(pageKey: string) {
  const out = await r2.send(new ListObjectsV2Command({ Bucket, Prefix: `${P}/experimental/whole-page/${pageKey}-` }));
  return (out.Contents ?? []).map((o) => ({ key: o.Key!, mod: o.LastModified }));
}

let restored = 0, skipped = 0;
for (const pageKey of PAGEKEYS) {
  const pageRow = (await db.select().from(pages)
    .where(and(eq(pages.projectId, P), ilike(pages.pageKey, pageKey))).limit(1))[0];
  if (!pageRow) { console.log(`  !! ${pageKey}: NO page row — skip`); continue; }

  const files = await listFor(pageKey);
  // group by render UUID (the segment right after `${pageKey}-`)
  const groups = new Map<string, { mod?: Date; png?: string; bp?: string; json?: string; txt?: string }>();
  for (const f of files) {
    const m = f.key.match(new RegExp(`${pageKey}-([0-9a-f-]{36})`, 'i'));
    if (!m) continue;
    const id = m[1];
    const g = groups.get(id) ?? {};
    if (f.key.endsWith('.blueprint.png')) g.bp = f.key;
    else if (f.key.endsWith('.png')) g.png = f.key;
    else if (f.key.endsWith('.json')) g.json = f.key;
    else if (f.key.endsWith('.txt')) g.txt = f.key;
    if (!g.mod || (f.mod && f.mod > g.mod)) g.mod = f.mod;
    groups.set(id, g);
  }
  // newest complete group (png+json+txt)
  const complete = [...groups.entries()].filter(([, g]) => g.png && g.json && g.txt)
    .sort((a, b) => (b[1].mod?.getTime() ?? 0) - (a[1].mod?.getTime() ?? 0));
  if (!complete.length) { console.log(`  !! ${pageKey}: no complete render group — skip`); continue; }
  const [renderId, g] = complete[0];

  const exists = (await db.select({ id: wholePageRenders.id }).from(wholePageRenders).where(eq(wholePageRenders.id, renderId)))[0];
  if (exists) { console.log(`  == ${pageKey}: render ${renderId} already present — skip`); skipped++; continue; }

  const specJson = JSON.parse((await storage.readProjectFile(g.json!)).toString('utf8'));
  const assembledPrompt = (await storage.readProjectFile(g.txt!)).toString('utf8');
  const png = await storage.readProjectFile(g.png!);
  const meta = await sharp(png).metadata();
  const promptSha256 = createHash('sha256').update(assembledPrompt, 'utf8').digest('hex');
  const maxV = Number(((await db.select({ v: sql<number>`COALESCE(MAX(${wholePageRenders.version}),0)` })
    .from(wholePageRenders).where(eq(wholePageRenders.pageId, pageRow.id)))[0]?.v) ?? 0);

  const values = {
    id: renderId, pageId: pageRow.id, projectId: P, version: maxV + 1,
    status: 'RENDERED' as const, specJson, assembledPrompt, promptSha256, standardVersion: STD_VERSION,
    imagePath: g.png!, specPath: g.json!, promptPath: g.txt!, blueprintPath: g.bp ?? null,
    widthPx: meta.width ?? null, heightPx: meta.height ?? null, model: MODEL,
    active: false, approvedForBook: false, attempts: maxV + 1,
  };
  console.log(`  ${COMMIT ? 'RESTORE' : 'WOULD RESTORE'} ${pageKey}  v${values.version}  ${meta.width}x${meta.height}  id=${renderId}`);
  if (COMMIT) { await db.insert(wholePageRenders).values(values); restored++; }
}
console.log(`\n${COMMIT ? 'restored' : 'would restore'}: ${PAGEKEYS.length - skipped} | skipped(existing): ${skipped}`);
if (!COMMIT) console.log('DRY RUN — re-run with --commit to write.');
process.exit(0);
