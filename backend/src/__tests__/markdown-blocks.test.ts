/**
 * markdown → render-ready blocks. The model must never receive a markdown char.
 * Anchored to the real SHELTER defect (### + ** rendered literally).
 */

import { describe, expect, it } from 'vitest';
import {
  markdownToBlocks,
  stripInlineMarkup,
  blocksToPlainText,
  type BodyBlock,
} from '../pipeline/whole-page-render/markdown-blocks.js';

const hasMarkdownChar = (blocks: BodyBlock[]): boolean =>
  blocks.some((b) => /[#*_`|]/.test(b.text) || /\u{1F000}-\u{1FAFF}/u.test(b.text));

describe('stripInlineMarkup', () => {
  it('drops bold/italic/code markers, keeps the words', () => {
    expect(stripInlineMarkup('the **bold** and *italic* and `code` words')).toBe('the bold and italic and code words');
  });
  it('removes stray pipes and emoji (binomial-header residue)', () => {
    expect(stripInlineMarkup('*Crotalus horridus* | ⚠️')).toBe('Crotalus horridus');
  });
});

describe('markdownToBlocks — the SHELTER defect cannot recur', () => {
  it('parses ### / ** into typed blocks with NO markdown characters', () => {
    const body = [
      'The Appalachian Mountain Club maintains eight huts.',
      '',
      '### Emergency Shelter Construction',
      '',
      '**Natural shelter first:**',
      '',
      '- **Dense hemlock groves** are the finest natural shelter.',
      '- **Rock overhangs and ledges** provide immediate overhead cover.',
    ].join('\n');
    const blocks = markdownToBlocks(body);

    expect(hasMarkdownChar(blocks)).toBe(false); // the whole point
    expect(blocks.find((b) => b.type === 'subheading')?.text).toBe('Emergency Shelter Construction');
    const bold = blocks.find((b) => b.text.startsWith('Natural shelter first'));
    expect(bold?.type).toBe('subheading');
    // list items become paragraphs, bullets + bold markers gone
    expect(blocks.some((b) => b.text.startsWith('Dense hemlock groves are the finest'))).toBe(true);
  });

  it('maps ## → heading, ### → subheading', () => {
    const blocks = markdownToBlocks('## What It Is\n\nThe bear is large.\n\n### Diet\n\nOmnivore.');
    expect(blocks[0]).toEqual({ type: 'heading', text: 'What It Is' });
    expect(blocks.find((b) => b.text === 'Diet')?.type).toBe('subheading');
  });

  it('joins consecutive lines into one paragraph', () => {
    const blocks = markdownToBlocks('Line one\nline two\nline three.');
    expect(blocks).toEqual([{ type: 'paragraph', text: 'Line one line two line three.' }]);
  });

  it('plain prose with no markdown is one untouched paragraph', () => {
    const blocks = markdownToBlocks('A simple paragraph with no markup at all.');
    expect(blocks).toEqual([{ type: 'paragraph', text: 'A simple paragraph with no markup at all.' }]);
  });

  it('blocksToPlainText reconstructs clean text', () => {
    const blocks = markdownToBlocks('## Title\n\nBody one.\n\nBody two.');
    expect(blocksToPlainText(blocks)).toBe('Title\n\nBody one.\n\nBody two.');
  });
});

// ─── F-9 — horizontal rules never reach the page ────────────────────────────

describe('markdownToBlocks — F-9 horizontal-rule stripping', () => {
  it('drops --- / *** / ___ separator lines entirely', () => {
    const blocks = markdownToBlocks('First paragraph.\n\n---\n\nSecond paragraph.\n***\nThird.\n___\n');
    expect(blocks.map((b) => b.text)).toEqual(['First paragraph.', 'Second paragraph.', 'Third.']);
    for (const b of blocks) expect(b.text).not.toMatch(/-{3,}|\*{3,}|_{3,}/);
  });

  it('a trailing --- (the CH01_P005 production defect) produces no block', () => {
    const blocks = markdownToBlocks('Know the difference between those two people and be the first one.\n\n---');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.text).not.toContain('-');
  });

  it('hyphenated words and en-dashes inside prose are untouched', () => {
    const blocks = markdownToBlocks('A well-known trail — the Long Trail — runs north.');
    expect(blocks[0]!.text).toContain('well-known');
    expect(blocks[0]!.text).toContain('—');
  });
});
