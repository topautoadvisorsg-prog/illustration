/**
 * BEFORE YOU NEED IT — does the printed contents match where the sections
 * ACTUALLY are?
 *
 * The book went 175 -> 174 -> 173 pages across two repairs, and its contents
 * page carries real folios. A cross-reference that silently goes one out is
 * exactly the kind of defect a visual sweep cannot catch: every page looks fine
 * on its own and the book is still wrong.
 *
 * Reads the folios OFF THE PRINTED CONTENTS PAGES of the shipping PDF and
 * compares them against the page each section opener actually landed on, taken
 * from the renderer's own report. Nothing is assumed from the manuscript.
 *
 *   yarn tsx scripts/_byni_toc_check.ts
 *
 * Local and free.
 */
import { readFileSync } from 'node:fs';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { INTERIOR_PDF, OUT_DIR, RENDER_INPUT, readManuscript } from './before-you-need-it-config.js';

const PDF = INTERIOR_PDF;

// ── 1. what the printed contents CLAIMS ─────────────────────────────────────
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
(pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = '';
const doc = await (
  pdfjs as unknown as { getDocument: (o: unknown) => { promise: Promise<any> } }
).getDocument({ data: new Uint8Array(readFileSync(PDF)), useSystemFonts: false, disableFontFace: true })
  .promise;

/** Group text items into lines by baseline, as the page model does. */
async function linesOf(n: number): Promise<string[]> {
  const page = await doc.getPage(n);
  const tc = await page.getTextContent();
  const buckets = new Map<number, Array<{ x: number; s: string }>>();
  for (const it of tc.items as Array<{ str?: string; transform: number[] }>) {
    const s = it.str ?? '';
    if (!s.trim()) continue;
    const y = Math.round(it.transform[5]! * 2) / 2;
    let key = y;
    for (const k of buckets.keys()) if (Math.abs(k - y) <= 1.2) key = k;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push({ x: it.transform[4]!, s });
  }
  return [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, items]) => items.sort((a, b) => a.x - b.x).map((i) => i.s).join(''));
}

const claimed: Array<{ title: string; folio: number }> = [];
for (const n of [3, 4]) {
  for (const line of await linesOf(n)) {
    // "Chapter 1 — What's happening ......... 17" — leader dots are drawn, not
    // set, so the folio is simply the trailing number.
    const m = /^(.*?)[\s.…]*(\d{1,3})\s*$/.exec(line.trim());
    if (!m) continue;
    const title = m[1]!.replace(/[\s.…]+$/, '').trim();
    if (!title || /^\d+$/.test(title) || title.toLowerCase() === 'contents') continue;
    claimed.push({ title, folio: Number(m[2]) });
  }
}

// ── 2. where the sections ACTUALLY are ──────────────────────────────────────
const { md } = readManuscript();
const render = await renderTypesetBook({ ...RENDER_INPUT, markdown: md });
const actual = new Map<string, number>();
const unplaced: string[] = [];
for (const s of render.report.sectionStarts) {
  // `page` is nullable on the report. A section the renderer could not place is
  // not a folio mismatch and must not be compared as one — it is a worse fault,
  // reported separately rather than silently becoming a null in the map.
  if (s.page === null) {
    unplaced.push(s.title);
    continue;
  }
  actual.set(norm(s.title), s.page);
}
if (unplaced.length) {
  console.error(`ABORT: ${unplaced.length} section(s) have no page: ${unplaced.join(', ')}`);
  process.exit(2);
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[—–-]/g, ' ')
    .replace(/[^a-z0-9' ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

console.log(`contents entries read off the printed page: ${claimed.length}`);
console.log(`section starts reported by the renderer   : ${actual.size}\n`);

let ok = 0;
const bad: string[] = [];
for (const c of claimed) {
  const got = actual.get(norm(c.title));
  if (got === undefined) {
    bad.push(`  ${c.title}  — no matching section start (claims p${c.folio})`);
    continue;
  }
  if (got !== c.folio) {
    bad.push(`  ${c.title}  — contents says p${c.folio}, actually p${got}`);
    continue;
  }
  ok += 1;
  console.log(`  OK  p${String(c.folio).padStart(3)}  ${c.title}`);
}

console.log('');
if (bad.length) {
  console.error(`MISMATCHED — ${bad.length}:`);
  for (const b of bad) console.error(b);
  process.exit(1);
}
console.log(`all ${ok} contents entries point at the right page.`);
process.exit(0);
