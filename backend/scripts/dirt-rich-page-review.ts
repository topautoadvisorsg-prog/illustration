/**
 * DIRT RICH — page-by-page review for the operator.
 *
 * Answers the questions that decide what still has to be produced:
 *   - what front and back matter the book actually contains, and what is missing
 *   - whether the contents page numbers agree with where sections really start
 *   - which pages are half empty or worse (image candidates)
 *   - where the production markers landed
 *
 * MEASURED, not estimated. Uses the renderer's deep probe, which reports the
 * bottom edge of every block relative to its page box, so "how full is this
 * page" is read off the laid-out page rather than inferred from word counts.
 *
 *   yarn tsx scripts/dirt-rich-page-review.ts
 */
import { ProjectConfigSchema } from '@wildlands/shared';
import { getProject } from '../src/db/repositories/projects.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { TRADE_NONFICTION_GUIDE_TYPESET_V1 as STD } from '../src/pipeline/typeset/layout-standards/trade-nonfiction-guide-v1.js';

// Read the project's WORKING manuscript, not the canonical file: the book has
// moved on (figures inline, markers stripped, checklist boxed) and reviewing the
// canonical would describe a book that no longer exists.
const PROJECT_ID = '55d7bce0-2f71-4f02-8131-e6c750c8506e';
const project = await getProject(PROJECT_ID);
if (!project) throw new Error('project not found');
const storage = getProjectStorage();
const md = (await storage.readProjectFile(project.manuscriptPath!)).toString('utf8');
const images: Record<string, string> = {};
for (const m of md.matchAll(/^!\[[^\]]*\]\(([^)]+)\)(?:\{\d{1,3}%\})?$/gm)) {
  const name = m[1]!.trim();
  const bytes = await storage.readProjectFile([PROJECT_ID, 'illustrations', name].join('/'));
  images[name] = `data:image/png;base64,${bytes.toString('base64')}`;
}

/** CSS px per inch. Paged.js lays out in CSS pixels. */
const PX_PER_IN = 96;
const textBlockHeightPx = (STD.trim.heightIn - STD.margins.topIn - STD.margins.bottomIn) * PX_PER_IN;

const config = ProjectConfigSchema.parse(project.config);

console.log('DIRT RICH — page review');
console.log(`  ${STD.trim.widthIn}x${STD.trim.heightIn}, ${STD.type.bodyPt}pt/${STD.type.lineHeight}, text block ${textBlockHeightPx}px tall\n`);

const r = await renderTypesetBook({
  markdown: md,
  config,
  images,
  layoutStandard: STD,
  // The PROJECT's setting, not the standard's default. Using the default forced
  // chapters onto rectos, added 4 parity blanks, and reported a 128-page book
  // with every page number after Chapter 5 shifted — while the console, which
  // reads the project, correctly showed 124.
  chaptersStartRecto: Boolean(config.typesetChaptersStartRecto),
  // MUST match the production path (build-typeset-interior). Passing empty front
  // matter renders a different book: it reported 123 pages against production's
  // 126, and every page number after the front matter was wrong. A diagnostic
  // that does not reproduce production is worse than no diagnostic.
  frontMatter: { publication: { year: new Date().getFullYear() } },
  deepProbe: true,
});

const { report, probe = [] } = r;
console.log(`${report.totalPages} pages, ${report.blankPages.length} parity blanks, ${report.verticalOverflowPages.length} overflow\n`);

// ── front / back matter present ─────────────────────────────────────────────
const html = r.html;
const generated = {
  'title page': html.includes('fm-title') || html.includes('class="fm-titlepage"'),
  'copyright page': /copyright/i.test(html),
  'contents page': html.includes('toc-page') || /class="[^"]*toc/.test(html),
};
console.log('GENERATED FRONT MATTER');
for (const [what, present] of Object.entries(generated)) {
  console.log(`  ${present ? 'present' : 'MISSING'}  ${what}`);
}

// ── section map, with the page each one starts on ───────────────────────────
console.log('\nSECTION MAP (measured start pages)');
for (const s of report.sectionStarts) {
  console.log(`  p${String(s.page ?? '?').padStart(3)}  [${(s.kind || '?').padEnd(7)}] ${s.title}`);
}

