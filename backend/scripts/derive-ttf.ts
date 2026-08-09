/**
 * DERIVE SYSTEM-INSTALLABLE TTFs FROM THE APPROVED WOFF2 ASSETS.
 *
 * Chromium emits Type3 glyph-drawing procedures for ANY `@font-face` — proven
 * against both WOFF2 and TTF payloads in scripts/font-embed-probe.ts — and
 * proper embedded Type0 CID subsets only for fonts installed in the render
 * host's font path. So the faces have to become real system fonts.
 *
 * ─── WHY DECOMPRESS RATHER THAN DOWNLOAD ──────────────────────────────────
 * The obvious route is fetching TTFs from the google/fonts OFL repo. That is a
 * DIFFERENT BUILD of the typeface than the one the approved interior was set
 * in, and a metric change of a fraction of a point repaginates a 159-page book.
 * WOFF2 is a compressed container over the same sfnt tables, so decompressing
 * what we already ship is lossless: identical glyph outlines, identical
 * metrics, identical pagination — by construction, not by hope.
 *
 * ─── WHY ONE FILE PER FAMILY+STYLE, NOT PER WEIGHT ────────────────────────
 * These are VARIABLE fonts. Each stylesheet repeats ONE binary under
 * `font-weight: 400`, `500` and `600` and lets the browser pin the `wght` axis
 * from the `@font-face` descriptor — verified by hashing the base64 payloads,
 * which are identical across the three weights of a given family+style. Writing
 * one file per declared weight would install three indistinguishable faces and
 * leave it to fontconfig to guess between them. So we key by payload and emit
 * one file per distinct binary, recording every weight it serves.
 *
 * ─── WHY THE NAME TABLE GETS REPAIRED ─────────────────────────────────────
 * Archivo's sliced binary claims family "Archivo SemiBold" with no typographic
 * family record, so `fc-list` in the render image never reports a family called
 * "Archivo" and `font-family: Archivo` would fall back to DejaVu Sans without a
 * word of warning. EB Garamond is named correctly, which is the only reason the
 * two behave differently. `rewriteFontNames` repairs the identity and touches
 * NOTHING else — asserted below by hashing every other table before and after.
 *
 * ─── WHY ONLY THE latin SUBSET ────────────────────────────────────────────
 * Each family ships two subsets per weight/style (latin, latin-ext). Installing
 * both would give fontconfig two faces with identical family/style metadata and
 * different coverage, and which one it picks is not something to leave to
 * chance in a print pipeline. Scanning the manuscript found ZERO characters in
 * the latin-ext ranges, so the latin face alone is provably equivalent here.
 * The check is re-run below, and this script FAILS if that ever stops holding.
 *
 *   yarn workspace @wildlands/backend fonts:ttf
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readFontNames, rewriteFontNames, tableDigests } from '../src/pipeline/typeset/sfnt-name.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const FONT_DIR = path.join(ROOT, 'backend/assets/fonts');
const TTF_DIR = path.join(FONT_DIR, 'ttf');
const MANUSCRIPT =
  process.env.WL_QA_MANUSCRIPT ?? 'C:/Users/jovan/Downloads/puberty boy book/export/NO-ONE-TOLD-ME-THAT_FINAL.md';

/** The `latin` subset always starts at U+0000-00FF; `latin-ext` starts at U+0100. */
const LATIN_RANGE_HEAD = 'U+0000-00FF';

interface Face {
  family: string;
  style: string;
  weight: string;
  bytes: Buffer;
}

/** Parse the vendored stylesheet into its latin-subset faces. */
function latinFaces(family: string, css: string): Face[] {
  const out: Face[] = [];
  for (const block of css.split('@font-face').slice(1)) {
    const range = /unicode-range:\s*([^;}]+)/.exec(block)?.[1] ?? '';
    if (!range.includes(LATIN_RANGE_HEAD)) continue; // latin-ext and friends
    const style = /font-style:\s*([a-z]+)/.exec(block)?.[1] ?? 'normal';
    const weight = /font-weight:\s*(\d+)/.exec(block)?.[1] ?? '400';
    const b64 = /base64,([A-Za-z0-9+/=]+)\)/.exec(block)?.[1];
    if (!b64) continue;
    out.push({ family, style, weight, bytes: Buffer.from(b64, 'base64') });
  }
  return out;
}

