/** Read-only: which page does each TSS passage land on? No files written. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ProjectConfigSchema } from '@wildlands/shared';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V4 } from '../src/pipeline/typeset/layout-standards/educational-nonfiction-v4.js';

const BOOK = 'C:/Users/jovan/Downloads/before-you-need-it';
const md = readFileSync(`${BOOK}/BEFORE-YOU-NEED-IT_FINAL.md`, 'utf8');
const sha = createHash('sha256').update(readFileSync(`${BOOK}/BEFORE-YOU-NEED-IT_FINAL.md`)).digest('hex');
if (sha !== 'b9cdbae4787f38f2052a5c4081306287d5ab7f116468a5871c74a87e5e959846') process.exit(2);

const S = EDUCATIONAL_NONFICTION_TYPESET_V4;
const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'Before You Need It',
  subtitle: "A Mother's Honest Guide to Periods, Puberty, and Everything Nobody Explains",
  authorName: 'Margo Teale',
  productionProfileId: 'bw-educational-nonfiction',
  trimSize: S.trim,
  typography: { bodyPt: S.type.bodyPt, lineHeight: S.type.lineHeight, headingFont: S.type.headingFont, bodyFont: S.type.bodyFont },
  typesetLayoutStandardId: S.id,
});

const r = await renderTypesetBook({
  markdown: md, config, layoutStandard: S,
  chaptersStartRecto: S.chaptersStartRecto, frontMatter: {},
});

const pageOf = new Map<string, number>();
for (const [page, ids] of Object.entries(r.report.pageBlocks)) for (const id of ids) pageOf.set(id, Number(page));

const NEEDLES = [
  ['SITE A heading  (Ch9 "Toxic shock, said once and properly")', 'Toxic shock, said once and properly'],
  ['SITE A speed para (Ch9)', 'So the rule is about how ill you feel'],
  ['SITE B heading  ("Tampons — the one that needs speed")', 'the one that needs speed'],
  ['SITE B speed para (back matter)', 'or simply feeling far worse than you can account for'],
  ['THIRD immediately site (adult-behaviour bullet)', "tell another adult"],
];
for (const [label, needle] of NEEDLES) {
  const i = r.html.indexOf(needle);
  if (i < 0) { console.log(`${label}: NOT FOUND`); continue; }
  const before = r.html.slice(0, i);
  const m = [...before.matchAll(/data-block-id="([^"]+)"/g)].pop();
  const id = m?.[1];
  console.log(`${label}: block ${id} -> page ${id ? (pageOf.get(id) ?? '?') : '?'}`);
}
console.log(`\ntotal pages ${r.report.totalPages}`);
process.exit(0);
