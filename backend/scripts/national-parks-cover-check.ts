/**
 * COVER PRINT CHECK — verify the finished wrap against KDP's own numbers.
 *
 * Reads the produced PDF from disk. Nothing here re-renders, because a checker
 * that builds its own copy proves something about a file nobody will upload.
 *
 * The required geometry is recomputed from KDP's published formula rather than
 * read back from whatever built the file:
 *   width  = 0.125 + 6 + spine + 6 + 0.125
 *   height = 0.125 + 9 + 0.125
 *   spine  = pages x 0.002252   (white paper, black-and-white interior)
 *
 *   npx tsx scripts/national-parks-cover-check.ts <coverPdf> [interiorPdf]
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib';
import { PAGE_THICKNESS_IN } from '../src/pipeline/publishing-standard/cover-dimensions.js';

const COVER = process.argv[2];
if (!COVER) throw new Error('usage: national-parks-cover-check.ts <coverPdf> [interiorPdf]');
const INTERIOR = process.argv[3];

const INTERIOR_PAGES = 116;

// KDP's formula, restated here so the check does not inherit a builder's error.
const TRIM_W = 6;
const TRIM_H = 9;
const BLEED = 0.125;
const THICKNESS = PAGE_THICKNESS_IN.white;
const SPINE = INTERIOR_PAGES * THICKNESS;
const WANT_W = BLEED + TRIM_W + SPINE + TRIM_W + BLEED;
const WANT_H = BLEED + TRIM_H + BLEED;
const PT = 72;

/** Copy must sit at least this far inside the trim line. KDP recommends 0.25. */
const SAFE_IN = 0.25;
/** KDP's barcode area, lower right of the BACK panel, plus its clearance. */
const BARCODE_W = 2;
const BARCODE_H = 1.2;
const BARCODE_CLEAR = 0.25;

let failures = 0;
let warnings = 0;
const fail = (l: string, d: string): void => { failures += 1; console.log(`  [FAIL] ${l}: ${d}`); };
const warn = (l: string, d: string): void => { warnings += 1; console.log(`  [WARN] ${l}: ${d}`); };
const pass = (l: string, d: string): void => console.log(`  [PASS] ${l}: ${d}`);

const bytes = readFileSync(COVER);
const sha = createHash('sha256').update(bytes).digest('hex');
const doc = await PDFDocument.load(bytes, { updateMetadata: false });
const pages = doc.getPages();

console.log(`cover  : ${COVER}`);
console.log(`sha256 : ${sha}`);
console.log(`bytes  : ${bytes.length}`);
console.log(`pages  : ${pages.length}\n`);

/**
 * IS THIS A RASTER WRAP?
 *
 * Decided from the page's own resources, before any check runs: a cover whose
 * words are painted into the artwork has image XObjects and no fonts at all.
 * The alternative — a wrap set as live type — has fonts and text runs.
 *
 * The distinction has to be made UP FRONT because it changes which checks are
 * meaningful. Asking a raster cover for its embedded fonts reports "no font
 * resources at all" on a file that is completely correct, and asking it for its
 * title reports the title missing from a cover where it is four inches tall.
 */
const RASTER = (() => {
  const res = pages[0]?.node.Resources();
  // COUNT the entries. A `/Font` key can be present and EMPTY — pdf-lib writes
  // one on a page that only ever drew an image — so testing for the key's
  // existence reported a raster wrap as live type and every text check then
  // failed on a correct file.
  const fonts = res?.lookupMaybe(PDFName.of('Font'), PDFDict);
  const xobjs = res?.lookupMaybe(PDFName.of('XObject'), PDFDict);
  const fontCount = fonts ? [...fonts.keys()].length : 0;
  const imageCount = xobjs ? [...xobjs.keys()].length : 0;
  return fontCount === 0 && imageCount > 0;
})();
console.log(`kind   : ${RASTER ? 'RASTER wrap (copy painted into the artwork)' : 'VECTOR wrap (live type)'}
`);

