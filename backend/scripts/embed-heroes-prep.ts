/* STEP 1 of the Kindle hero embed: map heroes → entries, VERIFY (no silent
 * guessing), import to project storage (original PNG + Kindle-optimized JPEG),
 * and write a mapping report. Read-only against the book; no image spend; does
 * not touch the print pipeline.
 *   node ../node_modules/tsx/dist/cli.mjs scripts/embed-heroes-prep.ts
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { listEntriesForProject } from '../src/db/repositories/entries.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { P } from './_project.js';

const HEROES = 'C:/Users/jovan/Downloads/heroes';
const KINDLE_MAXEDGE = 1200; // long-edge px for the in-book copy
const KINDLE_QUALITY = 80;

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function tokens(s: string): Set<string> {
  return new Set(slugify(s).split('-').filter((t) => t.length > 2));
}
/** True if the entry title and the hero slug share at least one meaningful token. */
function aligned(title: string, slug: string): boolean {
  const a = tokens(title);
  const b = new Set(slug.split('-').filter((t) => t.length > 2));
  for (const t of b) if (a.has(t)) return true;
  // also accept when the title is a single short word fully inside the slug
  return [...a].some((t) => slug.includes(t));
}

// Index hero files by their numeric/letter id (hero_<id>_<slug>.png).
const files = readdirSync(HEROES).filter((f) => /^hero_[0-9A-Z]{3}_.*\.png$/.test(f));
const byId = new Map<string, { file: string; slug: string }>();
for (const f of files) {
  const m = f.match(/^hero_([0-9A-Z]{3})_(.+)\.png$/);
  if (m) byId.set(m[1]!, { file: f, slug: m[2]! });
}

const entries = await listEntriesForProject(P);
const storage = getProjectStorage();
const doImport = !process.argv.includes('--report-only');

interface MapRow { readingOrder: number; entryKey: string; title: string; sci: string | null; heroId: string; heroFile: string | null; aligned: boolean; }
const rows: MapRow[] = [];
const missing: string[] = [];
const misaligned: string[] = [];

console.log(`\n=== HERO ↔ ENTRY MAPPING (${entries.length} entries, ${files.length} hero files) ===\n`);
for (const e of entries) {
  const id = String(e.readingOrder).padStart(3, '0');
  const hero = byId.get(id);
  const ok = hero ? aligned(e.entryTitle, hero.slug) : false;
  rows.push({ readingOrder: e.readingOrder, entryKey: e.entryKey, title: e.entryTitle, sci: e.scientificName, heroId: id, heroFile: hero?.file ?? null, aligned: ok });
  if (!hero) missing.push(`entry #${e.readingOrder} "${e.entryTitle}" → NO hero file hero_${id}_*`);
  else if (!ok) misaligned.push(`#${e.readingOrder} "${e.entryTitle}" ↔ ${hero.file} (slug doesn't match title)`);
}

// Section heroes (not in the 127 body entries).
const sections: Record<string, string> = { I: 'introduction', G: 'glossary', A: 'about-series' };
const sectionRows: { id: string; section: string; file: string | null }[] = [];
for (const [id, label] of Object.entries(sections)) {
  const key = '00' + id;
  const hero = byId.get(key);
  sectionRows.push({ id: key, section: label, file: hero?.file ?? null });
  if (!hero) missing.push(`section "${label}" → NO hero file hero_${key}_*`);
}

// Print mapping
for (const r of rows) {
  const flag = !r.heroFile ? '  ✗ MISSING' : r.aligned ? '' : '  ⚠ CHECK';
  console.log(`#${String(r.readingOrder).padStart(3)} ${r.title.padEnd(34).slice(0, 34)} ← ${r.heroFile ?? '(none)'}${flag}`);
}
console.log('\n--- section images ---');
for (const s of sectionRows) console.log(`${s.section.padEnd(14)} ← ${s.file ?? '(none)'}${s.file ? '' : '  ✗ MISSING'}`);
console.log('frontispiece    ← FM_001_HALF_TITLE (reused print half-title, separate path)');

console.log(`\n=== VERIFY: ${rows.filter((r) => r.heroFile).length}/${entries.length} entries mapped | misaligned: ${misaligned.length} | missing: ${missing.length} ===`);
for (const m of misaligned) console.log(`   ⚠ ${m}`);
for (const m of missing) console.log(`   ✗ ${m}`);

// Import to storage (original PNG + Kindle JPEG) keyed by id.
const manifest: Record<string, { original: string; kindle: string; bytesPng: number; bytesJpg: number }> = {};
if (doImport) {
  console.log(`\n=== IMPORTING to storage (original PNG + ${KINDLE_MAXEDGE}px JPEG q${KINDLE_QUALITY}) ===`);
  let n = 0;
  const allIds = [...rows.filter((r) => r.heroFile).map((r) => r.heroId), ...sectionRows.filter((s) => s.file).map((s) => s.id)];
  for (const id of allIds) {
    const hero = byId.get(id)!;
    const png = readFileSync(join(HEROES, hero.file));
    const jpg = await sharp(png).resize(KINDLE_MAXEDGE, KINDLE_MAXEDGE, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: KINDLE_QUALITY, mozjpeg: true }).toBuffer();
    const orig = await storage.writeProjectFile(P, ['heroes', 'original', `hero_${id}.png`], png);
    const kindle = await storage.writeProjectFile(P, ['heroes', 'kindle', `hero_${id}.jpg`], jpg);
    manifest[id] = { original: orig.relativePath, kindle: kindle.relativePath, bytesPng: png.length, bytesJpg: jpg.length };
    n++;
    if (n % 20 === 0) console.log(`  …${n} imported`);
  }
  console.log(`  imported ${n} images (orig+kindle).`);
}

// Persist the mapping for the embed step + a human report.
const mapping = {
  generatedAt: new Date().toISOString(),
  projectId: P,
  entries: rows.map((r) => ({ readingOrder: r.readingOrder, entryKey: r.entryKey, title: r.title, scientificName: r.sci, heroId: r.heroId, kindleKey: manifest[r.heroId]?.kindle ?? null, aligned: r.aligned })),
  sections: sectionRows.map((s) => ({ section: s.section, heroId: s.id, kindleKey: manifest[s.id]?.kindle ?? null })),
  frontispiece: 'FM_001_HALF_TITLE',
  missing,
  misaligned,
};
writeFileSync(join(HEROES, '_mapping.json'), JSON.stringify(mapping, null, 2));
if (doImport) await storage.writeProjectFile(P, ['heroes', 'mapping.json'], JSON.stringify(mapping, null, 2));
const totalJpg = Object.values(manifest).reduce((a, m) => a + m.bytesJpg, 0);
console.log(`\nmapping saved → ${join(HEROES, '_mapping.json')}${doImport ? ' + storage heroes/mapping.json' : ''}`);
if (doImport) console.log(`total Kindle-JPEG payload: ${(totalJpg / 1048576).toFixed(1)} MB across ${Object.keys(manifest).length} images`);
process.exit(0);
