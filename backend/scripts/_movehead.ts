/* SURGICAL orphan-heading fix: if <from> page ends with a bold **heading** (no body
 * after it), cut it and prepend it to <to> page's text. Updates readingFieldText on
 * both pages. Re-render BOTH pages after. No re-pagination, page count unchanged.
 * Usage: _movehead.ts <fromPageKey> <toPageKey>   (then: _batch ... <from> <to>) */
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';
import { P } from './_project.js';

const FROM = process.argv[2]!;
const TO = process.argv[3]!;
const db = getDb();
const fromRow = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, FROM))))[0];
const toRow = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, TO))))[0];
if (!fromRow || !toRow) { console.error('page not found'); process.exit(1); }

const lines = (fromRow.readingFieldText ?? '').replace(/\s+$/, '').split('\n');
let idx = -1;
for (let i = lines.length - 1; i >= 0; i--) { const l = lines[i]!.trim(); if (l === '') continue; if (/^\*\*.+\*\*$/.test(l)) idx = i; break; }
if (idx < 0) { console.log(`NO trailing **heading** on ${FROM}. Last non-empty line: ${JSON.stringify(lines.filter((l) => l.trim())[lines.filter((l) => l.trim()).length - 1])}`); process.exit(1); }

const heading = lines[idx]!.trim();
const newFrom = lines.slice(0, idx).join('\n').replace(/\s+$/, '');
const newTo = heading + '\n\n' + (toRow.readingFieldText ?? '');
console.log('moving heading:', heading);
console.log(`${FROM} now ENDS: …${JSON.stringify(newFrom.slice(-70))}`);
console.log(`${TO} now STARTS: ${JSON.stringify(newTo.slice(0, 70))}…`);
await db.update(pages).set({ readingFieldText: newFrom }).where(eq(pages.id, fromRow.id));
await db.update(pages).set({ readingFieldText: newTo }).where(eq(pages.id, toRow.id));
console.log(`\nUPDATED both. Now re-render: _batch.ts mh ${FROM} ${TO}`);
process.exit(0);
