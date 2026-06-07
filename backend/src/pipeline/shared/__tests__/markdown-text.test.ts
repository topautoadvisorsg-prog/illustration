import { describe, expect, it } from 'vitest';
import { countChars, countWords, stripMarkdown } from '../markdown-text.js';

describe('stripMarkdown', () => {
  it('strips fenced code blocks entirely', () => {
    const input = 'Before.\n\n```\nlet x = 1;\n```\n\nAfter.';
    const result = stripMarkdown(input);
    expect(result).not.toContain('let x');
    expect(result).toBe('Before. After.');
  });

  it('strips inline code', () => {
    expect(stripMarkdown('Use `console.log` to debug.')).toBe('Use to debug.');
  });

  it('strips image embeds', () => {
    expect(stripMarkdown('Caption: ![alt text](https://x.png) here.')).toBe('Caption: here.');
  });

  it('strips link syntax but keeps the link text intact would be ideal — current behavior removes it', () => {
    // Documents current behavior: link syntax `[text](url)` is removed entirely.
    // Acceptable for word counting; if v2 needs to preserve link text, change here.
    expect(stripMarkdown('See [the docs](https://x).')).toBe('See .');
  });

  it('collapses heading markers and emphasis', () => {
    expect(stripMarkdown('## **Bold** heading')).toBe('Bold heading');
  });
});

describe('countWords', () => {
  it('returns 0 for an empty body', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n  ')).toBe(0);
  });

  it('counts simple words separated by whitespace', () => {
    expect(countWords('one two three four')).toBe(4);
  });

  it('ignores fenced code blocks (they count as 0 words)', () => {
    expect(countWords('one\n\n```\nlots of code words here\n```\n\ntwo')).toBe(2);
  });
});

describe('countChars', () => {
  it('returns 0 for an empty body', () => {
    expect(countChars('')).toBe(0);
  });

  it('returns the stripped char count', () => {
    expect(countChars('## Heading')).toBe('Heading'.length);
  });
});
