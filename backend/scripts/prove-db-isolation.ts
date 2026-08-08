/**
 * Proves development is isolated from production.
 *
 * READ-ONLY against production. The only write is a test row in the DEV
 * database, which is then removed. Credentials are never printed.
 *
 *   tsx scripts/prove-db-isolation.ts
 */
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
loadDotenv({ path: path.join(REPO_ROOT, '.env') });
const PROD_URL = process.env.DATABASE_URL!;
loadDotenv({ path: path.join(REPO_ROOT, '.env.development.local'), override: true });
const DEV_URL = process.env.DATABASE_URL!;

const hostOf = (u: string) => new URL(u).hostname;
const nameOf = (u: string) => new URL(u).pathname.replace(/^\//, '');

async function main(): Promise<void> {
  if (PROD_URL === DEV_URL) {
    console.error('FAIL: dev and prod DATABASE_URL are identical — no isolation.');
    process.exit(1);
  }
  console.log(`prod : ${nameOf(PROD_URL)} @ ${hostOf(PROD_URL)}`);
  console.log(`dev  : ${nameOf(DEV_URL)} @ ${hostOf(DEV_URL)}\n`);

  const prod = postgres(PROD_URL, { max: 1, prepare: false });
  const dev = postgres(DEV_URL, { max: 1, prepare: false });
  const MARKER = `__isolation_probe_${Date.now()}`;
  let ok = true;

  try {
    // 1. Production baseline. SELECT only.
    const before = await prod`select id, title, canonical_manuscript_sha256 from projects order by created_at`;
    console.log(`production projects BEFORE : ${before.length}`);
    for (const r of before) console.log(`   - ${String(r.title).slice(0, 28)}`);

    const devBefore = await dev`select count(*)::int as n from projects`;
    console.log(`dev projects BEFORE        : ${devBefore[0]!.n}\n`);

    // 2. Write a test row in DEV ONLY.
    await dev`
      insert into projects (brand, audience, volume, title, author_name, config)
      values ('THE_WILDLANDS', 'ADULT', 1, ${MARKER}, 'isolation-test', '{}'::jsonb)`;
    const devAfter = await dev`select count(*)::int as n from projects`;
    const devHas = await dev`select count(*)::int as n from projects where title = ${MARKER}`;
    console.log(`dev projects AFTER insert  : ${devAfter[0]!.n}  (marker present: ${devHas[0]!.n === 1})`);

    // 3. The test row must NOT exist in production.
    const prodHas = await prod`select count(*)::int as n from projects where title = ${MARKER}`;
    console.log(`marker visible in PRODUCTION: ${prodHas[0]!.n}   <- must be 0`);
    if (prodHas[0]!.n !== 0) ok = false;

    // 4. Production must be byte-for-byte unchanged.
    const after = await prod`select id, title, canonical_manuscript_sha256 from projects order by created_at`;
    const same =
      after.length === before.length &&
      after.every((r, i) => r.id === before[i]!.id && r.title === before[i]!.title
        && r.canonical_manuscript_sha256 === before[i]!.canonical_manuscript_sha256);
    console.log(`production projects AFTER  : ${after.length}  (unchanged: ${same})`);
    if (!same) ok = false;

    // 5. Clean up the DEV row only.
    await dev`delete from projects where title = ${MARKER}`;
    const devFinal = await dev`select count(*)::int as n from projects`;
    console.log(`dev projects after cleanup : ${devFinal[0]!.n}`);

    console.log(`\n${ok ? 'PASS — development is isolated from production.' : 'FAIL — isolation breached.'}`);
  } finally {
    await prod.end();
    await dev.end();
  }
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
