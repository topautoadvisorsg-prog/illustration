/* BACKFILL — create the default Color edition for the active project (idempotent).
 * Requires migration 0009 (editions table) applied. Read/write ONLY the editions
 * table; never touches renders/pages/print. No image spend.
 *   node ../node_modules/tsx/dist/cli.mjs scripts/backfill-editions.ts
 */
import { ensureDefaultColorEdition, listEditionsForProject } from '../src/db/repositories/editions.repo.js';
import { P } from './_project.js';
const ed = await ensureDefaultColorEdition(P);
console.log('default edition ensured:', { key: ed.editionKey, styleDnaId: ed.styleDnaId, isDefault: ed.isDefault, paperType: ed.paperType });
console.log('all editions for project:', (await listEditionsForProject(P)).map((e) => `${e.editionKey}(${e.styleDnaId})`));
process.exit(0);
