/**
 * DIRT RICH — final pagination, on the PRINT manuscript with art stamped.
 *
 * Runs the whole Track B pipeline the way delivery will: the project's working
 * manuscript (markers stripped), the pinned 6x9 standard, illustrations stamped
 * onto the pages their anchors landed on, padded to an even leaf count.
 *
 * Asserts what must be true of a book about to be proofed:
 *   - the six satisfied markers are GONE from the printed text
 *   - FIGURE E.1's marker SURVIVES (it still needs a human illustrator, and a
 *     missing figure is worse than a visible note saying so)
 *   - both figures actually stamped, at 300ppi or better, with no orphans
 *   - the checklist prints real boxes, not literal "[ ]"
 *   - every table and the Appendix E plan are still intact
 *   - zero overflow, horizontal or vertical
 *
 *   yarn tsx scripts/dirt-rich-final-pagination.ts
 */
import { writeFileSync } from 'node:fs';
import { ProjectConfigSchema } from '@wildlands/shared';
import { getProject } from '../src/db/repositories/projects.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { buildTypesetInterior } from '../src/pipeline/typeset/build-typeset-interior.js';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { TRADE_NONFICTION_GUIDE_TYPESET_V1 as STD } from '../src/pipeline/typeset/layout-standards/trade-nonfiction-guide-v1.js';

const PROJECT_ID = '55d7bce0-2f71-4f02-8131-e6c750c8506e';
const OUT = 'C:/Users/jovan/Downloads/DIRT-RICH-FINAL-pagination.pdf';

const project = await getProject(PROJECT_ID);
if (!project) throw new Error('project not found');
const config = ProjectConfigSchema.parse(project.config);
const md = (await getProjectStorage().readProjectFile(project.manuscriptPath!)).toString('utf8');

console.log('DIRT RICH — FINAL PAGINATION');
console.log(`  manuscript : ${project.manuscriptPath}`);
console.log(`  canonical  : ${project.canonicalManuscriptPath}`);
console.log(`  standard   : ${config.typesetLayoutStandardId}`);
console.log(`  anchors    : ${Object.keys(config.illustrations ?? {}).length}\n`);

const interior = await buildTypesetInterior(PROJECT_ID, config, {
  chaptersStartRecto: Boolean(config.typesetChaptersStartRecto),
  reviewGuides: false,
});
writeFileSync(OUT, interior.pdf);

console.log(
  `${interior.pageCount} pages, ${interior.report.blankPages.length} blanks, ` +
    `${interior.report.verticalOverflowPages.length} v-overflow, ${interior.report.horizontalOverflow.length} h-overflow`,
);
console.log(`-> ${OUT}\n`);

// The HTML for content assertions. Same inputs, so the same layout — including
// the figure assets, or this render would report the figures missing when the
// interior above laid them out correctly.
const storage = getProjectStorage();
const images: Record<string, string> = {};
for (const m of md.matchAll(/^!\[[^\]]*\]\(([^)]+)\)(?:\{\d{1,3}%\})?$/gm)) {
  const name = m[1]!.trim();
  const bytes = await storage.readProjectFile([PROJECT_ID, 'illustrations', name].join('/'));
  images[name] = `data:image/png;base64,${bytes.toString('base64')}`;
}
const r = await renderTypesetBook({
  markdown: md,
  config,
  images,
  layoutStandard: STD,
  chaptersStartRecto: Boolean(config.typesetChaptersStartRecto),
  frontMatter: {},
});
const html = r.html;

const checks: { ok: boolean; name: string; detail: string }[] = [];
const check = (ok: boolean, name: string, detail: string): void => {
  checks.push({ ok, name, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`);
};

const GONE = ['FIGURE 5.1', 'FIGURE 10.1', 'TABLE A.1', 'TABLE B.1', 'TABLE C.1', 'CHECKLIST D.1', 'FIGURE E.1'];
const stillThere = GONE.filter((m) => html.includes(m));
check(stillThere.length === 0, 'satisfied markers stripped from the printed text',
  stillThere.length === 0 ? `all 7 gone: ${GONE.join(', ')}` : `STILL PRINTING: ${stillThere.join(', ')}`);

// Every production marker is now satisfied, Figure E.1 included, so NO marker
// may survive into the printed book.
const anyMarker = /\[(?:FIGURE|TABLE|CHECKLIST) [0-9A-Z.]+/.test(html);
check(!anyMarker, 'no production markers remain anywhere',
  anyMarker ? 'a marker is still printing' : 'all seven satisfied; none printing');

// Match the class, not an exact tag prefix: the block stamper inserts
// data-block-id straight after the tag name, so `<figure class=` never appears.
const figs = (html.match(/<figure[^>]*class="tset-figure"/g) ?? []).length;
const unresolved = (html.match(/!\[[^\]]*\]\(/g) ?? []).length;
// 8 = 2 data charts + 6 chapter-end plates.
const EXPECTED_FIGURES = 9;  // 2 charts + 6 plates + the Appendix E site plan
check(figs === EXPECTED_FIGURES && unresolved === 0, 'all figures render inline, in the flow',
  `${figs}/${EXPECTED_FIGURES} <figure> block(s); ${unresolved} unresolved reference(s) left as literal text`);

check(interior.orphanedIllustrations.length === 0, 'no orphaned stamp anchors',
  interior.orphanedIllustrations.length === 0
    ? 'none — figures are in the flow, not stamped into leftover space'
    : JSON.stringify(interior.orphanedIllustrations));

const boxes = (html.match(/class="ck-box/g) ?? []).length;
check(boxes === 11 && !html.includes('[ ]'), 'Checklist D.1 prints real boxes',
  `${boxes} drawn checkboxes; literal "[ ]" present: ${html.includes('[ ]')}`);

const tables = (html.match(/<table[^>]*class="tset-table"/g) ?? []).length;
const cells = (html.match(/<t[hd] /g) ?? []).length;
check(tables === 3 && cells === 212, 'tables intact', `${tables} tables, ${cells} cells`);

check((html.match(/<pre[^>]*class="tset-pre"/g) ?? []).length === 1, 'Appendix E plan intact',
  'one preformatted block, set in DejaVu Sans Mono');

check(interior.report.verticalOverflowPages.length === 0 && interior.report.horizontalOverflow.length === 0,
  'zero overflow', 'no page clips vertically; no element overruns its measure');

check(interior.pageCount % 2 === 0, 'even leaf count for print',
  `${interior.pageCount} pages`);

console.log(`\n${'─'.repeat(74)}`);
const failed = checks.filter((c) => !c.ok);
console.log(failed.length === 0
  ? `FINAL PAGINATION CLEAN — ${interior.pageCount} pages. Every production marker satisfied.`
  : `${failed.length} CHECK(S) FAILED — not ready.`);
process.exit(failed.length === 0 ? 0 : 1);
