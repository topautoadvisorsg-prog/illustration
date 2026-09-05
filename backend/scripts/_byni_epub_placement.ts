/**
 * WHERE does each figure land in the ebook?
 *
 * "5 figures present, 0 missing alt" says nothing about placement. A figure in
 * the wrong chapter passes every count-based check in the suite. The print
 * edition's placement was verified by rendering the pages; this is the ebook's
 * equivalent.
 */
import { readFileSync } from 'node:fs';
import { zipEntries } from './_zip.js';
import { OUT_DIR, REV } from './before-you-need-it-config.js';

const epub = `${OUT_DIR}/kindle/BEFORE-YOU-NEED-IT_kindle_${REV.replace('-', '')}.epub`;
const entries = zipEntries(readFileSync(epub));
const manifest: Array<{ id: string; file: string; alt: string }> =
  JSON.parse(readFileSync(`${OUT_DIR}/figures/FIGURE-MANIFEST.json`, 'utf8'));

for (const e of entries.filter((x) => /\.x?html$/i.test(x.entryName)).sort((a, b) => a.entryName.localeCompare(b.entryName))) {
  const html = e.getData().toString('utf8');
  const imgs = [...html.matchAll(/<img[^>]*alt="([^"]*)"[^>]*>/g)];
  if (!imgs.length) continue;
  const title = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) ?? html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/))?.[1]
    ?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() ?? '(no heading)';
  for (const m of imgs) {
    const alt = m[1]!;
    const fig = manifest.find((f) => alt.startsWith(f.alt.slice(0, 40)));
    // Where in the chapter does it sit? Report the sentence immediately before it.
    const before = html.slice(0, m.index!).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const lead = before.slice(-95);
    console.log(`\n${e.entryName}`);
    console.log(`  chapter: ${title.slice(0, 62)}`);
    console.log(`  figure : ${fig ? fig.id : 'UNRECOGNISED ALT'}`);
    console.log(`  follows: …${lead}`);
  }
}
process.exit(0);
