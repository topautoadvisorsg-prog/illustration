import { defineConfig } from 'drizzle-kit';
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';

loadDotenv({ path: path.resolve(__dirname, '../.env') });

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'your_database_url_here',
  },
  strict: true,
  verbose: true,
});
