/**
 * Local layout exceptions for 7 NATIONAL PARKS, keyed by stable block id.
 *
 * The rule this file follows is the platform's own:
 *
 *     systemic defect -> fix the layout standard
 *     isolated defect -> local override
 *     manuscript      -> frozen, always
 *
 * A page-by-page read of the printed proof found five one-line widows and two
 * headings sitting above a single line. Both classes were first attempted as
 * systemic rules and both were reverted: binding every heading to two paragraphs
 * fixed the two headings, added two pages, and reshuffled breaks elsewhere in
 * the book. Two headings out of roughly a hundred is not a systemic defect. It
 * is seven exceptions, and this is where exceptions live.
 *
 * WHY THESE TWO CONTROLS
 *   keepTogether on a widowed paragraph moves the WHOLE paragraph over rather
 *   than leaving its last line alone at the top of a page. Paged.js honours
 *   break-inside; it ignores the `widows` property entirely, which is why the
 *   standard already declaring `widows: 2` changed nothing.
 *
 *   breakBefore: page on a heading unit moves the heading and its text to the
 *   next page rather than leaving the heading with one line beneath it. The
 *   heading and its first paragraph are already one indivisible unit, so there
 *   is nothing left for keepTogether to do.
 *
 *   npx tsx scripts/national-parks-layout-overrides.ts --dry-run
 *   npx tsx scripts/national-parks-layout-overrides.ts
 */
import type { LayoutOverride } from '@wildlands/shared';

await import('../src/env.js');
const DRY = process.argv.includes('--dry-run');

const { P } = await import('./_project.js');
const { ProjectConfigSchema } = await import('@wildlands/shared');
const { getProject, updateProjectConfig } = await import('../src/db/repositories/projects.repo.js');

/**
 * Block ids come from `report.pageBlocks` on the build being corrected, never
 * from a page number typed in by hand — pagination has already moved four times
 * on this book and a page-keyed exception would silently re-point at unrelated
 * text.
 */
