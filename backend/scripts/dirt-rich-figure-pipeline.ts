/**
 * The DIRT RICH figure pipeline, formalized — canonical manuscript to the exact
 * working manuscript the approved 126-page interior was typeset from.
 *
 * ─── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * The approved book was NOT produced by intake. Intake sanitizes the canonical
 * source and stores that; the working manuscript was then OVERWRITTEN by a
 * sequence of figure scripts, one stage of which was never a script at all —
 * the Appendix E site plan was substituted by hand. So "take the canonical
 * manuscript in and typeset it" reproduces a different, figure-less book.
 *
 * Reconstructing that chain after the fact cost a full investigation. Anyone
 * repeating it on another target — production, a reprint, a second edition —
 * would have to repeat the investigation, and would have no way to know when
 * they had got it right. This script makes the chain executable and, more
 * importantly, CHECKED: every stage is compared against the hash the approved
 * book actually came from, and a mismatch aborts before anything is uploaded or
 * rendered.
 *
 * ─── WHY THE TRANSFORMS ARE RESTATED HERE ────────────────────────────────
 * The stage 1 and 2 logic is lifted verbatim from `dirt-rich-inline-figures.ts`
 * and `dirt-rich-place-interiors.ts`, which remain the historical record of what
 * was run. Restating them was preferred over importing, because those scripts
 * write to the database and object storage at module scope and cannot be loaded
 * without doing so. The copy is not taken on trust: if this file drifts from
 * them by even one character, the stage hashes below stop matching and the run
 * fails. Equivalence is asserted, not assumed.
 *
 * ─── SCOPE ────────────────────────────────────────────────────────────────
 * Reads the canonical manuscript and the illustration assets. Writes at most one
 * file, and only when `--out` is given. Never touches the database, object
 * storage, the renderer, the layout standard, or any approved artifact.
 *
 *   yarn tsx scripts/dirt-rich-figure-pipeline.ts --canonical "<path>"
 *   yarn tsx scripts/dirt-rich-figure-pipeline.ts --canonical "<path>" --out "<temp.md>"
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const optionValue = (name: string): string | undefined => {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  const next = i >= 0 ? argv[i + 1] : undefined;
  return next && !next.startsWith('--') ? next : undefined;
};

const CANONICAL = optionValue('canonical') ?? process.env.WL_MANUSCRIPT ?? '';
const OUT = optionValue('out');
const ASSET_DIR =
  optionValue('assets') ??
  'C:/Users/jovan/Downloads/wildlands agents platform/backend/backend/storage/55d7bce0-2f71-4f02-8131-e6c750c8506e/illustrations';

/**
 * Stage hashes, measured from the artifacts the approved interior was built
 * from. These are checkpoints, not preferences: `0376567e` is the manuscript
 * that produced the 126-page block whose spine is printed into an approved
 * cover, so a stage that stops matching means the book has changed.
 */
const STAGE_SHA = {
  canonical: 'bc27f4d50bb22be1eb4d0f4d83fa4041d97983cbbabc91077e496ee2205b358c',
  inlineFigures: 'a12b3edff82128548ccbbff4b35d596df43200a7f4c3210f1f7cc47de0d7e304',
  interiorPlates: '2639524595103d7822e48158ee2eda21aa3d5f48298716e9168e03032d09711a',
  working: '5e127f11ec3c627b5435f3d6f16eeb3f14a12598639baa1a381c89b3e0e3aa69',
} as const;

/**
 * REVISION 1, retained rather than overwritten.
 *
 * Rev 1 shipped two data charts that disagreed with the manuscript: Figure 5.1's
 * bar was labelled $20.30 on an axis that stopped at $20, and Figure 10.1 drew
 * April/May as 6-12 where the source says 6-10 while July/August ran off the top
 * of the plot. Rev 2 replaces both with deterministically drawn charts.
 *
 * The figures were given NEW KEYS rather than new bytes under the old ones. The
 * storage layer caches reads on the stated assumption that project files are
 * immutable, so replacing bytes at an existing key is invisible to the renderer:
 * the Rev 2 assets were uploaded, verified in the bucket by hash, and the very
 * next render still embedded the Rev 1 images at their old dimensions while
 * reporting 126 pages, no overflow and PRINT_READY. Nothing failed. Versioned
 * identities honour that contract instead of fighting it.
 *
 *   canonical      bc27f4d5  (unchanged - same source manuscript)
 *   inlineFigures  a00d8107
 *   interiorPlates 7be864f9
 *   working        0376567e  -> interior f9f5f2b5, the approved Rev 1 book
 */
