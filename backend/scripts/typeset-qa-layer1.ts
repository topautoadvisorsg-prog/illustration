/**
 * LAYER 1 — deterministic whole-book QA for the typeset interior.
 *
 * Everything a machine can decide, decided before a human looks at a page.
 * Visual review is expensive and its findings are judgement calls; text
 * fidelity, structure, geometry and font embedding are none of those things,
 * and a visual pass over a book that silently dropped a paragraph is wasted
 * work. This runs first and must be clean before Layer 2 begins.
 *
 *   yarn workspace @wildlands/backend qa:typeset
 *
 * Read-only. Renders locally, spends nothing, mutates nothing.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
loadDotenv({ path: path.join(ROOT, '.env') });
loadDotenv({ path: path.join(ROOT, '.env.development.local'), override: true });

const MANUSCRIPT =
  process.env.WL_QA_MANUSCRIPT ?? 'C:/Users/jovan/Downloads/puberty boy book/export/NO-ONE-TOLD-ME-THAT_FINAL.md';

/** Recorded in HANDOFF.md — the provenance chain this book must still satisfy. */
const CANONICAL_SHA = '2145cb95cb5506923a9a6c3c27b8935117b78c2ca7e14fe7dacdb03d160157a8';
const WORKING_SHA = '165a6dbb';

const { sanitizeManuscript } = await import('../src/pipeline/stage-1-ingestion/sanitize-manuscript.js');
const { renderTypesetBook } = await import('../src/pipeline/typeset/render-typeset.js');
const { parseTypesetSections, chapterLabel, typesetMarginsForTrim } = await import(
  '../src/pipeline/typeset/typeset-book.js'
);
const { ProjectConfigSchema } = await import('@wildlands/shared');

// ── reporting ───────────────────────────────────────────────────────────────
let failures = 0;
let warnings = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (ok) console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  else { failures++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
};
const warn = (label: string, detail = ''): void => {
  warnings++;
  console.log(`  WARN  ${label}${detail ? ` — ${detail}` : ''}`);
};
const section = (t: string): void => console.log(`\n== ${t} ==`);

const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * Reduce text to letters and digits only.
 *
 * Line-end hyphenation, smart quotes, ligatures, markdown markers and every
 * spacing difference between "what the manuscript says" and "what the PDF drew"
 * are noise for a fidelity check. Stripping to alphanumerics compares the words
 * themselves and nothing else.
 */
const norm = (s: string): string =>
  s
    .normalize('NFKD')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/** Word-level view, for locating a divergence in human terms. */
const words = (s: string): string[] =>
  s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

// ── 1. provenance ───────────────────────────────────────────────────────────
section('1. Manuscript provenance');
const raw = await readFile(MANUSCRIPT, 'utf8');
const rawSha = sha(raw);
check(rawSha === CANONICAL_SHA, 'canonical manuscript hash', `${rawSha.slice(0, 12)}…`);

const markdown = sanitizeManuscript(raw);
const workSha = sha(markdown);
check(workSha.startsWith(WORKING_SHA), 'sanitized working-copy hash', `${workSha.slice(0, 12)}…`);

// ── 2. structure ────────────────────────────────────────────────────────────
section('2. Structure');
const sections = parseTypesetSections(markdown);
const chapters = sections.filter((s) => s.kind === 'chapter');
check(sections.length === 28, 'section count', `${sections.length} (expect 28)`);
check(chapters.length === 23, 'chapter count', `${chapters.length} (expect 23)`);

const numbers = chapters.map((c) => c.number);
check(
  numbers.every((n, i) => n === i + 1),
  'chapters numbered 1..23 in order',
  numbers.join(','),
);

const titles = sections.map((s) => s.title);
const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
check(dupes.length === 0, 'no duplicated section titles', dupes.length ? dupes.join(' | ') : 'none');

check(sections[0]?.kind === 'front', 'opens with front matter', sections[0]?.title ?? '(none)');
const last = sections[sections.length - 1];
check(last?.kind === 'back', 'final section is back matter', last?.title ?? '(none)');

