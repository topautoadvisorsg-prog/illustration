/**
 * FIXTURE SMOKE — the end-to-end gate, on a book this repository owns.
 *
 *   fixture manuscript
 *     -> parser -> typesetting -> pagination -> interior PDF
 *     -> basic QA -> cover geometry -> compositor -> cover PDF -> manifest
 *
 *   npx tsx scripts/qa/fixture-smoke.ts
 *
 * WHY IT IS A SCRIPT AND NOT A UNIT TEST. Pagination runs Paged.js inside
 * Chromium. That is the right thing to exercise before trusting a release and
 * the wrong thing to put in a suite that must run in a second on every save, so
 * it lives here and CI calls it deliberately.
 *
 * It needs no database and no network. If Chromium cannot be resolved it says so
 * and exits 4, which a CI job can treat as "environment not ready" rather than
 * "the book is broken".
 *
 * WHAT IT DOES NOT YET PROVE: EPUB. That is the next fixture extension, kept out
 * of this phase deliberately rather than allowed to expand it.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { ProjectConfigSchema } from '@wildlands/shared';
import { renderTypesetBook } from '../../src/pipeline/typeset/render-typeset.js';
import { TRADE_NONFICTION_GUIDE_TYPESET_V2 } from '../../src/pipeline/typeset/layout-standards/trade-nonfiction-guide-v2.js';
import { normalizeManuscriptNewlines } from '../../src/pipeline/stage-1-ingestion/normalize-newlines.js';
import { buildCover } from '../../src/pipeline/cover/compositor/build-cover.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANUSCRIPT = path.resolve(HERE, '../../src/__tests__/fixtures/fixture-book/manuscript.md');
const OUT = path.resolve(HERE, '../../.fixture-smoke');

const PLATE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}
const checks: Check[] = [];
const check = (label: string, ok: boolean, detail: string) => checks.push({ label, ok, detail });

const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'The Fixture Field Guide',
  authorName: 'The Fixture Standards Board',
  trimSize: { widthIn: 6, heightIn: 9, bleedIn: 0.125 },
  paperStock: 'white',
});

const markdown = normalizeManuscriptNewlines(readFileSync(MANUSCRIPT, 'utf8'));
check('manuscript has no carriage returns after normalization', !markdown.includes('\r'), `${markdown.length} chars`);

// ── interior ────────────────────────────────────────────────────────────────
let interior: Buffer;
let html: string;
try {
  const rendered = await renderTypesetBook({
    markdown,
    config,
    images: { 'fixture-plate': PLATE },
    layoutStandard: TRADE_NONFICTION_GUIDE_TYPESET_V2,
    chaptersStartRecto: true,
  });
  interior = rendered.pdf;
  html = rendered.html;
} catch (e) {
  const msg = (e as Error).message;
  if (/chromium|browser|executablePath|ENOENT/i.test(msg)) {
    console.error(`\nFIXTURE SMOKE — ENVIRONMENT NOT READY\n\n  Chromium could not be resolved: ${msg}\n`);
    process.exit(4);
  }
  console.error(`\nFIXTURE SMOKE — FAILED DURING RENDER\n\n  ${msg}\n`);
  process.exit(1);
}

const doc = await PDFDocument.load(interior);
const pageCount = doc.getPageCount();
const { width, height } = doc.getPage(0).getSize();

check('interior paginated to a sane length', pageCount >= 4 && pageCount <= 40, `${pageCount} pages`);
check(
  'interior page box matches the trim',
  Math.abs(width / 72 - 6) < 0.01 && Math.abs(height / 72 - 9) < 0.01,
  `${(width / 72).toFixed(3)} x ${(height / 72).toFixed(3)}in`,
);

const bytes = interior.toString('latin1');
check('fonts are embedded, not referenced', bytes.includes('/FontFile'), 'found /FontFile in the PDF');

check('every section reached the page', (html.match(/class="tsec /g) ?? []).length === 7, '7 sections');
check('the plate rendered as a figure', (html.match(/<figure/g) ?? []).length === 1, 'one figure');
check('tables rendered', (html.match(/class="tset-table"/g) ?? []).length === 3, 'three tables');
check('the callout rendered', (html.match(/class="callout"/g) ?? []).length === 1, 'one callout');
/**
 * Asserted as "at least one", not an exact count, on purpose. `renderTypesetBook`
 * paginates in TWO passes so a contents page can state real start pages, and the
 * returned HTML therefore carries the block more than once. That is a property
 * of the render pipeline, not of the book, so pinning the number here would fail
 * for a reason that tells nobody anything. What matters is that the fence became
 * a styled block carrying its content, and that no literal fence reached a page.
 */
const preBlocks = (html.match(/class="tset-pre"/g) ?? []).length;
check('the fence rendered as a preformatted block', preBlocks >= 1, `${preBlocks} tset-pre block(s)`);
check(
  'the preformatted content survived to the page',
  html.includes('parse -&gt; typeset') || html.includes('parse -> typeset'),
  'the diagram text is present',
);
check('no unrendered fence survived to the page', !html.includes('```'), 'no literal fences');

// ── covers ──────────────────────────────────────────────────────────────────
/**
 * THE FIXTURE IS DELIBERATELY SHORTER THAN KDP WILL PRINT.
 *
 * It is kept at fixture size so CI stays fast, which puts it below the published
 * 24-page paperback minimum. That is not a problem to work around: it is a free
 * end-to-end proof that the compositor fails closed on a real rendered interior
 * rather than only in a unit test.
 *
 * The cover geometry itself is then exercised against a printable interior of
 * the same trim, synthesised here. Its page count is the only thing that
 * matters to a wrap.
 */
