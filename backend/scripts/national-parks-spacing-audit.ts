/**
 * SPACING AND LAYOUT AUDIT of a finished interior PDF.
 *
 * The fidelity checker already proves the WORDS are right. This looks at where
 * they sit: the things a reader notices without being able to name them, and
 * that no spell-check will ever find.
 *
 *   - a line stranded alone at the top of a page, or a paragraph starting on the
 *     last line of one
 *   - a heading left at the foot of a page with its text on the next
 *   - a vertical gap that nothing explains
 *   - two spaces where there should be one
 *   - a justified line pulled so loose it opens rivers
 *   - margins that wander from page to page
 *
 * Everything is MEASURED off the shipped bytes. Nothing is re-rendered, because
 * a check that rebuilds its own copy proves something about a file nobody will
 * upload.
 *
 *   npx tsx scripts/national-parks-spacing-audit.ts <interiorPdf>
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PDF = process.argv[2];
if (!PDF) throw new Error('usage: national-parks-spacing-audit.ts <interiorPdf>');

const bytes = readFileSync(PDF);
console.log(`file   : ${PDF}`);
console.log(`sha256 : ${createHash('sha256').update(bytes).digest('hex')}`);

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pdfjs as any).GlobalWorkerOptions.workerSrc = '';
const doc = await (
  pdfjs as unknown as { getDocument: (o: unknown) => { promise: Promise<any> } }
).getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true }).promise;

interface Line {
  y: number;
  x0: number;
  x1: number;
  size: number;
  text: string;
  font: string;
}
interface Page {
  n: number;
  h: number;
  w: number;
  lines: Line[];
}

const PT = 1;
const pages: Page[] = [];

for (let i = 1; i <= doc.numPages; i += 1) {
  const page = await doc.getPage(i);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  /** Items sharing a baseline within a point are one line. */
  const buckets = new Map<number, Array<{ x: number; w: number; s: string; size: number; font: string }>>();
  for (const it of tc.items as Array<any>) {
    const str: string = it.str ?? '';
    if (!str.trim()) continue;
    const y = Math.round(it.transform[5] * 2) / 2;
    let key = y;
    for (const k of buckets.keys()) if (Math.abs(k - y) <= 1.2) key = k;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push({
      x: it.transform[4],
      w: it.width ?? 0,
      s: str,
      size: Math.abs(it.transform[3]) || Math.abs(it.transform[0]),
      font: it.fontName ?? '?',
    });
  }
  const lines: Line[] = [];
  for (const [y, items] of buckets) {
    items.sort((a, b) => a.x - b.x);
    const x0 = items[0]!.x;
    const last = items[items.length - 1]!;
    lines.push({
      y,
      x0,
      x1: last.x + last.w,
      size: Math.max(...items.map((t) => t.size)),
      text: items.map((t) => t.s).join(''),
      font: items[0]!.font,
    });
  }
  /** PDF y grows upward; reading order is descending y. */
  lines.sort((a, b) => b.y - a.y);
  pages.push({ n: i, h: vp.height, w: vp.width, lines });
}

const findings: Array<{ page: number; kind: string; detail: string }> = [];
const note = (page: number, kind: string, detail: string): void => findings.push({ page, kind, detail });

// ── Establish what "normal" is on this book, from the book ─────────────────
const bodySizes = new Map<number, number>();
for (const p of pages) for (const l of p.lines) {
  const k = Math.round(l.size * 2) / 2;
  bodySizes.set(k, (bodySizes.get(k) ?? 0) + l.text.length);
}
const BODY_SIZE = [...bodySizes.entries()].sort((a, b) => b[1] - a[1])[0]![0];

const pitches: number[] = [];
for (const p of pages) {
  for (let i = 1; i < p.lines.length; i += 1) {
    const a = p.lines[i - 1]!;
    const b = p.lines[i]!;
    if (Math.abs(a.size - BODY_SIZE) < 0.6 && Math.abs(b.size - BODY_SIZE) < 0.6) {
      const d = a.y - b.y;
      if (d > 1 && d < 40) pitches.push(Math.round(d * 10) / 10);
    }
  }
}
pitches.sort((a, b) => a - b);
const counts = new Map<number, number>();
for (const v of pitches) counts.set(v, (counts.get(v) ?? 0) + 1);
const LEADING = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];

