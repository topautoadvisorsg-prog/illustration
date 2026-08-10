/**
 * Review guides must be visible and inert.
 *
 * The guides exist so an operator can see where the paper gets cut. That is
 * only useful if the guided preview is the SAME book as the export — if drawing
 * them nudged a text area by a hair, the preview would be showing page breaks
 * the printed book does not have, which is worse than having no guides at all.
 *
 * These are string-level checks on the emitted stylesheet (no browser), which is
 * where the inertness actually comes from: `outline` is painted outside the box
 * and takes part in no layout calculation. A `border` or any padding/margin
 * here would be a defect, so the test names them.
 */
import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';
import { buildTypesetHtml, parseTypesetSections } from '../pipeline/typeset/typeset-book.js';

const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'NO ONE TOLD ME THAT',
  authorName: 'Nolan Whitlow',
  trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
  typography: { bodyPt: 12, lineHeight: 1.3, headingFont: 'Archivo', bodyFont: 'EB Garamond' },
});

const MARKDOWN = [
  '# Chapter One',
  '',
  'A paragraph of body text that is long enough to wrap across more than a single line of the measure.',
  '',
  '# Chapter Two',
  '',
  'Another paragraph, also long enough that any change to the text area would show up as a different break.',
].join('\n');

const html = (reviewGuides: boolean): string =>
  buildTypesetHtml({ sections: parseTypesetSections(MARKDOWN), config, reviewGuides });

describe('typeset review guides', () => {
  it('are absent unless asked for — an export can never carry them', () => {
    const out = html(false);
    expect(out).not.toContain('REVIEW GUIDES');
    expect(out).not.toContain('outline');
  });

  it('draw the trim edge and the text area when asked for', () => {
    const out = html(true);
    expect(out).toContain('.pagedjs_pagebox { outline:');
    expect(out).toContain('.pagedjs_area { outline:');
  });

  it('use OUTLINE, never anything that occupies space', () => {
    // The guide DECLARATIONS only: the whole document contains borders that
    // legitimately belong to the book's design, and the guide block's own
    // comment says the word "border" while explaining why it does not use one.
    const guideBlock = html(true)
      .split('REVIEW GUIDES')[1]!
      .split('html, body')[0]!
      .replace(/[\s\S]*?\*\//, '');
    expect(guideBlock).toContain('outline');
    expect(guideBlock).not.toMatch(/\bborder\s*:/);
    expect(guideBlock).not.toMatch(/\b(padding|margin|width|height)\s*:/);
  });

  it('changes NOTHING else in the document', () => {
    // The strongest statement available without a browser: the guided document
    // is the unguided one plus the guide block, character for character.
    const guided = html(true);
    const plain = html(false);
    const stripped = guided.replace(/\n\/\* REVIEW GUIDES[\s\S]*?\.pagedjs_area \{ outline: [^}]*\}/, '');
    expect(stripped).toBe(plain);
  });
});