const labelProblems = chapters.filter((c) => !/^Chapter [A-Z][a-z]+(-[A-Z][a-z]+)?$/.test(chapterLabel(c)));
check(labelProblems.length === 0, 'all 23 chapter labels spelled per standard',
  labelProblems.length ? labelProblems.map((c) => chapterLabel(c)).join(', ') : 'Chapter One … Chapter Twenty-Three');

// ── 3. parse fidelity: source -> sections ───────────────────────────────────
section('3. Source fidelity (manuscript -> parsed sections)');
// Two things are consumed by the parser BY DESIGN and must not be counted as
// losses. First, the manuscript's own title block (title / subtitle / byline
// above the first structural marker) — the interior does not reprint it; that
// is the job of the Step 6 title page. Second, the structural markers
// themselves: "# Chapter 7" becomes the chapter label.
const lines = markdown.split('\n');
const firstMarker = lines.findIndex((l) =>
  /^#\s+chapter\s+\d+/i.test(l.trim()) || /^#\s+(front|back)\s+matter$/i.test(l.trim()));
check(firstMarker > 0, 'manuscript has a title block before the first structural marker',
  `preamble is ${firstMarker} lines`);
const sourceForCompare = lines
  .slice(Math.max(firstMarker, 0))
  .filter((l) => !/^#\s+chapter\s+\d+/i.test(l.trim()) && !/^#\s+(front|back)\s+matter$/i.test(l.trim()))
  .join('\n');
const parsedText = sections.map((s) => `${s.title}\n${s.bodyLines.join('\n')}`).join('\n');
const srcNorm = norm(sourceForCompare);
const parsedNorm = norm(parsedText);
check(srcNorm === parsedNorm, 'no source text lost or reordered in parsing',
  srcNorm === parsedNorm ? `${srcNorm.length} chars` : `source ${srcNorm.length} vs parsed ${parsedNorm.length}`);
if (srcNorm !== parsedNorm) {
  const a = words(sourceForCompare), b = words(parsedText);
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  console.log(`        first divergence at word ${i}:`);
  console.log(`          source: …${a.slice(Math.max(0, i - 6), i + 6).join(' ')}…`);
  console.log(`          parsed: …${b.slice(Math.max(0, i - 6), i + 6).join(' ')}…`);
}

// ── 4. render stability ─────────────────────────────────────────────────────
section('4. Render stability (2 runs)');
const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'NO ONE TOLD ME THAT',
  authorName: 'Nolan Whitlow',
  trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
  typography: { bodyPt: 12, lineHeight: 1.3, headingFont: 'Archivo', bodyFont: 'EB Garamond' },
});
const margins = typesetMarginsForTrim(config.trimSize);

const runs: { pdf: Buffer; report: Awaited<ReturnType<typeof renderTypesetBook>>['report'] }[] = [];
for (let i = 0; i < 2; i++) {
  const r = await renderTypesetBook({ markdown, config, chaptersStartRecto: true });
  runs.push({ pdf: r.pdf, report: r.report });
  console.log(`        run ${i + 1}: pages=${r.report.totalPages} blanks=${r.report.blankPages.length} overflow=${r.report.verticalOverflowPages.length} sections=${r.report.sectionStarts.length}`);
}
const [r1, r2] = runs as [(typeof runs)[0], (typeof runs)[0]];
const fingerprint = (r: (typeof runs)[0]): string =>
  `${r.report.totalPages}|${r.report.blankPages.join(',')}|${r.report.sectionStarts.map((s) => `${s.title}@${s.page}`).join(',')}`;
check(fingerprint(r1) === fingerprint(r2), 'identical page count, blanks and section pages across runs');
check(r1.report.verticalOverflowPages.length === 0, 'no real text overflow',
  r1.report.verticalOverflowPages.length ? `pages ${r1.report.verticalOverflowPages.join(', ')}` : '0 pages');
check(r1.report.sectionStarts.length === sections.length, 'every section reached the page',
  `${r1.report.sectionStarts.length}/${sections.length}`);
const lastStart = r1.report.sectionStarts[r1.report.sectionStarts.length - 1];
check(lastStart?.title === last?.title, 'final back-matter section present in the PDF',
  `${lastStart?.title} p${lastStart?.page}`);

