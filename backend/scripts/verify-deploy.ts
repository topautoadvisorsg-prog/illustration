/* Read-only post-deploy check: did migration 0009 (editions) apply? */
import { getDb } from '../src/db/client.js';
import { sql } from 'drizzle-orm';
const db = getDb();
try {
  const t: any = await db.execute(sql`select to_regclass('public.editions') as editions`);
  const j: any = await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
  console.log('editions table exists:', (t.rows ?? t)[0]?.editions ?? null);
  console.log('migrations applied:', (j.rows ?? j)[0]?.n);
} catch (e) { console.log('db check error:', e instanceof Error ? e.message : String(e)); }
process.exit(0);
