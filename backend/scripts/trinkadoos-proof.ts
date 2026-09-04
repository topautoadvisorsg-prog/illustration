/**
 * THE TRINKADOOS — interior proof render, all ten titles.
 *
 * Renders each standalone 32-page picture book at 8.5 x 8.5 + 0.125 bleed through
 * the production renderer (Chromium + Paged.js), then gates the result. Nothing
 * here re-decides pagination: a picture book's pagination is given, not computed.
 * The brief fixes it — p.3 opener, fourteen spreads, p.32 closer — and this script
 * asserts the render agrees with it.
 *
 * WHY PAGE COUNT IS THE OVERFLOW GATE. The pages are fixed at 32. If a text block
 * does not fit its text-safe zone, Paged.js pushes the overflow onto a new page and
 * the count comes back 33 or more. So overflow cannot pass silently as a clipped
 * line nobody notices — it fails the build loudly, by arithmetic. `overflow: hidden`
 * would have hidden exactly the defect this render exists to find.
 *
 * ART IS NOT GENERATED HERE, DELIBERATELY. No illustration asset exists for this
 * wave yet, and generation is a separate, paid stage. Every page carries a sized
 * art slot printed with its own ART block from the authoritative brief, so layout
 * is verifiable now and the artwork drops into a proven frame later.
 *
 * Usage: tsx scripts/trinkadoos-proof.ts [bookNumber ...]     (default: all ten)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { renderHtmlToPdf, loadPagedPolyfill, isChromiumAvailable } from '../src/pipeline/stage-6-layout/render-pdf.js';
import {
  ART_BRIEF, EXTENT, GEOMETRY, LOAD_BEARING, MARGINS, OUT_DIR, PALETTE, SPREAD_COUNT, TITLES,
  TRIM, UNITS_PER_TITLE, readArtBrief, readTitleManuscript, type TitleSpec,
} from './trinkadoos-config.js';

// ------------------------------------------------------------------ parsing

interface Unit {
  /** 'P3' | 'S1'..'S14' | 'P32' */
  key: string;
  label: string;
  text: string[];
  art: string;
  /** Pages this unit occupies. Spreads are two. */
  pages: number;
}

/** Splits the authoritative brief into ten titles of sixteen units each. */
function parseBrief(md: string): Map<number, Unit[]> {
  const byBook = new Map<number, Unit[]>();
  let book = 0;
  let unit: Unit | null = null;
  let mode: 'text' | null = null;
  for (const line of md.split('\n')) {
    const bookMatch = /^# BOOK (\d+) /.exec(line);
    if (bookMatch) {
      book = Number(bookMatch[1]);
      byBook.set(book, []);
      unit = null;
      continue;
    }
    if (!book) continue;
    // "PAGE 32" must be tried before "PAGE 3" or it matches as a prefix and the
    // closer silently overwrites the opener. That exact bug ate ten closers once.
    const unitMatch = /^### (PAGE 32|PAGE 3|SPREAD (\d+))(.*)$/.exec(line);
    if (unitMatch) {
      const key = unitMatch[1] === 'PAGE 3' ? 'P3' : unitMatch[1] === 'PAGE 32' ? 'P32' : `S${unitMatch[2]}`;
      unit = { key, label: `${unitMatch[1]}${unitMatch[3]}`.trim(), text: [], art: '', pages: key.startsWith('S') ? 2 : 1 };
      byBook.get(book)!.push(unit);
      mode = null;
      continue;
    }
    if (!unit) continue;
    if (line.startsWith('**TEXT:**')) { mode = 'text'; continue; }
    if (line.startsWith('**ART:**')) { unit.art = line.slice('**ART:**'.length).trim(); mode = null; continue; }
    if (mode === 'text' && line.startsWith('>')) {
      const t = line.slice(1).trim();
      // Compilation delimiters are reviewer apparatus and never print.
      if (t && !t.startsWith('**END OF')) unit.text.push(t);
    }
  }
  return byBook;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Story paragraphs of a layout manuscript, headings and rules removed. */
function manuscriptParagraphs(md: string): string[] {
  return md
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l !== '---')
    .map(norm);
}

// ------------------------------------------------------------------- markup

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Markdown emphasis the story text actually uses. Nothing else is supported. */
const inline = (s: string) =>
  esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');

