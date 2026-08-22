/**
 * TEXT-FIDELITY QA — does the printed PDF still say what the manuscript says?
 *
 * Reads the EXACT production PDF from disk rather than re-rendering. That is the
 * whole point: a checker that renders its own copy proves something about a file
 * nobody is going to print.
 *
 * The comparison is against the CANONICAL manuscript — the approved bytes, before
 * ingestion — because ingestion is itself part of what is being audited. Every
 * earlier check in this pipeline compared the render against the PARSE, which is
 * downstream of ingestion, so anything ingestion changed was missing from both
 * sides and the check passed.
 *
 *   npx tsx scripts/national-parks-fidelity.ts <pdf>
 *
 * Read-only. Renders nothing, spends nothing, mutates nothing.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PDF_PATH = process.argv[2];
if (!PDF_PATH) throw new Error('usage: national-parks-fidelity.ts <pdf>');

const MANUSCRIPT =
  'C:/Users/jovan/Downloads/national parks book/LAYOUT-7-national-parks-without-the-rookie-mistakes.md';
const SHIPPING_SHA = '9d3263d7903211771bd5cf638f5a3c41bf8a27d53e4c75a5b5d310a4cf0912d1';

const sha = (b: Buffer | string): string => createHash('sha256').update(b as never).digest('hex');

const markdown = readFileSync(MANUSCRIPT, 'utf8');
if (sha(markdown) !== SHIPPING_SHA) {
  console.error(`REFUSING: manuscript is not the shipping file (${sha(markdown)}).`);
  process.exit(1);
}
const pdfBytes = readFileSync(PDF_PATH);

// ── Extract the PDF's text, page by page ───────────────────────────────────
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pdfjs as any).GlobalWorkerOptions.workerSrc = '';
const doc = await (
  pdfjs as unknown as { getDocument: (o: unknown) => { promise: Promise<any> } }
).getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: false, disableFontFace: true }).promise;

/**
 * MARGIN FURNITURE IS EXCLUDED, and it has to be.
 *
 * A paragraph that runs over a page break has its two halves separated, in
 * reading order, by whatever sits in the margins between them — the running head
 * and the folio. Concatenating raw page text therefore injects
 * "7 NATIONAL PARKS WITHOUT THE ROOKIE MISTAKES 43" into the middle of a
 * sentence, and every paragraph that spans a turn fails a containment check
 * while being perfectly correct on the page. That accounted for most of a
 * 64-unit "missing" list on a book with nothing missing.
 *
 * Items are filtered by POSITION rather than by matching the running-head text:
 * a positional rule cannot be fooled by a chapter whose title happens to appear
 * in the body, and it drops the folio too without having to guess which numbers
 * are page numbers.
 */
const MARGIN_PT = 0.625 * 72; // the standard's top and bottom margin, in points

const bodyPageText: string[] = [];
const allPageText: string[] = [];
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const tc = await page.getTextContent();
  const height = page.getViewport({ scale: 1 }).height;
  const keep: string[] = [];
  const every: string[] = [];
  for (const it of tc.items as Array<{ str?: string; transform?: number[] }>) {
    const s = it.str ?? '';
    every.push(s);
    // transform[5] is the text origin's y, measured from the bottom of the page.
    const y = it.transform?.[5];
    if (y === undefined || (y >= MARGIN_PT && y <= height - MARGIN_PT)) keep.push(s);
  }
  // Join with spaces: pdf.js emits one item per positioned run, and two runs on
  // the same line have no separator of their own.
  bodyPageText.push(keep.join(' '));
  allPageText.push(every.join(' '));
}
/** Body only — used for every content comparison. */
const pdfRaw = bodyPageText.join('\n');
/** Everything, furniture included — used to check running heads and folios. */
const pdfWithFurniture = allPageText.join('\n');

// ── Normalisation ──────────────────────────────────────────────────────────
/**
 * Both sides are reduced to comparable text.
 *
 * What is deliberately normalised away, and why each is NOT a fidelity concern:
 *   - line breaks and runs of space: the typesetter chooses them, ragged right
 *   - curly vs straight quotes, en/em dashes: shaping, not content
 *   - soft hyphens and the zero-width break sentinel: layout hints
 *   - case: a heading set in caps is a design decision, not a rewording
 *
 * What is NOT normalised: digits, units, and every word. A changed number or a
 * dropped clause survives this untouched, which is the point.
 */
