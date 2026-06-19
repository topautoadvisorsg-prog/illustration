/* Review how much text a page carries → 15% (text-heavy) vs 25% (lighter, bigger
 * illustration). Prints chars, paragraphs, a density read, + a snippet. Read-only.
 * Usage: _textcheck.ts <key...> */
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';

const P = '66c1c69c-2c81-409e-a4b5-bff3f3bb04ba';
const KEYS = process.argv.slice(2);
const db = getDb();

function strip(md: string) {
  return md.replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').replace(/`(.*?)`/g, '$1').replace(/\[(.*?)\]\(.*?\)/g, '$1').trim();
}

for (const KEY of KEYS) {
  const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
  if (!row) { console.log(`\n=== ${KEY} === NOT FOUND`); continue; }
  const raw = row.readingFieldText ?? '';
  const text = strip(raw);
  const chars = text.length;
  const paras = raw.split(/\n\s*\n/).filter((x) => x.trim()).length;
  const words = text.split(/\s+/).filter(Boolean).length;
  // Suggestion: heavy text wants the 15% (full-text) template; light text can
  // afford a 25% illustration. ~900 chars (~150 words) is roughly a third of a
  // full reading field at 11pt — below that, a bigger illustration fits.
  const suggest = chars >= 900 ? '15% (text-heavy)' : chars >= 450 ? 'borderline — your call' : '25% (light text, bigger illustration)';
  console.log(`\n=== ${KEY} ===`);
  console.log(`chars ${chars} | words ${words} | paragraphs ${paras}  → suggest ${suggest}`);
  console.log('snippet:', text.slice(0, 240).replace(/\s+/g, ' '), text.length > 240 ? '…' : '');
}
process.exit(0);