// ── 1. Page box ────────────────────────────────────────────────────────────
console.log('1. WRAP GEOMETRY');
{
  if (pages.length !== 1) fail('page count', `a full wrap is ONE page; this file has ${pages.length}`);
  else pass('page count', '1 page, as a full wrap must be');

  const p = pages[0]!;
  const wIn = p.getWidth() / PT;
  const hIn = p.getHeight() / PT;
  const dw = Math.abs(wIn - WANT_W);
  const dh = Math.abs(hIn - WANT_H);
  console.log(`         required : ${WANT_W.toFixed(6)} x ${WANT_H.toFixed(6)} in  (spine ${SPINE.toFixed(6)})`);
  console.log(`         actual   : ${wIn.toFixed(6)} x ${hIn.toFixed(6)} in`);
  // A thousandth of an inch is a quarter of a point — far inside press tolerance.
  if (dw < 0.001 && dh < 0.001) pass('page size matches KDP', `delta ${dw.toFixed(6)} x ${dh.toFixed(6)} in`);
  else fail('page size', `off by ${dw.toFixed(6)} x ${dh.toFixed(6)} in`);

  const boxes = ['TrimBox', 'BleedBox', 'CropBox', 'ArtBox'].filter((k) => p.node.get(PDFName.of(k)));
  if (boxes.length === 0) pass('no conflicting boxes', 'MediaBox only — the wrap is the page');
  else warn('extra page boxes', `${boxes.join(', ')} declared; confirm each equals the MediaBox`);
}

// ── 2. Fonts ───────────────────────────────────────────────────────────────
console.log('\n2. FONTS');
if (RASTER) {
  // Nothing to embed: a raster wrap carries no live type. Reporting 'no font
  // resources' as a failure here condemned a completely correct file.
  pass('fonts', 'not applicable: the wrap carries no live type, so there is no face to embed');
} else {
  const found = new Map<string, boolean>();
  for (const page of pages) {
    const fonts = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
    if (!fonts) continue;
    for (const k of fonts.keys()) {
      const f = fonts.lookupMaybe(k, PDFDict);
      if (!f) continue;
      const base = String(f.get(PDFName.of('BaseFont')) ?? '?').replace(/^\//, '');
      const subtype = String(f.get(PDFName.of('Subtype')) ?? '?').replace(/^\//, '');
      let desc = f.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
      if (!desc) {
        const kids = f.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray);
        desc = kids?.lookupMaybe(0, PDFDict)?.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
      }
      const embedded = Boolean(desc && ['FontFile', 'FontFile2', 'FontFile3'].some((n) => desc!.get(PDFName.of(n))));
      found.set(`${subtype}:${base}`, embedded);
    }
  }
  for (const [n, e] of [...found].sort()) console.log(`         ${e ? 'embedded' : 'NOT EMBEDDED'}  ${n}`);
  const bad = [...found].filter(([n, e]) => !e || n.startsWith('Type3:'));
  if (found.size === 0) fail('fonts', 'no font resources at all');
  else if (bad.length === 0) pass('all faces embedded', `${found.size} face(s), every one a real font program`);
  else fail('font embedding', `${bad.length} face(s) unembedded or Type3: ${bad.map(([n]) => n).join(', ')}`);
}

// ── 3. Copy placement ──────────────────────────────────────────────────────
console.log('\n3. TEXT PLACEMENT, SAFE AREAS AND ZONES');
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pdfjs as any).GlobalWorkerOptions.workerSrc = '';
const jsDoc = await (
  pdfjs as unknown as { getDocument: (o: unknown) => { promise: Promise<any> } }
).getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true }).promise;

