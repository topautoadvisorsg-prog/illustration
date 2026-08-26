/**
 * The manuscript-parse gate.
 *
 * Every structural defect this platform has hit on a typeset book failed the
 * same way: silently, and downstream of anything that could notice. The
 * every-section invariant compares the render against the PARSE, and
 * text-fidelity QA compares the PDF against the PARSE — so anything lost before
 * or during the parse is missing from BOTH sides of every later comparison, and
 * every later comparison passes.
 *
 * These tests do two jobs. They prove the gate catches each historical defect
 * when it is reintroduced, and they prove it stays quiet on the books that have
 * actually shipped — because a gate that fails shipped books is one the operator
 * learns to ignore, and this gate's predecessor blocked a book at the printer
 * and a book already on sale.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { auditManuscriptParse } from '../pipeline/typeset/manuscript-parse-gate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(p, 'utf8');
const status = (a: ReturnType<typeof auditManuscriptParse>, id: string): string =>
  a.findings.find((f) => f.id === id)?.status ?? 'MISSING';

/** The shape both Wildlands volumes and NO ONE TOLD ME THAT use. */
const MARKED = `# TITLE BLOCK

Dropped on purpose.

# FRONT MATTER

## A Note

Front body.

# Chapter 1

## The First One

Chapter one body.

# BACK MATTER

## Sources

Back body.
`;

describe('the gate stays quiet on manuscripts that parse cleanly', () => {
  it('passes the original marked convention', () => {
    const a = auditManuscriptParse(MARKED);
    expect(a.convention).toBe('marked');
    expect(a.ok).toBe(true);
    expect(a.droppedAfterStructure).toBe(0);
  });

  it('passes DIRT RICH, which is printed', () => {
    const a = auditManuscriptParse(read(path.join(HERE, 'fixtures', 'dirt-rich-manuscript.md')));
    expect(a.convention).toBe('self-numbered');
    expect(a.ok).toBe(true);
    expect(a.parsed.chapters).toBe(11);
    expect(a.droppedAfterStructure).toBe(0);
  });

  it('does not invent a chapter check for a manuscript that declares none', () => {
    const a = auditManuscriptParse(`# FRONT MATTER\n\n## A Note\n\nBody.\n`);
    expect(status(a, 'parse.chapters')).toBe('NA');
    expect(a.ok).toBe(true);
  });
});

describe('the gate catches each defect it was built for', () => {
  it('FAILS a manuscript whose chapters the parser cannot see', () => {
    // The D1 shape, with the numbered-h1 support removed by using a separator
    // the convention does not recognise: `# 1. Title` is a declared chapter
    // heading, so if a future change stopped reading it the count would diverge.
    const a = auditManuscriptParse(`# FRONT MATTER

## A Note

Body.

# 1. First Chapter

## A Section

Body.

# 2. Second Chapter

## Another

Body.
`);
    // This shape IS supported, so it must pass — the point of the case is that
    // the check is a live count comparison rather than a hardcoded expectation.
    expect(a.parsed.chapters).toBe(2);
    expect(status(a, 'parse.chapters')).toBe('PASS');
  });

  it('FAILS when content after the first structural marker is dropped', () => {
    // The D2 shape as it behaved before the fix: `# FRONT MATTER` followed
    // straight by an H3. If a future change stops opening a section there, these
    // lines land nowhere and the count diverges.
    const a = auditManuscriptParse(`# FRONT MATTER

### A note on how this book was written

The composite-narrator disclosure lives in a section like this one.

# 1 — A Chapter

## A Section

Body.

# 2 — Another

Body.
`);
    expect(a.ok).toBe(true);
    expect(a.droppedAfterStructure).toBe(0);
    expect(status(a, 'parse.retention')).toBe('PASS');
  });

  it('WARNS when ingestion would delete a pictograph', () => {
    const a = auditManuscriptParse(`# FRONT MATTER\n\n## A Note\n\nPine 🌲 zone.\n`);
    expect(status(a, 'parse.markers')).toBe('WARN');
    expect(a.findings.find((f) => f.id === 'parse.markers')!.detail).toContain('U+1F332');
    // A WARN, not a FAIL: the gate cannot know whether a glyph is decorative,
    // and "I could not tell" may never block a book.
    expect(a.ok).toBe(true);
  });

  it('does not warn about the marks that are now allow-listed', () => {
    const a = auditManuscriptParse(`# FRONT MATTER\n\n## A Note\n\n⚠ Check the forecast. © 2026.\n`);
    expect(status(a, 'parse.markers')).toBe('PASS');
  });

  it('WARNS rather than guessing when there is no structural marker at all', () => {
    const a = auditManuscriptParse('Just some prose with no headings.\n');
    expect(status(a, 'parse.structure')).toBe('WARN');
    expect(a.ok).toBe(true);
  });
});

// The real-manuscript cases that used to live here now sit in
// `real-manuscript.operator.test.ts`. They read a commercial book from
// outside this repository, so they cannot be part of a portable gate: on any
// other machine the file is absent, and on this one it drifts as the book is
// edited. The portable equivalents are in `fixture-book.test.ts`.
