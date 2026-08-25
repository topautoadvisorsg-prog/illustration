/**
 * FINAL PACKAGING CHECK — the last look before the files leave the building.
 *
 * Everything here has been verified before, in pieces, by the fidelity, print
 * and cover checkers. This runs against THE EXACT TWO FILES that will be
 * uploaded, asserts their hashes first, and adds the handful of things those
 * checkers do not cover because they only matter at handover:
 *
 *   - annotations, form fields and embedded files, which must not exist on a
 *     print PDF and which no earlier check looked for
 *   - review guides, which are drawn as vector strokes and would not show up in
 *     a text or font check
 *   - the delivery folder holding nothing but the two files and the manifest
 *
 * Hash-first is the point. A checker that verifies "the interior" without
 * pinning which bytes it verified proves nothing about what gets uploaded.
 *
 *   npx tsx scripts/national-parks-package-check.ts <deliveryDir>
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib';

const DIR = process.argv[2];
if (!DIR) throw new Error('usage: national-parks-package-check.ts <deliveryDir>');

const INTERIOR = '7-national-parks-interior-6x9.pdf';
const COVER = '7-national-parks-cover-6x9-116pp.pdf';
const MANIFEST = 'KDP-UPLOAD-MANIFEST.md';

const EXPECT_INTERIOR_SHA = '93700cc83bdb3db5042b5c25e1c94f104821a9be1ba12b2dc4401f13b7132de9';
const EXPECT_COVER_SHA = 'ac77632ea1dcff7c9e7008b5f0f2b39988661130462e8eef1f2f31961399aefe';

const PAGES = 116;
const THICKNESS = 0.002252;
const SPINE = PAGES * THICKNESS;
const PT = 72;

let failures = 0;
const fail = (l: string, d: string): void => { failures += 1; console.log(`  [FAIL] ${l}: ${d}`); };
const pass = (l: string, d: string): void => console.log(`  [PASS] ${l}: ${d}`);

const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

// ── 1. The exact bytes ─────────────────────────────────────────────────────
console.log('1. FILE IDENTITY');
const interiorBytes = readFileSync(path.join(DIR, INTERIOR));
const coverBytes = readFileSync(path.join(DIR, COVER));
const iSha = sha(interiorBytes);
const cSha = sha(coverBytes);
console.log(`   interior ${iSha}`);
console.log(`   cover    ${cSha}`);
if (iSha === EXPECT_INTERIOR_SHA) pass('interior hash', 'matches the approved artifact');
else fail('interior hash', `expected ${EXPECT_INTERIOR_SHA}`);
if (cSha === EXPECT_COVER_SHA) pass('cover hash', 'matches the approved artifact');
else fail('cover hash', `expected ${EXPECT_COVER_SHA}`);

// ── 2. Geometry and page count ─────────────────────────────────────────────
console.log('\n2. GEOMETRY');
const interior = await PDFDocument.load(interiorBytes, { updateMetadata: false });
const cover = await PDFDocument.load(coverBytes, { updateMetadata: false });
const iPages = interior.getPages();
const cPages = cover.getPages();

if (iPages.length === PAGES) pass('interior page count', `${PAGES} pages`);
else fail('interior page count', `${iPages.length}, expected ${PAGES}`);
if (iPages.length % 2 === 0) pass('page parity', 'even, as KDP requires');
else fail('page parity', 'odd');

const oddSize = iPages.filter((p) => Math.abs(p.getWidth() - 6 * PT) > 0.5 || Math.abs(p.getHeight() - 9 * PT) > 0.5);
if (oddSize.length === 0) pass('interior trim', 'every page 6 x 9 in');
else fail('interior trim', `${oddSize.length} page(s) are not 6 x 9`);

if (cPages.length === 1) pass('cover page count', '1 page, as a full wrap must be');
else fail('cover page count', `${cPages.length}`);

const wantW = (0.125 * 2 + 6 * 2 + SPINE) * PT;
const wantH = (9 + 0.25) * PT;
const cw = cPages[0]!.getWidth();
const chh = cPages[0]!.getHeight();
if (Math.abs(cw - wantW) < 0.25 && Math.abs(chh - wantH) < 0.25) {
  pass('cover wrap', `${(cw / PT).toFixed(6)} x ${(chh / PT).toFixed(6)} in, spine ${SPINE.toFixed(6)} in from ${PAGES} pages`);
} else {
  fail('cover wrap', `${(cw / PT).toFixed(6)} x ${(chh / PT).toFixed(6)} in, expected ${(wantW / PT).toFixed(6)} x ${(wantH / PT).toFixed(6)}`);
}

// ── 3. Nothing that should not be in a print PDF ───────────────────────────
console.log('\n3. NO ANNOTATIONS, FORMS OR ATTACHMENTS');
{
  const annotated: number[] = [];
  for (const [i, p] of iPages.entries()) {
    const a = p.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (a && a.size() > 0) annotated.push(i + 1);
  }
  const coverAnnots = cPages[0]!.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  if (annotated.length === 0 && (!coverAnnots || coverAnnots.size() === 0)) {
    pass('annotations', 'none on either file — no comments, links, stamps or form fields');
  } else {
    fail('annotations', `interior p${annotated.join(', p')}${coverAnnots?.size() ? '; cover has some' : ''}`);
  }

  for (const [label, doc] of [['interior', interior], ['cover', cover]] as const) {
    const cat = doc.catalog;
    const acro = cat.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
    const names = cat.lookupMaybe(PDFName.of('Names'), PDFDict);
    const embedded = names?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
    if (!acro && !embedded) pass(`${label} catalog`, 'no AcroForm, no embedded files');
    else fail(`${label} catalog`, `${acro ? 'AcroForm ' : ''}${embedded ? 'EmbeddedFiles' : ''} present`);
  }
}

// ── 4. Review guides ───────────────────────────────────────────────────────
/**
 * Guides are drawn as dashed vector strokes, so neither the text checker nor
 * the font checker would see them. The build draws them only under an explicit
 * flag; this confirms the flag was off for the bytes actually being shipped.
 */
