/** Validate the EXACT shipping EPUB. Reads only; nothing is written. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { zipEntries } from './_zip.js';

const EPUB = 'C:/Users/jovan/Downloads/before-you-need-it/FINAL-FILES/4 - KINDLE.epub';
const FIGDIR = 'C:/Users/jovan/Downloads/before-you-need-it/06-PRODUCTION/figures';

const bytes = readFileSync(EPUB);
console.log(`file sha256 ${createHash('sha256').update(bytes).digest('hex')}`);
const entries = zipEntries(bytes);

const docs = entries.filter((e) => /\.x?html$/i.test(e.entryName));
const all = docs.map((e) => e.getData().toString('utf8')).join('');
const imgs = [...all.matchAll(/<img[^>]*>/g)].map((m) => m[0]);
const noAlt = imgs.filter((t) => !/\salt="[^"]+"/.test(t));
console.log(`img tags ${imgs.length}, missing alt ${noAlt.length}`);

const manifest: Array<{ id: string; file: string; alt: string }> =
  JSON.parse(readFileSync(`${FIGDIR}/FIGURE-MANIFEST.json`, 'utf8'));
const altHits = manifest.filter((f) => all.includes(f.alt));
console.log(`manifest alt strings found in the XHTML: ${altHits.length}/${manifest.length}`);

/* Identity, not count: hash the decoded pixels of every image in the package and
   match them against the five approved figures on disk. */
const pixelHash = async (b: Buffer) =>
  createHash('sha256')
    .update(await sharp(b).greyscale().resize(64, 64, { fit: 'fill' }).raw().toBuffer())
    .digest('hex')
    .slice(0, 16);
const approved = new Map<string, string>();
for (const f of manifest) approved.set(await pixelHash(readFileSync(`${FIGDIR}/${f.file}`)), f.id);

const pics = entries.filter((e) => /\.(png|jpe?g)$/i.test(e.entryName));
console.log(`\nimage files in the package: ${pics.length}`);
let matched = 0;
for (const p of pics) {
  const h = await pixelHash(p.getData());
  const id = approved.get(h);
  if (id) matched++;
  console.log(`  ${p.entryName.padEnd(34)} ${id ?? '(cover)'}`);
}
console.log(`\napproved figures present: ${matched}/${manifest.length}`);
const RETIRED = ['preparedness-pouch', 'sequence-not-schedule', 'folded-bra-on-chair',
  'deodorant-and-hairbrush', 'cycle-four-steps', 'volume-dial', 'two-seedlings'];
const bad = RETIRED.filter((r) => entries.some((e) => e.entryName.includes(r)) || all.includes(r));
console.log(`retired illustrations present: ${bad.length ? bad.join(', ') : '0'}`);