const REV1_STAGE_SHA = {
  inlineFigures: 'a00d81078d38ca5d31ddd3d9539ba56cad379de6a5481e599ecc713717ebd7f7',
  interiorPlates: '7be864f99e80dd71b400fd130f9e39265d41b67178ce901bcd6fb495e9132c72',
  working: '0376567eecc0576fb9932511dcb79648530948e8c1d35d79dc3684ed4657405d',
} as const;
void REV1_STAGE_SHA;

/** Every asset the finished manuscript references, with the bytes it must be. */
const ASSETS: Record<string, string> = {
  'p13-soil-profile.png': '225782897bd75cc0ddb08584fb067fb1b559c9eca8eb63fefcc04167b3511a7f',
  'p21-raised-bed.png': '305053c0e8e2a8344a84da2ea4f62609e44896f1ddf1ba316221225ad0c87eed',
  'figure-5-1-cost-per-dozen-v2.png': '44a8212406dd9537a5d708ae639592074ebbba55188161c59dcbd401418399b0',
  'p47-coop-dusk.png': 'af9ba6e93a83ca48b1b1a61a2b4a6cd24af58594bbaa2ce88fb96d2132d7d963',
  'p57-zucchini.png': 'd64f218ec4ef6e1ad661adeae4bce6a3937ff3b3f2713effd5bf9c071ea5c2f0',
  'p83-january-garden.png': '287ea5c543439877666ffda1b03924bb589621b38716f956dea94d20130b6754',
  'figure-10-1-hours-per-week-v2.png': '532da3ec7e10b0dcc7cfa6647f9c67d8af109bdf466eca0871543d9fdd92ec21',
  'p99-quarter-acre.png': 'f863e8091093fdf79687e5833885741d96c3e5ff02369a4915e06cd9f4f86729',
  'figure-E-1-site-plan.svg': '40e4bab171ea446cf4a13956d72dda4a1e1e48738b8fabbdb21df65f953d591f',
};

const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** A marker paragraph: `> **[FIGURE 5.1 — CHART]** ...` */
const markerTag = (line: string): string | null => {
  const m = /^>\s*\*\*\[([A-Z]+ [0-9A-Z.]+)/.exec(line.trim());
  return m ? m[1]! : null;
};

// ── stage 1 — from dirt-rich-inline-figures.ts ───────────────────────────
const FIGURES: Record<string, { asset: string; caption: string }> = {
  'FIGURE 5.1': {
    asset: 'figure-5-1-cost-per-dozen-v2.png',
    caption: '**Figure 5.1.** What a dozen backyard eggs actually cost.',
  },
  'FIGURE 10.1': {
    asset: 'figure-10-1-hours-per-week-v2.png',
    caption: '**Figure 10.1.** Hours per week, by month. A floating bar is a range, not an average.',
  },
};
/** Set by the renderer itself — the marker simply goes. */
const DROP = ['TABLE A.1', 'TABLE B.1', 'TABLE C.1', 'CHECKLIST D.1'];

export function inlineFigures(canonical: string): string {
  const out: string[] = [];
  const lines = canonical.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const tag = markerTag(lines[i]!);
    if (tag && FIGURES[tag]) {
      const f = FIGURES[tag]!;
      out.push(`![${f.caption}](${f.asset})`);
      if ((lines[i + 1] ?? '').trim() === '') i++;
      continue;
    }
    if (tag && DROP.includes(tag)) {
      if ((lines[i + 1] ?? '').trim() === '') i++;
      continue;
    }
    out.push(lines[i]!);
  }
  return out.join('\n');
}

