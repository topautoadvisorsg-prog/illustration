/**
 * CHAPTER-ENDING PAGES WITH ROOM FOR AN ILLUSTRATION.
 *
 * A chapter that ends halfway down a page leaves a hole. Filling those holes is
 * the one place a B&W illustration can be added without touching a single line
 * of type — nothing reflows, because the space is already empty.
 *
 * The measurement is deliberately the SAME one Layer 1 QA uses for its sparse
 * page warning: the vertical extent of drawn text inside the text block, read
 * out of the rendered PDF. Reading it from the PDF rather than the DOM means it
 * describes the artifact that goes to the printer.
 *
 *   yarn workspace @wildlands/backend qa:illustrations
 *   WL_MIN_EMPTY=50 yarn workspace @wildlands/backend qa:illustrations
 *
 * Reports candidates only. It renders nothing, spends nothing, and decides
 * nothing — the operator picks from the list.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
loadDotenv({ path: path.join(ROOT, '.env') });
loadDotenv({ path: path.join(ROOT, '.env.development.local'), override: true });

const MANUSCRIPT =
  process.env.WL_QA_MANUSCRIPT ?? 'C:/Users/jovan/Downloads/puberty boy book/export/NO-ONE-TOLD-ME-THAT_FINAL.md';

/** Minimum empty share of the text block for a page to qualify. */
const MIN_EMPTY = Number(process.env.WL_MIN_EMPTY ?? '50');

const { sanitizeManuscript } = await import('../src/pipeline/stage-1-ingestion/sanitize-manuscript.js');
const { renderTypesetBook } = await import('../src/pipeline/typeset/render-typeset.js');
const { resolveTypesetLayoutStandard } = await import('../src/pipeline/typeset/layout-standards/registry.js');
const { getProductionProfile } = await import('../src/pipeline/production-profiles/registry.js');
const { ProjectConfigSchema } = await import('@wildlands/shared');

const markdown = sanitizeManuscript(await readFile(MANUSCRIPT, 'utf8'));
const profile = getProductionProfile('bw-educational-nonfiction');
const standard = resolveTypesetLayoutStandard(profile.typesetLayoutStandardId!);

const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'NO ONE TOLD ME THAT',
  authorName: 'Nolan Whitlow',
  productionProfileId: profile.id,
  typesetLayoutStandardId: standard.id,
  trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
  typography: {
    bodyPt: 12,
    lineHeight: 1.3,
    headingFont: standard.type.headingFont,
    bodyFont: standard.type.bodyFont,
  },
  layoutOverrides: process.env.WL_OVERRIDES ? JSON.parse(process.env.WL_OVERRIDES) : {},
});

console.log('rendering …');
const { pdf, report, probe } = await renderTypesetBook({
  markdown,
  config,
  // Matches production: first chapter recto, the rest next-available, with
  // front matter. Scanning a different pagination than the book actually has
  // would report page numbers that do not exist.
  chaptersStartRecto: false,
  layoutStandard: standard,
  frontMatter: { publication: { year: new Date().getFullYear() } },
  deepProbe: true,
});

// ── Fill, measured from the PDF ────────────────────────────────────────────
// Same entry point and options Layer 1 QA uses, so the two agree by construction.
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pdfjs as any).GlobalWorkerOptions.workerSrc = '';
const doc = await (
  pdfjs as unknown as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getDocument: (o: unknown) => { promise: Promise<any> };
  }
).getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, disableFontFace: true }).promise;

const PT_PER_IN = 72;
const m = report.marginsIn;
const pageHeightPt = config.trimSize.heightIn * PT_PER_IN;
const topBand = pageHeightPt - m.topIn * PT_PER_IN;
const bottomBand = m.bottomIn * PT_PER_IN;
const blockHeight = topBand - bottomBand;

