/**
 * INTERIOR PAGE INVENTORY — where art would actually help, and where it would not.
 *
 * Reads the finished 116-page PDF and measures every page. Nothing is generated
 * and nothing is spent: this exists so the illustration list is chosen from
 * evidence rather than from a guess about which pages "look empty".
 *
 * WHAT IS MEASURED, per page:
 *   - body text only. Running heads and folios are excluded by POSITION, so a
 *     page carrying nothing but furniture is correctly reported as blank.
 *   - the lowest baseline, which is what actually determines whether art fits.
 *   - the free band beneath the last line of type, in inches.
 *
 * Parity blanks are reported SEPARATELY from sparse pages. They exist to keep
 * chapters opening recto, and filling one changes what it is for.
 *
 *   npx tsx scripts/national-parks-interior-inventory.ts <pdf>
 */
import { readFileSync } from 'node:fs';

const PDF = process.argv[2];
if (!PDF) throw new Error('usage: national-parks-interior-inventory.ts <pdf>');

const PT = 72;
const TRIM_W = 6;
const TRIM_H = 9;
const MARGIN_TOP = 0.625;
const MARGIN_BOTTOM = 0.625;
const OUTSIDE = 0.5;
const GUTTER = 0.625;
/** The painted text block: what a page has to give to type before art can have any. */
const TEXT_H = TRIM_H - MARGIN_TOP - MARGIN_BOTTOM;
const TEXT_W = TRIM_W - OUTSIDE - GUTTER;

const bytes = readFileSync(PDF);
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pdfjs as any).GlobalWorkerOptions.workerSrc = '';
const doc = await (
  pdfjs as unknown as { getDocument: (o: unknown) => { promise: Promise<any> } }
).getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true }).promise;

interface PageInfo {
  n: number;
  chars: number;
  lines: number;
  /** Distance from the page foot up to the LOWEST line of body type, in inches. */
  lowestBaselineIn: number;
  /** Distance from the page head down to the HIGHEST line of body type. */
  highestTopIn: number;
  /** Clear inches between the last line of type and the bottom margin. */
  freeBelowIn: number;
  furniture: number;
  head: string;
  firstText: string;
}

const pages: PageInfo[] = [];
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const tc = await page.getTextContent();
  const height = page.getViewport({ scale: 1 }).height;
  const bodyTop = height - MARGIN_TOP * PT;
  const bodyBottom = MARGIN_BOTTOM * PT;

  let chars = 0;
  let furniture = 0;
  let lowest = Infinity;
  let highest = -Infinity;
  const ys = new Set<number>();
  const head: string[] = [];
  const texts: string[] = [];

  for (const it of tc.items as Array<{ str?: string; transform?: number[] }>) {
    const s = (it.str ?? '').trim();
    if (!s) continue;
    const y = it.transform?.[5] ?? -1;
    if (y < bodyBottom || y > bodyTop) {
      furniture += 1;
      if (y > bodyTop) head.push(s);
      continue;
    }
    chars += s.length;
    texts.push(s);
    ys.add(Math.round(y));
    if (y < lowest) lowest = y;
    if (y > highest) highest = y;
  }

  pages.push({
    n: i,
    chars,
    lines: ys.size,
    lowestBaselineIn: lowest === Infinity ? 0 : lowest / PT,
    highestTopIn: highest === -Infinity ? 0 : (height - highest) / PT,
    freeBelowIn: lowest === Infinity ? TEXT_H : Math.max(0, lowest / PT - MARGIN_BOTTOM),
    furniture,
    head: head.join(' ').slice(0, 60),
    firstText: texts.join(' ').slice(0, 90),
  });
}

/** A full page of this book's body type, for scale. */
const FULL = Math.max(...pages.map((p) => p.lines));

console.log(`pdf        : ${PDF}`);
console.log(`pages      : ${doc.numPages}`);
console.log(`text block : ${TEXT_W.toFixed(3)} x ${TEXT_H.toFixed(3)} in`);
console.log(`fullest    : ${FULL} lines of type\n`);

// ── 1. Blank pages ─────────────────────────────────────────────────────────
const blanks = pages.filter((p) => p.chars === 0);
console.log(`1. COMPLETELY BLANK PAGES — ${blanks.length}`);
for (const b of blanks) {
  const side = b.n % 2 === 1 ? 'recto' : 'verso';
  console.log(`   p${String(b.n).padStart(3)} ${side}  furniture:${b.furniture}  (next page starts a section: see section map)`);
}

// ── 2. Sparse pages ────────────────────────────────────────────────────────
/** Under a third of a full page of type, but not empty. */
const SPARSE_LINES = Math.round(FULL / 3);
const sparse = pages.filter((p) => p.chars > 0 && p.lines <= SPARSE_LINES);
console.log(`\n2. SPARSE PAGES (<= ${SPARSE_LINES} lines, i.e. under a third of a full page) — ${sparse.length}`);
for (const s of sparse) {
  const side = s.n % 2 === 1 ? 'recto' : 'verso';
  console.log(
    `   p${String(s.n).padStart(3)} ${side}  ${String(s.lines).padStart(2)} lines  ${String(s.chars).padStart(4)} chars  ` +
      `type ends ${s.lowestBaselineIn.toFixed(2)}in up  free below ${s.freeBelowIn.toFixed(2)}in`,
  );
  console.log(`        head:"${s.head}"  text:"${s.firstText}"`);
}

// ── 3. Distribution, so "sparse" is judged against the book ────────────────
console.log('\n3. FILL DISTRIBUTION');
const buckets = [0, 5, 10, 15, 20, 25, 30, 35, 40];
for (let i = 0; i < buckets.length; i++) {
  const lo = buckets[i]!;
  const hi = buckets[i + 1] ?? 999;
  const n = pages.filter((p) => p.lines >= lo && p.lines < hi).length;
  if (n) console.log(`   ${String(lo).padStart(2)}-${hi === 999 ? '+ ' : String(hi).padStart(2)} lines : ${'#'.repeat(Math.min(n, 60))} ${n}`);
}

/**
 * CHAPTER-END PAGES.
 *
 * The page before a section start is where a chapter runs out. Those carry the
 * real holes -- two lines of type and seven inches of white -- and they are the
 * honest illustration opportunities, because the space is already there and
 * filling it costs no pagination.
 */
const SECTION_STARTS = [4,5,6,10,11,15,19,22,23,33,43,55,69,79,91,100,101,105,108,111,112];
console.log('\n4. CHAPTER-END PAGES (the page before each section start)');
for (const start of SECTION_STARTS) {
  const prev = pages.find((q) => q.n === start - 1);
  if (!prev) continue;
  const side = prev.n % 2 === 1 ? 'recto' : 'verso';
  const tag = prev.chars === 0 ? 'BLANK (parity)' : prev.lines <= 12 ? 'HOLE' : prev.lines <= 20 ? 'part-full' : 'full';
  console.log(
    `   p${String(prev.n).padStart(3)} ${side}  ${String(prev.lines).padStart(2)} lines  free below ${prev.freeBelowIn.toFixed(2)}in  ${tag}  -> p${start} starts a section`,
  );
}
const last = pages[pages.length - 1]!;
console.log(`   p${last.n} verso  ${last.lines} lines  free below ${last.freeBelowIn.toFixed(2)}in  (final page)`);

console.log(`\n5. AVERAGE free space below type: ${(pages.reduce((a, p) => a + p.freeBelowIn, 0) / pages.length).toFixed(2)}in`);
process.exit(0);