const norm = (s: string): string =>
  s
    .replace(/\u00ad|\u200b|\ue000/g, '')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014\u2012]/g, '-')
    .replace(/\u2026/g, '...')
    /**
     * DRAWN GLYPHS ARE REMOVED FROM BOTH SIDES.
     *
     * The arrows, the warning sign and the flag are rendered as inline SVG
     * paths, because the vendored text faces do not carry them and a missing
     * glyph prints as a tofu box. An SVG has no text layer, so it cannot appear
     * in an extraction \u2014 and mapping the manuscript's character to "->" would
     * compare a string the page can never contain.
     *
     * KNOWN LIMIT, stated rather than hidden: this check therefore cannot see a
     * drawn glyph that failed to draw. That is covered instead by
     * `typeset-heading-inline.test.ts`, which asserts the SVG is emitted, and by
     * the tofu-box artifact check further down.
     */
    .replace(/[\u2192\u27f6\u26a0\ufe0f\u{1F6A9}]/gu, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

/**
 * WHITESPACE-INSENSITIVE containment.
 *
 * pdf.js emits one item per positioned run, and a run ends wherever the style
 * does — so a sentence carrying bold extracts as three items and any join
 * inserts a separator the page does not have ("the park . Download"). Letter-
 * spaced small-caps labels split further still, sometimes one item per glyph.
 *
 * Comparing with all whitespace removed is immune to every one of those, while
 * a dropped word, a changed digit or a reordered clause still fails. That is the
 * right trade: the alternative produced 181 false misses on a book whose text is
 * intact, and a checker that cries wolf is one nobody reads.
 *
 * The readable form is kept for REPORTING, so a real failure is legible.
 */
const squash = (s: string): string => norm(s).replace(/\s+/g, '');

const pdf = norm(pdfRaw);
const pdfSquashed = squash(pdfRaw);
const inPdf = (s: string): boolean => pdfSquashed.includes(squash(s));

// ── Manuscript body, as comparable units ───────────────────────────────────
const lines = markdown.split('\n');

/** Strip inline markdown so a comparison is about words, not asterisks. */
const deMark = (s: string): string =>
  s
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*]+?)\*/g, '$1$2')
    .trim();

interface Unit {
  kind: 'para' | 'heading' | 'listitem' | 'cell' | 'quote';
  text: string;
  line: number;
}