interface PageSpec {
  n: number;
  side: 'recto' | 'verso';
  kind: 'front' | 'opener' | 'spread' | 'closer';
  unit?: Unit;
  /** Which half of a spread this page is. */
  half?: 'left' | 'right';
  html: string;
}

function artSlot(spec: TitleSpec, unit: Unit, half?: 'left' | 'right'): string {
  const loadBearing = LOAD_BEARING[`${spec.book}:${unit.key}`];
  const halfLabel = half ? ` &middot; ${half.toUpperCase()} HALF` : '';
  // The brief prints once per spread, on the left, so a two-page cue is not read
  // as two separate instructions.
  const body = half === 'right'
    ? '<p class="art-cont">artwork continues across the gutter from the facing page</p>'
    // The brief italicises for emphasis ("clearly *aware* of them"). Rendering the
    // asterisks literally makes art direction look like a broken file.
    : `<p class="art-brief">${inline(unit.art)}</p>${loadBearing ? `<p class="art-lb"><strong>LOAD-BEARING &mdash;</strong> ${inline(loadBearing)}</p>` : ''}`;
  return `<div class="art"><p class="art-key">ART SLOT &middot; ${esc(unit.label)}${halfLabel}</p>${body}<p class="art-note">full bleed &middot; 300 dpi &middot; ${TRIM.widthIn + TRIM.bleedIn} &times; ${TRIM.heightIn + 2 * TRIM.bleedIn} in with bleed</p></div>`;
}

function storyBlock(unit: Unit): string {
  if (!unit.text.length) return '<div class="story empty"></div>';
  return `<div class="story">${unit.text.map((t) => `<p>${inline(t)}</p>`).join('')}</div>`;
}

function buildPages(spec: TitleSpec, units: Unit[]): PageSpec[] {
  const pages: PageSpec[] = [];
  const push = (kind: PageSpec['kind'], html: string, unit?: Unit, half?: 'left' | 'right') => {
    const n = pages.length + 1;
    pages.push({ n, side: n % 2 === 1 ? 'recto' : 'verso', kind, unit, half, html });
  };

  const pal = PALETTE[spec.spotlight];
  push('front', `<div class="titlepage"><p class="series">THE TRINKADOOS</p><h1>${esc(spec.title)}</h1><p class="spot">${esc(spec.spotlight)} &middot; ${pal.power}</p></div>`);
  push('front', `<div class="copyright"><p>Copyright &copy; ${new Date().getFullYear()}. All rights reserved.</p><p>Book ${spec.book} of the First Wave. ${spec.words} words.</p><p class="placeholder">imprint, ISBN and printing line to be set</p></div>`);

  const opener = units.find((u) => u.key === 'P3')!;
  push('opener', artSlot(spec, opener) + storyBlock(opener), opener);

  for (let i = 1; i <= SPREAD_COUNT; i += 1) {
    const unit = units.find((u) => u.key === `S${i}`)!;
    push('spread', artSlot(spec, unit, 'left') + storyBlock(unit), unit, 'left');
    push('spread', artSlot(spec, unit, 'right'), unit, 'right');
  }

  const closer = units.find((u) => u.key === 'P32')!;
  push('closer', artSlot(spec, closer) + storyBlock(closer), closer);
  return pages;
}

function buildHtml(spec: TitleSpec, pages: PageSpec[], polyfill: string): string {
  const pal = PALETTE[spec.spotlight];
  const { pageWidthIn, pageHeightIn } = GEOMETRY;
  const bleed = TRIM.bleedIn;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(spec.title)}</title><style>
