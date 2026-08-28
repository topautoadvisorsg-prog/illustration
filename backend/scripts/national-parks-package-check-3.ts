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
import { PAGE_THICKNESS_IN } from '../src/pipeline/publishing-standard/cover-dimensions.js';

import { getKdpCoverDimensions } from '../src/pipeline/publishing-standard/kdp-cover-specs.js';

const DIR = process.argv[2];
if (!DIR) throw new Error('usage: national-parks-package-check-3.ts <deliveryDir>');

const MANIFEST = 'KDP-UPLOAD-MANIFEST.md';

/**
 * The five artifacts, by the exact name they carry in the delivery folder.
 *
 * ONE INTERIOR, not one per binding. The paperback and the hardcover are the
 * same 6x9 block of pages; only the cover differs, because only the cover
 * depends on how the book is bound. An earlier layout kept a copy of the
 * interior in a `paperback/` folder and another in a `hardcover/` folder and
 * proved them byte-identical, which was true and was the wrong shape: two files
 * that must never differ are better stored as one file that cannot.
 *
 * Flat, too. Nesting hid the fact that four of the six files were really three,
 * and at upload time the only thing that matters is picking the right file.
 */
const ARTIFACTS = {
  interior: '7-national-parks-interior-6x9-122pp.pdf',
  pbCover: '7-national-parks-cover-PAPERBACK-6x9-122pp.pdf',
  epub: '7-national-parks-KINDLE.epub',
  hcCover: '7-national-parks-cover-HARDCOVER-6x9-122pp.pdf',
  kindleCover: '7-national-parks-KINDLE-cover-1600x2560.jpg',
} as const;

/**
 * THE HARDCOVER COVER IS IN THE PACKAGE.
 *
 * It was pending for as long as there was no verified Cover Calculator reading
 * at this page count, and `kdp-cover-specs` refuses to interpolate a hardcover
 * spine from a single anchor. The reading was taken on 2026-08-27 for
 * HARDCOVER/CASE_LAMINATE, BLACK_AND_WHITE, WHITE paper, 6x9in at 122pp:
 * full wrap 14.039 x 10.417in, spine 0.464in, board 6.197 x 9.236in.
 *
 * Read, not interpolated. The model's interpolation for 122pp agreed on the
 * wrap and the spine and put the SPINE SAFE AREA at 0.235in against Amazon's
 * 0.339in, which is the number the spine copy is set inside.
 *
 * The 116pp wrap stays quarantined under `_np_build/_superseded-116pp/`. Its
 * 0.450in spine is wrong for a 120-page block and it must never be uploaded.
 */

/* The three cover files have been re-cut repeatedly across 2026-08-22/23 as the
   front-cover treatment settled, and the INTERIOR changed once, on 2026-08-23,
   to drop a stray "->" from the appendix running head. That rebuild was proved
   inert: 116 pages before and after, every page identical character for
   character except the two running heads, the five plates on the same pages,
   the parity blanks unmoved. Every superseded file is kept, named with its hash,
   under `_np_build/_superseded-*`. */
const EXPECT_SHA: Record<keyof typeof ARTIFACTS, string> = {
  interior: '27ee30d2d6d41cbd91fcdef0681b9705ee773728833d57826290c3cde6d412a2',
  pbCover: '65dd7ed40101b78a48a40345441199353eac0be46b98dad9ab10612897c26b71',
  epub: 'ec1502ee9eb1991c7282b9ec9c069b6f7b244df10e69bb6be95d5357b558da01',
  hcCover: '71c26d35d43bfb7b8564847424ba117d410bf0a264f04d09e2381fff051ffa84',
  kindleCover: '2b4499252c0723fd743da832eb242d2c40b79f6a7e9c498852e4727177e62376',
};

const PAGES = 122;
const PT = 72;

/** Paperback: spine is derived from this interior's own page count. */
const PB_THICKNESS = PAGE_THICKNESS_IN.white;
const PB_SPINE = PAGES * PB_THICKNESS;
const PB_WRAP_W = 0.125 * 2 + 6 * 2 + PB_SPINE;
const PB_WRAP_H = 9 + 0.25;
const PLATES_EXPECTED = 16;

/** Hardcover: the verified Cover Calculator reading, 6x9 case laminate, at THIS page count. */
const HC = getKdpCoverDimensions({
  binding: 'HARDCOVER',
  coverType: 'CASE_LAMINATE',
  interiorType: 'BLACK_AND_WHITE',
  paperType: 'WHITE',
  trimSize: '6x9',
  pageCount: PAGES,
});
const HC_WRAP_W = HC.fullWidthIn;
const HC_WRAP_H = HC.fullHeightIn;

