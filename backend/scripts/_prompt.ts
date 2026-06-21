/* Dump the FULL assembled prompt the model receives for a page, + surface the
 * ILLUSTRATION DNA subject (what actually drives how big/landscape-y the art is)
 * and the composition contract. Saves the full prompt to a .txt. Read-only.
 * Usage: _prompt.ts <pageKey> */
import { writeFileSync } from 'node:fs';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';
import { prepareRender } from '../src/pipeline/whole-page-render/render-whole-page.js';

import { P } from './_project.js';
const KEY = process.argv[2] ?? 'CH01_P002';
const db = getDb();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
if (!row) throw new Error('no page ' + KEY);

const prep = await prepareRender(row.id);
const { spec, assembledPrompt } = prep;

console.log(`\n=== ${KEY} ===`);
console.log('layout:', row.layoutTemplate ?? '(default for role)');
console.log('\n-- ILLUSTRATION DNA · subject (this is what the model paints) --');
console.log(JSON.stringify(spec.illustrationDNA.subject, null, 2));
console.log('\n-- COMPOSITION (size/placement) --');
console.log('imagePlacement:', spec.composition.imagePlacement);
console.log('textPlacement :', spec.composition.textPlacement);

const out = `C:/Users/jovan/Downloads/_prompt_${KEY}.txt`;
writeFileSync(out, assembledPrompt);
console.log(`\nfull prompt → ${out}  (${assembledPrompt.length} chars)`);
process.exit(0);
