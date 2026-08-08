/**
 * PAGE CONTEXT MEASUREMENT — how much readable content each page actually carries.
 *
 * Input to the review-routing standard: dense pages are expensive and tedious
 * for an operator to proof by eye and are where automated review earns its
 * keep; sparse pages (plates, diagrams, labels, openers) are quick to eyeball
 * and should not consume review spend.
 *
 * WHAT COUNTS AS READABLE
 * The body blocks and title the render pipeline actually asks the model to
 * print, taken from the real WholePageSpec via prepareRender(). NOT
 * `pages.readingFieldText`, which still carries markdown and a metadata header
 * line (habitat, tagline) that never appears on the page — counting that
 * inflates sparse species openers by 10-15 words each and would push some of
 * them over a threshold on text that does not exist.
 *
 * Measurement only. Assigns no route, writes no state.
 *
 * Usage: tsx scripts/context-classify.ts [--out page-context.json]
 */
import { eq } from 'drizzle-orm';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { P } from './_project.js';
import { getDb } from '../src/db/client.js';
import { pages } from '../src/db/schema/index.js';
import { prepareRender } from '../src/pipeline/whole-page-render/render-whole-page.js';

interface PageContext {
  pageKey: string;
  layoutTemplate: string | null;
  pageRole: string | null;
  section: string | null;
  plannedPageNumber: number | null;
  readableWords: number;
  readableChars: number;
  blocks: number;
  /** Reading field area as a share of the 7x10 trim. PLANNED allocation from
   *  the layout spec, not measured ink coverage — the model does not always
   *  honour it, so treat as a weak signal. */
  fieldAreaPct: number | null;
  /** OCR recovery from earlier screens, where we have it. */
  ocrRecovery: number | null;
  error?: string;
}

function ocrIndex(): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of ['./ocr-screen-45.json', './ocr-calibration.json', './ocr-textheavy-11.json']) {
    if (!existsSync(f)) continue;
    for (const r of JSON.parse(readFileSync(f, 'utf8')).results ?? []) m.set(r.pageKey, r.recovery);
  }
  return m;
}

async function main() {
  const outIdx = process.argv.indexOf('--out');
  const out = outIdx === -1 ? './page-context.json' : process.argv[outIdx + 1]!;

  const db = getDb();
  const rows = await db.select().from(pages).where(eq(pages.projectId, P));
  const ocr = ocrIndex();
  const results: PageContext[] = [];

  console.error(`measuring ${rows.length} pages...`);
  let n = 0;
  for (const row of rows as any[]) {
    let words = 0;
    let chars = 0;
    let blocks = 0;
    let fieldAreaPct: number | null = null;
    let error: string | undefined;
    try {
      const { spec } = await prepareRender(row.id);
      const s: any = spec;
      const pt = s.pageText ?? {};
      const parts: string[] = [];
      const t = pt.title ?? {};
      for (const k of ['kicker', 'number', 'name', 'scientificName']) if (t[k]) parts.push(String(t[k]));
      const bb: Array<{ text?: string }> = pt.bodyBlocks ?? [];
      for (const b of bb) if (b?.text) parts.push(b.text);
      blocks = bb.length;
      const text = parts.join(' ');
      chars = text.length;
      words = text.split(/\s+/).filter(Boolean).length;

      const rf = s.readingFieldGeometry;
      const trim = s.layoutGeometry?.trim;
      if (rf?.sizeIn && trim) {
        fieldAreaPct = (rf.sizeIn.w * rf.sizeIn.h) / (trim.widthIn * trim.heightIn);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    results.push({
      pageKey: row.pageKey,
      layoutTemplate: row.layoutTemplate ?? null,
      pageRole: row.pageRole ?? null,
      section: row.section ?? null,
      plannedPageNumber: row.plannedPageNumber ?? null,
      readableWords: words,
      readableChars: chars,
      blocks,
      fieldAreaPct,
      ocrRecovery: ocr.get(row.pageKey) ?? null,
      error,
    });
    if (++n % 40 === 0) console.error(`  ${n}/${rows.length}`);
  }

  writeFileSync(out, JSON.stringify({ projectId: P, generatedAt: new Date().toISOString(), results }, null, 2), 'utf8');

  // ── distribution ──
  const ok = results.filter((r) => !r.error);
  const w = ok.map((r) => r.readableWords).sort((a, b) => a - b);
  const pct = (p: number): number => w[Math.min(w.length - 1, Math.floor((p / 100) * w.length))]!;

  console.log(`\npages measured: ${ok.length}  (errors: ${results.length - ok.length})`);
  console.log(`\nREADABLE WORD COUNT — percentiles`);
  for (const p of [0, 5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95, 100]) {
    console.log(`  p${String(p).padStart(3)} : ${String(pct(p)).padStart(5)}`);
  }

  console.log(`\nHISTOGRAM (readable words)`);
  const bins = [0, 1, 25, 50, 100, 150, 200, 250, 300, 400, 500, 700, 1e9];
  for (let i = 0; i < bins.length - 1; i++) {
    const lo = bins[i]!;
    const hi = bins[i + 1]!;
    const c = ok.filter((r) => r.readableWords >= lo && r.readableWords < hi).length;
    if (c === 0) continue;
    const label = hi === 1e9 ? `${lo}+` : `${lo}-${hi - 1}`;
    console.log(`  ${label.padStart(9)} : ${String(c).padStart(3)} ${'█'.repeat(Math.round(c / 2))}`);
  }

  console.log(`\nCUTOFF SIMULATION`);
  console.log(`  cutoff   HIGH   MANUAL   AI cost @ $0.0019/pg`);
  for (const c of [50, 100, 150, 200, 250, 300, 350, 400]) {
    const hi = ok.filter((r) => r.readableWords >= c).length;
    console.log(`  ${String(c).padStart(6)}   ${String(hi).padStart(4)}   ${String(ok.length - hi).padStart(6)}   $${(hi * 0.0019).toFixed(3)}`);
  }

  console.log(`\nBY LAYOUT (mean readable words)`);
  const byL = new Map<string, number[]>();
  for (const r of ok) {
    const k = r.layoutTemplate ?? (r.section ? `FRONT/BACK (${r.section})` : 'NONE');
    byL.set(k, [...(byL.get(k) ?? []), r.readableWords]);
  }
  for (const [k, v] of [...byL.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const mean = v.reduce((s, x) => s + x, 0) / v.length;
    console.log(`  ${k.padEnd(30)} n=${String(v.length).padStart(3)}  mean ${mean.toFixed(0).padStart(4)}  min ${Math.min(...v)}  max ${Math.max(...v)}`);
  }

  // does density predict whether OCR can read the page? (routing evidence)
  const withOcr = ok.filter((r) => r.ocrRecovery !== null);
  if (withOcr.length) {
    console.log(`\nOCR READABILITY vs DENSITY (n=${withOcr.length})`);
    for (const [lo, hi] of [[0, 150], [150, 250], [250, 400], [400, 1e9]] as Array<[number, number]>) {
      const g = withOcr.filter((r) => r.readableWords >= lo && r.readableWords < hi);
      if (!g.length) continue;
      const good = g.filter((r) => (r.ocrRecovery ?? 0) >= 0.95).length;
      console.log(`  ${String(lo).padStart(4)}-${hi === 1e9 ? '+' : hi} words : ${good}/${g.length} OCR-readable (${((100 * good) / g.length).toFixed(0)}%)`);
    }
  }
  console.log(`\ndetail → ${out}`);
  console.log('Measurement only. No routing assigned, no state written.');
  process.exit(0);
}

main();