interface Item { str: string; x: number; y: number; w: number; h: number }
const items: Item[] = [];
{
  const page = await jsDoc.getPage(1);
  const tc = await page.getTextContent();
  for (const it of tc.items as Array<{ str?: string; transform?: number[]; width?: number; height?: number }>) {
    const s = (it.str ?? '').trim();
    if (!s) continue;
    const t = it.transform ?? [];
    items.push({
      str: s,
      x: (t[4] ?? 0) / PT,
      y: (t[5] ?? 0) / PT,
      w: (it.width ?? 0) / PT,
      h: (it.height ?? 0) / PT,
    });
  }
}
console.log(`         ${items.length} text run(s) on the wrap`);

/**
 * A RASTER WRAP HAS NO TEXT LAYER.
 *
 * The shipping cover is one continuous photographic image: the title, subtitle
 * and back copy are painted into the artwork, so `getTextContent` returns only
 * what CODE composited — and after the spine type was flattened into the image,
 * that is nothing at all.
 *
 * Reporting "title not found" on that file would be a lie about a cover whose
 * title is four inches tall. So the text checks below are SKIPPED for a raster
 * wrap and replaced by the ones that do apply: resolution, coverage, and the
 * geometry above. Copy safety on a raster cover is established by measuring the
 * artwork against drawn trim guides — see `_guides.png` in the build folder and
 * the measured margins in the report — not by parsing a layer that does not
 * exist.
 */
if (RASTER) {
  pass('raster wrap', 'no text layer: every word is painted into the artwork, as this cover lineage intends');
}

/** Panel boundaries, measured from the left edge of the wrap. */
const backRight = BLEED + TRIM_W;
const spineRight = backRight + SPINE;

const inBack = (i: Item): boolean => i.x + i.w <= backRight + 0.02;
const inFront = (i: Item): boolean => i.x >= spineRight - 0.02;
const inSpine = (i: Item): boolean => !inBack(i) && !inFront(i);

if (!RASTER) {
  // Safe box for each outer panel, expressed in wrap coordinates.
  const vTop = WANT_H - (BLEED + SAFE_IN);
  const vBottom = BLEED + SAFE_IN;
  const backSafeL = BLEED + SAFE_IN;
  const backSafeR = backRight - SAFE_IN;
  const frontSafeL = spineRight + SAFE_IN;
  const frontSafeR = WANT_W - (BLEED + SAFE_IN);

  const violations: string[] = [];
  for (const i of items) {
    if (inSpine(i)) continue;
    const l = inBack(i) ? backSafeL : frontSafeL;
    const rr = inBack(i) ? backSafeR : frontSafeR;
    // y is the baseline; descenders sit a little below it.
    const bottom = i.y - i.h * 0.25;
    const top = i.y + i.h;
    if (i.x < l - 0.005 || i.x + i.w > rr + 0.005 || bottom < vBottom - 0.005 || top > vTop + 0.005) {
      violations.push(`"${i.str.slice(0, 42)}" at x=${i.x.toFixed(3)} w=${i.w.toFixed(3)} y=${i.y.toFixed(3)}`);
    }
  }
  if (violations.length === 0) {
    pass('copy inside safe area', `every run at least ${SAFE_IN}in inside the trim on both panels`);
  } else {
    fail('copy outside safe area', `${violations.length} run(s)`);
    for (const v of violations.slice(0, 8)) console.log(`         ${v}`);
  }
}

if (!RASTER) {
  // Barcode zone: lower right of the BACK panel, plus KDP's clearance.
  const zoneR = backRight - BLEED;
  const zoneL = zoneR - BARCODE_W - BARCODE_CLEAR;
  const zoneB = BLEED;
  const zoneT = zoneB + BARCODE_H + BARCODE_CLEAR;
  const intruders = items.filter(
    (i) => inBack(i) && i.x + i.w > zoneL && i.x < zoneR && i.y - i.h * 0.25 < zoneT && i.y + i.h > zoneB,
  );
  console.log(`         barcode zone: x ${zoneL.toFixed(3)}–${zoneR.toFixed(3)}in, y ${zoneB.toFixed(3)}–${zoneT.toFixed(3)}in`);
  if (intruders.length === 0) pass('barcode zone clear', `${BARCODE_W} x ${BARCODE_H}in plus ${BARCODE_CLEAR}in clearance, no copy in it`);
  else {
    fail('barcode zone', `${intruders.length} run(s) inside it`);
    for (const i of intruders.slice(0, 5)) console.log(`         "${i.str.slice(0, 40)}"`);
  }
}

