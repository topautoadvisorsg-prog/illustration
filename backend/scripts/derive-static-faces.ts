/**
 * STATIC INTERIOR FACES — instantiate the book's two families at fixed weights.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────
 * The interior PDF contains no embedded font program: every face comes out as
 * Type3 glyph-drawing procedures, which print RIPs commonly reject. Measured in
 * the render image (scripts/font-system-probe.mjs), the trigger is VARIABLE
 * fonts — Chromium emits Type3 for a variable face whether it arrives as a
 * webfont or from the host font path, and Type0 CID subsets for a static face
 * either way, including as the base64 WOFF2 data URI we already ship.
 *
 * So the fix is here, in the vendored assets, and nowhere else. Nothing about
 * the render image, fontconfig, or system font installation is involved; that
 * approach was tried, disproven and rejected.
 *
 * ─── WHAT IS PRESERVED, AND WHAT IS NOT ───────────────────────────────────
 * Source is the WOFF2 ALREADY VENDORED for this book, never a fresh download
 * from google/fonts: a different upstream build can move metrics by a fraction
 * of a point and repaginate 159 pages.
 *
 * Instancing is not free, though, and this is the honest part. Pinning `wght`
 * bakes interpolated outlines and rounded advance widths into `hmtx`, where the
 * variable path interpolated at render time. Weights that sit on the axis
 * default come out exact; interpolated ones can differ by ~0.03px per line.
 * That is small, not zero, and NOT something this script may declare safe. The
 * acceptance gate is `qa:deepfingerprint` + `qa:fingerprintdiff`, which compare
 * every block's line boxes against the approved baseline.
 *
 * ─── SCOPE ────────────────────────────────────────────────────────────────
 * Only the two families the interior sets: the heading face and the body face.
 * Every weight/style/subset the stylesheet DECLARES is generated, not just the
 * ones a quick read of the CSS shows in use — dropping a face the CSS can still
 * select would let Chromium synthesise a fake oblique or bold in its place, a
 * silent substitution that no page count would reveal.
 *
 * ─── REPRODUCIBILITY ──────────────────────────────────────────────────────
 * Instancing runs in a PINNED container (image digest + fontTools version
 * below), so it does not depend on this machine and can be reproduced later.
 * Name repair and WOFF2 recompression happen here, in code that is unit
 * tested. Same inputs give the same bytes.
 *
 *   yarn workspace @wildlands/backend fonts:static
 *   yarn workspace @wildlands/backend fonts:static -- --check   (no writes)
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readFontNames, rewriteFontNames, tableDigests } from '../src/pipeline/typeset/sfnt-name.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const FONT_DIR = path.join(ROOT, 'backend/assets/fonts');
const WORK_DIR = path.join(ROOT, '.font-instancing');

/**
 * PINNED GENERATION ENVIRONMENT.
 *
 * The digest pins the interpreter and its libc; the version pins the instancer.
 * Both matter: instancing is floating-point interpolation, and "whatever python
 * image is current" is not a reproducible input for a print master.
 */
const PYTHON_IMAGE = 'python:3.12-slim@sha256:229a2c5bfa27522db7815ea81f9bed70af17ccb9de9fc7ad142b1877b5830d36';
const FONTTOOLS_VERSION = '4.55.3';
const BROTLI_VERSION = '1.1.0';

/** The interior's two families. Everything else stays variable and untouched. */
const FAMILIES = ['archivo', 'eb-garamond'];

interface Face {
  slug: string;
  family: string;
  style: 'normal' | 'italic';
  weight: number;
  /** The subset this face covers, kept verbatim so coverage cannot change. */
  unicodeRange: string;
  subset: 'latin' | 'latin-ext';
  woff2: Buffer;
}

const check = process.argv.includes('--check');

/** Parse a vendored stylesheet into its faces, preserving declaration order. */
function parseFaces(slug: string, family: string, css: string): Face[] {
  const out: Face[] = [];
  for (const block of css.split('@font-face').slice(1)) {
    const range = /unicode-range:\s*([^;}]+)/.exec(block)?.[1]?.trim();
    const style = /font-style:\s*([a-z]+)/.exec(block)?.[1] ?? 'normal';
    const weight = Number(/font-weight:\s*(\d+)/.exec(block)?.[1] ?? '400');
    const b64 = /base64,([A-Za-z0-9+/=]+)\)/.exec(block)?.[1];
    if (!range || !b64) throw new Error(`${slug}.css: a @font-face block is missing its range or payload`);
    out.push({
      slug,
      family,
      style: style === 'italic' ? 'italic' : 'normal',
      weight,
      unicodeRange: range,
      subset: range.includes('U+0000-00FF') ? 'latin' : 'latin-ext',
      woff2: Buffer.from(b64, 'base64'),
    });
  }
  return out;
}