// ── 5. PDF integrity ────────────────────────────────────────────────────────
section('5. PDF integrity');
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pdfjs as any).GlobalWorkerOptions.workerSrc = '';
const doc = await (pdfjs as unknown as {
  getDocument: (o: unknown) => { promise: Promise<any> };
}).getDocument({ data: new Uint8Array(r1.pdf), useSystemFonts: false, disableFontFace: true }).promise;

check(doc.numPages === r1.report.totalPages, 'PDF page count matches the report',
  `${doc.numPages} pages`);

const EXPECT_W = config.trimSize.widthIn * 72;
const EXPECT_H = config.trimSize.heightIn * 72;
const badGeometry: number[] = [];
const pageTexts: string[] = [];
const usedFamilies = new Set<string>();
let totalGlyphs = 0;

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const [x0, y0, x1, y1] = page.view as [number, number, number, number];
  const w = Math.round((x1 - x0) * 100) / 100;
  const h = Math.round((y1 - y0) * 100) / 100;
  if (Math.abs(w - EXPECT_W) > 0.5 || Math.abs(h - EXPECT_H) > 0.5) badGeometry.push(p);

  const tc = await page.getTextContent();
  for (const style of Object.values(tc.styles ?? {}) as { fontFamily?: string }[]) {
    if (style.fontFamily) usedFamilies.add(style.fontFamily);
  }
  // Keep only marks inside the text block. Running heads and folios live in the
  // page margins and are furniture, not manuscript text.
  const bodyTop = EXPECT_H - margins.topIn * 72;
  const bodyBottom = margins.bottomIn * 72;
  const kept: string[] = [];
  for (const item of tc.items as { str: string; transform: number[] }[]) {
    const y = item.transform[5] ?? 0;
    if (y >= bodyBottom - 2 && y <= bodyTop + 2) kept.push(item.str);
    totalGlyphs += item.str.length;
  }
  pageTexts.push(kept.join(' '));
}

check(badGeometry.length === 0, `every page is ${config.trimSize.widthIn}x${config.trimSize.heightIn} in`,
  badGeometry.length ? `wrong on pages ${badGeometry.slice(0, 8).join(', ')}` : `${EXPECT_W}x${EXPECT_H} pt`);
check(totalGlyphs > 50_000, 'text is live vector, not rasterised', `${totalGlyphs.toLocaleString()} extracted characters`);

// Fonts must be read from the PDF's object graph. Scanning raw bytes for
// /BaseFont sees only whatever escaped Chromium's compressed object streams,
// and pdf.js reports its own generic classification ("serif"/"sans-serif") for
// subset fonts — both will confidently give the wrong answer.
const { PDFDocument, PDFName, PDFDict } = await import('pdf-lib');
type Dict = InstanceType<typeof PDFDict>;
const parsed = await PDFDocument.load(r1.pdf, { updateMetadata: false });
const fontRefs = new Map<string, { subtype: string; embedded: boolean; refs: number }>();
const seenXObjects = new Set<unknown>();