/** The measure: the widest body line in the book, less a hair for justification. */
const bodyLines = pages.flatMap((p) => p.lines.filter((l) => Math.abs(l.size - BODY_SIZE) < 0.6));
const widths = bodyLines.map((l) => l.x1 - l.x0).sort((a, b) => a - b);
const MEASURE = widths[Math.floor(widths.length * 0.97)]!;

console.log(`\npages  : ${pages.length}`);
console.log(`body   : ${BODY_SIZE.toFixed(2)}pt on ${LEADING.toFixed(1)}pt leading`);
console.log(`measure: ${MEASURE.toFixed(1)}pt (${(MEASURE / 72).toFixed(3)}in)`);

/** Margin furniture (folio, running head) sits outside the text block. */
const isFurniture = (p: Page, l: Line): boolean =>
  l.y > p.h - 54 || l.y < 54 || (l.size < BODY_SIZE - 1.2 && (l.y > p.h - 90 || l.y < 90));

// ── 1. Double spaces and stray whitespace ──────────────────────────────────
for (const p of pages) {
  for (const l of p.lines) {
    if (/\S {2,}\S/.test(l.text)) note(p.n, 'double space', `"${l.text.trim().slice(0, 70)}"`);
    if (/\s+$/.test(l.text) && l.text.trim().length > 0 && /\s{2,}$/.test(l.text)) {
      note(p.n, 'trailing space', `"${l.text.trim().slice(0, 50)}"`);
    }
    if (/ [,.;:!?]/.test(l.text)) note(p.n, 'space before punctuation', `"${l.text.trim().slice(0, 70)}"`);
  }
}

// ── 2. Unexplained vertical gaps inside the text block ─────────────────────
for (const p of pages) {
  const body = p.lines.filter((l) => !isFurniture(p, l));
  for (let i = 1; i < body.length; i += 1) {
    const a = body[i - 1]!;
    const b = body[i]!;
    const gap = a.y - b.y;
    if (gap <= LEADING * 1.35) continue;
    /** A heading, an ornament or a plate legitimately opens space. */
    const heading = a.size > BODY_SIZE + 1 || b.size > BODY_SIZE + 1;
    const ornament = /^[*∗·\s]+$/.test(a.text.trim()) || /^[*∗·\s]+$/.test(b.text.trim());
    if (heading || ornament) continue;
    if (gap > LEADING * 1.9) {
      note(p.n, 'large gap', `${(gap / LEADING).toFixed(2)}x leading between "${a.text.trim().slice(0, 34)}" and "${b.text.trim().slice(0, 34)}"`);
    }
  }
}

// ── 3. Widows and orphans ──────────────────────────────────────────────────
/**
 * A WIDOW is a fragment, not merely a paragraph's last line.
 *
 * A first pass flagged any page opening with a line that ended a paragraph, and
 * called eleven pages defective. Ten of them opened with lines running 88-95% of
 * the measure — a nearly full line, which is what most paragraphs end on and
 * which no reader would ever notice. Only a genuinely SHORT line stranded at the
 * top of a page reads as a mistake, so the threshold is set where the eye
 * actually starts to see one.
 */
const WIDOW_FRACTION = 0.6;
const endsParagraph = (l: Line): boolean => l.x1 - l.x0 < MEASURE - BODY_SIZE * 1.2;

for (let i = 1; i < pages.length; i += 1) {
  const prev = pages[i - 1]!;
  const cur = pages[i]!;
  const prevBody = prev.lines.filter((l) => !isFurniture(prev, l) && Math.abs(l.size - BODY_SIZE) < 0.6);
  const curBody = cur.lines.filter((l) => !isFurniture(cur, l) && Math.abs(l.size - BODY_SIZE) < 0.6);
  if (prevBody.length === 0 || curBody.length === 0) continue;

  const first = curBody[0]!;
  const second = curBody[1];
  const prevLast = prevBody[prevBody.length - 1]!;
  const frac = (first.x1 - first.x0) / MEASURE;
  if (endsParagraph(first) && !endsParagraph(prevLast) && frac < WIDOW_FRACTION) {
    const alone = !second || cur.lines[0]!.y - second.y > LEADING * 1.35;
    if (alone) {
      note(cur.n, 'WIDOW', `opens with a ${(frac * 100).toFixed(0)}% line: "${first.text.trim().slice(0, 52)}"`);
    }
  }
}