const blanks = new Set(report.blankPages);
const fillByPage = new Map<number, number>();
for (let p = 1; p <= doc.numPages; p++) {
  if (blanks.has(p)) continue;
  const page = await doc.getPage(p);
  const content = await page.getTextContent();
  let lo = topBand;
  let hi = bottomBand;
  let any = false;
  for (const item of content.items as { str: string; transform: number[] }[]) {
    if (!item.str.trim()) continue;
    const y = item.transform[5] ?? 0;
    if (y < bottomBand || y > topBand) continue; // running head / folio live outside
    any = true;
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  fillByPage.set(p, any ? ((hi - lo) / blockHeight) * 100 : 0);
}

// ── Where each section ends ────────────────────────────────────────────────
// A section runs from its own start page to the page before the next section
// starts. Trailing parity blanks belong to the gap, not the chapter, so they
// are walked back over: the chapter ENDS on its last page carrying text.
const starts = report.sectionStarts
  .map((s) => ({ ...s, page: s.page ?? 0 }))
  .filter((s) => s.page > 0)
  .sort((a, b) => a.page - b.page);

interface Candidate {
  page: number;
  emptyPct: number;
  section: string;
  label: string;
  kind: string;
  blocks: string[];
  lastBlockId: string;
}

const candidates: Candidate[] = [];
for (const [i, s] of starts.entries()) {
  const nextStart = starts[i + 1]?.page ?? report.totalPages + 1;
  let end = nextStart - 1;
  while (end > s.page && blanks.has(end)) end -= 1;
  if (blanks.has(end)) continue;

  const fill = fillByPage.get(end) ?? 0;
  const empty = 100 - fill;
  if (empty < MIN_EMPTY) continue;

  const blocks = report.pageBlocks[end] ?? [];
  candidates.push({
    page: end,
    emptyPct: Math.round(empty),
    section: s.title,
    label: s.label,
    kind: s.kind,
    blocks,
    lastBlockId: blocks[blocks.length - 1] ?? '(none)',
  });
}

candidates.sort((a, b) => b.emptyPct - a.emptyPct);

// Every sparse page in the book, whether or not it ends a section. A page can
// look empty for reasons that have nothing to do with a chapter ending, and the
// operator is looking at ALL of them.
const ILLUSTRATED = new Set([10, 25, 43, 76, 100, 126, 132, 147]);
console.log('');
console.log('EVERY PAGE UNDER 45% FILL');
console.log(`  ${'page'.padEnd(6)} ${'empty'.padEnd(7)} state`);
for (let p = 1; p <= report.totalPages; p++) {
  if (blanks.has(p)) {
    console.log(`  ${String(`p${p}`).padEnd(6)} ${'100%'.padEnd(7)} BLANK (parity)`);
    continue;
  }
  const fill = fillByPage.get(p) ?? 0;
  if (100 - fill < 45) continue;
  const ends = starts.find((s, i) => {
    const next = starts[i + 1]?.page ?? report.totalPages + 1;
    let e = next - 1;
    while (e > s.page && blanks.has(e)) e -= 1;
    return e === p;
  });
  const tag = ILLUSTRATED.has(p)
    ? 'illustrated'
    : ends
      ? `ends "${ends.title.slice(0, 40)}"`
      : 'mid-section';
  console.log(`  ${String(`p${p}`).padEnd(6)} ${`${Math.round(100 - fill)}%`.padEnd(7)} ${tag}`);
}

const byId = new Map((probe ?? []).map((b) => [`${b.blockId}#${b.frag}`, b]));

// A page whose sparseness is already a deliberate typographic decision is not a
// hole to fill. Saying so here stops the list from proposing artwork on top of
// a treatment someone chose on purpose.
const treated = new Set(Object.keys(config.layoutOverrides ?? {}));

const chapters = candidates.filter((c) => c.kind === 'chapter');
const other = candidates.filter((c) => c.kind !== 'chapter');

function table(rows: Candidate[]): void {
  console.log(`  ${'page'.padEnd(6)} ${'empty'.padEnd(7)} ${'ends'.padEnd(22)} ${'section'.padEnd(52)} last block id`);
  for (const c of rows) {
    const flag = treated.has(c.lastBlockId) ? '  << already treated (override)' : '';
    console.log(
      `  ${String(`p${c.page}`).padEnd(6)} ${`${c.emptyPct}%`.padEnd(7)} ${(c.label || c.kind).padEnd(22)} ${c.section
        .slice(0, 52)
        .padEnd(52)} ${c.lastBlockId}${flag}`,
    );
  }
}

console.log(`\nPAGES AT LEAST ${MIN_EMPTY}% EMPTY AT A SECTION END  —  ${candidates.length} of ${starts.length} sections\n`);
console.log(`CHAPTER ENDINGS (${chapters.length})\n`);
table(chapters);
if (other.length) {
  console.log(`\nFRONT/BACK MATTER ENDINGS (${other.length}) — listed for completeness, not chapter endings\n`);
  table(other);
}

const outPath = path.join(ROOT, 'qa-shots', 'illustration-candidates.json');
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(
  outPath,
  `${JSON.stringify(
    {
      minEmptyPct: MIN_EMPTY,
      totalPages: report.totalPages,
      sections: starts.length,
      candidates: candidates.map((c) => ({
        ...c,
        lastBlockChars: byId.get(`${c.lastBlockId}#0`)?.chars ?? null,
      })),
    },
    null,
    1,
  )}\n`,
);
console.log(`\nwritten to ${outPath}`);
console.log('NO ARTWORK GENERATED. This is a candidate list for operator approval.');
process.exit(0);
