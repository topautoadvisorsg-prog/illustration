/**
 * KINDLE EPUB QA — against the manuscript, not against the model that built it.
 *
 * Unzips the finished .epub and reads what is actually in it. The build report
 * already says what the assembler THINKS it produced; this exists because those
 * are different claims, and the one that matters is what a reader will open.
 *
 *   npx tsx scripts/national-parks-epub-check.ts <epub>
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import AdmZip from 'adm-zip';

const EPUB = process.argv[2];
if (!EPUB) throw new Error('usage: national-parks-epub-check.ts <epub>');

const MANUSCRIPT =
  'C:/Users/jovan/Downloads/national parks book/LAYOUT-7-national-parks-without-the-rookie-mistakes.md';
const SHIPPING_SHA = '9d3263d7903211771bd5cf638f5a3c41bf8a27d53e4c75a5b5d310a4cf0912d1';

let failures = 0;
let warnings = 0;
const fail = (l: string, d: string): void => { failures += 1; console.log(`  [FAIL] ${l}: ${d}`); };
const warn = (l: string, d: string): void => { warnings += 1; console.log(`  [WARN] ${l}: ${d}`); };
const pass = (l: string, d: string): void => console.log(`  [PASS] ${l}: ${d}`);

const bytes = readFileSync(EPUB);
console.log(`epub   : ${EPUB}`);
console.log(`sha256 : ${createHash('sha256').update(bytes).digest('hex')}`);
console.log(`bytes  : ${bytes.length}\n`);

const zip = new AdmZip(bytes);
const entries = zip.getEntries();
const nameOf = (e: { entryName: string }): string => e.entryName;

// ── 1. Container ───────────────────────────────────────────────────────────
console.log('1. PACKAGE');
{
  const mimetype = entries.find((e) => nameOf(e) === 'mimetype');
  if (mimetype && mimetype.getData().toString('utf8').trim() === 'application/epub+zip') {
    pass('mimetype', 'application/epub+zip');
  } else fail('mimetype', 'missing or wrong');

  const opf = entries.find((e) => nameOf(e).endsWith('.opf'));
  const ncx = entries.find((e) => nameOf(e).endsWith('.ncx'));
  const nav = entries.find((e) => /nav\.xhtml$/i.test(nameOf(e)));
  if (opf) pass('package document', nameOf(opf));
  else fail('package document', 'no .opf found');
  if (ncx || nav) pass('navigation document', [ncx && nameOf(ncx), nav && nameOf(nav)].filter(Boolean).join(', '));
  else fail('navigation document', 'neither .ncx nor nav.xhtml found');

  const xhtml = entries.filter((e) => /\.x?html$/i.test(nameOf(e)));
  const images = entries.filter((e) => /\.(jpe?g|png|gif|svg)$/i.test(nameOf(e)));
  console.log(`         ${xhtml.length} content documents, ${images.length} images`);
}

// ── 2. Text, read from the content documents ───────────────────────────────
const contentDocs = entries.filter((e) => /\.x?html$/i.test(nameOf(e)));
const rawHtml = contentDocs.map((e) => e.getData().toString('utf8')).join('\n');
/**
 * Entities must be DECODED, all of them.
 *
 * The packer writes numeric entities for anything non-ASCII: the copyright sign
 * arrives as `&#xA9;`, the apostrophe in "YOU'RE" as `&apos;`, em dashes as
 * `&#x2014;`. Decoding only the five named XML entities reported the copyright
 * line missing from a page that states it correctly, Part 3 missing from a nav
 * that lists it, and ninety paragraphs missing from a book that contains every
 * one of them. The file was right and the reader of it was wrong.
 */
const decodeEntities = (s: string): string =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const stripTags = (s: string): string =>
  s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');

const plain = decodeEntities(stripTags(rawHtml));

const norm = (s: string): string =>
  s
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014\u2012]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2192\u27f6\u26a0\ufe0f]/gu, '')
    .toLowerCase();
const squash = (s: string): string => norm(s).replace(/\s+/g, '');
const book = squash(plain);
const inBook = (s: string): boolean => book.includes(squash(s));