const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');

/** Standard OpenType weight-class names, so the PDF names the face honestly. */
const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black',
};

function subfamilyFor(weight: number, style: 'normal' | 'italic'): string {
  const name = WEIGHT_NAMES[weight];
  if (!name) throw new Error(`no standard style name for weight ${weight}`);
  if (style === 'normal') return name;
  return weight === 400 ? 'Italic' : `${name} Italic`;
}

// ── Collect the faces to instantiate ───────────────────────────────────────
const faces: Face[] = [];
for (const slug of FAMILIES) {
  const css = await readFile(path.join(FONT_DIR, `${slug}.css`), 'utf8');
  if (css.includes('STATIC INSTANCES')) {
    console.error(
      `${slug}.css already holds static instances. Instancing a static font is a no-op at best and\n` +
        `a second rounding pass at worst. Restore the variable stylesheet from git first.`,
    );
    process.exit(1);
  }
  const family = /\/\*\s*([^—]+)—/.exec(css)?.[1]?.trim() ?? slug;
  faces.push(...parseFaces(slug, family, css));
}

console.log(`${faces.length} declared faces across ${FAMILIES.length} families\n`);

// ── Instantiate, in a pinned container ─────────────────────────────────────
await rm(WORK_DIR, { recursive: true, force: true });
await mkdir(path.join(WORK_DIR, 'in'), { recursive: true });
await mkdir(path.join(WORK_DIR, 'out'), { recursive: true });

const jobs = faces.map((f, i) => ({
  id: `${String(i).padStart(2, '0')}-${f.slug}-${f.weight}-${f.style}-${f.subset}`,
  weight: f.weight,
}));
for (const [i, f] of faces.entries()) {
  await writeFile(path.join(WORK_DIR, 'in', `${jobs[i].id}.woff2`), f.woff2);
}
await writeFile(path.join(WORK_DIR, 'jobs.json'), JSON.stringify(jobs, null, 1));

const PY = `
import json, os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

jobs = json.load(open("/work/jobs.json"))
for j in jobs:
    f = TTFont("/work/in/%s.woff2" % j["id"])
    axes = {a.axisTag: (a.minValue, a.defaultValue, a.maxValue) for a in f["fvar"].axes} if "fvar" in f else {}
    if "wght" not in axes:
        raise SystemExit("%s has no wght axis: %r" % (j["id"], axes))
    lo, _, hi = axes["wght"]
    if not (lo <= j["weight"] <= hi):
        raise SystemExit("%s: weight %s outside axis range %s..%s" % (j["id"], j["weight"], lo, hi))
    if len(axes) != 1:
        raise SystemExit("%s has axes beyond wght (%r); pinning only wght would leave it variable" % (j["id"], list(axes)))
    inst = instancer.instantiateVariableFont(f, {"wght": j["weight"]}, inplace=True, updateFontNames=False)
    # STAT is deliberately NOT in this list: it describes style attributes and
    # is valid, expected furniture on a static face. These are the tables that
    # would actually leave the font variable, and Chromium back on Type3.
    for t in ("fvar", "gvar", "avar", "HVAR", "MVAR"):
        if t in inst:
            raise SystemExit("%s still has %s after instancing - it would still be a variable font" % (j["id"], t))
    inst.flavor = None
    inst.save("/work/out/%s.ttf" % j["id"])
    print("  instanced %s -> wght %s" % (j["id"], j["weight"]))
`;
await writeFile(path.join(WORK_DIR, 'instance.py'), PY);