let refused = false;
let refusalReason = '';
try {
  await buildCover({
    interiorPdf: interior,
    artwork: await syntheticWrap(600, 450),
    binding: 'PAPERBACK',
    ink: 'BLACK_AND_WHITE',
    paper: 'WHITE',
    trim: '6x9',
    title: 'x',
    author: 'y',
    spineText: false,
    renderDpi: 72,
  });
} catch (e) {
  refused = true;
  refusalReason = (e as Error).message.split('\n').find((l) => l.includes('reason')) ?? '';
}
check(
  'the compositor refuses a book KDP will not print',
  refused,
  refused ? refusalReason.trim() : `${pageCount}pp was accepted, and it should not have been`,
);

const PRINTABLE_PAGES = 120;
const printableInterior = await syntheticInterior(PRINTABLE_PAGES);

const paperback = await buildCover({
  interiorPdf: printableInterior,
  interiorName: 'fixture-printable-interior.pdf',
  artwork: await syntheticWrap(1200, 890),
  artworkName: 'fixture-wrap.png',
  binding: 'PAPERBACK',
  ink: 'BLACK_AND_WHITE',
  paper: 'WHITE',
  trim: '6x9',
  title: 'The Fixture Field Guide',
  author: 'The Fixture Standards Board',
  spineText: false,
  renderDpi: 72,
});

check(
  'paperback wrap follows the published formula',
  Math.abs(paperback.geometry.spineIn - PRINTABLE_PAGES * 0.002252) < 1e-9,
  `spine ${paperback.geometry.spineIn.toFixed(5)}in at ${PRINTABLE_PAGES}pp`,
);
check(
  'paperback page count came from the PDF, not an argument',
  paperback.manifest.interior.pageCount === PRINTABLE_PAGES,
  `${paperback.manifest.interior.pageCount}`,
);
check(
  'paperback wrap dimensions',
  Math.abs(paperback.geometry.fullHeightIn - 9.25) < 1e-9,
  `${paperback.geometry.fullWidthIn.toFixed(5)} x ${paperback.geometry.fullHeightIn.toFixed(5)}in`,
);
check(
  'manifest pairs cover to interior by hash',
  /^[0-9a-f]{64}$/.test(paperback.manifest.interior.sha256) && /^[0-9a-f]{64}$/.test(paperback.manifest.cover.sha256),
  'both hashes present',
);

const hardcover = await buildCover({
  interiorPdf: printableInterior,
  artwork: await syntheticWrap(1200, 890),
  binding: 'HARDCOVER',
  ink: 'BLACK_AND_WHITE',
  paper: 'WHITE',
  trim: '6x9',
  title: 'The Fixture Field Guide',
  author: 'The Fixture Standards Board',
  spineText: false,
  renderDpi: 72,
});

check(
  'hardcover board is larger than the trim',
  hardcover.geometry.panelWidthIn > 6 && hardcover.geometry.panelHeightIn > 9,
  `board ${hardcover.geometry.panelWidthIn} x ${hardcover.geometry.panelHeightIn}in against a 6 x 9in trim`,
);
check(
  'hardcover wrap dimensions come from the calculator, not trim arithmetic',
  hardcover.geometry.spineAuthority === 'OFFICIAL_CALCULATOR_FIXTURE' &&
    hardcover.geometry.fullWidthIn > paperback.geometry.fullWidthIn + 1,
  `${hardcover.geometry.fullWidthIn} x ${hardcover.geometry.fullHeightIn}in, ${hardcover.geometry.spineAuthority}`,
);
check(
  'a stale cover is mechanically detectable',
  (await buildCover({
    interiorPdf: await syntheticInterior(PRINTABLE_PAGES + 2),
    artwork: await syntheticWrap(1200, 890),
    binding: 'PAPERBACK',
    ink: 'BLACK_AND_WHITE',
    paper: 'WHITE',
    trim: '6x9',
    title: 'x',
    author: 'y',
    spineText: false,
    renderDpi: 72,
  }).then((r) => r.manifest.spineIn !== paperback.manifest.spineIn)),
  `${PRINTABLE_PAGES} and ${PRINTABLE_PAGES + 2} pages produce different spines and different hashes`,
);

// ── report ──────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'interior.pdf'), interior);
writeFileSync(path.join(OUT, 'cover-paperback.pdf'), paperback.productionPdf);
writeFileSync(path.join(OUT, 'cover-paperback-proof.png'), paperback.proofPng);
writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(paperback.manifest, null, 2));

console.log('\nFIXTURE SMOKE');
console.log('─'.repeat(72));
for (const c of checks) console.log(`  [${c.ok ? 'PASS' : 'FAIL'}] ${c.label}\n         ${c.detail}`);
const failed = checks.filter((c) => !c.ok);
console.log('─'.repeat(72));
console.log(`  ${checks.length - failed.length}/${checks.length} passed`);
console.log(`  artifacts: ${OUT}`);
console.log('');
if (failed.length) process.exit(1);

/** A plain wrap-shaped raster. The compositor only needs real pixel dimensions. */
async function syntheticWrap(w: number, h: number): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 60, g: 70, b: 60 } } })
    .png()
    .toBuffer();
}

/**
 * An interior at a printable page count, for the cover half.
 *
 * A wrap cares about exactly one thing in the interior: how many pages it has.
 * Rendering a 120-page fixture book to prove that would cost CI minutes and
 * prove nothing extra.
 */
async function syntheticInterior(pages: number): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage([6 * 72, 9 * 72]);
  return Buffer.from(await pdf.save());
}