const units: Unit[] = [];
{
  let para: string[] = [];
  let paraStart = 0;
  const flush = (): void => {
    if (!para.length) return;
    units.push({ kind: 'para', text: deMark(para.join(' ')), line: paraStart });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const t = raw.trim();
    if (!t) { flush(); continue; }
    if (/^-{3,}$/.test(t)) { flush(); continue; }
    if (/^\|/.test(t)) {
      flush();
      // A delimiter row carries no content.
      if (/^\|[\s:|-]+\|?$/.test(t)) continue;
      for (const cell of t.replace(/^\||\|$/g, '').split('|')) {
        const c = deMark(cell.trim());
        // "—" and "" are placeholders meaning "nothing to report".
        if (c && c !== '—' && c !== '-') units.push({ kind: 'cell', text: c, line: i + 1 });
      }
      continue;
    }
    if (/^#{1,6}\s+/.test(t)) {
      flush();
      units.push({ kind: 'heading', text: deMark(t.replace(/^#{1,6}\s+/, '')), line: i + 1 });
      continue;
    }
    if (/^>\s?/.test(t)) {
      flush();
      const inner = t.replace(/^>\s?/, '');
      if (inner.trim()) {
        units.push({ kind: 'quote', text: deMark(inner.replace(/^#{1,6}\s+/, '')), line: i + 1 });
      }
      continue;
    }
    if (/^([-*]|\d+[.)])\s+/.test(t)) {
      flush();
      units.push({ kind: 'listitem', text: deMark(t.replace(/^([-*]|\d+[.)])\s+/, '')), line: i + 1 });
      continue;
    }
    if (!para.length) paraStart = i + 1;
    para.push(t);
  }
  flush();
}

/**
 * The TITLE BLOCK is dropped by the parser on purpose — the title page and the
 * copyright page are generated matter, so typesetting the manuscript's own would
 * set them twice. Those lines are checked SEPARATELY and by name further down,
 * which is stricter than folding them into a bulk sweep.
 */
const firstStructural = lines.findIndex((l) =>
  /^#\s+(front\s+matter|back\s+matter)\s*$/i.test(l.trim()) || /^#\s+\d+\s*[:.–—-]\s*\S/.test(l.trim()),
);
const body = units.filter((u) => u.line > firstStructural);

// ── Report scaffolding ─────────────────────────────────────────────────────
let failures = 0;
let warnings = 0;
const fail = (label: string, detail: string): void => {
  failures += 1;
  console.log(`  [FAIL] ${label}: ${detail}`);
};
const warn = (label: string, detail: string): void => {
  warnings += 1;
  console.log(`  [WARN] ${label}: ${detail}`);
};
const pass = (label: string, detail: string): void => console.log(`  [PASS] ${label}: ${detail}`);

console.log(`pdf        : ${PDF_PATH}`);
console.log(`pdf sha256 : ${sha(pdfBytes)}`);
console.log(`pages      : ${doc.numPages}`);
console.log(`manuscript : ${SHIPPING_SHA.slice(0, 8)} (verified)`);
console.log(`units      : ${body.length} body units from the manuscript\n`);

// ── 1. Nothing dropped ─────────────────────────────────────────────────────
console.log('1. TEXT RETENTION');
// The matter MARKERS are consumed by the parser by design (`# FRONT MATTER`
// names a region, it is not a heading the book prints), so they are not loss.
const isMatterMarker = (u: Unit): boolean =>
  u.kind === 'heading' && /^(front|back)[ ]+matter$/i.test(u.text.trim());
/**
 * A NUMBERED CHAPTER HEADING is split by design.
 *
 * A heading like "4 — Great Smoky Mountains" sets as the kicker "Chapter 4" over the title
 * "Great Smoky Mountains", so the authored string never appears as one run. The
 * number is checked separately, below, so nothing goes unverified — the raw form
 * is simply not what the page is supposed to say.
 */
const CHAPTER_HEADING = /^(\d+)\s*[:.‐-―-]\s*(.+)$/;

/**
 * A CHECKLIST MARKER is not text either.
 *
 * The back-matter checklist is authored as `- [ ] Pick one park.` and the
 * checklist component draws the box as a rule, so the literal brackets never
 * appear on the page — correctly. Verified by hand against the PDF before this
 * was written: "Pick one park" is present, "[ ]" is not.
 */
const stripTaskMarker = (s: string): string => s.replace(/^\[[ xX]?\]\s*/, '');

const checkable = body
  .filter((u) => !isMatterMarker(u))
  .map((u) => {
    if (u.kind === 'listitem') return { ...u, text: stripTaskMarker(u.text) };
    if (u.kind !== 'heading') return u;
    const m = CHAPTER_HEADING.exec(u.text.trim());
    return m ? { ...u, text: m[2]!.trim() } : u;
  });
const missing = checkable.filter((u) => u.text.length >= 12 && !inPdf(u.text));
if (missing.length === 0) {
  pass('every body unit present', `${checkable.length} paragraphs, headings, list items, quotes and table cells`);
} else {
  fail('missing from the PDF', `${missing.length} of ${checkable.length} units`);
  for (const m of missing.slice(0, 12)) {
    console.log(`         L${m.line} [${m.kind}] ${m.text.slice(0, 110)}`);
  }
  if (missing.length > 12) console.log(`         …and ${missing.length - 12} more`);
}

// ── 2. No duplication ──────────────────────────────────────────────────────
console.log('\n2. NO DUPLICATION');
const countIn = (hay: string, needle: string): number => {
  if (!needle) return 0;
  let n = 0;
  let i = hay.indexOf(needle);
  while (i !== -1) { n += 1; i = hay.indexOf(needle, i + 1); }
  return n;
};
/**
 * Duplication means "printed MORE TIMES THAN THE AUTHOR WROTE IT", not
 * "printed twice". This book repeats its fee paragraph in six places on
 * purpose — once per park chapter — so a flat >1 rule reported the author's own
 * structure as a rendering defect.
 */
const manuscriptSquashed = squash(markdown.replace(/\*+/g, ''));
const paras = body.filter((u) => u.kind === 'para' && u.text.length >= 60);
const dupes = paras
  .map((u) => ({ u, inPdf: countIn(pdfSquashed, squash(u.text)), inSrc: countIn(manuscriptSquashed, squash(u.text)) }))
  .filter((d) => d.inPdf > d.inSrc);
if (dupes.length === 0) pass('nothing printed more often than it was written', `${paras.length} substantial paragraphs checked`);
else {
  fail('printed more often than authored', `${dupes.length} paragraph(s)`);
  for (const d of dupes.slice(0, 6)) console.log(`         L${d.u.line} src x${d.inSrc} pdf x${d.inPdf} — ${d.u.text.slice(0, 90)}`);
}

// ── 3. Content order ───────────────────────────────────────────────────────
console.log('\n3. CONTENT ORDER');
{
  const anchors = paras.filter((_, i) => i % 8 === 0).slice(0, 60);
  let lastAt = -1;
  let outOfOrder = 0;
  for (const a of anchors) {
    const at = pdfSquashed.indexOf(squash(a.text));
    if (at === -1) continue;
    if (at < lastAt) outOfOrder += 1;
    lastAt = at;
  }
  if (outOfOrder === 0) pass('manuscript order preserved', `${anchors.length} anchors, monotonically increasing`);
  else fail('content reordered', `${outOfOrder} anchor(s) appear before the one preceding them`);
}

// ── 4. Numbers and safety figures ──────────────────────────────────────────
console.log('\n4. NUMBERS AND SAFETY FIGURES');
{
  /** Every money / distance / time / measurement token in the manuscript body. */
  const NUM = /\$[\d,]+(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:feet|foot|ft|miles?|mi|yards?|minutes?|hours?|a\.m\.|p\.m\.|degrees?|%|pounds?|inches|in\.|days?|weeks?|years?)\b/gi;
  const tokens = new Map<string, number>();
  for (const u of body) {
    for (const m of u.text.matchAll(NUM)) {
      const k = norm(m[0]);
      tokens.set(k, (tokens.get(k) ?? 0) + 1);
    }
  }
  const absent = [...tokens.keys()].filter((k) => !inPdf(k));
  if (absent.length === 0) pass('every measured value present', `${tokens.size} distinct money/distance/time tokens`);
  else {
    fail('value missing from the PDF', `${absent.length} of ${tokens.size}`);
    for (const a of absent.slice(0, 15)) console.log(`         ${a}`);
  }
}

/**
 * The corrections the manuscript QA specifically protected.
 *
 * Taken from EDITORIAL-FREEZE-2026-08-20. These are the sentences where a
 * layout defect would cost a reader money or safety, and the ones a stale export
 * would silently revert — `6bb6db65` states 75 and 20 feet where the park says
 * 100 and 50. Checked BOTH ways: the corrected value must be present AND the
 * superseded value must be absent.
 */
console.log('\n5. PROTECTED CORRECTIONS (from the editorial freeze)');
const MUST_APPEAR: Array<[string, string]> = [
  ['Grand Canyon wildlife distance, large animals', '100 feet'],
  ['Grand Canyon wildlife distance, small animals', '50 feet'],
  ['Non-resident surcharge', '$100'],
  ['Non-resident annual pass', '$250'],
  ['Rocky Mountain timed-entry processing fee', '$2'],
  ['Smokies parking tag, day', '$5'],
  ['Smokies parking tag, week', '$15'],
  ['Smokies parking tag, year', '$40'],
  ['Cadillac Summit reservation', '$6'],
  ['Standard entrance fee', '$35'],
];
for (const [label, needle] of MUST_APPEAR) {
  if (inPdf(needle)) pass(label, `"${needle}" present`);
  else fail(label, `"${needle}" NOT FOUND in the PDF`);
}

/**
 * Strings that must NOT reach the page.
 *
 * Every entry is self-checked against the manuscript first. Two earlier entries
 * were wrong in exactly the way this guard now catches:
 *
 *   "75 feet"  is Rocky Mountain's elk and bighorn distance and is IN the
 *              approved manuscript. It was listed as a superseded Grand Canyon
 *              value, conflating two parks' rules.
 *   "20 feet"  never appears at all — it matched as a substring of "120 feet",
 *              which is the moose distance.
 *
 * So a forbidden string is only meaningful if the manuscript does not contain
 * it, and matching is word-bounded rather than substring.
 */
const MUST_NOT_APPEAR: Array<[string, string]> = [
  ['Retired author identity (Nolan)', 'Nolan'],
  ['Retired author identity (Withlow)', 'Withlow'],
  ['Retired title', 'Without the Overwhelm'],
  ['Retired subtitle', "A First-Timer's Deep Guide"],
];
for (const [label, needle] of MUST_NOT_APPEAR) {
  const n = norm(needle);
  if (norm(markdown).includes(n)) {
    warn(label, `"${needle}" is in the APPROVED manuscript — this check is wrong, not the book`);
    continue;
  }
  /**
   * WORD-BOUNDED, not substring. "20 feet" matched inside "120 feet" and
   * reported the moose distance as a superseded Grand Canyon value.
   *
   * Every needle above is plain words and apostrophes, so the boundary test is
   * done by inspecting the characters either side of each hit rather than by
   * building a regex that would need escaping.
   */
  const isWordChar = (c: string | undefined): boolean => c !== undefined && /[a-z0-9]/.test(c);
  let hit = false;
  for (let i = pdf.indexOf(n); i !== -1; i = pdf.indexOf(n, i + 1)) {
    if (!isWordChar(pdf[i - 1]) && !isWordChar(pdf[i + n.length])) { hit = true; break; }
  }
  if (!hit) pass(label, 'absent, as required');
  else fail(label, `"${needle}" IS PRESENT and must not be`);
}

/**
 * The Grand Canyon correction, checked where it actually lives.
 *
 * Phase 3 of the revision changed this chapter's wildlife distances from 75/20
 * feet to the park's own 100/50. A book-wide search for "75 feet" cannot test
 * that — the number is correct elsewhere — so the sentence itself is the test.
 */
{
  const gcStart = lines.findIndex((l) => l.trim().startsWith('# 7 — Grand Canyon'));
  const gcEnd = lines.findIndex((l) => l.trim().startsWith('# 8 — Yosemite'));
  const distanceLines = lines
    .slice(gcStart, gcEnd)
    .filter((l) => /[0-9]+[ ]*feet/.test(l))
    .map((l) => deMark(l.trim()));
  const lost = distanceLines.filter((l) => !inPdf(l));
  if (distanceLines.length === 0) fail('Grand Canyon distances', 'no distance sentence found in the chapter');
  else if (lost.length === 0) {
    pass('Grand Canyon wildlife distances', `${distanceLines.length} distance sentence(s) printed verbatim`);
  } else {
    fail('Grand Canyon wildlife distances', `${lost.length} distance sentence(s) missing`);
    for (const l of lost) console.log(`         ${l.slice(0, 110)}`);
  }
}

// ── 6. Warnings ────────────────────────────────────────────────────────────
console.log('\n6. SAFETY WARNINGS');
{
  // The mark itself is a drawn SVG and carries no text, so the warnings are
  // counted by their opening words instead — which is what a reader loses if a
  // warning goes missing.
  const warnLines = lines.filter((l) => /^\s*⚠/.test(l));
  const lost = warnLines.filter((l) => {
    const t = norm(deMark(l.replace(/^\s*⚠\ufe0f?\s*/, '')));
    return !inPdf(t.slice(0, Math.min(90, t.length)));
  });
  if (warnLines.length !== 16) warn('warning count', `expected 16 in the manuscript, found ${warnLines.length}`);
  if (lost.length === 0) pass('all warnings printed', `${warnLines.length} of ${warnLines.length}`);
  else {
    fail('warning text missing', `${lost.length} of ${warnLines.length}`);
    for (const l of lost.slice(0, 5)) console.log(`         ${l.slice(0, 100)}`);
  }
}

// ── 7. Front matter, disclosure, identity ──────────────────────────────────
console.log('\n7. FRONT MATTER AND IDENTITY');
{
  const disclosure = lines
    .map((l) => l.trim())
    .find((l) => l.includes('Tom Everett is a pen name and a composite narrator'))!;
  const clean = deMark(disclosure);
  if (inPdf(clean)) pass('composite-narrator disclosure', 'present, verbatim');
  else fail('composite-narrator disclosure', 'NOT FOUND — this is a legal disclosure and must print');

  const REQUIRED: Array<[string, string]> = [
    ['Title', '7 National Parks Without the Rookie Mistakes'],
    ['Subtitle', "What's Worth Your Time, What to Skip, and What I Learned the Hard Way"],
    ['Author', 'Tom Everett'],
    ['Copyright line', 'Copyright © 2026 by Tom Everett'],
    ['Rights statement', 'All rights reserved.'],
    ['Front-matter note 1', 'A note on how this book was written'],
    ['Front-matter note 2', 'The other note, the legal one'],
    ['Back matter', 'QUICK-REFERENCE PLANNING CHECKLIST'],
    ['Appendix', 'APPENDIX'],
  ];
  for (const [label, needle] of REQUIRED) {
    if (inPdf(needle)) pass(label, `"${needle.slice(0, 52)}" present`);
    else fail(label, `"${needle}" NOT FOUND`);
  }

  // Nothing invented on the copyright page.
  for (const [label, needle] of [
    ['No invented edition string', 'first edition'],
    ['No invented ISBN', 'isbn'],
  ] as Array<[string, string]>) {
    if (!inPdf(needle)) pass(label, 'absent, as instructed');
    else warn(label, `"${needle}" appears in the PDF — confirm it was intended`);
  }
}

// ── 8. No markdown artifacts ───────────────────────────────────────────────
console.log('\n8. NO MARKDOWN ARTIFACTS ON THE PAGE');
{
  const ARTIFACTS: Array<[string, RegExp]> = [
    ['bold markers', /\*\*/],
    ['heading hashes', /(^|\s)#{2,}\s/],
    ['table pipes', /\|\s*-{3,}/],
    ['table row pipes', /\s\|\s.*\s\|\s/],
    ['blockquote markers', /(^|\s)>\s\w/],
    ['undrawn long arrow', /\u27f6/],
    ['tofu box', /\ufffd/],
  ];
  let found = 0;
  for (const [label, re] of ARTIFACTS) {
    if (re.test(pdfRaw)) {
      found += 1;
      const m = re.exec(pdfRaw);
      const at = m ? Math.max(0, m.index - 50) : 0;
      fail(label, `found: …${pdfRaw.slice(at, at + 120).replace(/\s+/g, ' ')}…`);
    }
  }
  if (found === 0) pass('no raw markdown reached the page', `${ARTIFACTS.length} artifact classes checked`);
}

// ── 9. Tables ──────────────────────────────────────────────────────────────
console.log('\n9. TABLES');
{
  const cells = body.filter((u) => u.kind === 'cell');
  const lostCells = cells.filter((c) => c.text.length >= 3 && !inPdf(c.text));
  const rowLines = lines.filter((l) => /^\s*\|/.test(l));
  const dataRows = rowLines.filter((l) => !/^\s*\|[\s:|-]+\|?\s*$/.test(l));
  console.log(`  ${rowLines.length} pipe rows in the manuscript, ${dataRows.length} carrying data, ${cells.length} non-empty cells`);
  if (lostCells.length === 0) pass('every table cell printed', `${cells.length} cells`);
  else {
    fail('table cells missing', `${lostCells.length} of ${cells.length}`);
    for (const c of lostCells.slice(0, 10)) console.log(`         L${c.line} ${c.text.slice(0, 90)}`);
  }
}

// ── 10. Callouts ───────────────────────────────────────────────────────────
console.log('\n10. CALLOUTS');
{
  const skipLabels = lines.filter((l) => /^>\s*###\s*SKIP IT/i.test(l.trim()));
  const nwm = lines.filter((l) => /^##\s*NOBODY WARNED ME/i.test(l.trim()));
  const labelPrinted = inPdf('SKIP IT / DO THIS INSTEAD');
  if (skipLabels.length && labelPrinted) pass('skip-box labels', `${skipLabels.length} boxes, label set as text`);
  else if (skipLabels.length) fail('skip-box labels', 'the label does not appear in the PDF');
  const nwmCount = countIn(pdfSquashed, squash('NOBODY WARNED ME'));
  // The manuscript also names the section once in the introduction, so the
  // printed count is legitimately one higher than the number of boxes.
  if (nwmCount >= nwm.length) pass('NOBODY WARNED ME sections', `${nwm.length} authored, ${nwmCount} occurrences printed`);
  else fail('NOBODY WARNED ME sections', `${nwm.length} authored but only ${nwmCount} printed`);
}

// ── Verdict ────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(70)}`);
console.log(`FIDELITY: ${failures} failure(s), ${warnings} warning(s)`);
console.log(failures === 0 ? 'TEXT FIDELITY: PASS' : 'TEXT FIDELITY: FAIL');
process.exit(failures === 0 ? 0 : 1);