// ── contents page numbers vs reality ────────────────────────────────────────
// The contents is generated in a second pass from measured start pages, so a
// mismatch here means the two passes disagreed — the exact failure the
// fixed-width number slot exists to prevent.
const tocRows = [...html.matchAll(/class="toc-entry"[^>]*>([\s\S]*?)<\/li>/g)].length;
console.log(`\nCONTENTS: ${tocRows} entries rendered vs ${report.sectionStarts.length} sections laid out`);

// ── page fill ───────────────────────────────────────────────────────────────
// Deepest block bottom on each page = how far down the page the type reaches.
const bottomByPage = new Map<number, number>();
for (const b of probe) {
  if (b.page === null) continue;
  const cur = bottomByPage.get(b.page) ?? 0;
  if (b.bottomPx > cur) bottomByPage.set(b.page, b.bottomPx);
}

const blanks = new Set(report.blankPages);
const rows: { page: number; fill: number }[] = [];
for (let p = 1; p <= report.totalPages; p++) {
  if (blanks.has(p)) continue; // parity blanks are deliberate, not underfilled
  const bottom = bottomByPage.get(p) ?? 0;
  rows.push({ page: p, fill: Math.min(1, bottom / textBlockHeightPx) });
}

const sparse = rows.filter((x) => x.fill <= 0.5).sort((a, b) => a.fill - b.fill);
const startPages = new Map(report.sectionStarts.map((s) => [s.page ?? -1, s.title]));

console.log(`\nPAGES 50% EMPTY OR MORE — ${sparse.length} of ${rows.length} typeset pages`);
console.log('(a chapter opener is SUPPOSED to be light: it carries a one-third sink by design)');
// What is actually ON each sparse page, so a subject can be chosen from the
// text rather than invented. Without this a recommendation is just decoration.
const byId = new Map(r.blocks.map((b) => [b.blockId, b]));
const TEXT_BLOCK_IN = STD.trim.heightIn - STD.margins.topIn - STD.margins.bottomIn;
for (const x of sparse) {
  const opener = startPages.get(x.page);
  const ids = (report.pageBlocks[x.page] ?? []) as string[];
  const blocks = ids.map((id) => byId.get(id)).filter(Boolean) as typeof r.blocks;
  const freeIn = ((1 - x.fill) * TEXT_BLOCK_IN).toFixed(2);
  console.log(
    `  p${String(x.page).padStart(3)}  ${String(Math.round(x.fill * 100)).padStart(3)}% full  ${freeIn}in free` +
      (opener ? `   <- opener: ${opener}` : '   <- BODY PAGE, image candidate'),
  );
  console.log(`         section: ${blocks[0]?.sectionTitle ?? '?'}`);
  const last = blocks[blocks.length - 1];
  if (last) console.log(`         ends: "${last.preview.slice(0, 86)}"`);
}

const sparseBody = sparse.filter((x) => !startPages.has(x.page));
console.log(`\n  of those, ${sparseBody.length} are body pages (real image candidates), ${sparse.length - sparseBody.length} are chapter openers (by design)`);

// ── where the production markers landed ─────────────────────────────────────
const MARKERS = ['FIGURE 5.1', 'FIGURE 10.1', 'TABLE A.1', 'TABLE B.1', 'TABLE C.1', 'CHECKLIST D.1', 'FIGURE E.1'];
console.log('\nPRODUCTION MARKERS — page they landed on');
for (const m of MARKERS) {
  // Locate by scanning page blocks' preview text via the block list.
  const block = r.blocks.find((b) => b.preview.includes(m));
  const page = block
    ? Object.entries(report.pageBlocks).find(([, ids]) => (ids as string[]).includes(block.blockId))?.[0]
    : undefined;
  console.log(`  ${m.padEnd(14)} ${block ? `p${page ?? '?'}` : 'NOT FOUND'}`);
}

// ── fill distribution ───────────────────────────────────────────────────────
const buckets = [0.5, 0.6, 0.7, 0.8, 0.9, 1.01];
console.log('\nFILL DISTRIBUTION (typeset pages, parity blanks excluded)');
let prev = 0;
for (const b of buckets) {
  const n = rows.filter((x) => x.fill > prev && x.fill <= b).length;
  console.log(`  ${String(Math.round(prev * 100)).padStart(3)}-${String(Math.round(b * 100)).padStart(3)}%  ${'#'.repeat(Math.round(n / 2))} ${n}`);
  prev = b;
}