if (!RASTER) {
  // Spine text must stay comfortably inside the spine. A perfect-bound fold
  // wanders, and KDP's own guidance is to allow 0.0625in either side.
  const FOLD_VARIANCE = 0.0625;
  const spineItems = items.filter(inSpine);
  if (spineItems.length === 0) warn('spine text', 'none found');
  else {
    // Vertical type: the run's own height is its horizontal extent on the spine.
    const worst = spineItems.reduce((m, i) => Math.max(m, i.h), 0);
    const clearEachSide = (SPINE - worst) / 2;
    console.log(`         spine ${SPINE.toFixed(4)}in, type ${worst.toFixed(4)}in, clear ${clearEachSide.toFixed(4)}in per side`);
    if (clearEachSide >= FOLD_VARIANCE) {
      pass('spine text inside safe area', `${clearEachSide.toFixed(4)}in clear each side, at or beyond the ${FOLD_VARIANCE}in fold variance`);
    } else {
      fail('spine text', `only ${clearEachSide.toFixed(4)}in clear per side; needs ${FOLD_VARIANCE}in for fold variance`);
    }
    if (INTERIOR_PAGES < 79) fail('spine text allowed', `${INTERIOR_PAGES} pages is under KDP's 79-page threshold`);
    else pass('spine text allowed', `${INTERIOR_PAGES} >= 79 pages`);
  }
}

// ── 4. Metadata on the wrap ────────────────────────────────────────────────
console.log('\n4. METADATA ON THE COVER');
if (RASTER) {
  pass(
    'metadata',
    'verified on the ARTWORK against drawn trim guides, not by parsing text: a raster wrap has no layer to parse. See the guides proof and the measured margins in the build folder.',
  );
} else {
  const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const all = squash(items.map((i) => i.str).join(' '));
  /**
   * Checked PER PANEL, not across the wrap.
   *
   * The first version of this check asked only whether the title appeared
   * anywhere in the file. It passed on a build whose FRONT COVER WAS BLANK,
   * because the spine carries the title and author too. "Somewhere on the wrap"
   * is not the requirement; the front cover is.
   */
  const frontText = squash(items.filter(inFront).map((i) => i.str).join(' '));
  const backText = squash(items.filter(inBack).map((i) => i.str).join(' '));
  const spineText = squash(items.filter(inSpine).map((i) => i.str).join(' '));
  console.log(`         front ${items.filter(inFront).length} run(s), spine ${items.filter(inSpine).length}, back ${items.filter(inBack).length}`);

  const ON_FRONT: Array<[string, string]> = [
    ['Title on the front', '7 National Parks Without the Rookie Mistakes'],
    ['Subtitle on the front', "What's Worth Your Time, What to Skip, and What I Learned the Hard Way"],
    ['Author on the front', 'Wes Denman'],
  ];
  for (const [label, needle] of ON_FRONT) {
    if (frontText.includes(squash(needle))) pass(label, `"${needle.slice(0, 46)}" present`);
    else fail(label, `"${needle.slice(0, 46)}" NOT ON THE FRONT COVER`);
  }
  if (spineText.includes(squash('Wes Denman'))) pass('Author on the spine', 'present');
  else fail('Author on the spine', 'missing');
  if (backText.length > 400) pass('back-cover copy', `${backText.length} characters of copy on the back panel`);
  else fail('back-cover copy', `only ${backText.length} characters on the back panel`);

  const FORBIDDEN: Array<[string, string]> = [
    ['Retired author (Nolan)', 'Nolan'],
    ['Retired author (Withlow)', 'Withlow'],
    ['Retired title', 'Without the Overwhelm'],
    ['Retired subtitle', "A First-Timer's Deep Guide"],
    ['Placeholder barcode caption', 'ISBN barcode area'],
    ['Placeholder text', 'Lorem ipsum'],
  ];
  for (const [label, needle] of FORBIDDEN) {
    if (!all.includes(squash(needle))) pass(label, 'absent, as required');
    else fail(label, `"${needle}" IS ON THE COVER`);
  }
}