// ── stage 2 — from dirt-rich-place-interiors.ts ──────────────────────────
const PLATES: { section: string; asset: string; widthPct: number }[] = [
  { section: 'Backyard Me v1.0', asset: 'p13-soil-profile.png', widthPct: 70 },
  { section: 'Dirt Before Anything', asset: 'p21-raised-bed.png', widthPct: 70 },
  { section: 'Chickens: The Gateway Animal', asset: 'p47-coop-dusk.png', widthPct: 70 },
  { section: 'The Meat Bird Chapter', asset: 'p57-zucchini.png', widthPct: 100 },
  { section: 'Neighbors, HOAs, and Zoning', asset: 'p83-january-garden.png', widthPct: 85 },
  { section: 'Backyard Me Now', asset: 'p99-quarter-acre.png', widthPct: 100 },
];
const isHeading = (l: string): boolean => /^#{1,2}\s+/.test(l);
const headingFor = (title: string) => (l: string): boolean =>
  isHeading(l) &&
  l.replace(/^#{1,2}\s+/, '').replace(/^Chapter\s+\d+\s*[:.–—-]\s*/i, '').trim() === title;

export function placeInteriorPlates(md: string): { md: string; placed: string[] } {
  const out = md.split('\n');
  const placed: string[] = [];
  // Bottom-up, so an earlier insertion cannot shift a later index.
  for (const plate of [...PLATES].reverse()) {
    const start = out.findIndex(headingFor(plate.section));
    if (start < 0) throw new Error(`stage 2: section heading not found: "${plate.section}"`);
    let end = start + 1;
    while (end < out.length && !isHeading(out[end]!)) end++;
    let at = end - 1;
    while (at > start && (!out[at]!.trim() || /^\s*-{3,}\s*$/.test(out[at]!))) at--;
    out.splice(at + 1, 0, '', `![](${plate.asset}){${plate.widthPct}%}`);
    placed.push(`${plate.section} -> ${plate.asset} at ${plate.widthPct}% (after line ${at + 1})`);
  }
  return { md: out.join('\n'), placed: placed.reverse() };
}

// ── stage 3 — the step that was never a script ───────────────────────────
/**
 * Replace the Appendix E layout brief with the finished site plan.
 *
 * The canonical manuscript carries a blockquote marked REDRAW REQUIRED holding a
 * box-drawing sketch and a description for the illustrator. Once the plan was
 * drawn, that whole block was replaced by hand with a reference to the SVG. This
 * performs exactly that one substitution.
 *
 * It refuses on absence AND on duplication. Absence means the manuscript is not
 * the one this pipeline was proven against; duplication means an ambiguous
 * target, and picking one silently is how a mutation ends up in the wrong place.
 */
export const SITE_PLAN_REFERENCE = '![](figure-E-1-site-plan.svg){74%}';

export function placeSitePlan(md: string): { md: string; linesReplaced: number; atLine: number } {
  const lines = md.split('\n');
  const starts = lines
    .map((l, i) => (markerTag(l) === 'FIGURE E.1' ? i : -1))
    .filter((i) => i >= 0);

  if (starts.length === 0) {
    throw new Error(
      'stage 3: no [FIGURE E.1] block found. This manuscript is not the one the pipeline was ' +
        'proven against — refusing to guess where the site plan belongs.',
    );
  }
  if (starts.length > 1) {
    throw new Error(
      `stage 3: found ${starts.length} [FIGURE E.1] blocks (lines ${starts.map((i) => i + 1).join(', ')}). ` +
        'The target must be unambiguous — refusing to choose one.',
    );
  }

  const start = starts[0]!;
  // The brief is a contiguous blockquote; consume it whole.
  let end = start;
  while (end + 1 < lines.length && lines[end + 1]!.trimStart().startsWith('>')) end++;
  const linesReplaced = end - start + 1;
  lines.splice(start, linesReplaced, SITE_PLAN_REFERENCE);
  return { md: lines.join('\n'), linesReplaced, atLine: start + 1 };
}

// ── runner ───────────────────────────────────────────────────────────────
/**
 * Only run the CLI when this file IS the entry point. Without this the runner
 * fires on import and calls process.exit, so the stage functions above cannot be
 * imported or tested — the duplicate-target guard could not be exercised at all.
 */
const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (!isEntryPoint) {
  // imported for its transforms; the CLI below is skipped
} else {
if (!CANONICAL) {
  console.error('Pass --canonical "<path to DIRT-RICH-ABBY-FENWICK_FINAL.md>" or set WL_MANUSCRIPT.');
  process.exit(2);
}
if (!existsSync(CANONICAL)) {
  console.error(`Canonical manuscript not found: ${CANONICAL}`);
  process.exit(2);
}

const failures: string[] = [];
const check = (stage: string, text: string, expected: string): void => {
  const got = sha(text);
  const ok = got === expected;
  const figs = (text.match(/^!\[/gm) ?? []).length;
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'}  ${stage.padEnd(30)} ${got.slice(0, 16)}…  ` +
      `${String(text.split('\n').length).padStart(4)} lines  ${figs} figs`,
  );
  if (!ok) failures.push(`${stage}: got ${got}, expected ${expected}`);
};

console.log(`canonical : ${CANONICAL}`);
console.log(`assets    : ${ASSET_DIR}`);
console.log(`output    : ${OUT ?? '(none — verification only)'}\n`);

console.log('MANUSCRIPT STAGES');
const canonical = readFileSync(CANONICAL, 'utf8');
check('0. canonical', canonical, STAGE_SHA.canonical);

const s1 = inlineFigures(canonical);
check('1. inline figures 5.1 / 10.1', s1, STAGE_SHA.inlineFigures);

const { md: s2, placed } = placeInteriorPlates(s1);
check('2. six interior plates', s2, STAGE_SHA.interiorPlates);

const { md: s3, linesReplaced, atLine } = placeSitePlan(s2);
check('3. appendix E site plan', s3, STAGE_SHA.working);

console.log('\n  stage 2 placements:');
for (const p of placed) console.log(`    ${p}`);
console.log(`  stage 3: replaced ${linesReplaced} blockquote lines at line ${atLine}`);

// ── assets ───────────────────────────────────────────────────────────────
console.log('\nILLUSTRATION ASSETS');
const referenced = [...s3.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]!.replace(/\{.*$/, ''));
const unique = [...new Set(referenced)];
for (const name of unique) {
  const expected = ASSETS[name];
  const file = path.join(ASSET_DIR, name);
  if (!expected) { failures.push(`asset not in the manifest: ${name}`); console.log(`  FAIL  ${name} — referenced but not in the manifest`); continue; }
  if (!existsSync(file)) { failures.push(`asset missing: ${name}`); console.log(`  FAIL  ${name} — missing from ${ASSET_DIR}`); continue; }
  const got = createHash('sha256').update(readFileSync(file)).digest('hex');
  const ok = got === expected;
  if (!ok) failures.push(`asset hash: ${name} is ${got}, expected ${expected}`);
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name.padEnd(32)} ${got.slice(0, 16)}…`);
}
const missingRefs = Object.keys(ASSETS).filter((a) => !unique.includes(a));
if (missingRefs.length) {
  failures.push(`manifest assets never referenced: ${missingRefs.join(', ')}`);
  console.log(`  FAIL  manifest lists assets the manuscript never references: ${missingRefs.join(', ')}`);
}
console.log(`  ${unique.length} referenced, ${Object.keys(ASSETS).length} in the manifest`);

// ── result ───────────────────────────────────────────────────────────────
console.log('');
if (failures.length) {
  console.error('PIPELINE FAILED — nothing written, nothing uploaded, nothing rendered.');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
if (OUT) {
  writeFileSync(OUT, s3, 'utf8');
  console.log(`wrote ${OUT}`);
}
console.log(`PIPELINE CLEAN — canonical ${STAGE_SHA.canonical.slice(0, 8)}… reproduces working ${STAGE_SHA.working.slice(0, 8)}… deterministically.`);
}