console.log('\n4. NO REVIEW GUIDES');
{
  const raw = interiorBytes.toString('latin1');
  const dashPatterns = (raw.match(/\/CA 1[\s\S]{0,40}?d\b/g) ?? []).length;
  const hasDash = /\[\s*\d+(\.\d+)?\s+\d+(\.\d+)?\s*\]\s*0\s+d/.test(raw);
  if (!hasDash) pass('interior guides', 'no dashed stroke patterns — trim and text-area guides are off');
  else fail('interior guides', `dashed stroke pattern found (${dashPatterns} candidates) — a guided build may have shipped`);
}

// ── 5. Identity ────────────────────────────────────────────────────────────
console.log('\n5. IDENTITY');
{
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdfjs as any).GlobalWorkerOptions.workerSrc = '';
  const doc = await (
    pdfjs as unknown as { getDocument: (o: unknown) => { promise: Promise<any> } }
  ).getDocument({ data: new Uint8Array(interiorBytes), useSystemFonts: false, disableFontFace: true }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    text += tc.items.map((it: { str?: string }) => it.str ?? '').join(' ') + '\n';
  }
  const flat = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const [label, needle] of [
    ['Title', '7 National Parks Without the Rookie Mistakes'],
    ['Subtitle', "What's Worth Your Time, What to Skip, and What I Learned the Hard Way"],
    ['Author', 'Tom Everett'],
  ] as Array<[string, string]>) {
    if (flat.includes(squash(needle))) pass(label, 'present in the interior');
    else fail(label, 'NOT FOUND in the interior');
  }
  for (const [label, needle] of [
    ['Retired author (Nolan)', 'nolan'],
    ['Retired author (Withlow)', 'withlow'],
    ['Retired title', 'withouttheoverwhelm'],
  ] as Array<[string, string]>) {
    if (!flat.includes(needle)) pass(label, 'absent, as required');
    else fail(label, 'PRESENT and must not be');
  }
}

// ── 6. Fonts and plates ────────────────────────────────────────────────────
console.log('\n6. FONTS AND PLATES');
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
      const cs = String(d.get(PDFName.of('ColorSpace')) ?? '?');
      plates.push(`p${i + 1} ${cs}`);
    }
  }
  const unembedded = [...fontsFound].filter(([, e]) => !e);
  if (fontsFound.size > 0 && unembedded.length === 0) pass('fonts', `${fontsFound.size} faces, all embedded`);
  else fail('fonts', `${unembedded.length} unembedded of ${fontsFound.size}`);

  console.log(`   plates: ${plates.join(', ')}`);
  if (plates.length === 5) pass('plate count', '5 stamped illustrations');
  else fail('plate count', `${plates.length}, expected 5`);
  if (plates.every((p) => p.includes('DeviceGray'))) pass('plate colour', 'every plate DeviceGray — a black-and-white interior');
  else fail('plate colour', 'a plate is not DeviceGray; KDP may price this as a colour interior');
}

// ── 7. The delivery folder holds nothing else ──────────────────────────────
console.log('\n7. DELIVERY FOLDER');
{
  const entries = readdirSync(DIR).sort();
  const expected = [COVER, INTERIOR, MANIFEST].sort();
  console.log(`   ${entries.join(', ')}`);
  const extra = entries.filter((e) => !expected.includes(e));
  const missing = expected.filter((e) => !entries.includes(e));
  if (extra.length === 0 && missing.length === 0) {
    pass('folder contents', 'exactly the interior, the cover and the manifest — no stale or draft file beside them');
  } else {
    if (extra.length) fail('unexpected files', extra.join(', '));
    if (missing.length) fail('missing files', missing.join(', '));
  }
}

console.log(`\n${'─'.repeat(70)}`);
console.log(failures === 0 ? 'PACKAGE CHECK: PASS' : `PACKAGE CHECK: FAIL — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
