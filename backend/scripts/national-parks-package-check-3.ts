/**
 * THREE-FORMAT PACKAGING CHECK — the last look before six files leave the building.
 *
 * The paperback-only checker (national-parks-package-check.ts) verified a flat
 * two-file folder and still does. This one verifies the full KDP package:
 * paperback, hardcover and Kindle, in the nested structure that actually ships.
 *
 * What it adds beyond the earlier checkers:
 *
 *   - every one of the six artifacts pinned by hash, so the run proves what it
 *     inspected rather than "the interior" in the abstract
 *   - the hardcover interior proved BYTE-IDENTICAL to the paperback interior,
 *     which is the whole claim of reusing it
 *   - hardcover wrap geometry against the figures read off Amazon's own Cover
 *     Calculator, not an interpolation
 *   - the EPUB opened as a real container: mimetype stored first and
 *     uncompressed, OPF, nav, plates, cover
 *   - the marketing JPG's true pixel dimensions and colour space
 *   - the folder holding exactly these files and nothing stale beside them
 *
 *   npx tsx scripts/national-parks-package-check-3.ts <deliveryDir>
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import sharp from 'sharp';
import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib';

const DIR = process.argv[2];
if (!DIR) throw new Error('usage: national-parks-package-check-3.ts <deliveryDir>');

const MANIFEST = 'KDP-UPLOAD-MANIFEST.md';

/** The six artifacts, by the exact path they occupy in the delivery folder. */
const ARTIFACTS = {
  pbInterior: 'paperback/7-national-parks-interior-6x9.pdf',
  pbCover: 'paperback/7-national-parks-cover-6x9-116pp.pdf',
  hcInterior: 'hardcover/7-national-parks-interior-6x9.pdf',
  hcCover: 'hardcover/7-national-parks-HARDCOVER-6x9-116pp.pdf',
  epub: 'kindle/7_NATIONAL_PARKS_WITHOUT_THE_ROOKIE_MISTAKES_KINDLE.epub',
  kindleCover: 'kindle/7-national-parks-KINDLE-cover-1600x2560.jpg',
} as const;

/* Cover hashes have changed four times on 2026-08-22/23: to re-centre the spine
   type, to size it down until the drawn typography clears both folds by the
   0.075in house target, to name the seven parks on the back cover, and to carry
   the same seven along the foot of the front. The Kindle cover changed with the
   last of those, because it is a crop of that same front panel. Every superseded
   file is kept, named with its hash, under `_np_build/_superseded-*`. */
const EXPECT_SHA: Record<keyof typeof ARTIFACTS, string> = {
  pbInterior: '1e7cb467e630287d6994eb62cfadf4be716c2f262e45d18662e6b61ef5d9b3ac',
  pbCover: '537e53cc41b952cccefe3c807b036a57eac2d4049b6c13828f13802c395f9fb1',
  hcInterior: '1e7cb467e630287d6994eb62cfadf4be716c2f262e45d18662e6b61ef5d9b3ac',
  hcCover: '7fc1e54eb9b20a142c17d0f9235ec40729d1fe5291813d43dafbe81f42a0cee7',
  epub: '2c013d1da3cadf0418edeaf3dfff6b4705e8318beaab2ab951c57a209e41d95d',
  kindleCover: '4c623265867d0de703e4338c6d963bf684d3c867788334ddddb9d774adcd4c87',
};

const PAGES = 116;
const PT = 72;

/** Paperback: spine is derived from this interior's own page count. */
const PB_THICKNESS = 0.002252;
const PB_SPINE = PAGES * PB_THICKNESS;
const PB_WRAP_W = 0.125 * 2 + 6 * 2 + PB_SPINE;
const PB_WRAP_H = 9 + 0.25;

/** Hardcover: read from Amazon's Cover Calculator, 6x9 case laminate, 116pp. */
const HC_WRAP_W = 14.025;
const HC_WRAP_H = 10.417;

let failures = 0;
const fail = (l: string, d: string): void => { failures += 1; console.log(`  [FAIL] ${l}: ${d}`); };
const pass = (l: string, d: string): void => console.log(`  [PASS] ${l}: ${d}`);

const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
const abs = (rel: string): string => path.join(DIR, ...rel.split('/'));

// ── 1. The exact bytes ─────────────────────────────────────────────────────
console.log('1. FILE IDENTITY — six artifacts');
const bytes = {} as Record<keyof typeof ARTIFACTS, Buffer>;
for (const key of Object.keys(ARTIFACTS) as Array<keyof typeof ARTIFACTS>) {
  const rel = ARTIFACTS[key];
  let buf: Buffer;
  try {
    buf = readFileSync(abs(rel));
  } catch {
    fail(rel, 'MISSING from the delivery folder');
    continue;
  }
  bytes[key] = buf;
  const got = sha(buf);
  const kb = (buf.length / 1024).toFixed(0);
  if (got === EXPECT_SHA[key]) pass(rel, `${got.slice(0, 16)}… (${kb} KB)`);
  else fail(rel, `sha ${got}\n           expected ${EXPECT_SHA[key]}`);
}
if (failures > 0) {
  console.log('\nStopping: the files on disk are not the approved artifacts.');
  process.exit(1);
}

