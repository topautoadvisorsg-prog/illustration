/* Add the reused FM_001 half-title as the Kindle frontispiece (opening illustration).
 * Reads the active HALF_TITLE render from storage, makes a Kindle-optimized JPEG,
 * stores it under heroes/kindle/hero_FRONT.jpg, and records it in heroes/mapping.json.
 * No image spend; does not touch the print render.
 *   node ../node_modules/tsx/dist/cli.mjs scripts/add-frontispiece.ts
 */
import sharp from 'sharp';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { P } from './_project.js';

const db = getDb();
const storage = getProjectStorage();

const halfTitle = await db
  .select({ id: pages.id })
  .from(pages)
  .where(and(eq(pages.projectId, P), eq(pages.frontMatterType, 'HALF_TITLE')))
  .limit(1);
if (!halfTitle[0]) { console.error('no HALF_TITLE page found'); process.exit(1); }

const render = await db
  .select({ imagePath: wholePageRenders.imagePath })
  .from(wholePageRenders)
  .where(and(eq(wholePageRenders.pageId, halfTitle[0].id), eq(wholePageRenders.active, true)))
  .limit(1);
const imagePath = render[0]?.imagePath;
if (!imagePath) { console.error('no active HALF_TITLE render'); process.exit(1); }
console.log('FM_001 source:', imagePath);

const png = await storage.readProjectFile(imagePath);
const jpg = await sharp(png).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
const stored = await storage.writeProjectFile(P, ['heroes', 'kindle', 'hero_FRONT.jpg'], jpg);
console.log(`frontispiece optimized → ${stored.relativePath} (${(jpg.length / 1024) | 0} KB)`);

// Update mapping.json
const mapBytes = await storage.readProjectFile(`${P}/heroes/mapping.json`);
const mapping = JSON.parse(mapBytes.toString('utf8'));
mapping.frontispiece = {
  heroId: 'FRONT',
  kindleKey: stored.relativePath,
  alt: 'The Wildlands — opening illustration: a misty boreal pond at sunrise beneath a great pine.',
};
await storage.writeProjectFile(P, ['heroes', 'mapping.json'], JSON.stringify(mapping, null, 2));
console.log('mapping.json updated with frontispiece.');
process.exit(0);
