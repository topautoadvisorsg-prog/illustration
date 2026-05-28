import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getEnv, isPlaceholder } from '../env.js';
import * as schema from './schema/index.js';

export type WildlandsDb = PostgresJsDatabase<typeof schema>;

let db: WildlandsDb | null = null;

export function getDb(): WildlandsDb {
  if (db) return db;

  const env = getEnv();
  if (isPlaceholder(env.DATABASE_URL)) {
    throw new Error('DATABASE_URL is still a placeholder; database access is disabled until Supabase keys arrive.');
  }

  const client = postgres(env.DATABASE_URL, {
    max: 5,
    prepare: false,
  });
  db = drizzle(client, { schema });
  return db;
}
