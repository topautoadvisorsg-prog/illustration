/**
 * WHAT A FAILURE HERE MEANS
 *
 * `docs/SOURCE-OF-TRUTH.md` is the document that says which module owns which
 * number. It went stale once already: it still described paperback geometry as
 * UNRESOLVED with "zero verified paperback readings" after that had been fixed,
 * and pointed at a Track A module as the de-facto authority after the logic had
 * moved out of it.
 *
 * A stale row in THAT document is worse than no document, so these checks tie it
 * to the code. They are deliberately narrow. This is not a documentation
 * generator; it fails on the three specific ways this file has actually lied.
 *
 * If one fails, fix the document (or the code), not the test.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PAPERBACK_SPINE_FACTOR_IN } from '../pipeline/publishing-standard/kdp-spec.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const DOC_PATH = path.join(REPO, 'docs/SOURCE-OF-TRUTH.md');
const DOC = readFileSync(DOC_PATH, 'utf8');

/** The row for one subject in the matrix, as raw markdown. */
function row(subject: string): string {
  const line = DOC.split('\n').find((l) => l.startsWith(`| **${subject}**`));
  if (!line) throw new Error(`SOURCE-OF-TRUTH.md has no row for "${subject}"`);
  return line;
}

describe('the source-of-truth matrix matches the code', () => {
  it('does not call paperback geometry unresolved while published formulas exist', () => {
    const formulas = Object.values(PAPERBACK_SPINE_FACTOR_IN)
      .flatMap((byPaper) => Object.values(byPaper ?? {}))
      .filter((v) => v?.authority === 'OFFICIAL_FORMULA');
    expect(formulas.length).toBeGreaterThan(0);

    const paperback = row('Paperback geometry');
    expect(paperback).not.toMatch(/UNRESOLVED/);
    expect(paperback).toMatch(/cover-dimensions\.ts/);
  });

  it('names a canonical module for cover geometry that actually exists', () => {
    for (const subject of ['Paperback geometry', 'Hardcover geometry']) {
      const cells = row(subject).split('|');
      const canonical = cells[2] ?? '';
      const named = [...canonical.matchAll(/`([^`]+\.ts)`/g)].map((m) => m[1]!);
      expect(named.length, `${subject} names no module`).toBeGreaterThan(0);
      for (const mod of named) {
        const hit = findModule(mod);
        expect(hit, `${subject} points at ${mod}, which no longer exists`).not.toBeNull();
      }
    }
  });

  it('does not still point at a retired authority', () => {
    // render-html.ts held computeCoverDimensions until Phase 1A. It is now a
    // re-export shim, so it must not be described as where geometry lives.
    const paperback = row('Paperback geometry');
    const canonical = paperback.split('|')[2] ?? '';
    expect(canonical).not.toMatch(/render-html\.ts/);
  });

  it('no live geometry implementation exists outside the authority and its tests', () => {
    // The matrix claiming one owner is only true while nothing else quietly
    // recomputes the same numbers. This is the check that keeps it honest.
    const offenders = scanForGeometryConstants();
    expect(offenders, `these carry executable cover-geometry constants:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────

function findModule(name: string): string | null {
  const direct = path.join(REPO, name);
  if (existsSync(direct)) return direct;
  const base = path.basename(name);
  const found = walk(path.join(REPO, 'backend')).find((f) => path.basename(f) === base);
  return found ?? null;
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Strip comments and string literals so only executable numbers remain. */
function stripNonCode(src: string): string {
  let out = '';
  let i = 0;
  let mode: string = 'code';
  while (i < src.length) {
    const c = src[i]!;
    const d = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && d === '*') { mode = 'block'; i += 2; continue; }
      if (c === '/' && d === '/') { mode = 'line'; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') { mode = c; i += 1; continue; }
      out += c; i += 1; continue;
    }
    if (mode === 'block') { if (c === '*' && d === '/') mode = 'code', (i += 2); else i += 1; continue; }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; out += '\n'; } i += 1; continue; }
    if (c === '\\') { i += 2; continue; }
    if (c === mode) { mode = 'code'; i += 1; continue; }
    i += 1;
  }
  return out;
}

const GEOMETRY_LITERALS = [
  /\b0\.591\b/, /\b0\.394\b/, /\b0\.51\b/, /\b0\.635\b/,
  /\b0\.002252\b/, /\b0\.0025\b/, /\b0\.002347\b/, /\b0\.00235\b/,
  /\b6\.197\b/, /\b9\.236\b/, /\b14\.079\b/, /\b10\.417\b/, /\b0\.504\b/, /\b0\.315\b/,
  /Math\.max\(\s*0\.06\s*,/,
];
const IS_AUTHORITY = /publishing-standard[\\/](kdp-spec|kdp-cover-specs|cover-dimensions)\.ts$/;
const IS_TEST = /__tests__|\.test\.ts$/;

function scanForGeometryConstants(): string[] {
  return walk(path.join(REPO, 'backend'))
    .filter((f) => !IS_AUTHORITY.test(f) && !IS_TEST.test(f))
    .filter((f) => {
      const code = stripNonCode(readFileSync(f, 'utf8'));
      return GEOMETRY_LITERALS.some((re) => re.test(code));
    })
    .map((f) => path.relative(REPO, f).replace(/\\/g, '/'))
    .sort();
}
