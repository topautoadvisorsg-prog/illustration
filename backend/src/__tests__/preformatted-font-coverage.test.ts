/**
 * PREFORMATTED FACE — glyph coverage, enforced.
 *
 * ─── WHY THIS TEST IS THE POINT OF THE WHOLE EXERCISE ─────────────────────
 * A missing glyph does not raise an error. The browser silently substitutes
 * another face, or draws nothing at all, and the PDF looks plausible in every
 * automated check that counts pages, sections or overflow. DIRT RICH's Appendix
 * E would have reached print as a page of tofu with a clean QA report.
 *
 * That is not hypothetical. Measured on the real manuscript:
 *   - all 11 previously vendored faces: missing 18 of 22 characters
 *   - JetBrains / Noto Sans / IBM Plex / Source Code Pro Mono: missing 18 of 22
 *   - Roboto Mono: missing 20 of 22
 * Google's webfont builds carry latin/greek/cyrillic/vietnamese subsets only, so
 * "use a monospace webfont" does not fix it. Hence a locally vendored TTF.
 *
 * So this test reads the ACTUAL characters out of the ACTUAL manuscript and
 * checks them against the ACTUAL vendored binary. It is not given a list to
 * trust — a list would drift the moment the appendix is edited.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fontkit from 'fontkit';
import { describe, expect, it } from 'vitest';

const FONT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/fonts',
);
const TTF = path.join(FONT_DIR, 'ttf', 'DejaVuSansMono.ttf');
const CSS = path.join(FONT_DIR, 'dejavu-sans-mono.css');
const LICENCE = path.join(FONT_DIR, 'DejaVuSansMono-LICENSE.txt');

/** Official DejaVu Fonts 2.37, ttf/DejaVuSansMono.ttf, unmodified. */
const EXPECTED_SHA256 = 'b4a6c3e4faab8773f4ff761d56451646409f29abedd68f05d38c2df667d3c582';

// The manuscript is a REPO FIXTURE, not a path on one operator's desktop. The
// absolute Downloads path this replaced made the suite fail to load the moment
// the file moved, and could never have run on Linux/CI at all.
const MANUSCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/dirt-rich-manuscript.md');

/**
 * Every character inside every fenced block of the manuscript, read fresh.
 *
 * Deliberately derived from the file rather than hard-coded: if someone extends
 * Appendix E with a glyph the face cannot draw, this test must fail on the next
 * run rather than pass against a stale list.
 */
function fencedCharacters(markdown: string): string[] {
  const lines = markdown.split('\n');
  const chars = new Set<string>();
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) for (const c of line) chars.add(c);
  }
  return [...chars];
}

describe('preformatted face — the vendored binary', () => {
  it('is present, with its licence alongside it', () => {
    expect(existsSync(TTF), 'DejaVuSansMono.ttf must be committed').toBe(true);
    expect(existsSync(LICENCE), 'the licence must be committed with the font').toBe(true);
  });

  it('is the unmodified official 2.37 release', () => {
    const sha = createHash('sha256').update(readFileSync(TTF)).digest('hex');
    expect(sha, 'font binary does not match the official 2.37 release').toBe(EXPECTED_SHA256);
  });

  it('is inlined COMPLETE, with no unicode-range subsetting', () => {
    const css = readFileSync(CSS, 'utf8');
    expect(css).toContain("font-family:'DejaVu Sans Mono'");
    expect(css).toContain('base64,');
    // A unicode-range here would mean the face had been through the latin-only
    // path, which strips the box-drawing glyphs it exists for.
    expect(css, 'the preformatted face must not be subsetted').not.toContain('unicode-range');
  });

  it('embeds rather than deferring to a system copy', async () => {
    const { bundledFontCss, resetSystemFontCache } = await import('../pipeline/typeset/font-assets.js');
    resetSystemFontCache();
    const r = bundledFontCss(['DejaVu Sans Mono']);
    expect(r.bundled).toContain('DejaVu Sans Mono');
    expect(r.systemInstalled).not.toContain('DejaVu Sans Mono');
    expect(r.missing).toEqual([]);
  });
});

describe('preformatted face — covers every character DIRT RICH actually sets', () => {
  const font = fontkit.openSync(TTF);
  const chars = fencedCharacters(readFileSync(MANUSCRIPT, 'utf8'));

  it('found the fenced content to check', () => {
    expect(chars.length).toBeGreaterThan(20);
    // Sanity: the site plan's box drawing really is in there.
    expect(chars).toContain('\u2500'); // ─
    expect(chars).toContain('\u2551'); // ║
  });

  it('renders EVERY character in every fenced block', () => {
    const missing = chars.filter((c) => !font.hasGlyphForCodePoint(c.codePointAt(0)!));
    expect(
      missing,
      `the vendored preformatted face cannot draw: ${missing
        .map((c) => `${c} (U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')})`)
        .join(', ')}. Browser fallback would hide this — fix the face, not this test.`,
    ).toEqual([]);
  });

  it('covers the box-drawing and block-element ranges as a whole', () => {
    // Beyond what this book happens to use, so the next manuscript with a
    // diagram does not rediscover the problem one glyph at a time.
    const ranges: [number, number][] = [
      [0x2500, 0x257f], // box drawing
      [0x2591, 0x2593], // shade blocks
      [0x2190, 0x2193], // arrows
    ];
    const missing: string[] = [];
    for (const [lo, hi] of ranges) {
      for (let cp = lo; cp <= hi; cp++) {
        if (!font.hasGlyphForCodePoint(cp)) missing.push(`U+${cp.toString(16).toUpperCase()}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