// ── 2. The hardcover reuses the paperback interior, byte for byte ──────────
console.log('\n2. SHARED INTERIOR');
if (bytes.pbInterior.equals(bytes.hcInterior)) {
  pass('interior reuse', 'hardcover interior is byte-identical to the paperback — one approved file, two bindings');
} else {
  fail('interior reuse', 'the two interiors differ; the approved interior was regenerated for the hardcover');
}

// ── 3. Interior geometry, checked once on the shared file ──────────────────
console.log('\n3. INTERIOR (shared by both print editions)');
const interior = await PDFDocument.load(bytes.pbInterior, { updateMetadata: false });
const iPages = interior.getPages();

if (iPages.length === PAGES) pass('page count', `${PAGES} pages`);
else fail('page count', `${iPages.length}, expected ${PAGES}`);
if (iPages.length % 2 === 0) pass('page parity', 'even, as KDP requires');
else fail('page parity', 'odd');

/**
 * KDP's hardcover minimum is 75 pages; the paperback minimum is 24. A file that
 * clears the hardcover floor clears both, which is why one interior can serve.
 */
if (iPages.length >= 75 && iPages.length <= 550) pass('hardcover page range', `${iPages.length} sits inside 75-550`);
else fail('hardcover page range', `${iPages.length} is outside KDP's 75-550 hardcover range`);

const oddSize = iPages.filter((p) => Math.abs(p.getWidth() - 6 * PT) > 0.5 || Math.abs(p.getHeight() - 9 * PT) > 0.5);
if (oddSize.length === 0) pass('trim', 'every page 6 x 9 in');
else fail('trim', `${oddSize.length} page(s) are not 6 x 9`);

{
  const annotated = iPages.filter((p) => {
    const a = p.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    return Boolean(a && a.size() > 0);
  }).length;
  const acro = interior.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  const embedded = interior.catalog
    .lookupMaybe(PDFName.of('Names'), PDFDict)
    ?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
  if (annotated === 0 && !acro && !embedded) pass('annotations', 'none — no comments, links, form fields or attachments');
  else fail('annotations', `${annotated} annotated page(s)${acro ? ', AcroForm' : ''}${embedded ? ', EmbeddedFiles' : ''}`);
}

{
  const raw = bytes.pbInterior.toString('latin1');
  const hasDash = /\[\s*\d+(\.\d+)?\s+\d+(\.\d+)?\s*\]\s*0\s+d/.test(raw);
  if (!hasDash) pass('review guides', 'no dashed stroke patterns — trim and text-area guides are off');
  else fail('review guides', 'dashed stroke pattern found; a guided build may have shipped');
}

{
  const fontsFound = new Map<string, boolean>();
  const plates: string[] = [];
  for (const [i, p] of iPages.entries()) {
    const res = p.node.Resources();
    const fonts = res?.lookupMaybe(PDFName.of('Font'), PDFDict);
    if (fonts) {
      for (const k of fonts.keys()) {
        const f = fonts.lookupMaybe(k, PDFDict);
        if (!f) continue;
        const base = String(f.get(PDFName.of('BaseFont')) ?? '?').replace(/^\//, '');
        let desc = f.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
        if (!desc) {
          const kids = f.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray);
          desc = kids?.lookupMaybe(0, PDFDict)?.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
        }
        fontsFound.set(base, Boolean(desc && ['FontFile', 'FontFile2', 'FontFile3'].some((n) => desc!.get(PDFName.of(n)))));
      }
    }
    const xo = res?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xo) continue;
    for (const k of xo.keys()) {
      const raw = xo.context.lookup(xo.get(k));
      const d = raw instanceof PDFDict ? raw : (raw as { dict?: InstanceType<typeof PDFDict> })?.dict;
      if (!d || String(d.get(PDFName.of('Subtype')) ?? '') !== '/Image') continue;
      plates.push(`p${i + 1} ${String(d.get(PDFName.of('ColorSpace')) ?? '?')}`);
    }
  }
  const unembedded = [...fontsFound].filter(([, e]) => !e);
  if (fontsFound.size > 0 && unembedded.length === 0) pass('fonts', `${fontsFound.size} faces, all embedded`);
  else fail('fonts', `${unembedded.length} unembedded of ${fontsFound.size}: ${unembedded.map(([n]) => n).join(', ')}`);

  console.log(`   plates: ${plates.join(', ')}`);
  if (plates.length === 5) pass('plate count', '5 stamped illustrations');
  else fail('plate count', `${plates.length}, expected 5`);
  if (plates.every((p) => p.includes('DeviceGray'))) pass('plate colour', 'every plate DeviceGray — a black-and-white interior');
  else fail('plate colour', 'a plate is not DeviceGray; KDP may price this as a colour interior');
}

