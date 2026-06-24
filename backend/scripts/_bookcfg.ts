/* Inspect / set a project's book config by EXPLICIT id (not the .env PROJECT_ID).
 * Read-only by default; --set-digest applies the middle-grade chapter-book standard
 * (5.5x8.5 digest, 12pt EB Garamond, 1.3 leading, no bleed) by MERGING into the
 * existing config (never blanks title/author).
 * Usage: _bookcfg.ts <projectId> [--set-digest] */
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { projects } from '../src/db/schema/index.js';

const ID = process.argv[2];
const SET = process.argv.includes('--set-digest');
if (!ID) { console.error('usage: _bookcfg.ts <projectId> [--set-digest]'); process.exit(1); }

const db = getDb();
const row = (await db.select().from(projects).where(eq(projects.id, ID)))[0];
if (!row) { console.error('no project', ID); process.exit(1); }
const cfg = (row.config ?? {}) as Record<string, any>;

console.log('=== project', ID, '===');
console.log('title       :', cfg.title ?? cfg.publishing?.title ?? '(none)');
console.log('author      :', cfg.authorName ?? cfg.publishing?.authors?.join(', ') ?? '(none)');
console.log('manuscript  :', (row as any).manuscriptPath ?? '(none)', (row as any).status ? `· status ${(row as any).status}` : '');
console.log('trimSize    :', JSON.stringify(cfg.trimSize));
console.log('typography  :', JSON.stringify(cfg.typography));
console.log('headingFont :', cfg.headingFont ?? cfg.typography?.headingFont ?? '(default)');
console.log('bodyFont    :', cfg.bodyFont ?? cfg.typography?.bodyFont ?? '(default)');

if (SET) {
  const next = {
    ...cfg,
    trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
    typography: { ...(cfg.typography ?? {}), bodyPt: 12, lineHeight: 1.3, bodyFont: cfg.typography?.bodyFont ?? 'EB Garamond' },
  };
  await db.update(projects).set({ config: next }).where(eq(projects.id, ID));
  console.log('\n✅ applied digest standard: 5.5×8.5 · bleed 0 · EB Garamond 12pt/1.3 (fonts kept; heading font is a taste call)');
}
process.exit(0);
