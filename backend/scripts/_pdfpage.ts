/* Rasterize one page straight out of a PDF so we can SEE what's actually in the
 * assembled file (not the cache). Read-only. Usage: _pdfpage.ts <file.pdf> <0-basedPage> [outName] */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import sharp from 'sharp';

const f = process.argv[2]!;
const page = Number(process.argv[3] ?? 0);
const out = process.argv[4] ?? '_pdfpage.png';
const st = statSync(f);
console.log(`${f}\n  size=${(st.size / 1048576).toFixed(1)}MB  mtime=${st.mtime.toISOString()}`);
const buf = readFileSync(f);
const img = await sharp(buf, { page, density: 110 }).png().toBuffer();
writeFileSync(`C:/Users/jovan/Downloads/${out}`, img);
console.log(`  page ${page} → ${out}`);
process.exit(0);