// ── 3. Content coverage against the manuscript ─────────────────────────────
console.log('\n2. CONTENT COVERAGE (vs the approved manuscript)');
const markdown = readFileSync(MANUSCRIPT, 'utf8');
if (createHash('sha256').update(markdown).digest('hex') !== SHIPPING_SHA) {
  fail('manuscript', 'not the shipping file — cannot compare');
} else {
  const deMark = (s: string): string =>
    s
      .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/(^|[^*])\*([^*]+?)\*/g, '$1$2')
      .trim();

  const lines = markdown.split('\n');
  const firstStructural = lines.findIndex(
    (l) => /^#\s+(front|back)\s+matter\s*$/i.test(l.trim()) || /^#\s+\d+\s*[:.–—-]\s*\S/.test(l.trim()),
  );

  const units: Array<{ text: string; line: number }> = [];
  let para: string[] = [];
  let start = 0;
  const flush = (): void => {
    if (para.length) units.push({ text: deMark(para.join(' ')), line: start });
    para = [];
  };
  for (let i = firstStructural; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (!t || /^-{3,}$/.test(t)) { flush(); continue; }
    if (/^\|/.test(t)) {
      flush();
      if (/^\|[\s:|-]+\|?$/.test(t)) continue;
      for (const c of t.replace(/^\||\|$/g, '').split('|')) {
        const cell = deMark(c.trim());
        if (cell && cell !== '—' && cell !== '-') units.push({ text: cell, line: i + 1 });
      }
      continue;
    }
    if (/^#{1,6}\s+/.test(t)) { flush(); units.push({ text: deMark(t.replace(/^#{1,6}\s+/, '')), line: i + 1 }); continue; }
    if (/^>\s?/.test(t)) { flush(); const inner = deMark(t.replace(/^>\s?/, '').replace(/^#{1,6}\s+/, '')); if (inner) units.push({ text: inner, line: i + 1 }); continue; }
    if (/^([-*]|\d+[.)])\s+/.test(t)) { flush(); units.push({ text: deMark(t.replace(/^([-*]|\d+[.)])\s+/, '').replace(/^\[[ xX]?\]\s*/, '')), line: i + 1 }); continue; }
    if (!para.length) start = i + 1;
    para.push(t);
  }
  flush();

  const checkable = units
    .filter((u) => u.text.length >= 12 && !/^(front|back)[ ]+matter$/i.test(u.text))
    // A numbered chapter heading becomes "Chapter 4: Great Smoky Mountains" in the
    // ebook, so the authored form never appears verbatim. The title must survive.
    .map((u) => ({ ...u, text: u.text.replace(/^\d+\s*[:.‐-―-]\s*/, '') }));
  const missing = checkable.filter((u) => !inBook(u.text));
  if (missing.length === 0) {
    pass('every manuscript unit present', `${checkable.length} paragraphs, headings, list items, quotes and table cells`);
  } else {
    fail('content missing from the EPUB', `${missing.length} of ${checkable.length}`);
    for (const m of missing.slice(0, 10)) console.log(`         L${m.line} ${m.text.slice(0, 100)}`);
  }
}

// ── 4. Structure ───────────────────────────────────────────────────────────
console.log('\n3. STRUCTURE AND NAVIGATION');
{
  const opf = entries.find((e) => nameOf(e).endsWith('.opf'))?.getData().toString('utf8') ?? '';
  const ncx = entries.find((e) => nameOf(e).endsWith('.ncx'))?.getData().toString('utf8') ?? '';
  const nav = entries.find((e) => /nav\.xhtml$/i.test(nameOf(e)))?.getData().toString('utf8') ?? '';
  const navText = squash(decodeEntities(stripTags(`${ncx} ${nav}`)));

  for (const [label, needle] of [
    ['Part 1 in navigation', 'PART 1 — BEFORE YOU GO'],
    ['Part 2 in navigation', 'PART 2 — THE SEVEN PARKS'],
    ['Part 3 in navigation', "PART 3 — AFTER YOU'RE HOOKED"],
  ] as Array<[string, string]>) {
    if (navText.includes(squash(needle))) pass(label, 'present');
    else fail(label, `"${needle}" NOT in the nav document`);
  }

  const chapterHits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((n) =>
    navText.includes(squash(`Chapter ${n}:`)),
  );
  if (chapterHits.length === 12) pass('all 12 chapters in navigation', 'Chapter 1 through Chapter 12');
  else fail('chapter navigation', `only ${chapterHits.length} of 12 found: ${chapterHits.join(', ')}`);

  const spineCount = (opf.match(/<itemref/g) ?? []).length;
  console.log(`         spine has ${spineCount} items (reading order)`);
  if (spineCount >= 20) pass('reading order', `${spineCount} documents in the spine`);
  else warn('reading order', `${spineCount} spine items looks low`);

  if (/<meta[^>]+name="cover"/i.test(opf) || /properties="cover-image"/i.test(opf)) {
    pass('cover declared', 'the OPF marks a cover image');
  } else warn('cover', 'no cover-image property found in the OPF');
}

// ── 5. Illustrations ───────────────────────────────────────────────────────
console.log('\n4. ILLUSTRATIONS');
{
  const imgTags = [...rawHtml.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const images = entries.filter((e) => /\.(jpe?g|png|gif)$/i.test(nameOf(e)));
  console.log(`         ${imgTags.length} <img> tags, ${images.length} image files in the package`);
  // Cover + five plates.
  if (imgTags.length >= 5) pass('plates present', `${imgTags.length} images referenced in the text`);
  else fail('plates', `only ${imgTags.length} <img> tags — the five approved plates should be here`);

  const noAlt = imgTags.filter((t) => !/\balt\s*=\s*"[^"]+"/i.test(t));
  if (noAlt.length === 0) pass('alt text', 'every image has non-empty alt text');
  else warn('alt text', `${noAlt.length} image(s) without alt text`);

  const fixedPx = imgTags.filter((t) => /width\s*=\s*"?\d+px/i.test(t) || /style="[^"]*\b\d+px/i.test(t));
  if (fixedPx.length === 0) pass('responsive images', 'no fixed pixel dimensions — the device controls size');
  else fail('responsive images', `${fixedPx.length} image(s) carry fixed px sizing`);
}

// ── 6. Reflowability ───────────────────────────────────────────────────────
console.log('\n5. REFLOWABLE, NOT PRINT');
{
  const css = entries
    .filter((e) => /\.css$/i.test(nameOf(e)))
    .map((e) => e.getData().toString('utf8'))
    .join('\n');
  const pxInCss = [...css.matchAll(/(\d+(?:\.\d+)?)px/g)].map((m) => m[0]);
  if (pxInCss.length === 0) pass('no fixed px in the stylesheet', 'sizes are relative, so reader font size works');
  else warn('fixed px in CSS', `${pxInCss.length}: ${[...new Set(pxInCss)].slice(0, 6).join(', ')}`);

  if (!/fixed-layout|pre-paginated/i.test(rawHtml + css)) pass('reflowable', 'no fixed-layout or pre-paginated markers');
  else fail('fixed layout', 'the file declares fixed layout — Kindle must reflow');

  // Print-only furniture must not have come across.
  const folio = /page-break-before:\s*always[\s\S]{0,40}folio/i.test(css);
  if (!folio) pass('no print folios', 'no page-number furniture');
  const blanks = contentDocs.filter((e) => {
    const t = e.getData().toString('utf8').replace(/<[^>]+>/g, '').trim();
    return t.length === 0;
  });
  if (blanks.length === 0) pass('no blank pages', 'no empty content documents — parity blanks are print-only');
  else fail('blank documents', `${blanks.length}: ${blanks.map(nameOf).join(', ')}`);
}

// ── 7. Tables ──────────────────────────────────────────────────────────────
console.log('\n6. TABLES');
{
  const tables = (rawHtml.match(/<table\b/gi) ?? []).length;
  const cells = (rawHtml.match(/<t[dh]\b/gi) ?? []).length;
  console.log(`         ${tables} tables, ${cells} cells`);
  if (tables > 0) pass('tables present', `${tables} rendered as real tables`);
  else warn('tables', 'no <table> found — check the wide-table treatment');

  // The five-column permit table is the one that cannot survive a narrow screen
  // as a grid. Its cells must be present whichever way it was rendered.
  const wide = 'Timed Entry + Bear Lake Road if your day touches the Bear Lake corridor';
  if (inBook(wide)) pass('widest table cell', 'present and complete');
  else fail('widest table cell', 'the five-column permit row is missing');
}

// ── 8. Identity ────────────────────────────────────────────────────────────
console.log('\n7. IDENTITY');
{
  for (const [label, needle] of [
    ['Title', '7 National Parks Without the Rookie Mistakes'],
    ['Subtitle', "What's Worth Your Time, What to Skip, and What I Learned the Hard Way"],
    ['Author', 'Tom Everett'],
    ['Composite-narrator disclosure', 'Tom Everett is a pen name and a composite narrator'],
    ['Copyright line', 'Copyright © 2026 by Tom Everett'],
    ['Rights statement', 'All rights reserved.'],
  ] as Array<[string, string]>) {
    if (inBook(needle)) pass(label, 'present');
    else fail(label, `"${needle.slice(0, 50)}" NOT FOUND`);
  }
  for (const [label, needle] of [
    ['Retired author (Nolan)', 'nolan'],
    ['Retired author (Withlow)', 'withlow'],
    ['Retired title', 'withouttheoverwhelm'],
  ] as Array<[string, string]>) {
    if (!book.includes(needle)) pass(label, 'absent, as required');
    else fail(label, 'PRESENT and must not be');
  }

  if (!/\ufffd/.test(plain)) pass('no replacement characters', 'no tofu in the text');
  else fail('unsupported characters', 'U+FFFD replacement characters found');
}

console.log(`\n${'─'.repeat(70)}`);
console.log(`EPUB: ${failures} failure(s), ${warnings} warning(s)`);
console.log(failures === 0 ? 'EPUB CHECK: PASS' : 'EPUB CHECK: FAIL');
process.exit(failures === 0 ? 0 : 1);