const visitResources = (res: Dict | undefined, depth = 0): void => {
  if (!res || depth > 6) return;
  const fd = res.lookupMaybe(PDFName.of('Font'), PDFDict);
  if (fd) {
    for (const [, ref] of fd.entries()) {
      const f = parsed.context.lookup(ref) as Dict;
      if (!f?.get) continue;
      const base = String(f.get(PDFName.of('BaseFont')) ?? '(no BaseFont)').replace(/^\//, '');
      const subtype = String(f.get(PDFName.of('Subtype')) ?? '?').replace(/^\//, '');
      let desc = f.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
      if (!desc) {
        const kids = f.get(PDFName.of('DescendantFonts'));
        const arr = kids ? (parsed.context.lookup(kids) as { get?: (i: number) => unknown }) : null;
        const kid = arr?.get ? (parsed.context.lookup(arr.get(0) as never) as Dict) : null;
        desc = kid?.lookupMaybe?.(PDFName.of('FontDescriptor'), PDFDict) ?? undefined;
      }
      const isEmbedded = !!desc && ['FontFile', 'FontFile2', 'FontFile3'].some((k) => desc!.get(PDFName.of(k)));
      const key = `${subtype}:${base}`;
      fontRefs.set(key, { subtype, embedded: isEmbedded, refs: (fontRefs.get(key)?.refs ?? 0) + 1 });
    }
  }
  const xo = res.lookupMaybe(PDFName.of('XObject'), PDFDict);
  if (xo) {
    for (const [, ref] of xo.entries()) {
      if (seenXObjects.has(ref)) continue;
      seenXObjects.add(ref);
      const x = parsed.context.lookup(ref) as Dict;
      visitResources(x?.lookupMaybe?.(PDFName.of('Resources'), PDFDict), depth + 1);
    }
  }
};
for (const p of parsed.getPages()) visitResources(p.node.Resources());

for (const [key, info] of [...fontRefs].sort()) {
  console.log(`        font: ${key.padEnd(46)} embedded=${String(info.embedded).padEnd(5)} refs=${info.refs}`);
}

/**
 * Type3 is the failure mode to catch. Chromium emits proper embedded CID
 * subsets for SYSTEM-installed fonts, but turns any @font-face web font —
 * whether from a CDN or a base64 data URI — into Type3 glyph-drawing
 * procedures. The page still LOOKS right, which is exactly why this survives
 * visual review, but no font program is embedded and print RIPs and PDF/X
 * preflight commonly reject or mishandle Type3.
 */
const type3 = [...fontRefs].filter(([, i]) => i.subtype === 'Type3');
check(type3.length === 0, 'no Type3 (drawn-glyph) fonts — print RIPs reject these',
  type3.length ? `${type3.reduce((n, [, i]) => n + i.refs, 0)} references` : 'none');

const notEmbedded = [...fontRefs].filter(([, i]) => !i.embedded);
check(notEmbedded.length === 0, 'every font is embedded as a font program',
  notEmbedded.length ? notEmbedded.map(([k]) => k).join(', ') : `${fontRefs.size} fonts`);

const names = [...fontRefs.keys()].join(' ');
check(/archivo/i.test(names), 'Archivo embedded as the display face');
check(/garamond/i.test(names), 'EB Garamond embedded as the text face');

// pdf.js's view, kept as context rather than as a gate.
console.log(`        pdf.js reports families: ${[...usedFamilies].sort().join(', ') || '(none)'}`);

// ── 6. text fidelity: sections -> PDF ───────────────────────────────────────
section('6. Text fidelity (parsed sections -> PDF page content)');
const expectedText = sections
  .map((s) => [chapterLabel(s), s.title, s.bodyLines.join(' ')].filter(Boolean).join(' '))
  .join(' ');
const expNorm = norm(expectedText);
const pdfNorm = norm(pageTexts.join(' '));

check(expNorm === pdfNorm, 'every word of the manuscript is on the page, in order',
  expNorm === pdfNorm
    ? `${expNorm.length.toLocaleString()} chars matched`
    : `expected ${expNorm.length.toLocaleString()} vs PDF ${pdfNorm.length.toLocaleString()}`);

if (expNorm !== pdfNorm) {
  const a = words(expectedText), b = words(pageTexts.join(' '));
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0; while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  console.log(`        diverges at word ${i} of ${a.length}; ${j} words match from the end`);
  console.log(`          expected: …${a.slice(Math.max(0, i - 8), i + 8).join(' ')}…`);
  console.log(`          in PDF  : …${b.slice(Math.max(0, i - 8), i + 8).join(' ')}…`);
  const onlyExpected = a.slice(i, a.length - j);
  const onlyPdf = b.slice(i, b.length - j);
  if (onlyExpected.length) console.log(`        MISSING from PDF (${onlyExpected.length} words): ${onlyExpected.slice(0, 25).join(' ')}${onlyExpected.length > 25 ? ' …' : ''}`);
  if (onlyPdf.length) console.log(`        EXTRA in PDF (${onlyPdf.length} words): ${onlyPdf.slice(0, 25).join(' ')}${onlyPdf.length > 25 ? ' …' : ''}`);
}

// ── verdict ─────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(64)}`);
console.log(failures === 0 ? `LAYER 1 CLEAN — ${warnings} warning(s). Visual QA may begin.` : `LAYER 1 FAILED — ${failures} failure(s), ${warnings} warning(s). Fix before visual QA.`);
console.log('='.repeat(64));
process.exit(failures === 0 ? 0 : 1);