console.log(`instancing in ${PYTHON_IMAGE.split('@')[0]} with fontTools ${FONTTOOLS_VERSION}`);
execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${WORK_DIR}:/work`,
    PYTHON_IMAGE,
    'bash',
    '-lc',
    `pip install -q --no-cache-dir "fonttools==${FONTTOOLS_VERSION}" "brotli==${BROTLI_VERSION}" && python /work/instance.py`,
  ],
  { stdio: 'inherit', env: { ...process.env, MSYS_NO_PATHCONV: '1' } },
);

// ── Repair naming, recompress, rebuild the stylesheets ─────────────────────
const { compress } = await import('wawoff2');

const produced = new Set(await readdir(path.join(WORK_DIR, 'out')));
const byFamily = new Map<string, string[]>();
const summary: { face: string; ttfBytes: number; woff2Bytes: number; sha: string }[] = [];

for (const [i, f] of faces.entries()) {
  const id = jobs[i].id;
  if (!produced.has(`${id}.ttf`)) throw new Error(`instancing produced no output for ${id}`);
  const instanced = await readFile(path.join(WORK_DIR, 'out', `${id}.ttf`));

  // Deterministic identity, and one that names the WEIGHT. Without this the
  // PDF's BaseFont carries whatever the sliced variable font called itself —
  // "Archivo SemiBold" for every Archivo weight, including 400 — and naming
  // every instance "Regular" would be just as dishonest in the other direction:
  // three distinct embedded subsets would appear under one name, so a prepress
  // check could not tell whether weight selection actually worked.
  const subfamily = subfamilyFor(f.weight, f.style);
  const named = rewriteFontNames(instanced, { family: f.family, subfamily });

  const before = tableDigests(instanced);
  const after = tableDigests(named);
  const moved = Object.keys(before).filter((t) => t !== 'name' && t !== 'head' && before[t] !== after[t]);
  if (moved.length) throw new Error(`${id}: name repair altered ${moved.join(', ')}`);
  const names = readFontNames(named);
  if (names.family !== f.family || names.subfamily !== subfamily) {
    throw new Error(`${id}: name repair did not take (${names.family} / ${names.subfamily})`);
  }

  const woff2 = Buffer.from(await compress(named));
  const b64 = woff2.toString('base64');

  if (!byFamily.has(f.slug)) byFamily.set(f.slug, []);
  byFamily
    .get(f.slug)!
    .push(
      `@font-face{font-family:'${f.family}';font-style:${f.style};font-weight:${f.weight};font-display:block;` +
        `src:url(data:font/woff2;base64,${b64}) format('woff2');unicode-range:${f.unicodeRange}}`,
    );

  summary.push({
    face: `${f.family} ${f.weight} ${f.style} ${f.subset}`,
    ttfBytes: named.length,
    woff2Bytes: woff2.length,
    sha: sha(woff2).slice(0, 12),
  });
}

console.log('');
for (const s of summary) {
  console.log(`  ${s.face.padEnd(34)} ttf ${String(Math.round(s.ttfBytes / 1024)).padStart(4)}kB  woff2 ${String(Math.round(s.woff2Bytes / 1024)).padStart(4)}kB  ${s.sha}`);
}

const HEADER = (family: string): string =>
  `/* ${family} — STATIC INSTANCES derived from the vendored variable WOFF2 for this book.\n` +
  `   Generated by backend/scripts/derive-static-faces.ts using fontTools ${FONTTOOLS_VERSION}\n` +
  `   in ${PYTHON_IMAGE}.\n` +
  `   Static because Chromium emits Type3 glyph procedures for VARIABLE faces and\n` +
  `   embedded Type0 CID subsets for static ones. Do not hand-edit; do not replace\n` +
  `   with a fresh google/fonts build — that is a different build of the typeface. */\n`;

for (const [slug, blocks] of byFamily) {
  const family = faces.find((f) => f.slug === slug)!.family;
  const css = `${HEADER(family)}${blocks.join('\n')}\n`;
  const target = path.join(FONT_DIR, `${slug}.css`);
  if (check) {
    const current = await readFile(target, 'utf8');
    console.log(`\n${slug}.css: ${current === css ? 'UNCHANGED' : `would change ${current.length}B -> ${css.length}B`}`);
  } else {
    await writeFile(target, css);
    console.log(`\nwrote ${slug}.css  (${(css.length / 1024).toFixed(0)}kB)`);
  }
}

await rm(WORK_DIR, { recursive: true, force: true });
console.log(
  check
    ? '\n--check: nothing written'
    : '\nNOT ACCEPTED YET. Run qa:deepfingerprint and qa:fingerprintdiff against the baseline before trusting this.',
);
process.exit(0);