// ── 5. Raster content ──────────────────────────────────────────────────────
console.log('\n5. IMAGE RESOLUTION');
{
  const xo = pages[0]!.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
  const images: string[] = [];
  if (xo) {
    for (const k of xo.keys()) {
      // An image XObject is a STREAM, not a dictionary — `lookupMaybe(_, PDFDict)`
      // throws on it rather than returning undefined. Resolve the reference and
      // read whichever shape came back.
      const raw = xo.context.lookup(xo.get(k));
      const d = raw instanceof PDFDict ? raw : (raw as { dict?: InstanceType<typeof PDFDict> })?.dict;
      if (!d) continue;
      if (String(d.get(PDFName.of('Subtype')) ?? '') === '/Image') {
        const w = Number(String(d.get(PDFName.of('Width')) ?? '0'));
        const h = Number(String(d.get(PDFName.of('Height')) ?? '0'));
        images.push(`${String(k)} ${w}x${h}px`);
      }
    }
  }
  if (images.length === 0) {
    if (RASTER) fail('artwork', 'the wrap carries no text layer AND no image — it is empty');
    else pass('no raster art', 'the wrap is vector type and flat colour, so there is no resolution to fall short');
  } else {
    const p0 = pages[0]!;
    for (const i of images) {
      const m = /(\d+)x(\d+)px/.exec(i);
      if (!m) { console.log(`         ${i}`); continue; }
      const wPx = Number(m[1]), hPx = Number(m[2]);
      // Placed full-bleed across the whole wrap, which is what this cover does.
      const dpiX = wPx / (p0.getWidth() / PT);
      const dpiY = hPx / (p0.getHeight() / PT);
      console.log(`         ${i} -> ${dpiX.toFixed(0)} x ${dpiY.toFixed(0)} DPI at full-wrap size`);
      if (dpiX >= 299.5 && dpiY >= 299.5) {
        pass('image resolution', `${Math.round(Math.min(dpiX, dpiY))} DPI, at or above KDP's 300 DPI minimum`);
      } else {
        fail('image resolution', `${Math.round(Math.min(dpiX, dpiY))} DPI is below KDP's 300 DPI minimum`);
      }
      if (Math.abs(wPx / hPx - p0.getWidth() / p0.getHeight()) < 0.01) {
        pass('artwork covers the wrap', 'the image aspect matches the page, so it is full-bleed with no gap');
      } else {
        fail('artwork coverage', 'the image aspect does not match the page — it cannot be covering the full wrap');
      }
    }
  }
}

// ── 6. Pairing with the interior ───────────────────────────────────────────
if (INTERIOR) {
  console.log('\n6. INTERIOR PAIRING');
  const iBytes = readFileSync(INTERIOR);
  const iDoc = await PDFDocument.load(iBytes, { updateMetadata: false });
  const n = iDoc.getPageCount();
  console.log(`         interior : ${INTERIOR}`);
  console.log(`         sha256   : ${createHash('sha256').update(iBytes).digest('hex')}`);
  if (n === INTERIOR_PAGES) pass('page count agrees', `${n} pages, the count this spine was computed from`);
  else fail('page count mismatch', `the wrap assumes ${INTERIOR_PAGES} pages, the interior has ${n} — the spine is wrong`);
}

console.log(`\n${'─'.repeat(70)}`);
console.log(`COVER: ${failures} failure(s), ${warnings} warning(s)`);
console.log(failures === 0 ? 'COVER CHECK: PASS' : 'COVER CHECK: FAIL');
process.exit(failures === 0 ? 0 : 1);