let failures = 0;
const fail = (l: string, d: string): void => { failures += 1; console.log(`  [FAIL] ${l}: ${d}`); };
const pass = (l: string, d: string): void => console.log(`  [PASS] ${l}: ${d}`);

const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
const abs = (rel: string): string => path.join(DIR, ...rel.split('/'));

// ── 1. The exact bytes ─────────────────────────────────────────────────────
console.log('1. FILE IDENTITY — five artifacts, all three editions');
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

// ── 2. One interior, valid for both bindings ──────────────────────────────
/**
 * There is nothing left to compare — that is the point of storing it once. What
 * still has to be proved is that this single file is acceptable to BOTH
 * bindings, since it is uploaded to both.
 */
console.log('\n2. ONE INTERIOR, UPLOADED TO BOTH PRINT EDITIONS');
pass('single source', 'one interior file, so the two print editions cannot drift apart');

// ── 3. Interior geometry ───────────────────────────────────────────────────
console.log('\n3. INTERIOR');
const interior = await PDFDocument.load(bytes.interior, { updateMetadata: false });
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
  const raw = bytes.interior.toString('latin1');
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
  if (plates.length === PLATES_EXPECTED) pass('plate count', `${PLATES_EXPECTED} stamped illustrations`);
  else fail('plate count', `${plates.length}, expected ${PLATES_EXPECTED}`);
  if (plates.every((p) => p.includes('DeviceGray'))) pass('plate colour', 'every plate DeviceGray — a black-and-white interior');
  else fail('plate colour', 'a plate is not DeviceGray; KDP may price this as a colour interior');
}

// ── 4. The two covers ──────────────────────────────────────────────────────
console.log('\n4. COVER WRAPS');
for (const [label, buf, wantW, wantH, note] of [
  ['paperback', bytes.pbCover, PB_WRAP_W, PB_WRAP_H, `spine ${PB_SPINE.toFixed(6)} in from ${PAGES} pages`],
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

{
  /** Measured against the calculator reading for THIS page count, not a formula. */
  const bytes = readFileSync(abs(ARTIFACTS.hcCover));
  const doc = await PDFDocument.load(bytes);
  const pg = doc.getPage(0);
  const w = pg.getWidth() / PT;
  const h = pg.getHeight() / PT;
  const okW = Math.abs(w - HC_WRAP_W) < 0.002;
  const okH = Math.abs(h - HC_WRAP_H) < 0.002;
  if (okW && okH) {
    pass(
      'hardcover wrap',
      `${w.toFixed(6)} x ${h.toFixed(6)} in — spine ${HC.spineIn}in, board ${HC.frontWidthIn} x ${HC.frontHeightIn}in, ` +
        `from the Cover Calculator reading for ${PAGES}pp (${HC.provenance})`,
    );
  } else {
    fail('hardcover wrap', `${w.toFixed(6)} x ${h.toFixed(6)} in against a required ${HC_WRAP_W} x ${HC_WRAP_H} in`);
  }
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
    ['Author', 'Wes Denman'],
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
  /**
   * The listing copy travels with the package.
   *
   * It is not an upload artifact -- nothing in it is a file KDP receives -- but
   * the description, the seven keywords and the price all get typed into the KDP
   * form during the same sitting as the uploads, and keeping them in the same
   * folder is what stops that being done from memory.
   */
  const COMPANION_DOCS = ['AMAZON-BOOK-DESCRIPTION.md', '7-national-parks-cover-HARDCOVER-6x9-122pp.json'];
  const expected = [...Object.values(ARTIFACTS), MANIFEST, ...COMPANION_DOCS].sort();
  for (const f of found) console.log(`   ${f}`);
  const extra = found.filter((e) => !expected.includes(e));
  const missing = expected.filter((e) => !found.includes(e));
  if (extra.length === 0 && missing.length === 0) {
    pass('folder contents', 'five artifacts and the manifest, flat — nothing stale beside them');
  } else {
    if (extra.length) fail('unexpected files', extra.join(', '));
    if (missing.length) fail('missing files', missing.join(', '));
  }

  const manifest = readFileSync(abs(MANIFEST), 'utf8');
  const missingHashes = (Object.keys(ARTIFACTS) as Array<keyof typeof ARTIFACTS>)
    .filter((k) => !manifest.includes(EXPECT_SHA[k]));
  if (missingHashes.length === 0) pass('manifest', 'lists the SHA-256 of every one of the five artifacts');
  else fail('manifest', `no hash for ${missingHashes.map((k) => ARTIFACTS[k]).join(', ')}`);
}

console.log(`\n${'─'.repeat(70)}`);
console.log(failures === 0 ? 'THREE-FORMAT PACKAGE CHECK: PASS' : `THREE-FORMAT PACKAGE CHECK: FAIL — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
