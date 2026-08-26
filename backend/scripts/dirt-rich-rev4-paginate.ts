/**
 * DIRT RICH Rev 4 — pagination proof.
 *
 * Renders the Rev 3 text and the Rev 4 candidate through the SAME engine, the
 * same pinned standard and the same assets, and reports both page counts.
 *
 * Baseline first, always. A corrected build that lands on 126 proves nothing
 * unless the unmodified text also lands on 126 in this harness — otherwise the
 * harness is being measured, not the wording. Rev 3's QA pass made exactly this
 * mistake once (it baselined the canonical manuscript, got 124 with zero
 * figures, and had to discard the run).
 *
 * ASSET NOTE: the manuscript references the `-v2` charts, which exist only in
 * production storage. They are resolved to the v1 files here. That is sound for
 * a pagination proof and not a shortcut: an image FILENAME sits inside an image
 * reference and does not participate in text flow, and both charts occupy the
 * same box. Rev 3 proved the same point by hash.
 *
 *   yarn tsx scripts/dirt-rich-rev4-paginate.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ProjectConfigSchema } from '@wildlands/shared';
import { PDFDocument } from 'pdf-lib';
import { getProject } from '../src/db/repositories/projects.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { TRADE_NONFICTION_GUIDE_TYPESET_V1 as STD } from '../src/pipeline/typeset/layout-standards/trade-nonfiction-guide-v1.js';
import { padInteriorToEven } from '../src/pipeline/typeset/pad-to-even.js';
import { resolvePaperbackSpine } from '../src/pipeline/publishing-standard/kdp-spec.js';

const PROJECT_ID = '55d7bce0-2f71-4f02-8131-e6c750c8506e';
const DIR = 'C:/Users/jovan/Downloads/dirt rich book';
const BASELINE = `${DIR}/QA-ONLY-corrected-on-REV2-NOT-CANONICAL.md`;
const CANDIDATE = `${DIR}/REV4-CANDIDATE-working-manuscript.md`;
const OUT = `${DIR}/REV4-CANDIDATE-pagination-proof.pdf`;

/** Production-only assets, resolved to their v1 equivalents for the probe. */
const ASSET_ALIASES: Record<string, string> = {
  'figure-5-1-cost-per-dozen-v2.png': 'figure-5-1-cost-per-dozen.png',
  'figure-10-1-hours-per-week-v2.png': 'figure-10-1-hours-per-week.png',
};

const project = await getProject(PROJECT_ID);
if (!project) throw new Error('project not found');
const config = ProjectConfigSchema.parse(project.config);
const storage = getProjectStorage();

const loadImages = async (markdown: string): Promise<Record<string, string>> => {
  const images: Record<string, string> = {};
  for (const m of markdown.matchAll(/^!\[[^\]]*\]\(([^)]+)\)(?:\{\d{1,3}%\})?$/gm)) {
    const name = m[1]!.trim();
    const file = ASSET_ALIASES[name] ?? name;
    const bytes = await storage.readProjectFile([PROJECT_ID, 'illustrations', file].join('/'));
    const mime = file.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    images[name] = `data:${mime};base64,${bytes.toString('base64')}`;
  }
  return images;
};

const build = async (label: string, path: string) => {
  const markdown = readFileSync(path, 'utf8');
  const images = await loadImages(markdown);
  const result = await renderTypesetBook({
    markdown,
    config,
    images,
    layoutStandard: STD,
    chaptersStartRecto: Boolean(config.typesetChaptersStartRecto),
    frontMatter: { publication: { year: 2026 } },
  });
  // The DELIVERED count is the padded one. `renderTypesetBook` returns raw
  // typeset pages; delivery runs `padInteriorToEven` last, because a print block
  // must be an even number of pages and KDP otherwise adds the leaf itself and
  // silently invalidates the spine. Rev 3's "125 + 1 = 126" is exactly this.
  // Measured here rather than reasoned about, so the number is the printer's.
  const raw = (await PDFDocument.load(result.pdf)).getPageCount();
  const padded = await padInteriorToEven(result.pdf);
  const r = result.report;
  console.log(
    `${label.padEnd(9)} typeset ${String(raw).padStart(3)}  + pad ${padded.added ? 1 : 0}  ` +
      `= DELIVERED ${String(padded.pageCount).padStart(3)}   ` +
      `v-overflow ${r.verticalOverflowPages.length}   h-overflow ${r.horizontalOverflow.length}   ` +
      `figures ${Object.keys(images).length}`,
  );
  if (r.verticalOverflowPages.length) console.log(`          v-overflow on: ${r.verticalOverflowPages.join(', ')}`);
  return { pages: padded.pageCount, raw, pdf: padded.pdf, result, images };
};

console.log('DIRT RICH — Rev 4 pagination proof');
console.log(`standard : ${config.typesetLayoutStandardId}`);
console.log(`trim     : ${config.trimSize.widthIn} x ${config.trimSize.heightIn} in\n`);

const base = await build('BASELINE', BASELINE);
const cand = await build('REV 4', CANDIDATE);
writeFileSync(OUT, cand.pdf);
// Also write the baseline, so 'did MY EDITS change this page?' can be separated
// from 'does this harness differ from the production build?'.
writeFileSync(`${DIR}/REV4-BASELINE-harness-proof.pdf`, base.pdf);

console.log('\nRESULT');
if (base.pages !== 126) {
  console.log(`  HARNESS SUSPECT — baseline should reproduce 126, produced ${base.pages}.`);
  console.log('  The comparison below measures the harness, not the wording. Do not act on it.');
} else {
  console.log('  baseline reproduces the approved 126 delivered pages, so the harness is faithful');
}
console.log(`  Rev 4 candidate: ${cand.pages} pages (${cand.pages === base.pages ? 'UNCHANGED' : `MOVED by ${cand.pages - base.pages}`})`);

// The 0.06in floor this used to apply is gone: it was never KDP, and it only
// engaged below 24 pages on cream. This book is 126.
const spineIn = (n: number): number =>
  resolvePaperbackSpine({ ink: 'BLACK_AND_WHITE', paper: 'CREAM', trim: '6x9', pageCount: n }).spineIn;
if (cand.pages !== base.pages) {
  console.log(`\n  SPINE IMPACT: ${spineIn(base.pages).toFixed(3)}in -> ${spineIn(cand.pages).toFixed(3)}in`);
  console.log('  The approved cover must be recomposed. Artwork is unchanged; geometry only.');
} else {
  console.log(`  spine unchanged at ${spineIn(cand.pages).toFixed(3)}in — the approved cover still fits`);
}

console.log(`\n-> ${OUT}`);
process.exit(0);