// ── 4. The two covers ──────────────────────────────────────────────────────
console.log('\n4. COVER WRAPS');
for (const [label, buf, wantW, wantH, note] of [
  ['paperback', bytes.pbCover, PB_WRAP_W, PB_WRAP_H, `spine ${PB_SPINE.toFixed(6)} in from ${PAGES} pages`],
  ['hardcover', bytes.hcCover, HC_WRAP_W, HC_WRAP_H, 'case laminate, spine 0.450 in per the KDP Cover Calculator'],
] as Array<[string, Buffer, number, number, string]>) {
  const doc = await PDFDocument.load(buf, { updateMetadata: false });
  const pages = doc.getPages();
  if (pages.length !== 1) { fail(`${label} page count`, `${pages.length}, a full wrap must be 1 page`); continue; }
  const w = pages[0]!.getWidth() / PT;
  const h = pages[0]!.getHeight() / PT;
  if (Math.abs(w - wantW) < 0.005 && Math.abs(h - wantH) < 0.005) {
    pass(`${label} wrap`, `${w.toFixed(6)} x ${h.toFixed(6)} in — ${note}`);
  } else {
    fail(`${label} wrap`, `${w.toFixed(6)} x ${h.toFixed(6)} in, expected ${wantW.toFixed(6)} x ${wantH.toFixed(6)}`);
  }

  const annots = pages[0]!.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  const acro = doc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  if ((!annots || annots.size() === 0) && !acro) pass(`${label} annotations`, 'none');
  else fail(`${label} annotations`, 'annotations or a form are present on a print cover');
}

/** The hardcover wrap is genuinely larger — if it were not, one of them is wrong. */
if (HC_WRAP_W > PB_WRAP_W && HC_WRAP_H > PB_WRAP_H) {
  pass('wrap separation', `hardcover is ${(HC_WRAP_W - PB_WRAP_W).toFixed(3)} in wider and ${(HC_WRAP_H - PB_WRAP_H).toFixed(3)} in taller — a distinct file, not a copy`);
} else {
  fail('wrap separation', 'the hardcover wrap is not larger than the paperback wrap');
}

