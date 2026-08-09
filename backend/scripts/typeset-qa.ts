/** Design-QA the generated typeset proof by reading the real PDF pages. */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import http from 'node:http';
import https from 'node:https';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
loadDotenv({ path: path.join(ROOT, '.env') });

const HOST = process.argv[3] ?? 'https://wildlandsbackend-production.up.railway.app';
const id = process.argv[2]!;
const pw = process.env.CONSOLE_PASSWORD ?? '';

function get(url: string): Promise<Buffer> {
  const lib = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    lib.get(url, { headers: { Authorization: `Bearer ${pw}` }, timeout: 0 }, (res) => {
      const c: Buffer[] = [];
      res.on('data', (d) => c.push(d as Buffer));
      res.on('end', () => resolve(Buffer.concat(c)));
    }).on('error', reject);
  });
}

console.log('fetching proof…');
const pdf = await get(`${HOST}/api/projects/${id}/typeset-preview?recto=true`);
const out = path.join(ROOT, 'outputs', 'typeset-prototype', 'proof-live.pdf');
await writeFile(out, pdf);
console.log('saved:', out, `(${(pdf.length / 1024 / 1024).toFixed(2)} MB)`);

const { extractText, getDocumentProxy } = await import('unpdf');
const doc = await getDocumentProxy(new Uint8Array(pdf));
const { text: pages } = await extractText(doc, { mergePages: false });
console.log('pages parsed:', pages.length);

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const blank = (s: string) => norm(s).length < 4;

console.log('\n=== PAGES 1–6 (verbatim, truncated) ===');
for (let i = 0; i < 6 && i < pages.length; i++) {
  const t = norm(pages[i]!);
  console.log(`p${i + 1} [${t.length} chars] ${t ? t.slice(0, 150) : '(EMPTY)'}`);
}

console.log('\n=== BLANK PAGES ===');
const blanks = pages.map((t, i) => (blank(t) ? i + 1 : 0)).filter(Boolean);
console.log(blanks.join(', '));

// Folios: a page number should appear in the extracted text of a normal page.
const folio = pages.map((t, i) => norm(t).includes(String(i + 1)));
const missingFolio = folio.map((f, i) => (!f && !blank(pages[i]!) ? i + 1 : 0)).filter(Boolean);
console.log('\n=== FOLIOS ===');
console.log('non-blank pages missing their own page number:', missingFolio.length, missingFolio.slice(0, 20).join(', '));

// Running heads: verso should carry the book title.
const RH = 'NO ONE TOLD ME THAT';
const versoWithHead = pages.filter((t, i) => (i + 1) % 2 === 0 && !blank(t) && norm(t).toUpperCase().includes(RH)).length;
const versoNonBlank = pages.filter((t, i) => (i + 1) % 2 === 0 && !blank(t)).length;
console.log('\n=== RUNNING HEADS ===');
console.log(`verso pages carrying the book title: ${versoWithHead}/${versoNonBlank}`);

// Section starts + duplicate/missing detection.
console.log('\n=== SECTION SEQUENCE ===');
const rep = JSON.parse((await get(`${HOST}/api/projects/${id}/typeset-preview?format=json&recto=true`)).toString()) as {
  report: { sectionStarts: Array<{ title: string; label: string; kind: string; page: number }>; totalPages: number };
};
const ss = rep.report.sectionStarts;
console.log('sections:', ss.length);
for (const s of ss) console.log(`  p${String(s.page).padStart(3)} [${(s.label || s.kind).padEnd(10)}] ${s.title}`);
const titles = ss.map((s) => s.title);
const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
console.log('duplicate section titles:', dupes.length ? dupes.join(' | ') : 'none');
const chapters = ss.filter((s) => s.label.startsWith('Chapter')).map((s) => Number(s.label.split(' ')[1]));
const missingCh = Array.from({ length: 23 }, (_, i) => i + 1).filter((n) => !chapters.includes(n));
console.log('chapters present:', chapters.length, '| missing:', missingCh.length ? missingCh.join(',') : 'none');
console.log('chapter order monotonic:', chapters.every((n, i) => i === 0 || n > chapters[i - 1]!));

// Short last lines / very sparse pages (potential widows or bad breaks).
console.log('\n=== SPARSE PAGES (possible bad breaks) ===');
const lens = pages.map((t) => norm(t).length);
const median = [...lens].filter((l) => l > 50).sort((a, b) => a - b)[Math.floor(lens.filter((l) => l > 50).length / 2)] ?? 0;
const sparse = lens.map((l, i) => (!blank(pages[i]!) && l < median * 0.35 ? { p: i + 1, chars: l } : null)).filter(Boolean);
console.log('median chars/page:', median);
console.log('pages under 35% of median:', sparse.length);
for (const s of sparse.slice(0, 15)) console.log(`  p${(s as { p: number }).p} — ${(s as { chars: number }).chars} chars`);

console.log('\n=== TOC / GENERATED FRONT MATTER ===');
const first10 = pages.slice(0, 10).map(norm).join(' ').toLowerCase();
console.log('contains "contents":', first10.includes('contents'));
console.log('contains "copyright":', first10.includes('copyright'));
console.log('contains ISBN:', first10.includes('isbn'));
process.exit(0);