const OVERRIDES: Record<string, LayoutOverride> = {
  // ── Five one-line widows: the paragraph moves whole ──────────────────────
  /**
   * NOT FORCED, and deliberately so.
   *
   * "Selection runs about one in five" is a single sentence that already fits on
   * one line. It was never a widow — it is a WHOLE short paragraph that happened
   * to land alone at the top of a page, which looks the same to a reader and is
   * a different thing to a typesetter. keepTogether has nothing to hold.
   *
   * The control that does work is `break-before: avoid`, and it was measured:
   * it fixes the page and costs TWO more pages and a sixth parity blank, because
   * forcing the break earlier cascades. Trading two blank leaves for one tidy
   * page top is not an improvement to the book, so it stays as it is and is
   * reported rather than hidden.
   */
  '7f4b3917': { keepTogether: true, note: 'p75: whole one-line paragraph alone at a page top. Left as-is; break-before:avoid costs 2 pages and a 6th blank.' },
  /**
   * bf8a8ea6 is NOT here. That p77 widow was fixed by the re-pagination the
   * heading rule caused, and its block id no longer exists in the document, so
   * carrying the override forward only produced an "orphaned override" warning
   * on every build. An override that points at nothing is a lie about what the
   * book needs; the audit confirms the widow is gone.
   */
  '4f665a70': { keepTogether: true, note: 'p87 widow: paragraph tail alone at the page top.' },
  '8f99ddd3': { keepTogether: true, note: 'p92 widow: "hour out and served by the national carriers." was alone at the page top.' },
  '7f9b5d43': { keepTogether: true, note: 'p94 widow: paragraph tail alone at the page top.' },
  /**
   * APPENDIX: the Acadia permit entry was splitting across the leaf.
   *
   * The restructured appendix sets each park as a bold name followed by a
   * What/When/Cost/Where list. Those are separate blocks, so nothing binds the
   * name to its own bullets, and Acadia landed as the last line of p115 with its
   * four bullets overleaf. A reader turning that page meets four unlabelled
   * facts.
   *
   * Only one park of the seven broke, so this is an exception rather than a rule
   * change. `breakBefore: page` costs about one line of white at the foot of
   * p115, which is the cheapest correct fix available.
   */
  '40abccae': { breakBefore: 'page', note: 'Appendix: keep the Acadia permit entry whole; its name was stranded at the foot of p115.' },
  /**
   * CHAPTER 8'S CLOSING PARAGRAPH GETS ITS OWN PAGE, so its plate has one.
   *
   * A typeset change tightened the book from 120 pages to 118. Two of those
   * pages were the tail of Yosemite's closing passage and the parity blank
   * behind it, and they were carrying artwork: the Yosemite chapter-end plate
   * sat on the first and the Rocky Mountain frontispiece on the second. With
   * the pages gone the plates had nowhere to go, and the stamper dropped both
   * rather than clip them -- silently, because a plate that does not fit is not
   * an error, it is a placement that no longer holds.
   *
   * Removing a blank page is right when it is blank. These were not: they were
   * illustrated, and the illustrations are approved. So the break comes back.
   *
   * ONE override restores both. Pushing this paragraph to a new page gives the
   * Yosemite plate the page it is anchored to, and moves Chapter 9's opening
   * onto the next recto -- which puts the parity blank back in front of it, and
   * the Rocky Mountain frontispiece is anchored to that chapter opening at
   * offset -1, so it lands there again on its own.
   *
   * `breakBefore` rather than a bigger placement or a smaller plate: the art is
   * approved at its size and the page count is the thing being restored, not
   * worked around.
   */
  '22904bd9': { breakBefore: 'page', note: "Ch8 coda to its own page, restoring the Yosemite plate's page and the parity blank that carries the Rocky Mountain frontispiece." },
  /**
   * THE YELLOWSTONE SAFETY PANEL, ON ITS OWN PAGE.
   *
   * It broke across pp49-50 with only 0.92in spilling onto the second leaf, so
   * the reader met a closed box at the foot of one page and an unlabelled
   * fragment of another at the head of the next.
   *
   * `keepTogether` alone was the cheaper repair and it is not available here.
   * Moving the panel whole to p50 pushes 2.26in down the rest of the chapter,
   * and the space that absorbs it is the chapter-end white on p53 where the
   * Yellowstone closing plate sits. Measured: p53 drops to 1.13in of free
   * region against a plate that needs 4.05in, and the build refuses the plate.
   *
   * So the panel takes a page of its own. That costs a leaf and it does not
   * disturb where the chapter's own art sits, which the cheaper option would
   * have destroyed. The panel fills 41% of the text block, so the page carries
   * an illustration under it — see the Yellowstone distances plate.
   */
  'b526d11d': { breakBefore: 'page', breakAfter: 'page', note: 'Ch6 NOBODY WARNED ME (distances) alone on its page; it split across pp49-50 and keepTogether alone would have cost the p53 plate.' },
  /**
   * THE ROCKY MOUNTAIN SAFETY PANEL, KEPT WHOLE.
   *
   * NOBODY WARNED ME on afternoon thunderstorms above treeline broke across
   * pp87-88, and the two halves each drew a complete four-sided box, so the
   * spread showed two separate panels instead of one continuing. The
   * continuation also carries no label, so the second box read as an unlabelled
   * quote of its own. On a panel whose subject is a storm that kills people
   * above treeline, that is the wrong thing to be ambiguous about.
   *
   * Pinned HERE rather than by flipping `keepTogether` on the standard.
   * Book-wide was tried and measured: every panel that starts low then moves
   * whole to the next leaf and pushes about three inches down the rest of its
   * chapter. In chapters 6 and 9 that space is the chapter-end white the
   * closing plates sit in, and the build correctly refused two of the fifteen
   * plates that no longer fit. One panel, pinned, costs one chapter.
   *
   * `keepTogether` rather than `breakBefore`: break-inside lets the panel stay
   * where it is whenever it fits, and move only when it would otherwise split.
   * A hard break would push it to a new page even on the pages where there was
   * never a problem.
   */
  'fdfaae85': { keepTogether: true, note: 'Ch9 NOBODY WARNED ME (afternoon storms) kept whole; it split across pp87-88 and drew two closed boxes.' },
  /**
   * The two heading orphans are NOT here any more.
   *
   * They were fixed with `breakBefore: page`, which moved each heading to the
   * next page and left the page behind it two-thirds empty — a worse mark on the
   * spread than the defect. They are handled in the renderer instead, by binding
   * a heading to two LINES of body rather than to one block, which is the actual
   * rule and leaves no hole.
   */
};

const project = await getProject(P);
if (!project) throw new Error(`project ${P} not found`);
const config = ProjectConfigSchema.parse(project.config);

const before = Object.keys(config.layoutOverrides ?? {}).length;
const next = { ...config, layoutOverrides: { ...(config.layoutOverrides ?? {}), ...OVERRIDES } };

console.log(`project   : ${P}`);
console.log(`overrides : ${before} -> ${Object.keys(next.layoutOverrides).length}\n`);
for (const [id, o] of Object.entries(OVERRIDES)) {
  const what = [
    o.keepTogether ? 'keepTogether' : '',
    o.breakBefore ? `breakBefore:${o.breakBefore}` : '',
    o.breakAfter ? `breakAfter:${o.breakAfter}` : '',
  ].filter(Boolean).join(' + ');
  console.log(`  ${id}  ${what.padEnd(18)} ${o.note ?? ''}`);
}

if (DRY) {
  console.log('\nDRY RUN — nothing written.');
  process.exit(0);
}
await updateProjectConfig(P, ProjectConfigSchema.parse(next));
console.log('\nwritten. Rebuild the interior, then check that nothing new was pushed out of place.');
process.exit(0);