@page { size: ${pageWidthIn}in ${pageHeightIn}in; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: Georgia, "Times New Roman", serif; color: #1b1b1b; }
.page { position: relative; width: ${pageWidthIn}in; height: ${pageHeightIn}in; overflow: visible; break-after: page; }
.page:last-child { break-after: auto; }

/* The art slot is the page. Bleed is real trim overrun, not decoration. */
.art { position: absolute; inset: 0; background: repeating-linear-gradient(135deg,#f6f3ec,#f6f3ec 14px,#efe9dd 14px,#efe9dd 28px);
       border: 1.5px dashed #b9ab8d; padding: ${bleed + 0.18}in; display: flex; flex-direction: column; gap: .10in; }
.art-key { margin: 0; font: 700 8.5pt/1.25 "Segoe UI", Arial, sans-serif; letter-spacing: .045em; color: ${pal.ink}; text-transform: uppercase; }
.art-brief { margin: 0; font: 9.5pt/1.42 "Segoe UI", Arial, sans-serif; color: #4a4a4a; max-width: 5.6in; }
.art-lb { margin: .04in 0 0; font: 9pt/1.4 "Segoe UI", Arial, sans-serif; color: #8a2b12; max-width: 5.6in; }
.art-cont { margin: 0; font: italic 9.5pt/1.4 "Segoe UI", Arial, sans-serif; color: #8d8d8d; }
.art-note { margin: auto 0 0; font: 7.5pt/1.2 "Segoe UI", Arial, sans-serif; color: #a09a88; }

/* Text-safe zone. Type never enters the gutter or the bleed. */
.story { position: absolute; background: rgba(255,255,255,.90); border-radius: .07in;
         padding: .20in .24in; box-shadow: 0 0 0 1px rgba(0,0,0,.05);
         top: auto; bottom: ${MARGINS.bottomIn}in; }
.page.recto .story { left: ${MARGINS.gutterIn}in;  right: ${MARGINS.rightIn}in; }
.page.verso .story { left: ${MARGINS.rightIn}in;   right: ${MARGINS.gutterIn}in; }
.story p { margin: 0 0 .085in; font-size: 15pt; line-height: 1.42; }
.story p:last-child { margin-bottom: 0; }
.story.empty { display: none; }

.titlepage, .copyright { position: absolute; inset: ${MARGINS.topIn}in ${MARGINS.rightIn}in; text-align: center; }
.titlepage { top: 2.1in; }
.series { margin: 0 0 .28in; font: 700 10pt/1.2 "Segoe UI", Arial, sans-serif; letter-spacing: .22em; color: ${pal.ink}; }
.titlepage h1 { margin: 0; font-size: 26pt; line-height: 1.18; font-weight: 400; }
.spot { margin: .34in 0 0; font: 10pt/1.3 "Segoe UI", Arial, sans-serif; color: ${pal.ink}; letter-spacing: .10em; }
.copyright { top: auto; bottom: ${MARGINS.bottomIn}in; }
.copyright p { margin: 0 0 .09in; font: 8.5pt/1.45 "Segoe UI", Arial, sans-serif; color: #555; }
.placeholder { color: #9a9a9a; font-style: italic; }
</style></head><body>
${pages.map((p) => `<section class="page ${p.side}">${p.html}</section>`).join('\n')}
<script>${polyfill}</script>
</body></html>`;
}

// -------------------------------------------------------------- print prep

const PT = 72;

/**
 * Sets MediaBox exactly and declares TrimBox and BleedBox per side.
 *
 * Chromium sizes the page by converting the CSS inch to device pixels and back,
 * which lands the MediaBox on 621.12 pt where 621.00 is meant. 0.0017 in is well
 * inside this platform's own 0.01 in preflight tolerance, so it is not a defect —
 * but a printer reads the boxes, not the intent, and there is no reason to hand
 * one a number that is merely close.
 *
 * The gutter edge does NOT bleed. Page width is trim + ONE bleed, so on a recto
 * (gutter left) the overrun is on the right, and on a verso it is on the left.
 * Getting that backwards mirrors the trim on every other page and is invisible
 * until a proof comes back cropped down the wrong side.
 */
async function normalizeBoxes(pdf: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf);
  const bleed = TRIM.bleedIn * PT;
  const trimW = TRIM.widthIn * PT;
  const trimH = TRIM.heightIn * PT;
  const pageW = GEOMETRY.pageWidthIn * PT;
  const pageH = GEOMETRY.pageHeightIn * PT;

  doc.getPages().forEach((page, index) => {
    const isRecto = (index + 1) % 2 === 1;
    page.setMediaBox(0, 0, pageW, pageH);
    page.setBleedBox(0, 0, pageW, pageH);
    page.setTrimBox(isRecto ? 0 : bleed, bleed, trimW, trimH);
  });
  return Buffer.from(await doc.save());
}

// -------------------------------------------------------------------- gates

interface Check { name: string; pass: boolean; detail: string }

function gate(spec: TitleSpec, units: Unit[], pages: PageSpec[], totalPages: number, manuscript: string): Check[] {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  add('units from brief', units.length === UNITS_PER_TITLE, `${units.length} of ${UNITS_PER_TITLE}`);
  add('art blocks present', units.every((u) => u.art.length > 0), `${units.filter((u) => u.art).length} of ${units.length}`);
  add('page plan is 32', pages.length === EXTENT, `${pages.length}`);
  add('rendered page count is 32', totalPages === EXTENT, `${totalPages} rendered${totalPages > EXTENT ? ' \u2014 TEXT OVERFLOWED ITS SAFE ZONE' : ''}`);

  // Every approved word reaches a page, and no word is invented on the way.
  const fromBrief = norm(units.flatMap((u) => u.text).join(' '));
  const fromManuscript = norm(manuscriptParagraphs(manuscript).join(' '));
  add('brief text === layout manuscript', fromBrief === fromManuscript,
    fromBrief === fromManuscript ? 'identical' : `brief ${fromBrief.split(' ').length}w vs manuscript ${fromManuscript.split(' ').length}w`);
  add('story words match manifest', fromManuscript.split(' ').filter(Boolean).length === spec.words,
    `${fromManuscript.split(' ').filter(Boolean).length} vs ${spec.words}`);

  const lb = Object.keys(LOAD_BEARING).filter((k) => k.startsWith(`${spec.book}:`));
  add('load-bearing art carried', lb.every((k) => units.some((u) => u.key === k.split(':')[1])), lb.length ? lb.join(', ') : 'none for this title');

  add('spreads occupy two pages', pages.filter((p) => p.kind === 'spread').length === SPREAD_COUNT * 2,
    `${pages.filter((p) => p.kind === 'spread').length} of ${SPREAD_COUNT * 2}`);
  return checks;
}

// --------------------------------------------------------------------- main

async function main() {
  if (!isChromiumAvailable()) {
    console.error('ABORT: no Chromium. export CHROMIUM_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe"');
    process.exit(2);
  }
  const wanted = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
  const titles = wanted.length ? TITLES.filter((t) => wanted.includes(t.book)) : TITLES;

  const brief = parseBrief(readArtBrief());
  const polyfill = await loadPagedPolyfill();
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`trim ${TRIM.widthIn} x ${TRIM.heightIn} in + ${TRIM.bleedIn} bleed  ->  page ${GEOMETRY.pageWidthIn} x ${GEOMETRY.pageHeightIn} in`);
  console.log(`art brief ${ART_BRIEF.split('/').pop()}  \u00b7  ${titles.length} title(s)\n`);

  const report: unknown[] = [];
  let failed = 0;

  for (const spec of titles) {
    const units = brief.get(spec.book) ?? [];
    const manuscript = readTitleManuscript(spec);
    const pages = buildPages(spec, units);
    const html = buildHtml(spec, pages, polyfill);

    const rendered = await renderHtmlToPdf(html, GEOMETRY);
    const totalPages = rendered.totalPages;
    const buffer = await normalizeBoxes(rendered.buffer);
    const slug = spec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const pdfPath = `${OUT_DIR}/TRINKADOOS-${String(spec.book).padStart(2, '0')}-${slug}_interior-proof.pdf`;
    writeFileSync(pdfPath, buffer);

    const checks = gate(spec, units, pages, totalPages, manuscript);
    const bad = checks.filter((c) => !c.pass);
    if (bad.length) failed += 1;

    console.log(`BOOK ${spec.book} \u2014 ${spec.title}`);
    console.log(`  ${pdfPath.split('/').pop()}  (${(buffer.length / 1024).toFixed(0)} KB)`);
    for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}: ${c.detail}`);
    console.log('');

    report.push({ book: spec.book, title: spec.title, pdf: pdfPath, bytes: buffer.length, totalPages, artSlots: units.length, checks });
  }

  const reportPath = `${OUT_DIR}/PROOF-REPORT.json`;
  writeFileSync(reportPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    trim: TRIM, geometry: GEOMETRY, margins: MARGINS, extent: EXTENT,
    illustrationAssets: 'none generated \u2014 every page carries a sized art slot',
    titles: report,
  }, null, 2)}\n`);

  console.log(`report ${reportPath}`);
  console.log(failed ? `${failed} title(s) FAILED` : `all ${titles.length} title(s) passed`);
  process.exit(failed ? 1 : 0);
}

await main();
