/**
 * SWAP THE COVER INSIDE A FINISHED EPUB, and repack it correctly.
 *
 * The Kindle file and the paperback have to be the same book. When the cover
 * artwork changes, OEBPS/cover.jpeg inside the EPUB is stale, and no amount of
 * checking the delivery folder catches it because the wrong image is sealed
 * inside the zip.
 *
 * REPACKING AN EPUB IS NOT ZIPPING A FOLDER. The OCF spec requires "mimetype"
 * to be the FIRST entry and STORED, not deflated: readers and EPUBCheck sniff
 * those bytes at a fixed offset. A plain recursive zip puts the files in
 * whatever order the filesystem hands them over and compresses everything,
 * which produces an archive that opens in some readers and is rejected by
 * others. So mimetype is written first and uncompressed, and everything else
 * follows.
 *
 * Nothing else in the book is touched: same XHTML, same manifest, same spine,
 * same images bar the cover.
 *
 *   tsx scripts/national-parks-epub-recover.ts <in.epub> <newCover.jpg> <out.epub>
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';

const IN = process.argv[2];
const COVER = process.argv[3];
const OUT = process.argv[4];
if (!IN || !COVER || !OUT) throw new Error('usage: national-parks-epub-recover.ts <in.epub> <newCover.jpg> <out.epub>');

const srcBytes = readFileSync(IN);
const src = await JSZip.loadAsync(srcBytes);
const coverBytes = readFileSync(COVER);

const names = Object.keys(src.files).filter((n) => !src.files[n]!.dir);
console.log(`source     : ${IN}`);
console.log(`           : ${names.length} entries, sha256 ${createHash('sha256').update(srcBytes).digest('hex')}`);

const COVER_PATH = names.find((n) => /(^|\/)cover\.jpe?g$/i.test(n));
if (!COVER_PATH) throw new Error('no cover.jpeg inside this EPUB; refusing to guess which image is the cover');
const oldCover = await src.file(COVER_PATH)!.async('nodebuffer');
console.log(`cover      : ${COVER_PATH}`);
console.log(`  was      : ${oldCover.length} bytes, sha256 ${createHash('sha256').update(oldCover).digest('hex').slice(0, 32)}`);
console.log(`  now      : ${coverBytes.length} bytes, sha256 ${createHash('sha256').update(coverBytes).digest('hex').slice(0, 32)}`);

if (!names.includes('mimetype')) throw new Error('no mimetype entry; this is not a valid EPUB to repack');

const out = new JSZip();
/** FIRST and STORED. Everything else after it. */
out.file('mimetype', await src.file('mimetype')!.async('nodebuffer'), { compression: 'STORE' });
for (const name of names) {
  if (name === 'mimetype') continue;
  const data = name === COVER_PATH ? coverBytes : await src.file(name)!.async('nodebuffer');
  out.file(name, data, { compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

const bytes = await out.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
writeFileSync(OUT, bytes);

/** Read the file back and prove the two things that matter, rather than assume them. */
const check = await JSZip.loadAsync(readFileSync(OUT));
const checkNames = Object.keys(check.files).filter((n) => !check.files[n]!.dir);
const first = Object.keys(check.files)[0];
const checkCover = await check.file(COVER_PATH)!.async('nodebuffer');
const mimetypeText = await check.file('mimetype')!.async('string');
console.log(`\nfile       : ${OUT}`);
console.log(`bytes      : ${bytes.length}`);
console.log(`sha256     : ${createHash('sha256').update(bytes).digest('hex')}`);
console.log(`entries    : ${checkNames.length} (source had ${names.length})`);
console.log(`first entry: ${first} = "${mimetypeText.trim()}"`);
console.log(`cover in   : ${checkCover.length} bytes, matches the new file: ${Buffer.compare(checkCover, coverBytes) === 0}`);
if (first !== 'mimetype') throw new Error('mimetype is not the first entry after repacking');
if (checkNames.length !== names.length) throw new Error(`entry count changed: ${names.length} -> ${checkNames.length}`);
if (Buffer.compare(checkCover, coverBytes) !== 0) throw new Error('the cover inside the repacked EPUB is not the file that was passed in');
console.log(`           : mimetype first, entry count unchanged, cover swapped — PASS`);
process.exit(0);
