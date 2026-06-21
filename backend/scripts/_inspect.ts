/* Verify blueprint ↔ prompt agreement for a page: prints the layout, the prompt's
 * COMPOSITION CONTRACT (placement) line, the painted zones (role + geometry), and
 * saves the blueprint PNG so the zones can be eyeballed against the prompt text.
 * Read-only. Usage: _inspect.ts <pageKey> */
import { writeFileSync } from 'node:fs';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';
import { prepareRender } from '../src/pipeline/whole-page-render/render-whole-page.js';
import { renderBlueprintPng } from '../src/pipeline/stage-3-generation/blueprint.js';

import { P } from './_project.js';
const KEY = process.argv[2] ?? 'CH03_P004';
const db = getDb();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, KEY))))[0];
if (!row) throw new Error('no page ' + KEY);

const prep = await prepareRender(row.id);
const { spec, assembledPrompt, allocation, size } = prep;

console.log(`\n=== ${KEY} ===`);
console.log('layoutTemplate (row):', row.layoutTemplate);
console.log('\n-- PROMPT placement (what the AI is told) --');
console.log('imagePlacement:', spec.composition.imagePlacement);
console.log('textPlacement :', spec.composition.textPlacement);
const contract = assembledPrompt.split('\n').find((l) => l.includes('COMPOSITION CONTRACT'));
if (contract) console.log('\ncontract line:', contract.trim());

console.log('\n-- BLUEPRINT zones (what the AI is shown) --');
const fmt = (z: { role: string; xPct: number; yPct: number; widthPct: number; heightPct: number }) =>
  `  ${z.role.padEnd(15)} x${z.xPct} y${z.yPct} w${z.widthPct} h${z.heightPct}  (bottom=${(z.yPct + z.heightPct).toFixed(1)})`;
console.log(' image zones:'); for (const z of allocation.imagePriorityZones) console.log(fmt(z));
console.log(' text  zones:'); for (const z of allocation.textSafeZones) console.log(fmt(z));

const [bw, bh] = size.split('x').map(Number);
const { trim, bleedIn } = spec.layoutGeometry;
const canvasIn = { w: trim.widthIn + 2 * bleedIn, h: trim.heightIn + 2 * bleedIn };
const { png } = await renderBlueprintPng(allocation, bw ?? 1024, bh ?? 1536, { badgeSafeZones: spec.badgeSafeZones, canvasIn });
const out = `C:/Users/jovan/Downloads/_blueprint_${KEY}.png`;
writeFileSync(out, png);
console.log('\nblueprint →', out);
process.exit(0);
