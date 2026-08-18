/**
 * Re-anchor the figures to blocks that actually have room beneath them.
 *
 * The stamper draws art BELOW the last line of its anchor block, inside the safe
 * region. Both figures were anchored to their authored lead-in paragraph, which
 * is where they belong editorially — but those paragraphs happened to land near
 * the foot of a page (0.24in of space on p85, NEGATIVE on p38), so a 3.13in
 * figure could not fit and the stamper correctly refused rather than printing
 * art off the page.
 *
 * So: walk FORWARD in reading order from the intended spot and take the first
 * block with enough clear space under it. That keeps the figure as close to its
 * lead-in as the page allows, which is the honest trade — a figure one page
 * later still reads as belonging to that passage; a figure over the trim does
 * not print at all.
 *
 *   yarn tsx scripts/dirt-rich-fix-figure-anchors.ts           # dry run
 *   yarn tsx scripts/dirt-rich-fix-figure-anchors.ts --write
 */
import { ProjectConfigSchema, type PageIllustration } from '@wildlands/shared';
import { getProject, updateProjectConfig } from '../src/db/repositories/projects.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { TRADE_NONFICTION_GUIDE_TYPESET_V1 as STD } from '../src/pipeline/typeset/layout-standards/trade-nonfiction-guide-v1.js';

const PROJECT_ID = '55d7bce0-2f71-4f02-8131-e6c750c8506e';
const WRITE = process.argv.includes('--write');
const PX_PER_IN = 96;
const TEXT_BLOCK_PX = (STD.trim.heightIn - STD.margins.topIn - STD.margins.bottomIn) * PX_PER_IN;
/** Gap between the last line of type and the top of the art. */
const ART_GAP_IN = 0.18;

const project = await getProject(PROJECT_ID);
if (!project) throw new Error('project not found');
const config = ProjectConfigSchema.parse(project.config);
const md = (await getProjectStorage().readProjectFile(project.manuscriptPath!)).toString('utf8');

const r = await renderTypesetBook({
  markdown: md,
  config,
  layoutStandard: STD,
  chaptersStartRecto: Boolean(config.typesetChaptersStartRecto),
  frontMatter: {},
  deepProbe: true,
});
const probe = r.probe ?? [];

/** Deepest point of each block, and the page it ended on (last fragment). */
const blockGeom = new Map<string, { page: number; bottomPx: number }>();
for (const b of probe) {
  if (b.page === null) continue;
  const cur = blockGeom.get(b.blockId);
  if (!cur || b.page > cur.page || (b.page === cur.page && b.bottomPx > cur.bottomPx)) {
    blockGeom.set(b.blockId, { page: b.page, bottomPx: b.bottomPx });
  }
}

/** Reading order, so "forward" means "later in the book". */
const order = r.blocks.map((b) => b.blockId);

/** The block that sits lowest on each page — the only valid stamp anchor. */
const pageFloor = new Map<number, string>();
{
  const deepest = new Map<number, number>();
  for (const [id, g] of blockGeom) {
    const d = deepest.get(g.page);
    if (d === undefined || g.bottomPx > d) {
      deepest.set(g.page, g.bottomPx);
      pageFloor.set(g.page, id);
    }
  }
}

const current = config.illustrations ?? {};
const next: Record<string, PageIllustration> = {};

for (const [oldId, art] of Object.entries(current)) {
  const neededIn = art.placementHeightIn + ART_GAP_IN;
  const neededPx = neededIn * PX_PER_IN;
  const startIdx = Math.max(0, order.indexOf(oldId));

  // The space available is what is left at the FOOT OF THE PAGE, not what is
  // left under the anchor paragraph — text carries on below it. Measuring from
  // the anchor was wrong and disagreed with the stamper by six inches: it
  // reported 6.64in free where the real safe region was 0.14in.
  //
  // So the anchor must be the LAST block on its page, and that page must end
  // early enough to fit the art.
  let chosen: { id: string; page: number; freeIn: number } | null = null;
  for (let i = startIdx; i < order.length; i++) {
    const id = order[i]!;
    const g = blockGeom.get(id);
    if (!g) continue;
    const isLastOnPage = pageFloor.get(g.page) === id;
    if (!isLastOnPage) continue;
    const freePx = TEXT_BLOCK_PX - g.bottomPx;
    if (freePx >= neededPx) {
      chosen = { id, page: g.page, freeIn: freePx / PX_PER_IN };
      break;
    }
  }

  const was = blockGeom.get(oldId);
  const wasFree = was ? (TEXT_BLOCK_PX - was.bottomPx) / PX_PER_IN : NaN;
  console.log(
    `${(art.subject ?? oldId).padEnd(12)} needs ${neededIn.toFixed(2)}in\n` +
      `   was  ${oldId} p${was?.page ?? '?'}  free ${wasFree.toFixed(2)}in  ${wasFree >= neededIn ? '(fits)' : '(DOES NOT FIT)'}`,
  );
  if (!chosen) {
    console.log('   no block in the rest of the book has room — figure would not print. Not writing.');
    process.exit(1);
  }
  const moved = chosen.id === oldId ? 'unchanged' : `moved ${(chosen.page - (was?.page ?? chosen.page))} page(s) later`;
  console.log(`   now  ${chosen.id} p${chosen.page}  free ${chosen.freeIn.toFixed(2)}in  ${moved}`);
  next[chosen.id] = art;
}

if (Object.keys(next).length !== Object.keys(current).length) {
  throw new Error('anchor count changed — refusing to write.');
}

if (!WRITE) {
  console.log('\nDRY RUN — nothing written.');
  process.exit(0);
}
await updateProjectConfig(PROJECT_ID, { ...config, illustrations: next });
console.log(`\nconfig updated: ${Object.keys(next).length} anchors re-pointed.`);