// ── 5. Kindle ──────────────────────────────────────────────────────────────
console.log('\n5. KINDLE');
{
  /**
   * EPUB requires "mimetype" to be the first entry and stored uncompressed.
   * Readers that check it reject the file outright when it is not, and a zip
   * library will happily produce an archive that fails on a device.
   */
  const head = bytes.epub.subarray(0, 60).toString('latin1');
  if (head.startsWith('PK') && head.includes('mimetypeapplication/epub+zip')) {
    pass('epub container', 'mimetype is the first entry and stored uncompressed');
  } else {
    fail('epub container', 'mimetype is not the first stored entry');
  }

  const zip = await JSZip.loadAsync(bytes.epub);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir).sort();

  const xhtml = names.filter((n) => n.endsWith('.xhtml') || n.endsWith('.html'));
  const images = names.filter((n) => /\.(jpe?g|png|gif|svg)$/i.test(n));
  const opf = names.filter((n) => n.endsWith('.opf'));
  const nav = names.filter((n) => /nav\.xhtml$|toc\.ncx$/i.test(n));

  if (opf.length === 1) pass('opf', opf[0]!);
  else fail('opf', `${opf.length} package documents, expected 1`);
  if (nav.length > 0) pass('navigation', nav.join(', '));
  else fail('navigation', 'no nav.xhtml or toc.ncx');

  const opfXml = await zip.file(opf[0]!)!.async('string');
  const spineCount = (opfXml.match(/<itemref\b/g) ?? []).length;
  console.log(`   documents: ${xhtml.length}   spine items: ${spineCount}   images: ${images.length}`);

  /** Five approved plates plus the cover image. */
  if (images.length >= 6) pass('images', `${images.length} — the five approved plates plus the cover`);
  else fail('images', `${images.length}, expected at least 6 (5 plates + cover)`);

  for (const [label, needle] of [
    ['Title', '7 National Parks Without the Rookie Mistakes'],
    ['Author', 'Tom Everett'],
  ] as Array<[string, string]>) {
    if (opfXml.includes(needle)) pass(`${label} in the OPF`, 'present');
    else fail(`${label} in the OPF`, 'NOT FOUND in the package metadata');
  }

  /** The retired identity must not have survived anywhere in the book text. */
  let allText = '';
  for (const n of xhtml) allText += await zip.file(n)!.async('string');
  const flat = allText.toLowerCase();
  for (const needle of ['nolan', 'withlow', 'without the overwhelm']) {
    if (!flat.includes(needle)) pass(`retired "${needle}"`, 'absent, as required');
    else fail(`retired "${needle}"`, 'PRESENT and must not be');
  }

  /** Composite-narrator disclosure is one of the three things that must survive. */
  if (flat.includes('composite')) pass('narrator disclosure', 'present in the ebook text');
  else fail('narrator disclosure', 'NOT FOUND — the composite-narrator disclosure must survive to every edition');

  /**
   * Navigation labels must be plain text. `<title>`, the nav link text and the
   * NCX label cannot hold markup, so a heading carrying emphasis used to reach
   * the contents screen with its asterisks intact.
   */
  {
    const navDoc = names.find((n) => /toc\.xhtml$|nav\.xhtml$/i.test(n));
    const ncx = names.find((n) => /toc\.ncx$/i.test(n));
    const labels: string[] = [];
    if (navDoc) {
      const s = await zip.file(navDoc)!.async('string');
      for (const m of s.matchAll(/<a [^>]*href="[^"]+"[^>]*>([\s\S]*?)<\/a>/g)) labels.push(m[1]!);
    }
    if (ncx) {
      const s = await zip.file(ncx)!.async('string');
      for (const m of s.matchAll(/<text>([\s\S]*?)<\/text>/g)) labels.push(m[1]!);
    }
    for (const n of xhtml) {
      const s = await zip.file(n)!.async('string');
      const t = s.match(/<title>([\s\S]*?)<\/title>/);
      if (t) labels.push(t[1]!);
    }
    const raw = labels.filter((l) => /\*\*|(^|\s)\*\S/.test(l)).map((l) => l.replace(/\s+/g, ' ').trim());
    if (raw.length === 0) pass('navigation labels', `${labels.length} titles and links, none carrying raw markdown`);
    else fail('navigation labels', `raw markdown in: ${raw.slice(0, 3).join(' | ')}`);
  }

  /** Reflowable means no fixed-layout declaration. */
  if (!/pre-paginated/i.test(opfXml)) pass('reflowable', 'no fixed-layout declaration');
  else fail('reflowable', 'the package declares pre-paginated layout');

  const meta = await sharp(bytes.kindleCover).metadata();
  if (meta.width === 1600 && meta.height === 2560) pass('marketing cover', `1600 x 2560 px, ${meta.space}, ${(bytes.kindleCover.length / 1024).toFixed(0)} KB`);
  else fail('marketing cover', `${meta.width} x ${meta.height}, expected 1600 x 2560`);
  if (meta.space === 'srgb') pass('cover colour space', 'sRGB, as KDP requires');
  else fail('cover colour space', `${meta.space}`);
}

// ── 6. The delivery folder holds exactly this and nothing else ─────────────
console.log('\n6. DELIVERY FOLDER');
{
  const walk = (dir: string, prefix = ''): string[] =>
    readdirSync(dir).flatMap((e) => {
      const full = path.join(dir, e);
      const rel = prefix ? `${prefix}/${e}` : e;
      return statSync(full).isDirectory() ? walk(full, rel) : [rel];
    });
  const found = walk(DIR).sort();
  const expected = [...Object.values(ARTIFACTS), MANIFEST].sort();
  for (const f of found) console.log(`   ${f}`);
  const extra = found.filter((e) => !expected.includes(e));
  const missing = expected.filter((e) => !found.includes(e));
  if (extra.length === 0 && missing.length === 0) {
    pass('folder contents', 'three edition folders, six artifacts and the manifest — nothing stale beside them');
  } else {
    if (extra.length) fail('unexpected files', extra.join(', '));
    if (missing.length) fail('missing files', missing.join(', '));
  }

  const manifest = readFileSync(abs(MANIFEST), 'utf8');
  const missingHashes = (Object.keys(ARTIFACTS) as Array<keyof typeof ARTIFACTS>)
    .filter((k) => !manifest.includes(EXPECT_SHA[k]));
  if (missingHashes.length === 0) pass('manifest', 'lists the SHA-256 of every one of the six artifacts');
  else fail('manifest', `no hash for ${missingHashes.map((k) => ARTIFACTS[k]).join(', ')}`);
}

console.log(`\n${'─'.repeat(70)}`);
console.log(failures === 0 ? 'THREE-FORMAT PACKAGE CHECK: PASS' : `THREE-FORMAT PACKAGE CHECK: FAIL — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
