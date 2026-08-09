import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readFontNames, rewriteFontNames, tableDigests } from '../pipeline/typeset/sfnt-name.js';

const TTF_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/fonts/ttf');

const load = (file: string): Promise<Buffer> => readFile(path.join(TTF_DIR, file));

describe('sfnt name-table rewriting', () => {
  it('repairs the family name of a face that mislabels itself', async () => {
    // Archivo's sliced binary calls itself "Archivo SemiBold", which is why
    // fontconfig never reported a family called "Archivo".
    const font = await load('archivo-normal.ttf');
    expect(readFontNames(font).family).toBe('Archivo');
  });

  it('leaves every table except name and head byte-identical', async () => {
    // The whole point of rewriting names rather than regenerating fonts: glyph
    // outlines and metrics must be untouched, so pagination cannot move. head
    // is exempt because checkSumAdjustment covers the entire file.
    const original = await load('eb-garamond-normal.ttf');
    const renamed = rewriteFontNames(original, { family: 'Probe Family', subfamily: 'Regular' });

    const before = tableDigests(original);
    const after = tableDigests(renamed);
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());

    const changed = Object.keys(before).filter((tag) => before[tag] !== after[tag]);
    expect(changed.sort()).toEqual(['head', 'name']);
  });

  it('preserves the variation axis tables', async () => {
    // These are variable fonts. Dropping fvar/gvar here would silently collapse
    // every weight onto one instance.
    const font = await load('archivo-italic.ttf');
    const tags = Object.keys(tableDigests(font));
    expect(tags).toEqual(expect.arrayContaining(['fvar', 'gvar', 'glyf', 'hmtx', 'HVAR']));
  });

  it('round-trips family and subfamily', async () => {
    const font = await load('lora-normal.ttf');
    const renamed = rewriteFontNames(font, { family: 'Some Serif', subfamily: 'Italic' });
    expect(readFontNames(renamed)).toEqual({ family: 'Some Serif', subfamily: 'Italic' });
  });

  it('is idempotent', async () => {
    const font = await load('oswald-normal.ttf');
    const once = rewriteFontNames(font, { family: 'Oswald', subfamily: 'Regular' });
    const twice = rewriteFontNames(once, { family: 'Oswald', subfamily: 'Regular' });
    expect(twice.equals(once)).toBe(true);
  });

  it('refuses a family name it cannot encode for the Mac platform', async () => {
    const font = await load('lora-normal.ttf');
    expect(() => rewriteFontNames(font, { family: 'Lora — Prime', subfamily: 'Regular' })).toThrow(
      /non-ASCII/,
    );
  });

  it('rejects anything that is not a TrueType sfnt', () => {
    expect(() => readFontNames(Buffer.from('not a font at all'))).toThrow(/sfnt/);
  });
});

describe('derived font assets', () => {
  it('ships one binary per family and style, with the weights it serves', async () => {
    const manifest = JSON.parse(await readFile(path.join(TTF_DIR, 'manifest.json'), 'utf8')) as {
      file: string;
      family: string;
      style: string;
      weights: string[];
    }[];

    // The stylesheets repeat one variable binary across 400/500/600, so one
    // file per declared weight would install indistinguishable duplicates.
    const keys = manifest.map((m) => `${m.family}|${m.style}`);
    expect(new Set(keys).size).toBe(keys.length);

    for (const entry of manifest) {
      const font = await load(entry.file);
      expect(readFontNames(font)).toEqual({
        family: entry.family,
        subfamily: entry.style === 'italic' ? 'Italic' : 'Regular',
      });
      expect(entry.weights.length).toBeGreaterThan(0);
    }
  });

  it('exposes the two book faces under the names the stylesheets ask for', async () => {
    const manifest = JSON.parse(await readFile(path.join(TTF_DIR, 'manifest.json'), 'utf8')) as {
      family: string;
    }[];
    const families = new Set(manifest.map((m) => m.family));
    expect(families).toContain('Archivo');
    expect(families).toContain('EB Garamond');
  });
});