/**
 * An ORPHAN is the opposite: a paragraph that begins on the last line of a page
 * and continues overleaf. One line of a new thought, then a page turn.
 */
for (let i = 0; i < pages.length - 1; i += 1) {
  const cur = pages[i]!;
  const next = pages[i + 1]!;
  const body = cur.lines.filter((l) => !isFurniture(cur, l) && Math.abs(l.size - BODY_SIZE) < 0.6);
  const nextBody = next.lines.filter((l) => !isFurniture(next, l) && Math.abs(l.size - BODY_SIZE) < 0.6);
  if (body.length < 2 || nextBody.length === 0) continue;
  const last = body[body.length - 1]!;
  const before = body[body.length - 2]!;
  /** It starts a paragraph if there is paragraph space above it. */
  const startsParagraph = before.y - last.y > LEADING * 1.15;
  if (startsParagraph && !endsParagraph(last)) {
    note(cur.n, 'ORPHAN', `a paragraph starts on the last line and runs over: "${last.text.trim().slice(0, 52)}"`);
  }
}

// ── 4. A heading stranded at the foot of a page ────────────────────────────
for (const p of pages) {
  const body = p.lines.filter((l) => !isFurniture(p, l));
  if (body.length === 0) continue;
  const last = body[body.length - 1]!;
  if (last.size > BODY_SIZE + 1) {
    note(p.n, 'STRANDED HEADING', `"${last.text.trim().slice(0, 60)}" is the last thing on the page`);
  }
}

// ── 5. Justification: lines pulled loose ───────────────────────────────────
/**
 * The contents page is excluded by NAME, not by page number: its entries are a
 * title and a folio separated by a long gap, which is not a loose line, it is a
 * different thing entirely. Everything else in the book is measured.
 */
const CONTENTS_PAGES = new Set(
  pages.filter((p) => p.lines.some((l) => /^contents$/i.test(l.text.trim()))).map((p) => p.n),
);
{
  const loose: Array<[number, number, string]> = [];
  for (const p of pages) {
    for (const l of p.lines) {
      if (CONTENTS_PAGES.has(p.n)) continue;
      if (Math.abs(l.size - BODY_SIZE) > 0.6) continue;
      if (l.x1 - l.x0 < MEASURE - 2) continue; // only full (justified) lines
      const words = l.text.trim().split(/\s+/).filter(Boolean);
      if (words.length < 4) continue;
      const ink = words.join('').length;
      /** Rough per-character advance; a loose line spends a lot on spaces. */
      const perChar = (l.x1 - l.x0) / Math.max(ink, 1);
      loose.push([p.n, perChar, l.text.trim().slice(0, 60)]);
    }
  }
  const vals = loose.map((v) => v[1]).sort((a, b) => a - b);
  if (vals.length > 20) {
    const median = vals[Math.floor(vals.length / 2)]!;
    for (const [pn, v, t] of loose) {
      if (v > median * 1.28) note(pn, 'loose line', `${((v / median - 1) * 100).toFixed(0)}% wider than typical: "${t}"`);
    }
  }
}

// ── 6. Margins that wander ─────────────────────────────────────────────────
{
  const tops: number[] = [];
  const lefts: number[] = [];
  for (const p of pages) {
    const body = p.lines.filter((l) => !isFurniture(p, l));
    if (body.length === 0) continue;
    tops.push(Math.round(p.h - body[0]!.y));
    for (const l of body) if (Math.abs(l.size - BODY_SIZE) < 0.6) lefts.push(Math.round(l.x0));
  }
  const mode = (a: number[]): number => {
    const m = new Map<number, number>();
    for (const v of a) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((x, y) => y[1] - x[1])[0]![0];
  };
  const topMode = mode(tops);
  const leftModes = [...new Set(lefts)].sort((a, b) => a - b);
  console.log(`top edge of text block: mode ${topMode}pt (${(topMode / 72).toFixed(3)}in)`);
  console.log(`left edges seen       : ${leftModes.length} distinct, ${leftModes[0]}pt to ${leftModes[leftModes.length - 1]}pt`);

  for (const p of pages) {
    const body = p.lines.filter((l) => !isFurniture(p, l));
    if (body.length === 0) continue;
    const top = Math.round(p.h - body[0]!.y);
    /**
     * A chapter or part opener legitimately starts low. Judged on the whole top
     * of the page, not on its first line: these openers lead with a small-caps
     * "CHAPTER 9" kicker, which is SMALLER than body, so testing the first line
     * alone called every opener in the book a margin defect.
     */
    const opener = body.slice(0, 3).some((l) => l.size > BODY_SIZE + 2);
    if (opener || Math.abs(top - topMode) <= LEADING * 0.9) continue;
    note(
      p.n,
      'top margin',
      `text starts ${top}pt from the top rather than ${topMode}pt, with ` +
        `${body[0]!.size.toFixed(1)}pt "${body[0]!.text.trim().slice(0, 46)}"`,
    );
  }
}