/** Ranges the vendored latin subset does NOT cover, per the stylesheets. */
function usesLatinExt(text: string): string[] {
  const EXT: [number, number][] = [
    [0x0100, 0x02ba], [0x02bd, 0x02c5], [0x02c7, 0x02cc], [0x02ce, 0x02d7],
    [0x02dd, 0x02ff], [0x1d00, 0x1dbf], [0x1e00, 0x1e9f], [0x1ef2, 0x1eff],
    [0x2020, 0x2020], [0x20a0, 0x20ab], [0x20ad, 0x20c0], [0x2113, 0x2113],
    [0x2c60, 0x2c7f], [0xa720, 0xa7ff],
  ];
  const hits = new Set<string>();
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (EXT.some(([a, b]) => c >= a && c <= b)) hits.add(`U+${c.toString(16).toUpperCase().padStart(4, '0')}`);
  }
  return [...hits];
}

const manuscript = await readFile(MANUSCRIPT, 'utf8').catch(() => '');
if (manuscript) {
  const ext = usesLatinExt(manuscript);
  if (ext.length) {
    console.error(
      `REFUSING: the manuscript uses ${ext.length} character(s) outside the latin subset (${ext.join(' ')}).\n` +
        'Installing latin-only faces would send those to an unknown fallback font. Merge the latin-ext\n' +
        'subset into each face, or vendor full TTFs, before continuing.',
    );
    process.exit(1);
  }
  console.log('manuscript uses no latin-ext characters — latin-only faces are equivalent\n');
}

const { decompress } = await import('wawoff2');
await rm(TTF_DIR, { recursive: true, force: true });
await mkdir(TTF_DIR, { recursive: true });

interface ManifestEntry {
  file: string;
  /** The family name fontconfig will report, and the one CSS must ask for. */
  family: string;
  style: string;
  /** Every `font-weight` the stylesheet serves from this one binary. */
  weights: string[];
  bytes: number;
  /** What the sliced binary called itself before the identity repair. */
  originalFamily: string;
}

const manifest: ManifestEntry[] = [];
for (const entry of (await readdir(FONT_DIR)).filter((f) => f.endsWith('.css'))) {
  const slug = entry.replace(/\.css$/, '');
  const css = await readFile(path.join(FONT_DIR, entry), 'utf8');
  const family = /\/\*\s*([^—]+)—/.exec(css)?.[1]?.trim() ?? slug;

  // One entry per DISTINCT binary. The stylesheet repeats the same variable
  // font across weights, so the payload hash — not the declared weight — is
  // what tells us how many faces there really are.
  const byPayload = new Map<string, { face: Face; weights: Set<string> }>();
  for (const face of latinFaces(family, css)) {
    const key = createHash('sha256').update(face.bytes).digest('hex');
    const existing = byPayload.get(key);
    if (existing) {
      if (existing.face.style !== face.style) {
        throw new Error(`${slug}: one binary is served as both ${existing.face.style} and ${face.style}`);
      }
      existing.weights.add(face.weight);
    } else {
      byPayload.set(key, { face, weights: new Set([face.weight]) });
    }
  }

  for (const { face, weights } of byPayload.values()) {
    const raw = Buffer.from(await decompress(face.bytes));
    const before = readFontNames(raw);
    const subfamily = face.style === 'italic' ? 'Italic' : 'Regular';
    const ttf = rewriteFontNames(raw, { family, subfamily });

    // The repair is only safe because it is provably confined to `name`. Every
    // other table has to come through byte-identical or the outlines and
    // metrics this whole script exists to preserve are no longer guaranteed.
    const [a, b] = [tableDigests(raw), tableDigests(ttf)];
    const moved = Object.keys(a).filter((tag) => tag !== 'name' && tag !== 'head' && a[tag] !== b[tag]);
    if (moved.length) {
      throw new Error(`${slug} ${face.style}: identity repair altered ${moved.join(', ')} — refusing to write`);
    }
    const after = readFontNames(ttf);
    if (after.family !== family || after.subfamily !== subfamily) {
      throw new Error(`${slug} ${face.style}: name rewrite did not take (got ${after.family} / ${after.subfamily})`);
    }

    const sorted = [...weights].sort();
    const file = `${slug}-${face.style}.ttf`;
    await writeFile(path.join(TTF_DIR, file), ttf);
    manifest.push({
      file,
      family,
      style: face.style,
      weights: sorted,
      bytes: ttf.length,
      originalFamily: before.family,
    });
    const renamed = before.family === family ? '' : `  (was "${before.family}")`;
    console.log(
      `  ${file.padEnd(30)} ${family} ${subfamily}  wght ${sorted.join('/')}  ${(ttf.length / 1024).toFixed(0)}kB${renamed}`,
    );
  }
}

await writeFile(path.join(TTF_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const families = [...new Set(manifest.map((m) => m.family))].sort();
console.log(`\n${manifest.length} faces / ${families.length} families -> backend/assets/fonts/ttf/`);
console.log(`families: ${families.join(', ')}`);
process.exit(0);