// ── 6b. Pages that stop short ──────────────────────────────────────────────
/**
 * A page whose text stops well above where every other page stops. Legitimate at
 * the end of a chapter, on a divider, or facing a plate — anywhere else it means
 * something was pushed over that did not need to be.
 */
{
  const bottoms: number[] = [];
  for (const p of pages) {
    const body = p.lines.filter((l) => !isFurniture(p, l));
    if (body.length > 6) bottoms.push(Math.round(body[body.length - 1]!.y));
  }
  const m = new Map<number, number>();
  for (const v of bottoms) m.set(v, (m.get(v) ?? 0) + 1);
  const bottomMode = [...m.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  console.log(`bottom of text block  : mode ${bottomMode}pt from the foot`);

  for (const [i, p] of pages.entries()) {
    const body = p.lines.filter((l) => !isFurniture(p, l));
    if (body.length < 4) continue;
    /**
     * A chapter opener starts roughly 40% down the page and therefore ends
     * short by design. Checking only the FOLLOWING page for an opener missed
     * that, and called every chapter opening in the book a spacing defect.
     */
    if (body.slice(0, 3).some((l) => l.size > BODY_SIZE + 2)) continue;
    const bottom = body[body.length - 1]!.y;
    const short = bottom - bottomMode;
    if (short < LEADING * 2.5) continue;
    const nextPage = pages[i + 1];
    const nextBody = nextPage ? nextPage.lines.filter((l) => !isFurniture(nextPage, l)) : [];
    /** A chapter or part opener overleaf explains it; so does a blank. */
    const nextIsOpener = nextBody.length === 0 || nextBody.slice(0, 3).some((l) => l.size > BODY_SIZE + 2);
    if (nextIsOpener) continue;
    note(p.n, 'short page', `text stops ${short.toFixed(0)}pt (${(short / LEADING).toFixed(1)} lines) early`);
  }
}

// ── 7. Blank and near-blank pages ──────────────────────────────────────────
for (const p of pages) {
  const body = p.lines.filter((l) => !isFurniture(p, l));
  const ink = body.map((l) => l.text.trim()).join('');
  if (ink.length === 0) note(p.n, 'blank page', `no text (${p.lines.length} furniture item(s))`);
  else if (body.length <= 2 && ink.length < 60) note(p.n, 'near-blank page', `only "${ink.slice(0, 60)}"`);
}

// ── Report ─────────────────────────────────────────────────────────────────
const order = [
  'STRANDED HEADING',
  'WIDOW',
  'ORPHAN',
  'short page',
  'double space',
  'space before punctuation',
  'trailing space',
  'large gap',
  'top margin',
  'loose line',
  'blank page',
  'near-blank page',
];
console.log(`\n${'─'.repeat(74)}`);
if (findings.length === 0) {
  console.log('SPACING AUDIT: nothing to report');
} else {
  for (const kind of order) {
    const hits = findings.filter((f) => f.kind === kind);
    if (hits.length === 0) continue;
    console.log(`\n${kind.toUpperCase()}  (${hits.length})`);
    for (const h of hits.slice(0, 24)) console.log(`  p${String(h.page).padStart(3)}  ${h.detail}`);
    if (hits.length > 24) console.log(`  ... and ${hits.length - 24} more`);
  }
  const unknown = findings.filter((f) => !order.includes(f.kind));
  for (const h of unknown) console.log(`  p${h.page}  ${h.kind}: ${h.detail}`);
}
console.log(`\n${'─'.repeat(74)}`);
console.log(`${findings.length} observation(s) across ${pages.length} pages`);
process.exit(0);
